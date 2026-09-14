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

  it('should update order to PAGADO_MERCADOPAGO and deduct stock using firebase-admin on approved payment', async () => {
    // Mock Mercado Pago API returning approved payment
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        external_reference: 'PRONTO-123456',
        id: 998877
      })
    } as Response)

    // Mock Firebase Admin Firestore
    const mockOrderUpdate = vi.fn().mockResolvedValue(true)
    const mockTransactionUpdate = vi.fn()
    const mockTransactionGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ stockCount: 5, inStock: true })
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
                      ref: { update: mockOrderUpdate },
                      data: () => ({
                        orderId: 'PRONTO-123456',
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
            doc: vi.fn().mockReturnValue({ id: 'prod-turbine-1' })
          }
        }
        return {}
      }),
      runTransaction: vi.fn(async (cb: any) => {
        await cb({
          get: mockTransactionGet,
          update: mockTransactionUpdate
        })
      })
    }

    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as any)

    const req = {
      method: 'POST',
      body: { data: { id: '998877' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })

    // Verify order update
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PAGADO_MERCADOPAGO',
        mercadopagoPaymentId: '998877',
        paidAt: expect.any(String)
      })
    )

    // Verify atomic stock deduction in transaction: 5 - 2 = 3
    expect(mockAdminDb.runTransaction).toHaveBeenCalledTimes(1)
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        stockCount: 3,
        inStock: true
      })
    )
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
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as any)

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
})
