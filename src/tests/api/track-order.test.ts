import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

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
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

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
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

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

  function mockOrderDb(orderData: Record<string, unknown>) {
    const mockAdminDb = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ empty: false, docs: [{ data: () => orderData }] })
          })
        })
      })
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
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
})
