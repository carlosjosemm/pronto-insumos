import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Mock the Firebase boundaries before importing the handler
vi.mock('firebase-admin/storage', () => ({
  getStorage: vi.fn()
}))
vi.mock('../../../api/_lib/firebaseAdmin', () => ({
  getAdminApp: vi.fn(),
  getAdminFirestore: vi.fn()
}))

import handler from '../../../api/upload-voucher'
import { getAdminApp, getAdminFirestore } from '../../../api/_lib/firebaseAdmin'
import { getStorage } from 'firebase-admin/storage'
import { FieldValue } from 'firebase-admin/firestore'
import { THROTTLE_MESSAGE, THROTTLE_POLICIES } from '../../../api/_lib/abuseThrottle'
import { createThrottleCounters } from './helpers/throttleCounters'

function createMockRes() {
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis()
  }
  return res as VercelResponse & {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
    setHeader: ReturnType<typeof vi.fn>
  }
}

const PENDING_ORDER = {
  orderId: 'PRONTO-123456',
  status: 'PENDIENTE_TRANSFERENCIA',
  totalAmount: 189990,
  items: [{ productId: 'odon-101', name: 'Turbina', quantity: 1, price: 189990 }],
  customer: {
    fullName: 'Dra. Andrea',
    email: 'andrea@clinica.cl',
    rut: '12345678-5',
    address: 'Calle 1',
    city: 'Melipilla'
  }
}

/**
 * Firestore Admin double: direct doc-id lookup, `where` fallback, and a transactional
 * write path. `transactionData` lets a test simulate the order changing between the
 * authorization read and the confirm transaction (Task 2.9 TOCTOU guard).
 *
 * Since Task 8.8 the same double also backs the `abuse_counters` collection: the
 * composite transaction routes counter refs to `counters` and every other ref to
 * `orderTx` (the order transaction), so `orderTx.get` is the precise "the order
 * transaction ran" assertion while the throttle keeps working underneath.
 */
function createMockDb(
  orderData: Record<string, unknown> | null,
  options: { transactionData?: Record<string, unknown> | null } = {}
) {
  const updateSpy = vi.fn()
  const setSpy = vi.fn()
  // `DocumentReference.update(data)` is a bound method in the Admin SDK; the wrapper
  // keeps the (ref, data) call shape identical to `transaction.update(ref, data)`.
  const docRef = { id: 'PRONTO-123456' } as {
    id: string
    update: (data: Record<string, unknown>) => unknown
  }
  docRef.update = (data) => updateSpy(docRef, data)
  const orderDoc = { exists: true, ref: docRef, data: () => orderData }

  const directGet = vi
    .fn()
    .mockResolvedValue(orderData ? orderDoc : { exists: false, ref: docRef, data: () => undefined })
  const whereGet = vi.fn().mockResolvedValue(orderData ? { empty: false, docs: [orderDoc] } : { empty: true, docs: [] })

  // The transactional order document is a MUTABLE copy: a transaction update must be
  // visible to a later transaction read — the Task 8.8 alert-reservation release does a
  // compare-and-swap against what the confirm transaction wrote. Snapshots return a copy,
  // like the real SDK, so `latestData` cannot alias the post-update state.
  const orderState: Record<string, unknown> | null =
    orderData === null ? null : { ...(options.transactionData === undefined ? orderData : options.transactionData) }
  const orderSnapshot = () => ({
    exists: orderState !== null,
    ref: docRef,
    data: () => (orderState ? { ...orderState } : undefined)
  })

  const orderTx = {
    get: vi.fn(async () => orderSnapshot()),
    set: vi.fn((ref: unknown, data: Record<string, unknown>) => setSpy(ref, data)),
    update: vi.fn((ref: unknown, data: Record<string, unknown>) => {
      if (orderState) Object.assign(orderState, data)
      updateSpy(ref, data)
    })
  }
  const counters = createThrottleCounters(orderTx)

  const collection = vi.fn((name: string) =>
    String(name).includes('abuse_counters')
      ? counters.collection(name)
      : name.includes('order_status_history')
        ? { doc: vi.fn(() => ({ id: 'osh-123' })) }
        : {
            doc: vi.fn(() => ({ get: directGet })),
            where: vi.fn(() => ({ limit: vi.fn(() => ({ get: whereGet })) }))
          }
  )

  const runTransaction = counters.runTransaction

  const db = { collection, runTransaction }

  return { db, counters, orderTx, docRef, updateSpy, setSpy, runTransaction }
}

