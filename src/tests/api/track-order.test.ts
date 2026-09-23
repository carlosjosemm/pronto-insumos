import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Mock firebaseAdmin before importing handler
vi.mock('../../../api/lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn(() => null)
}))

import handler from '../../../api/track-order'
import { getAdminFirestore } from '../../../api/lib/firebaseAdmin'

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
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
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
    const mockAdminDb = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ empty: true, docs: [] })
          })
        })
      })
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as any)

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
    const mockOrderDoc = {
      data: () => ({
        orderId: 'PRONTO-123456',
        customer: { rut: '11.111.111-1' },
        status: 'PENDIENTE_TRANSFERENCIA'
      })
    }
    const mockAdminDb = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ empty: false, docs: [mockOrderDoc] })
          })
        })
      })
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as any)

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
    const mockOrderDoc = {
      data: () => ({
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
    }
    const mockAdminDb = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ empty: false, docs: [mockOrderDoc] })
          })
        })
      })
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as any)

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
})
