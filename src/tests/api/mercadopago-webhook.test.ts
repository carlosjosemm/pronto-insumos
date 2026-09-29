import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Mock firebaseAdmin before importing webhook handler
vi.mock('../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

import handler from '../../../api/webhooks/mercadopago'
import { getAdminFirestore } from '../../../api/_lib/firebaseAdmin'

function createMockRes() {
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  }
  return res as VercelResponse & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }
}

/**
 * Orders-collection double for the canonical lookup (Task 0.12): the document key
 * resolves to the first fixture document — mirroring `resolveOrderByCanonicalId` —
 * and the legacy `orderId` field query returns the same fixtures.
 */
function orderCollectionMock(docs: Array<{ id: string; ref: unknown; data: () => Record<string, unknown> }> = []) {
  const primary = docs[0]
  return {
    doc: vi.fn(() => ({
      get: vi
        .fn()
        .mockResolvedValue(primary ? { exists: true, ref: primary.ref, data: primary.data } : { exists: false })
    })),
    where: vi.fn(() => ({
      limit: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ empty: docs.length === 0, docs }) }))
    }))
  }
}

describe('Mercado Pago Serverless Webhook (/api/webhooks/mercadopago)', () => {
  const initialVercelEnv = process.env.VERCEL_ENV
  const initialAllowSimulated = process.env.ALLOW_SIMULATED_PAYMENTS

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    // Deterministic simulation policy (Task 0.10): every test starts outside
    // production with no override; the production-gate tests set VERCEL_ENV explicitly.
    delete process.env.VERCEL_ENV
    delete process.env.ALLOW_SIMULATED_PAYMENTS
  })

  afterAll(() => {
    if (initialVercelEnv === undefined) {
      delete process.env.VERCEL_ENV
    } else {
      process.env.VERCEL_ENV = initialVercelEnv
    }
    if (initialAllowSimulated === undefined) {
      delete process.env.ALLOW_SIMULATED_PAYMENTS
    } else {
      process.env.ALLOW_SIMULATED_PAYMENTS = initialAllowSimulated
    }
  })

  it('should return 200 with health message on GET request', async () => {
    const req = { method: 'GET' } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        message: expect.stringContaining('Active')
      })
    )
  })

  it('should return 405 on non-GET / non-POST methods', async () => {
    const req = { method: 'PUT' } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  it('should acknowledge 200 when no payment ID is present in payload', async () => {
    const req = {
      method: 'POST',
      body: {},
      query: {}
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        received: true,
        note: expect.stringContaining('No payment ID')
      })
    )
  })

  it('should handle failed Mercado Pago payment verification safely', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    } as Response)

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const req = {
      method: 'POST',
      body: { data: { id: 'invalid-id' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        received: true,
        note: expect.stringContaining('verification failed')
      })
    )
    consoleSpy.mockRestore()
  })

  it('should update order to PAGADO_MERCADOPAGO and deduct stock using firebase-admin in an atomic transaction on approved payment', async () => {
    // Mock Mercado Pago API returning approved payment matching the catalog-verified total
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        external_reference: 'PRONTO-123456',
        id: 998877,
        transaction_amount: 189990
      })
    } as Response)

    const orderRef = { id: 'order-doc-abc' }
    const productRef = { id: 'prod-turbine-1' }

    const orderData = {
      orderId: 'PRONTO-123456',
      status: 'PENDIENTE_PAGO_MERCADOPAGO',
      totalAmount: 189990,
      items: [{ productId: 'prod-turbine-1', quantity: 2 }]
    }

    const mockTransactionUpdate = vi.fn()
    const mockTransactionGet = vi.fn().mockImplementation((ref: { id?: string }) => {
      if (ref?.id === 'order-doc-abc') {
        return Promise.resolve({
          exists: true,
          data: () => orderData
        })
      }
      return Promise.resolve({
        exists: true,
        data: () => ({ stockCount: 5, inStock: true, price: 94995 })
      })
    })

    const mockAdminDb = {
      collection: vi.fn((colName: string) => {
        if (colName === 'orders') {
          return orderCollectionMock([
            {
              id: 'order-doc-abc',
              ref: orderRef,
              data: () => ({
                orderId: 'PRONTO-123456',
                status: 'PENDIENTE_PAGO_MERCADOPAGO',
                items: [{ productId: 'prod-turbine-1', quantity: 2 }]
              })
            }
          ])
        }
        if (colName === 'products') {
          return {
            doc: vi.fn().mockReturnValue(productRef)
          }
        }
        return {
          doc: vi.fn().mockReturnValue({ id: 'audit-dummy-id' })
        }
      }),
      runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
        await cb({
          get: mockTransactionGet,
          update: mockTransactionUpdate,
          set: vi.fn()
        })
      })
    }

    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: { data: { id: '998877' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })

    // Verify atomic transaction was executed
    expect(mockAdminDb.runTransaction).toHaveBeenCalledTimes(1)

    // Verify order update inside transaction
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      orderRef,
      expect.objectContaining({
        status: 'PAGADO_MERCADOPAGO',
        mercadopagoPaymentId: '998877',
        paidAt: expect.any(String)
      })
    )

    // Verify stock deduction inside transaction: 5 - 2 = 3
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      productRef,
      expect.objectContaining({
        stockCount: 3,
        inStock: true
      })
    )
  })

  it('should acknowledge 200 with duplicate flag and skip transaction if order is already PAGADO_MERCADOPAGO (idempotency)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        external_reference: 'PRONTO-123456',
        id: 998877
      })
    } as Response)

    const mockAdminDb = {
      collection: vi.fn((colName: string) => {
        if (colName === 'orders') {
          return orderCollectionMock([
            {
              id: 'order-doc-abc',
              ref: { id: 'order-doc-abc' },
              data: () => ({
                orderId: 'PRONTO-123456',
                status: 'PAGADO_MERCADOPAGO',
                mercadopagoPaymentId: '998877',
                items: [{ productId: 'prod-turbine-1', quantity: 2 }]
              })
            }
          ])
        }
        return {}
      }),
      runTransaction: vi.fn()
    }

    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: { data: { id: '998877' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        received: true,
        verifiedStatus: 'approved',
        duplicate: true,
        message: expect.stringContaining('already processed')
      })
    )

    // CRITICAL: Must not run transaction or decrement stock again
    expect(mockAdminDb.runTransaction).not.toHaveBeenCalled()
  })

  it('should acknowledge 200 with duplicate flag if order already recorded paymentId even if status differs', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        external_reference: 'PRONTO-123456',
        id: 998877
      })
    } as Response)

    const mockAdminDb = {
      collection: vi.fn((colName: string) => {
        if (colName === 'orders') {
          return orderCollectionMock([
            {
              id: 'order-doc-abc',
              ref: { id: 'order-doc-abc' },
              data: () => ({
                orderId: 'PRONTO-123456',
                status: 'EN_PROCESAMIENTO',
                mercadopagoPaymentId: '998877',
                items: [{ productId: 'prod-turbine-1', quantity: 2 }]
              })
            }
          ])
        }
        return {}
      }),
      runTransaction: vi.fn()
    }

    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: { data: { id: '998877' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        received: true,
        duplicate: true
      })
    )
    expect(mockAdminDb.runTransaction).not.toHaveBeenCalled()
  })

  it('should abort transaction without writes if order was marked paid during concurrent transaction', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        external_reference: 'PRONTO-123456',
        id: 998877
      })
    } as Response)

    const orderRef = { id: 'order-doc-abc' }
    const mockTransactionUpdate = vi.fn()
    const mockTransactionGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        status: 'PAGADO_MERCADOPAGO', // concurrently updated
        mercadopagoPaymentId: '998877'
      })
    })

    const mockAdminDb = {
      collection: vi.fn((colName: string) => {
        if (colName === 'orders') {
          return orderCollectionMock([
            {
              id: 'order-doc-abc',
              ref: orderRef,
              data: () => ({
                orderId: 'PRONTO-123456',
                status: 'PENDIENTE_PAGO_MERCADOPAGO' // initial read was pending
              })
            }
          ])
        }
        return {}
      }),
      runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
        await cb({
          get: mockTransactionGet,
          update: mockTransactionUpdate
        })
      })
    }

    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: { data: { id: '998877' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockAdminDb.runTransaction).toHaveBeenCalledTimes(1)
    // Concurrency guard inside transaction must prevent any updates
    expect(mockTransactionUpdate).not.toHaveBeenCalled()
  })

  it('should not update order or stock if payment status is rejected or pending', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'rejected',
        external_reference: 'PRONTO-123456',
        id: 112233
      })
    } as Response)

    const mockAdminDb = {
      collection: vi.fn()
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: { data: { id: '112233' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'rejected' })
    expect(mockAdminDb.collection).not.toHaveBeenCalled()
  })

  it('should handle uninitialized Firestore admin gracefully with warning response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        external_reference: 'PRONTO-123456',
        id: 554433
      })
    } as Response)

    vi.mocked(getAdminFirestore).mockReturnValue(null)
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const req = {
      method: 'POST',
      body: { data: { id: '554433' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        received: true,
        verifiedStatus: 'approved',
        warning: 'Firestore Admin unavailable'
      })
    )
    consoleSpy.mockRestore()
  })

  it('should return 200 on OPTIONS preflight request', async () => {
    const resEnd = vi.fn()
    const req = { method: 'OPTIONS' } as VercelRequest
    const res = {
      status: vi.fn().mockReturnValue({ end: resEnd }),
      statusCode: 200
    } as unknown as VercelResponse

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(resEnd).toHaveBeenCalled()
  })

  it('should log a warning and return 200 when approved order is not found in Firestore', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        external_reference: 'PRONTO-NONEXISTENT',
        id: 778899
      })
    } as Response)

    const mockAdminDb = {
      collection: vi.fn().mockReturnValue(orderCollectionMock()),
      runTransaction: vi.fn()
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const req = {
      method: 'POST',
      body: { data: { id: '778899' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })
    expect(mockAdminDb.runTransaction).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Order "PRONTO-NONEXISTENT" not found in Firestore')
    )
    consoleSpy.mockRestore()
  })

  it('resolves the document key first: a decoy document carrying the same orderId field cannot shadow the real order (Task 0.12)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        external_reference: 'PRONTO-123456',
        id: 998877,
        transaction_amount: 189990
      })
    } as Response)

    const realOrderRef = { id: 'PRONTO-123456' }
    const decoyRef = { id: 'decoy-doc' }
    const orderData = {
      orderId: 'PRONTO-123456',
      status: 'PENDIENTE_PAGO_MERCADOPAGO',
      totalAmount: 189990,
      items: [{ productId: 'prod-turbine-1', quantity: 2 }],
      customer: { email: 'andrea@clinica.cl' }
    }
    const decoyDoc = {
      id: 'decoy-doc',
      ref: decoyRef,
      data: () => ({
        orderId: 'PRONTO-123456',
        status: 'ENTREGADO',
        totalAmount: 1,
        items: [{ productId: 'prod-turbine-1', quantity: 1 }]
      })
    }

    const mockTransactionGet = vi
      .fn()
      .mockImplementation((ref: { id?: string }) =>
        ref?.id === 'PRONTO-123456'
          ? Promise.resolve({ exists: true, data: () => orderData })
          : Promise.resolve({ exists: true, data: () => ({ stockCount: 5, inStock: true, price: 94995 }) })
      )
    const mockTransactionUpdate = vi.fn()
    const whereSpy = vi.fn(() => ({
      limit: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ empty: false, docs: [decoyDoc] }) }))
    }))

    const mockAdminDb = {
      collection: vi.fn((colName: string) => {
        if (colName === 'orders') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn().mockResolvedValue({ exists: true, ref: realOrderRef, data: () => orderData })
            })),
            where: whereSpy
          }
        }
        if (colName === 'products') {
          return { doc: vi.fn().mockReturnValue({ id: 'prod-turbine-1' }) }
        }
        return { doc: vi.fn().mockReturnValue({ id: 'audit-dummy-id' }) }
      }),
      runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
        await cb({ get: mockTransactionGet, update: mockTransactionUpdate, set: vi.fn() })
      })
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})

    const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    // The REAL document is the one marked paid — never the decoy (status ENTREGADO).
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      realOrderRef,
      expect.objectContaining({ status: 'PAGADO_MERCADOPAGO', mercadopagoPaymentId: '998877' })
    )
    expect(mockTransactionUpdate).not.toHaveBeenCalledWith(decoyRef, expect.anything())
    // The decoy is only reachable through the `orderId` field query, which is never consulted.
    expect(whereSpy).not.toHaveBeenCalled()
  })

  describe('Webhook Cryptographic Signature Verification (x-signature)', () => {
    const testSecret = 'secret_webhook_key_12345'

    it('should return 401 Unauthorized when MERCADOPAGO_WEBHOOK_SECRET is set but x-signature header is missing', async () => {
      const originalSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: {},
        body: { data: { id: '998877' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Unauthorized'),
          reason: 'missing_signature_headers_or_id'
        })
      )

      consoleSpy.mockRestore()
      process.env.MERCADOPAGO_WEBHOOK_SECRET = originalSecret
    })

    it('should return 401 Unauthorized when x-signature contains invalid hash', async () => {
      const originalSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: {
          'x-signature': 'ts=1710372000,v1=bad_hash_value_1234567890abcdef',
          'x-request-id': 'req-test-uuid'
        },
        body: { data: { id: '998877' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Unauthorized')
        })
      )

      consoleSpy.mockRestore()
      process.env.MERCADOPAGO_WEBHOOK_SECRET = originalSecret
    })

    it('should proceed and return 200 when signature is cryptographically valid', async () => {
      const originalSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret

      const paymentId = '998877'
      const requestId = 'req-test-uuid-valid'
      const ts = '1710372000'
      const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`
      const validHash = (await import('crypto')).default.createHmac('sha256', testSecret).update(manifest).digest('hex')

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'rejected',
          external_reference: 'PRONTO-123456',
          id: paymentId
        })
      } as Response)

      const req = {
        method: 'POST',
        headers: {
          'x-signature': `ts=${ts},v1=${validHash}`,
          'x-request-id': requestId
        },
        body: { data: { id: paymentId } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'rejected' })

      process.env.MERCADOPAGO_WEBHOOK_SECRET = originalSecret
    })
  })

  describe('Transactional Email Notifications (Resend)', () => {
    let resendKeyBackup: string | undefined
    let warehouseBackup: string | undefined

    beforeEach(() => {
      resendKeyBackup = process.env.RESEND_API_KEY
      warehouseBackup = process.env.WAREHOUSE_NOTIFICATION_EMAIL
      delete process.env.RESEND_API_KEY
      delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
      // Signature tests above may leave the string "undefined" behind — ensure open webhook
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET
    })

    afterEach(() => {
      if (resendKeyBackup === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = resendKeyBackup
      if (warehouseBackup === undefined) delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
      else process.env.WAREHOUSE_NOTIFICATION_EMAIL = warehouseBackup
    })

    function mockSuccessfulPaymentDb() {
      const orderRef = { id: 'order-doc-abc' }
      const productRef = { id: 'prod-turbine-1' }
      const mockTransactionUpdate = vi.fn()
      const orderData = {
        orderId: 'PRONTO-123456',
        status: 'PENDIENTE_PAGO_MERCADOPAGO',
        totalAmount: 189990,
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2, price: 94995 }],
        customer: {
          fullName: 'Dra. Andrea',
          email: 'andrea@clinica.cl',
          rut: '12345678-5',
          address: 'Calle 1',
          city: 'Melipilla'
        }
      }
      const mockTransactionGet = vi.fn().mockImplementation((ref: { id?: string }) => {
        if (ref?.id === 'order-doc-abc') {
          return Promise.resolve({ exists: true, data: () => orderData })
        }
        return Promise.resolve({ exists: true, data: () => ({ stockCount: 5, inStock: true, price: 94995 }) })
      })
      const mockAdminDb = {
        collection: vi.fn((colName: string) => {
          if (colName === 'orders') {
            return orderCollectionMock([{ id: 'order-doc-abc', ref: orderRef, data: () => orderData }])
          }
          if (colName === 'products') {
            return { doc: vi.fn().mockReturnValue(productRef) }
          }
          return { doc: vi.fn().mockReturnValue({ id: 'audit-dummy-id' }) }
        }),
        runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
          await cb({ get: mockTransactionGet, update: mockTransactionUpdate, set: vi.fn() })
        })
      }
      return { mockAdminDb, mockTransactionUpdate }
    }

    /** fetch spy that answers both the Mercado Pago API call and Resend sends. */
    function mockFetchBoundaries(resendOk = true) {
      return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('api.resend.com')) {
          return {
            ok: resendOk,
            status: resendOk ? 200 : 500,
            json: async () => (resendOk ? { id: 'email_xyz' } : {}),
            text: async () => (resendOk ? '' : 'Resend error')
          } as Response
        }
        return {
          ok: true,
          json: async () => ({
            status: 'approved',
            external_reference: 'PRONTO-123456',
            id: 998877,
            transaction_amount: 189990
          })
        } as Response
      })
    }

    const resendCalls = (fetchSpy: { mock: { calls: unknown[][] } }) =>
      fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))

    const resendRecipient = (call: unknown[]) =>
      (JSON.parse(((call[1] as RequestInit | undefined)?.body ?? '{}') as string).to as string[])[0]

    it('should send customer payment-confirmation and warehouse emails after approved payment', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = mockFetchBoundaries()
      const { mockAdminDb } = mockSuccessfulPaymentDb()
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })

      const sends = resendCalls(fetchSpy)
      expect(sends).toHaveLength(2)
      const recipients = sends.map(resendRecipient)
      expect(recipients).toContain('andrea@clinica.cl')
      expect(recipients).toContain('bodega@prontoinsumos.com')
    })

    it('should not send any email on duplicate delivery (no re-notification)', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = mockFetchBoundaries()
      const { mockAdminDb } = mockSuccessfulPaymentDb()
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      // Simulate the transaction seeing the order already paid (concurrency guard path)
      const alreadyPaidDb = {
        ...mockAdminDb,
        collection: vi.fn((colName: string) => {
          if (colName === 'orders') {
            return orderCollectionMock([
              {
                id: 'order-doc-abc',
                ref: { id: 'order-doc-abc' },
                data: () => ({
                  orderId: 'PRONTO-123456',
                  status: 'PAGADO_MERCADOPAGO',
                  mercadopagoPaymentId: '998877'
                })
              }
            ])
          }
          return {}
        })
      }
      vi.mocked(getAdminFirestore).mockReturnValue(alreadyPaidDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(resendCalls(fetchSpy)).toHaveLength(0)
    })

    it('should still return 200 when Resend is down (email outage never breaks the webhook)', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = mockFetchBoundaries(false)
      const { mockAdminDb } = mockSuccessfulPaymentDb()
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })
      expect(resendCalls(fetchSpy).length).toBeGreaterThan(0)
    })
  })

  describe('Server-side amount verification (Task 0.9 — underpayment exploit)', () => {
    interface AmountFixture {
      totalAmount: number
      catalogPrice: number
      quantity: number
      transactionAmount: number
      promoCode?: string
      items?: Array<Record<string, unknown>>
    }

    /** Firestore Admin double whose order/product docs carry the configured amounts. */
    function mockAmountDb(cfg: AmountFixture) {
      const orderRef = { id: 'order-doc-abc' }
      const productRef = { id: 'prod-turbine-1' }
      const mockTransactionUpdate = vi.fn()
      const orderData = {
        orderId: 'PRONTO-123456',
        status: 'PENDIENTE_PAGO_MERCADOPAGO',
        totalAmount: cfg.totalAmount,
        ...(cfg.promoCode ? { promoCode: cfg.promoCode } : {}),
        items: cfg.items ?? [
          { productId: 'prod-turbine-1', name: 'Turbina', quantity: cfg.quantity, price: cfg.catalogPrice }
        ],
        customer: {
          fullName: 'Dra. Andrea',
          email: 'andrea@clinica.cl',
          rut: '12345678-5',
          address: 'Calle 1',
          city: 'Melipilla'
        }
      }
      const mockTransactionGet = vi.fn().mockImplementation((ref: { id?: string }) => {
        if (ref?.id === 'order-doc-abc') {
          return Promise.resolve({ exists: true, data: () => orderData })
        }
        return Promise.resolve({
          exists: true,
          data: () => ({ stockCount: 5, inStock: true, price: cfg.catalogPrice })
        })
      })
      const mockAdminDb = {
        collection: vi.fn((colName: string) => {
          if (colName === 'orders') {
            return orderCollectionMock([{ id: 'order-doc-abc', ref: orderRef, data: () => orderData }])
          }
          if (colName === 'products') {
            return { doc: vi.fn().mockReturnValue(productRef) }
          }
          return { doc: vi.fn().mockReturnValue({ id: 'audit-dummy-id' }) }
        }),
        runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
          await cb({ get: mockTransactionGet, update: mockTransactionUpdate, set: vi.fn() })
        })
      }
      return { mockAdminDb, mockTransactionUpdate, orderRef, productRef }
    }

    function mockApprovedPaymentFetch(transactionAmount: number) {
      return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        if (String(input).includes('api.resend.com')) {
          return { ok: true, status: 200, json: async () => ({ id: 'email_xyz' }), text: async () => '' } as Response
        }
        return {
          ok: true,
          json: async () => ({
            status: 'approved',
            external_reference: 'PRONTO-123456',
            id: 998877,
            transaction_amount: transactionAmount
          })
        } as Response
      })
    }

    it('should mark PAGADO_MERCADOPAGO and deduct stock when the paid amount matches the catalog-verified total', async () => {
      mockApprovedPaymentFetch(189990)
      const { mockAdminDb, mockTransactionUpdate, orderRef, productRef } = mockAmountDb({
        totalAmount: 189990,
        catalogPrice: 94995,
        quantity: 2,
        transactionAmount: 189990
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({ status: 'PAGADO_MERCADOPAGO' })
      )
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        productRef,
        expect.objectContaining({ stockCount: 3, inStock: true })
      )
    })

    it('should flag PAGO_EN_REVISION without stock deduction when transaction_amount underpays the order', async () => {
      mockApprovedPaymentFetch(100) // attacker paid $100 for a $189.990 order
      const { mockAdminDb, mockTransactionUpdate, orderRef, productRef } = mockAmountDb({
        totalAmount: 189990,
        catalogPrice: 94995,
        quantity: 2,
        transactionAmount: 100
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })

      // Order flagged for review — NOT marked paid
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({
          status: 'PAGO_EN_REVISION',
          mercadopagoPaymentId: '998877'
        })
      )
      // CRITICAL: zero stock deduction
      expect(mockTransactionUpdate).not.toHaveBeenCalledWith(
        productRef,
        expect.objectContaining({ stockCount: expect.any(Number) })
      )
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('amount verification failed'))
      consoleSpy.mockRestore()
    })

    it('should flag a review state when order.totalAmount diverges from the catalog reality', async () => {
      mockApprovedPaymentFetch(189990)
      const { mockAdminDb, mockTransactionUpdate, orderRef, productRef } = mockAmountDb({
        totalAmount: 1000, // tampered client total — catalog says 189990
        catalogPrice: 94995,
        quantity: 2,
        transactionAmount: 189990
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({ status: 'PAGO_EN_REVISION' })
      )
      expect(mockTransactionUpdate).not.toHaveBeenCalledWith(
        productRef,
        expect.objectContaining({ stockCount: expect.any(Number) })
      )
      consoleSpy.mockRestore()
    })

    it('should route orders with unresolvable item productIds to manual review instead of decrementing stock', async () => {
      mockApprovedPaymentFetch(189990)
      const { mockAdminDb, mockTransactionUpdate } = mockAmountDb({
        totalAmount: 189990,
        catalogPrice: 94995,
        quantity: 2,
        transactionAmount: 189990,
        items: [{ name: 'Línea sin productId', quantity: 2 }] // no productId/id
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'order-doc-abc' }),
        expect.objectContaining({ status: 'PAGO_EN_REVISION' })
      )
      consoleSpy.mockRestore()
    })

    it('should approve a promo-discounted order when the paid amount matches the verified total', async () => {
      // PRONTO10 on 2 × 94995 = round(94995 × 0.9) × 2 = 85496 × 2 = 170992
      mockApprovedPaymentFetch(170992)
      const { mockAdminDb, mockTransactionUpdate, orderRef, productRef } = mockAmountDb({
        totalAmount: 170992,
        catalogPrice: 94995,
        quantity: 2,
        transactionAmount: 170992,
        promoCode: 'PRONTO10'
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({ status: 'PAGADO_MERCADOPAGO' })
      )
      expect(mockTransactionUpdate).toHaveBeenCalledWith(productRef, expect.objectContaining({ stockCount: 3 }))
      consoleSpy.mockRestore()
    })

    it('should treat a redelivered payment for an order already in review as a duplicate (idempotent)', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'approved',
          external_reference: 'PRONTO-123456',
          id: 998877,
          transaction_amount: 100
        })
      } as Response)

      const mockAdminDb = {
        collection: vi.fn((colName: string) => {
          if (colName === 'orders') {
            return orderCollectionMock([
              {
                id: 'order-doc-abc',
                ref: { id: 'order-doc-abc' },
                data: () => ({
                  orderId: 'PRONTO-123456',
                  status: 'PAGO_EN_REVISION',
                  mercadopagoPaymentId: '998877',
                  items: [{ productId: 'prod-turbine-1', quantity: 2 }]
                })
              }
            ])
          }
          return {}
        }),
        runTransaction: vi.fn()
      }

      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true,
          verifiedStatus: 'approved',
          duplicate: true,
          message: expect.stringContaining('already processed')
        })
      )
      expect(mockAdminDb.runTransaction).not.toHaveBeenCalled()
    })
  })

  describe('Production fail-closed configuration gates (Task 0.10)', () => {
    const testSecret = 'secret_webhook_key_12345'
    const initialSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
    const initialToken = process.env.MERCADOPAGO_ACCESS_TOKEN

    afterEach(() => {
      if (initialSecret === undefined) {
        delete process.env.MERCADOPAGO_WEBHOOK_SECRET
      } else {
        process.env.MERCADOPAGO_WEBHOOK_SECRET = initialSecret
      }
      if (initialToken === undefined) {
        delete process.env.MERCADOPAGO_ACCESS_TOKEN
      } else {
        process.env.MERCADOPAGO_ACCESS_TOKEN = initialToken
      }
    })

    async function validSignatureHeaders(paymentId: string, secret: string) {
      const requestId = 'req-test-uuid-valid'
      const ts = '1710372000'
      const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`
      const hash = (await import('crypto')).default.createHmac('sha256', secret).update(manifest).digest('hex')
      return { 'x-signature': `ts=${ts},v1=${hash}`, 'x-request-id': requestId }
    }

    it('should fail closed with 500 when the webhook secret is missing in a production runtime', async () => {
      process.env.VERCEL_ENV = 'production'
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET

      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch should not be called'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: {},
        body: { data: { id: '998877' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('signature verification unavailable')
      })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('MERCADOPAGO_WEBHOOK_SECRET missing in a production runtime')
      )
      consoleSpy.mockRestore()
    })

    it('should fail closed with 500 when the access token is missing in a production runtime', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret
      delete process.env.MERCADOPAGO_ACCESS_TOKEN

      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch should not be called'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const paymentId = '998877'
      const req = {
        method: 'POST',
        headers: await validSignatureHeaders(paymentId, testSecret),
        body: { data: { id: paymentId } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('payment verification unavailable')
      })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('MERCADOPAGO_ACCESS_TOKEN missing in a production runtime')
      )
      consoleSpy.mockRestore()
    })

    it('should keep the permissive acknowledgement in production when ALLOW_SIMULATED_PAYMENTS=true', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.ALLOW_SIMULATED_PAYMENTS = 'true'
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: {},
        body: { data: { id: '998877' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true,
          note: expect.stringContaining('verification failed')
        })
      )
      consoleSpy.mockRestore()
    })

    it("should not gate a production runtime with real credentials (MP API failure keeps today's ack)", async () => {
      // Known gap #5 (api/AGENTS.md §8.5): this permissive ack is still un-gated in
      // production — update this test when that path is picked up.
      process.env.VERCEL_ENV = 'production'
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const paymentId = '998877'
      const req = {
        method: 'POST',
        headers: await validSignatureHeaders(paymentId, testSecret),
        body: { data: { id: paymentId } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true,
          note: expect.stringContaining('verification failed')
        })
      )
      consoleSpy.mockRestore()
    })

    it('should keep the permissive acknowledgement outside production when the secret is missing (regression guard)', async () => {
      delete process.env.VERCEL_ENV
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: {},
        body: { data: { id: '998877' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      consoleSpy.mockRestore()
    })

    it('should refuse to acknowledge a verified payment when Firestore Admin is unavailable in production', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'approved',
          external_reference: 'PRONTO-123456',
          id: '998877'
        })
      } as Response)
      vi.mocked(getAdminFirestore).mockReturnValue(null)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const paymentId = '998877'
      const req = {
        method: 'POST',
        headers: await validSignatureHeaders(paymentId, testSecret),
        body: { data: { id: paymentId } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Webhook processing unavailable' })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Firestore Admin unavailable in a production runtime')
      )
      consoleSpy.mockRestore()
    })

    it('should keep the permissive warning response in production when ALLOW_SIMULATED_PAYMENTS=true (Admin down)', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.ALLOW_SIMULATED_PAYMENTS = 'true'
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'approved',
          external_reference: 'PRONTO-123456',
          id: '998877'
        })
      } as Response)
      vi.mocked(getAdminFirestore).mockReturnValue(null)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const paymentId = '998877'
      const req = {
        method: 'POST',
        headers: await validSignatureHeaders(paymentId, testSecret),
        body: { data: { id: paymentId } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true,
          warning: 'Firestore Admin unavailable'
        })
      )
      consoleSpy.mockRestore()
    })
  })
})