/** Storage bucket double — one shared file handle so assertions see every operation. */
function createMockBucket(metadata: { size?: unknown; contentType?: unknown } = {}) {
  const fileApi = {
    getMetadata: vi.fn().mockResolvedValue([{ size: 2048, contentType: 'application/pdf', ...metadata }]),
    setMetadata: vi.fn().mockResolvedValue([{}]),
    getSignedUrl: vi.fn().mockResolvedValue(['https://storage.googleapis.com/pronto-vouchers/upload?sig=abc', {}]),
    delete: vi.fn().mockResolvedValue([{}])
  }
  const fileSpy = vi.fn(() => fileApi)
  return { bucket: { name: 'pronto-insumos.firebasestorage.app', file: fileSpy }, fileApi, fileSpy }
}

function setupAdmin(
  orderData: Record<string, unknown> | null,
  bucket: ReturnType<typeof createMockBucket>,
  options: { transactionData?: Record<string, unknown> | null } = {}
) {
  const db = createMockDb(orderData, options)
  vi.mocked(getAdminFirestore).mockReturnValue(db.db as unknown as ReturnType<typeof getAdminFirestore>)
  process.env.FIREBASE_PROJECT_ID = 'pronto-insumos'
  vi.mocked(getAdminApp).mockReturnValue({
    options: {}
  } as unknown as ReturnType<typeof getAdminApp>)
  vi.mocked(getStorage).mockReturnValue({
    bucket: vi.fn(() => bucket.bucket)
  } as unknown as ReturnType<typeof getStorage>)
  return db
}

const signRequest = (body: Record<string, unknown> = {}) =>
  ({
    method: 'POST',
    body: {
      action: 'sign',
      orderId: 'PRONTO-123456',
      rut: '12.345.678-5',
      fileName: 'comprobante_banco_chile.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      ...body
    }
  }) as VercelRequest

const confirmRequest = (body: Record<string, unknown> = {}) =>
  ({
    method: 'POST',
    body: {
      action: 'confirm',
      orderId: 'PRONTO-123456',
      rut: '12.345.678-5',
      storagePath: 'vouchers/orders/PRONTO-123456/1700000000000-abcd1234.pdf',
      fileName: 'comprobante_banco_chile.pdf',
      ...body
    }
  }) as VercelRequest

