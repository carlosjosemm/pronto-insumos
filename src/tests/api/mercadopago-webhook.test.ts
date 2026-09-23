import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Mock firebaseAdmin before importing webhook handler
vi.mock('../../../api/lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

import handler from '../../../api/webhooks/mercadopago'
import { getAdminFirestore } from '../../../api/lib/firebaseAdmin'

function createMockRes() {
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  }
  return res as VercelResponse & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }
}

describe('Mercado Pago Serverless Webhook (/api/webhooks/mercadopago)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
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
    // Mock Mercado Pago API returning approved payment
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        external_reference: 'PRONTO-123456',
        id: 998877
      })
    } as Response)

    const orderRef = { id: 'order-doc-abc' }
    const productRef = { id: 'prod-turbine-1' }

    const mockTransactionUpdate = vi.fn()
    const mockTransactionGet = vi.fn().mockImplementation((ref: { id?: string }) => {
      if (ref?.id === 'order-doc-abc') {
        return Promise.resolve({
          exists: true,
          data: () => ({
            orderId: 'PRONTO-123456',
            status: 'PENDIENTE_PAGO_MERCADOPAGO',
            items: [{ productId: 'prod-turbine-1', quantity: 2 }]
          })
        })
      }
      return Promise.resolve({
        exists: true,
        data: () => ({ stockCount: 5, inStock: true })
      })
    })

    const mockAdminDb = {
      collection: vi.fn((colName: string) => {
        if (colName === 'orders') {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                  empty: false,
                  docs: [
                    {
                      id: 'order-doc-abc',
                      ref: orderRef,
                      data: () => ({
                        orderId: 'PRONTO-123456',
                        status: 'PENDIENTE_PAGO_MERCADOPAGO',
                        items: [{ productId: 'prod-turbine-1', quantity: 2 }]
                      })
                    }
                  ]
                })
              })
            })
          }
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
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                  empty: false,
                  docs: [
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
                  ]
                })
              })
            })
          }
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
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                  empty: false,
                  docs: [
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
                  ]
                })
              })
            })
          }
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
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                  empty: false,
                  docs: [
                    {
                      id: 'order-doc-abc',
                      ref: orderRef,
                      data: () => ({
                        orderId: 'PRONTO-123456',
                        status: 'PENDIENTE_PAGO_MERCADOPAGO' // initial read was pending
                      })
                    }
                  ]
                })
              })
            })
          }
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
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ empty: true, docs: [] })
          })
        })
      }),
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
})
