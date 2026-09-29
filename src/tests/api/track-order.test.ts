import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Mock firebaseAdmin before importing handler
vi.mock('../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn(() => null)
}))

import handler from '../../../api/track-order'
import { getAdminFirestore } from '../../../api/_lib/firebaseAdmin'

function createMockRes() {
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis()
  }
  return res as VercelResponse & {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
  }
}

describe('Order Tracking Serverless Endpoint (/api/track-order)', () => {
  const envBackup: Record<string, string | undefined> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    // A developer shell (or CI) must never be able to flip the production gate.
    for (const key of ['VERCEL_ENV', 'ALLOW_SIMULATED_PAYMENTS']) {
      envBackup[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('should handle OPTIONS preflight with status 200', async () => {
    const req = { method: 'OPTIONS' } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.end).toHaveBeenCalled()
  })

  it('should return 405 Method Not Allowed on non-POST requests', async () => {
    const req = { method: 'GET' } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  it('should return 400 when orderId or rut is missing', async () => {
    const req = { method: 'POST', body: { orderId: 'PRONTO-123' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Faltan parámetros') })
    )
  })

  it('should return 404 when order is not found in Firestore', async () => {
    mockOrderDb(null)

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-999999', rut: '12.345.678-5' }
    } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('No se encontró') }))
  })

  it('should return 401 when customer RUT does not match order record', async () => {
    mockOrderDb({
      orderId: 'PRONTO-123456',
      customer: { rut: '11.111.111-1' },
      status: 'PENDIENTE_TRANSFERENCIA'
    })

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123456', rut: '12.345.678-5' }
    } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('no coincide') }))
  })

  it('should return 200 with mapped fulfillment info when order and RUT match', async () => {
    mockOrderDb({
      orderId: 'PRONTO-123456',
      status: 'EN_PREPARACION',
      paymentMethod: 'transferencia',
      totalAmount: 189990,
      items: [{ productId: 'odon-1', name: 'Turbina', quantity: 1, price: 189990 }],
      customer: {
        fullName: 'Dra. Andrea Morales',
        email: 'andrea@clinica.cl',
        rut: '12345678-5',
        address: 'Av. Ortúzar 750',
        city: 'Melipilla',
        documentType: 'factura'
      },
      courier: 'Despacho Express Melipilla',
      trackingNumber: 'MEL-1234'
    })

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123456', rut: '12.345.678-5' }
    } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'PRONTO-123456',
        status: 'EN_PREPARACION',
        fulfillment: expect.objectContaining({
          currentStep: 3,
          statusTitle: 'Preparando en Bodega',
          courier: 'Despacho Express Melipilla',
          trackingNumber: 'MEL-1234'
        })
      })
    )
  })

  /**
   * Admin SDK double for the canonical order lookup (Task 0.12): the document key
   * resolves first; the `orderId` field query is only consulted when the key is
   * missing (or when `legacyFieldOnly` forces the legacy path).
   */
  function mockOrderDb(
    orderData: Record<string, unknown> | null,
    options: { decoy?: Record<string, unknown>; legacyFieldOnly?: boolean } = {}
  ) {
    const orderRef = { id: 'PRONTO-123456' }
    const orderDoc = orderData ? { id: 'PRONTO-123456', ref: orderRef, data: () => orderData } : null
    const decoyDoc = options.decoy ? { id: 'decoy-doc', ref: { id: 'decoy-doc' }, data: () => options.decoy } : null

    const directGet = vi
      .fn()
      .mockResolvedValue(
        orderData && !options.legacyFieldOnly
          ? { exists: true, ref: orderRef, data: () => orderData }
          : { exists: false, ref: orderRef, data: () => undefined }
      )
    const whereGet = vi
      .fn()
      .mockResolvedValue(
        decoyDoc
          ? { empty: false, docs: [decoyDoc] }
          : orderDoc
            ? { empty: false, docs: [orderDoc] }
            : { empty: true, docs: [] }
      )

    const collectionApi = {
      doc: vi.fn(() => ({ get: directGet })),
      where: vi.fn(() => ({ limit: vi.fn(() => ({ get: whereGet })) }))
    }
    const mockAdminDb = { collection: vi.fn(() => collectionApi) }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
    return { mockAdminDb }
  }

  it('should never echo a legacy Base64 voucher (Task 2.9)', async () => {
    mockOrderDb({
      orderId: 'PRONTO-123456',
      status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
      totalAmount: 189990,
      items: [],
      customer: { rut: '12345678-5', fullName: 'Dra. Andrea', email: 'a@b.cl', address: 'x', city: 'Melipilla' },
      voucherUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
      voucherFileName: 'comprobante.pdf',
      voucherUploadedAt: '2026-09-01T10:00:00.000Z'
    })

    const res = createMockRes()
    await handler({ method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12.345.678-5' } } as VercelRequest, res)

    const payload = res.json.mock.calls[0][0]
    expect(payload.voucher).toMatchObject({
      uploaded: true,
      fileName: 'comprobante.pdf',
      uploadedAt: '2026-09-01T10:00:00.000Z'
    })
    expect(payload.voucher.url).toBeUndefined()
    expect(JSON.stringify(payload)).not.toContain('data:application/pdf')
  })

  it('should return the storage-backed voucher URL when the order was uploaded after Task 2.9', async () => {
    const voucherUrl =
      'https://firebasestorage.googleapis.com/v0/b/pronto-insumos.firebasestorage.app/o/vouchers%2Forders%2FPRONTO-123456%2Fa.pdf?alt=media&token=tok'
    mockOrderDb({
      orderId: 'PRONTO-123456',
      status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
      totalAmount: 189990,
      items: [],
      customer: { rut: '12345678-5', fullName: 'Dra. Andrea', email: 'a@b.cl', address: 'x', city: 'Melipilla' },
      voucherUrl,
      voucherStoragePath: 'vouchers/orders/PRONTO-123456/a.pdf',
      voucherFileName: 'comprobante.pdf'
    })

    const res = createMockRes()
    await handler({ method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12.345.678-5' } } as VercelRequest, res)

    expect(res.json.mock.calls[0][0].voucher).toMatchObject({ uploaded: true, url: voucherUrl })
  })

  it('resolves the document key first: a decoy document carrying the same orderId field cannot shadow the real order (Task 0.12)', async () => {
    const { mockAdminDb } = mockOrderDb(
      {
        orderId: 'PRONTO-123456',
        status: 'PENDIENTE_TRANSFERENCIA',
        totalAmount: 189990,
        items: [],
        customer: { rut: '12345678-5', fullName: 'Dra. Andrea', email: 'a@b.cl', address: 'x', city: 'Melipilla' }
      },
      {
        decoy: {
          orderId: 'PRONTO-123456',
          status: 'ENTREGADO',
          totalAmount: 1,
          items: [],
          customer: { rut: '12345678-5', fullName: 'Decoy', email: 'decoy@evil.cl', address: 'x', city: 'Melipilla' }
        }
      }
    )

    const res = createMockRes()
    await handler({ method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12.345.678-5' } } as VercelRequest, res)

    const payload = res.json.mock.calls[0][0]
    expect(payload.status).toBe('PENDIENTE_TRANSFERENCIA')
    expect(payload.totalAmount).toBe(189990)
    expect(payload.customer.fullName).toBe('Dra. Andrea')
    // The field query is never consulted once the document key resolves.
    expect(mockAdminDb.collection().where).not.toHaveBeenCalled()
  })

  it('falls back to the orderId field query for legacy documents whose key differs (Task 0.12)', async () => {
    mockOrderDb(
      {
        orderId: 'PRONTO-123456',
        status: 'PENDIENTE_TRANSFERENCIA',
        totalAmount: 189990,
        items: [],
        customer: { rut: '12345678-5', fullName: 'Dra. Andrea', email: 'a@b.cl', address: 'x', city: 'Melipilla' }
      },
      { legacyFieldOnly: true }
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = createMockRes()
    await handler({ method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12.345.678-5' } } as VercelRequest, res)

    expect(res.json.mock.calls[0][0].orderId).toBe('PRONTO-123456')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('orderId field fallback'))
    warnSpy.mockRestore()
  })

  describe('Fail-closed when Firestore Admin is unavailable (Task 0.16)', () => {
    const trackingRequest = {
      method: 'POST',
      body: { orderId: 'PRONTO-123456', rut: '12.345.678-5' }
    } as VercelRequest

    it('should refuse with 500 in a production runtime instead of fabricating an order', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      process.env.VERCEL_ENV = 'production'
      vi.mocked(getAdminFirestore).mockReturnValue(null)

      const res = createMockRes()
      await handler(trackingRequest, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[track-order]'))

      const payload = res.json.mock.calls[0][0]
      expect(payload.error).toEqual(expect.stringContaining('WhatsApp'))
      // No fabricated customer, amount or fiscal document may leak into the response.
      const serialized = JSON.stringify(payload)
      expect(serialized).not.toContain('Andrea Morales')
      expect(serialized).not.toContain('189990')
      expect(serialized).not.toContain('MORALES SPA')
    })

    it('should keep the simulated order outside a production runtime (dev and preview)', async () => {
      vi.mocked(getAdminFirestore).mockReturnValue(null)

      const res = createMockRes()
      await handler(trackingRequest, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json.mock.calls[0][0].customer.fullName).toBe('Dra. Andrea Morales')
      expect(res.json.mock.calls[0][0].fulfillment.currentStep).toBe(1)
    })

    it('should keep the simulated order in production only with the explicit ALLOW_SIMULATED_PAYMENTS opt-in', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.ALLOW_SIMULATED_PAYMENTS = 'true'
      vi.mocked(getAdminFirestore).mockReturnValue(null)

      const res = createMockRes()
      await handler(trackingRequest, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json.mock.calls[0][0].customer.fullName).toBe('Dra. Andrea Morales')
    })
  })
})