describe('Voucher Upload Serverless Endpoint (/api/upload-voucher)', () => {
  const envBackup: Record<string, string | undefined> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    for (const key of [
      'RESEND_API_KEY',
      'WAREHOUSE_NOTIFICATION_EMAIL',
      'VERCEL_ENV',
      'ALLOW_SIMULATED_PAYMENTS',
      'FIREBASE_PROJECT_ID'
    ]) {
      envBackup[key] = process.env[key]
    }
    delete process.env.RESEND_API_KEY
    delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
    delete process.env.VERCEL_ENV
    delete process.env.ALLOW_SIMULATED_PAYMENTS
    delete process.env.FIREBASE_PROJECT_ID
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('should handle OPTIONS preflight with status 200', async () => {
    const res = createMockRes()
    await handler({ method: 'OPTIONS' } as VercelRequest, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.end).toHaveBeenCalled()
  })

  it('should return 405 Method Not Allowed on non-POST requests', async () => {
    const res = createMockRes()
    await handler({ method: 'GET' } as VercelRequest, res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  it('should reject a request without a valid action', async () => {
    const res = createMockRes()
    await handler({ method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12.345.678-5' } } as VercelRequest, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Acción no válida') })
    )
  })

  it('should reject Base64 data URLs outright (Task 2.9)', async () => {
    const res = createMockRes()
    await handler(
      {
        method: 'POST',
        body: { orderId: 'PRONTO-123456', rut: '12.345.678-5', dataUrl: 'data:application/pdf;base64,AAAA' }
      } as VercelRequest,
      res
    )

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('base64') }))
  })

  it('should return 400 when orderId or RUT are missing', async () => {
    const res = createMockRes()
    await handler({ method: 'POST', body: { action: 'sign', orderId: 'PRONTO-123456' } } as VercelRequest, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Faltan parámetros') })
    )
  })

  it('should return 400 when the RUT is malformed', async () => {
    const res = createMockRes()
    await handler(signRequest({ rut: '123' }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('RUT no válido') }))
  })

  describe('Simulation policy & fail-closed behaviour', () => {
    it('should return a simulated response when Admin is unavailable outside production', async () => {
      vi.mocked(getAdminFirestore).mockReturnValue(null)
      const res = createMockRes()

      await handler(signRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, simulated: true, orderId: 'PRONTO-123456' })
      )
    })

    it('should refuse the upload with 500 when Admin is unavailable in production', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      process.env.VERCEL_ENV = 'production'
      vi.mocked(getAdminFirestore).mockReturnValue(null)
      const res = createMockRes()

      await handler(signRequest(), res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('WhatsApp') }))
    })

    it('should refuse the upload with 500 when the storage bucket cannot be resolved in production', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      process.env.VERCEL_ENV = 'production'
      const db = createMockDb(PENDING_ORDER)
      vi.mocked(getAdminFirestore).mockReturnValue(db.db as unknown as ReturnType<typeof getAdminFirestore>)
      vi.mocked(getAdminApp).mockReturnValue(null)
      const res = createMockRes()

      await handler(signRequest(), res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(db.orderTx.get).not.toHaveBeenCalled()
    })
  })

  describe('Sign phase', () => {
    it('should require fileName, contentType and sizeBytes', async () => {
      const bucket = createMockBucket()
      setupAdmin(PENDING_ORDER, bucket)
      const res = createMockRes()

      await handler(signRequest({ fileName: undefined, contentType: undefined, sizeBytes: undefined }), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('fileName, contentType y sizeBytes') })
      )
    })

    it('should reject an unsupported MIME type server-side', async () => {
      const bucket = createMockBucket()
      setupAdmin(PENDING_ORDER, bucket)
      const res = createMockRes()

      await handler(signRequest({ contentType: 'application/zip' }), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Formato no soportado') })
      )
      expect(bucket.fileApi.getSignedUrl).not.toHaveBeenCalled()
    })

    it('should reject non-positive and oversized declared sizes', async () => {
      const bucket = createMockBucket()
      setupAdmin(PENDING_ORDER, bucket)

      const zeroRes = createMockRes()
      await handler(signRequest({ sizeBytes: 0 }), zeroRes)
      expect(zeroRes.status).toHaveBeenCalledWith(400)
      expect(zeroRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Tamaño de archivo') })
      )

      const hugeRes = createMockRes()
      await handler(signRequest({ sizeBytes: 5 * 1024 * 1024 + 1 }), hugeRes)
      expect(hugeRes.status).toHaveBeenCalledWith(400)
      expect(hugeRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('5 MB') }))

      expect(bucket.fileApi.getSignedUrl).not.toHaveBeenCalled()
    })

    it('returns one identical 404 for an unknown order and for a wrong RUT — no enumeration oracle (Task 8.8)', async () => {
      const bucket = createMockBucket()
      setupAdmin(null, bucket)
      const unknownRes = createMockRes()
      await handler(signRequest({ orderId: 'PRONTO-000000' }), unknownRes)

      const mismatchBucket = createMockBucket()
      setupAdmin({ ...PENDING_ORDER, customer: { ...PENDING_ORDER.customer, rut: '99999999-9' } }, mismatchBucket)
      const mismatchRes = createMockRes()
      await handler(signRequest(), mismatchRes)

      expect(unknownRes.status).toHaveBeenCalledWith(404)
      expect(mismatchRes.status).toHaveBeenCalledWith(404)
      const payload = unknownRes.json.mock.calls[0][0]
      expect(mismatchRes.json.mock.calls[0][0]).toEqual(payload)
      expect(payload.error).toContain('No encontramos un pedido con ese código y RUT')
      expect(JSON.stringify(payload)).not.toContain('PRONTO-000000')
      // A failed lookup never mints a signed URL.
      expect(mismatchBucket.fileApi.getSignedUrl).not.toHaveBeenCalled()
    })

    it('refuses with 429 once the IP budget is locked, in both phases (Task 8.8)', async () => {
      const bucket = createMockBucket()
      const db = setupAdmin(PENDING_ORDER, bucket)
      db.counters.seedLocked('upload-voucher', 'ip', '200.83.10.4')

      const signRes = createMockRes()
      await handler({ ...signRequest(), headers: { 'x-real-ip': '200.83.10.4' } } as unknown as VercelRequest, signRes)
      expect(signRes.status).toHaveBeenCalledWith(429)
      expect(signRes.json).toHaveBeenCalledWith({ error: THROTTLE_MESSAGE })
      expect(signRes.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String))
      expect(bucket.fileApi.getSignedUrl).not.toHaveBeenCalled()

      const confirmRes = createMockRes()
      await handler(
        { ...confirmRequest(), headers: { 'x-real-ip': '200.83.10.4' } } as unknown as VercelRequest,
        confirmRes
      )
      expect(confirmRes.status).toHaveBeenCalledWith(429)
      expect(bucket.fileApi.getMetadata).not.toHaveBeenCalled()
    })

    it('locks the order key after N failed lookups, even from rotating IPs (Task 8.8)', async () => {
      const bucket = createMockBucket()
      const db = setupAdmin(null, bucket)
      const maxFailures = THROTTLE_POLICIES['upload-voucher'].order.maxFailures

      for (let attempt = 0; attempt < maxFailures; attempt += 1) {
        const res = createMockRes()
        await handler(
          {
            ...signRequest({ orderId: 'PRONTO-000000' }),
            headers: { 'x-real-ip': `200.83.10.${attempt + 1}` }
          } as unknown as VercelRequest,
          res
        )
        expect(res.status).toHaveBeenCalledWith(404)
      }

      // The order budget locks regardless of how many source IPs were used, and each
      // IP carries its own recorded failure.
      expect(db.counters.read('upload-voucher', 'order', 'PRONTO-000000')).toMatchObject({ failures: maxFailures })
      expect(db.counters.read('upload-voucher', 'ip', '200.83.10.1')).toMatchObject({ failures: 1 })

      const lockedRes = createMockRes()
      await handler(
        {
          ...signRequest({ orderId: 'PRONTO-000000' }),
          headers: { 'x-real-ip': '200.83.10.99' }
        } as unknown as VercelRequest,
        lockedRes
      )
      expect(lockedRes.status).toHaveBeenCalledWith(429)
    })

    it('should refuse every status outside the lifecycle guard with 409', async () => {
      for (const status of [
        'PAGADO_MERCADOPAGO',
        'PAGADO_TRANSFERENCIA',
        'TRANSFERENCIA_APROBADA',
        'DESPACHADO',
        'ENTREGADO',
        'CANCELADO',
        'COTIZACION_SOLICITADA_WHATSAPP'
      ]) {
        const bucket = createMockBucket()
        setupAdmin({ ...PENDING_ORDER, status }, bucket)
        const res = createMockRes()

        await handler(signRequest(), res)

        expect(res.status).toHaveBeenCalledWith(409)
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining(status) }))
        expect(bucket.fileApi.getSignedUrl).not.toHaveBeenCalled()
      }
    })

    it('should mint a scoped signed URL without writing anything to Firestore', async () => {
      const bucket = createMockBucket()
      const db = setupAdmin(PENDING_ORDER, bucket)
      const res = createMockRes()

      await handler(signRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(bucket.fileApi.getSignedUrl).toHaveBeenCalledTimes(1)
      const signedConfig = bucket.fileApi.getSignedUrl.mock.calls[0][0]
      expect(signedConfig).toMatchObject({
        version: 'v4',
        action: 'write',
        contentType: 'application/pdf',
        // The byte cap is part of the signature, so Storage itself refuses oversized uploads
        extensionHeaders: { 'x-goog-content-length-range': `0,${5 * 1024 * 1024}` }
      })
      expect(signedConfig.expires).toBeGreaterThan(Date.now())

      const payload = res.json.mock.calls[0][0]
      expect(payload).toMatchObject({
        success: true,
        orderId: 'PRONTO-123456',
        uploadUrl: 'https://storage.googleapis.com/pronto-vouchers/upload?sig=abc',
        contentType: 'application/pdf',
        maxBytes: 5 * 1024 * 1024
      })
      expect(payload.storagePath).toMatch(/^vouchers\/orders\/PRONTO-123456\/\d+-[0-9a-f]{8}\.pdf$/)
      expect(payload.dataUrl).toBeUndefined()

      // No bytes, no metadata and no status change are persisted at signing time
      expect(db.updateSpy).not.toHaveBeenCalled()
      expect(db.setSpy).not.toHaveBeenCalled()
      expect(db.orderTx.get).not.toHaveBeenCalled()
    })

    it('should allow a voucher replacement while the transfer is still pending', async () => {
      const bucket = createMockBucket()
      setupAdmin({ ...PENDING_ORDER, status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO' }, bucket)
      const res = createMockRes()

      await handler(signRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(bucket.fileApi.getSignedUrl).toHaveBeenCalledTimes(1)
    })

    it('should fail closed when signing the URL throws', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const bucket = createMockBucket()
      bucket.fileApi.getSignedUrl.mockRejectedValue(new Error('402 billing required'))
      setupAdmin(PENDING_ORDER, bucket)
      const res = createMockRes()

      await handler(signRequest(), res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('WhatsApp') }))
    })
  })

  describe('Confirm phase', () => {
    const objectPath = 'vouchers/orders/PRONTO-123456/1700000000000-abcd1234.pdf'

    it('should require a storage path', async () => {
      const bucket = createMockBucket()
      setupAdmin(PENDING_ORDER, bucket)
      const res = createMockRes()

      await handler(confirmRequest({ storagePath: undefined }), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('identificador del comprobante') })
      )
    })

    it('should reject a storage path that belongs to another order', async () => {
      const bucket = createMockBucket()
      setupAdmin(PENDING_ORDER, bucket)
      const res = createMockRes()

      await handler(confirmRequest({ storagePath: 'vouchers/orders/PRONTO-999999/1700000000000-abcd1234.pdf' }), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('no corresponde') })
      )
      expect(bucket.fileApi.getMetadata).not.toHaveBeenCalled()
    })

    it('should reject a storage path outside the voucher prefix', async () => {
      const bucket = createMockBucket()
      setupAdmin(PENDING_ORDER, bucket)
      const res = createMockRes()

      await handler(confirmRequest({ storagePath: 'products/odon-101.png' }), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(bucket.fileApi.delete).not.toHaveBeenCalled()
    })

    it('should return 400 when the uploaded object cannot be found', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const bucket = createMockBucket()
      bucket.fileApi.getMetadata.mockRejectedValue(new Error('Not Found'))
      setupAdmin(PENDING_ORDER, bucket)
      const res = createMockRes()

      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('No encontramos el comprobante') })
      )
    })

    it('should delete and reject an object that exceeds the byte cap', async () => {
      const bucket = createMockBucket({ size: 5 * 1024 * 1024 + 1 })
      const db = setupAdmin(PENDING_ORDER, bucket)
      const res = createMockRes()

      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('5 MB') }))
      expect(bucket.fileApi.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
      expect(db.orderTx.get).not.toHaveBeenCalled()
    })

    it('should delete and reject an object whose real content type is not allowed', async () => {
      const bucket = createMockBucket({ contentType: 'application/x-msdownload' })
      const db = setupAdmin(PENDING_ORDER, bucket)
      const res = createMockRes()

      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Formato no soportado') })
      )
      expect(bucket.fileApi.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
      expect(db.orderTx.get).not.toHaveBeenCalled()
    })

    it('should persist the voucher trail without ever storing Base64 bytes', async () => {
      const bucket = createMockBucket()
      const db = setupAdmin(PENDING_ORDER, bucket)
      const res = createMockRes()

      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(db.orderTx.get).toHaveBeenCalledTimes(1)

      const updatePayload = db.updateSpy.mock.calls[0][1] as Record<string, unknown>
      expect(updatePayload).toMatchObject({
        voucherStoragePath: objectPath,
        voucherFileName: 'comprobante_banco_chile.pdf',
        voucherContentType: 'application/pdf',
        voucherSizeBytes: 2048,
        status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO'
      })
      expect(String(updatePayload.voucherUrl)).toMatch(
        /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/pronto-insumos\.firebasestorage\.app\/o\//
      )
      expect(String(updatePayload.voucherUrl)).toContain('token=')
      expect(JSON.stringify(updatePayload)).not.toContain('data:')
      expect(bucket.fileApi.setMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ firebaseStorageDownloadTokens: expect.any(String) })
        })
      )

      const historyPayload = db.setSpy.mock.calls[0][1] as Record<string, unknown>
      expect(historyPayload).toMatchObject({
        orderId: 'PRONTO-123456',
        previousStatus: 'PENDIENTE_TRANSFERENCIA',
        newStatus: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
        changedBy: 'CUSTOMER',
        changedByEmail: 'andrea@clinica.cl',
        actorRole: 'CUSTOMER'
      })
      expect((historyPayload.metadata as Record<string, unknown>).storagePath).toBe(objectPath)

      const responsePayload = res.json.mock.calls[0][0]
      expect(responsePayload).toMatchObject({ success: true, status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO' })
      expect(responsePayload.voucherUrl).toContain('token=')

      // Nothing was deleted: this order had no previous voucher
      expect(bucket.fileApi.delete).not.toHaveBeenCalled()
    })

    it('should be idempotent when the same object is confirmed twice', async () => {
      const bucket = createMockBucket()
      const db = setupAdmin(
        {
          ...PENDING_ORDER,
          status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
          voucherStoragePath: objectPath,
          voucherUrl:
            'https://firebasestorage.googleapis.com/v0/b/pronto-insumos.firebasestorage.app/o/x?alt=media&token=t',
          voucherFileName: 'comprobante_banco_chile.pdf',
          voucherUploadedAt: '2026-09-28T10:00:00.000Z'
        },
        bucket
      )
      const res = createMockRes()

      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, duplicate: true }))
      // Nothing at all happens on a retried confirm: no transaction, no write, no re-tokenization
      expect(db.orderTx.get).not.toHaveBeenCalled()
      expect(db.updateSpy).not.toHaveBeenCalled()
      expect(bucket.fileApi.setMetadata).not.toHaveBeenCalled()
    })

    it('should replace the previous object only after the new voucher is persisted', async () => {
      const previousPath = 'vouchers/orders/PRONTO-123456/1699999999999-old.pdf'
      const bucket = createMockBucket()
      const db = setupAdmin(
        { ...PENDING_ORDER, status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO', voucherStoragePath: previousPath },
        bucket
      )
      const res = createMockRes()

      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(bucket.fileApi.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
      expect(db.updateSpy.mock.invocationCallOrder[0]).toBeLessThan(bucket.fileApi.delete.mock.invocationCallOrder[0])
    })

    it('should refuse a status that changed during the upload window (TOCTOU guard)', async () => {
      const bucket = createMockBucket()
      const db = setupAdmin(PENDING_ORDER, bucket, {
        transactionData: { ...PENDING_ORDER, status: 'TRANSFERENCIA_APROBADA' }
      })
      const res = createMockRes()

      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('TRANSFERENCIA_APROBADA') })
      )
      expect(db.updateSpy).not.toHaveBeenCalled()
      expect(bucket.fileApi.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
    })

    it('should fail closed without deleting anything when the order write fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const previousPath = 'vouchers/orders/PRONTO-123456/1699999999999-old.pdf'
      const bucket = createMockBucket()
      const db = setupAdmin(
        { ...PENDING_ORDER, status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO', voucherStoragePath: previousPath },
        bucket
      )
      db.orderTx.get.mockRejectedValue(new Error('firestore unavailable'))
      const res = createMockRes()

      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('No pudimos registrar') })
      )
      expect(bucket.fileApi.delete).not.toHaveBeenCalled()
    })
  })

  describe('Warehouse Email Alert (Resend)', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
    })

    it('should send a warehouse alert email after the voucher is stored', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      const bucket = createMockBucket()
      setupAdmin(PENDING_ORDER, bucket)

      const res = createMockRes()
      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))
      expect(resendCalls).toHaveLength(1)
      const body = JSON.parse(resendCalls[0][1]?.body as string)
      expect(body.to).toEqual(['bodega@prontoinsumos.com'])
      expect(body.subject).toContain('PRONTO-123456')
    })

    it('should still return 200 when the warehouse alert fails (non-blocking)', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const bucket = createMockBucket()
      setupAdmin(PENDING_ORDER, bucket)

      const res = createMockRes()
      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('suppresses the alert while the per-order cooldown is active (Task 8.8)', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const bucket = createMockBucket()
      const db = setupAdmin(
        {
          ...PENDING_ORDER,
          status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
          voucherAlertSentAt: new Date(Date.now() - 60_000).toISOString(),
          voucherAlertCount: 1
        },
        bucket
      )

      const res = createMockRes()
      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Warehouse alert'))
      // No stamp either: nothing was sent.
      const stampCall = db.updateSpy.mock.calls.find(
        ([, payload]) => payload && typeof payload === 'object' && 'voucherAlertSentAt' in payload
      )
      expect(stampCall).toBeUndefined()
    })

    it('sends again once the cooldown has passed and increments the per-order counter (Task 8.8)', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      const bucket = createMockBucket()
      const db = setupAdmin(
        {
          ...PENDING_ORDER,
          status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
          voucherAlertSentAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          voucherAlertCount: 1
        },
        bucket
      )

      const res = createMockRes()
      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))).toHaveLength(1)

      const stampCall = db.updateSpy.mock.calls.find(
        ([, payload]) => payload && typeof payload === 'object' && 'voucherAlertSentAt' in payload
      )
      expect(stampCall?.[1]).toMatchObject({ voucherAlertCount: 2, voucherAlertSentAt: expect.any(String) })
    })

    it('suppresses the alert once the per-order cap is reached (Task 8.8)', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const bucket = createMockBucket()
      setupAdmin(
        {
          ...PENDING_ORDER,
          status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
          voucherAlertSentAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          voucherAlertCount: 5
        },
        bucket
      )

      const res = createMockRes()
      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))).toHaveLength(0)
    })

    it('releases the reservation when the send fails, keeping the alert retryable', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const bucket = createMockBucket()
      const db = setupAdmin(PENDING_ORDER, bucket)

      const res = createMockRes()
      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      // The transaction reserved the alert (stamped it with the voucher), and the failed
      // send released the reservation. This order had no previous values, so the release
      // deletes the fields instead of writing empty placeholders onto the document.
      const rollbackCall = db.updateSpy.mock.calls.at(-1)
      const rollbackPayload = rollbackCall?.[1] as Record<string, unknown>
      expect(FieldValue.delete().isEqual(rollbackPayload.voucherAlertSentAt as FieldValue)).toBe(true)
      expect(FieldValue.delete().isEqual(rollbackPayload.voucherAlertCount as FieldValue)).toBe(true)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('network down'))
    })

    it('never clobbers a reservation a concurrent confirm committed meanwhile (Task 8.8)', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const bucket = createMockBucket()
      const db = setupAdmin(PENDING_ORDER, bucket)

      // First transaction read: the plain order. Second (the release's compare-and-swap):
      // a NEWER reservation committed by a concurrent confirm.
      db.orderTx.get
        .mockResolvedValueOnce({ exists: true, ref: db.docRef, data: () => ({ ...PENDING_ORDER }) })
        .mockResolvedValueOnce({
          exists: true,
          ref: db.docRef,
          data: () => ({
            ...PENDING_ORDER,
            status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
            voucherAlertSentAt: '2026-09-29T22:00:00.000Z',
            voucherAlertCount: 2
          })
        })

      const res = createMockRes()
      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('superseded'))
      // The only order update is the confirm transaction's own — the release never ran.
      expect(db.updateSpy).toHaveBeenCalledTimes(1)
    })

    it('never reserves an alert slot when no warehouse recipient is configured (Task 8.8)', async () => {
      // The outer beforeEach deletes WAREHOUSE_NOTIFICATION_EMAIL; make it explicit.
      delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      const bucket = createMockBucket()
      const db = setupAdmin(PENDING_ORDER, bucket)

      const res = createMockRes()
      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))).toHaveLength(0)
      const orderUpdate = db.updateSpy.mock.calls[0][1] as Record<string, unknown>
      expect(orderUpdate).not.toHaveProperty('voucherAlertSentAt')
      expect(orderUpdate).not.toHaveProperty('voucherAlertCount')
    })

    it('skips the alert when a concurrent confirm already stamped it inside the transaction window (Task 8.8)', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const bucket = createMockBucket()
      const db = setupAdmin(PENDING_ORDER, bucket, {
        // The authorization read saw no stamp; by the time the confirm transaction ran,
        // another confirm of a different object had already committed one.
        transactionData: {
          ...PENDING_ORDER,
          status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
          voucherAlertSentAt: new Date(Date.now() - 30_000).toISOString(),
          voucherAlertCount: 1
        }
      })

      const res = createMockRes()
      await handler(confirmRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cooldown active'))
      // The order update carries the voucher but no fresh reservation.
      const orderUpdate = db.updateSpy.mock.calls[0][1] as Record<string, unknown>
      expect(orderUpdate).not.toHaveProperty('voucherAlertSentAt')
      expect(orderUpdate).toMatchObject({ status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO' })
    })
  })
})
