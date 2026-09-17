import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchOrderTracking } from '../../services/orderTracking'

describe('Order Tracking Service (src/services/orderTracking)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('should return error when orderId is empty', async () => {
    const res = await fetchOrderTracking({ orderId: '', rut: '12.345.678-5' })
    expect(res.success).toBe(false)
    expect(res.error).toContain('N° de Pedido')
  })

  it('should return error when RUT is missing or invalid according to Modulo 11', async () => {
    const emptyRut = await fetchOrderTracking({ orderId: 'PRONTO-123456', rut: '' })
    expect(emptyRut.success).toBe(false)
    expect(emptyRut.error).toContain('RUT')

    const invalidRut = await fetchOrderTracking({ orderId: 'PRONTO-123456', rut: '12.345.678-0' })
    expect(invalidRut.success).toBe(false)
    expect(invalidRut.error).toContain('RUT')
  })

  it('should call /api/track-order with normalized parameters and return tracking data', async () => {
    const mockTrackingData = {
      orderId: 'PRONTO-123456',
      createdAt: '2026-09-17T12:00:00Z',
      status: 'EN_PREPARACION',
      paymentMethod: 'transferencia',
      totalAmount: 189990,
      items: [{ productId: 'odon-101', name: 'Turbina LED', quantity: 1, price: 189990 }],
      customer: {
        fullName: 'Dra. Andrea Morales',
        email: 'contacto@moralesdental.cl',
        rut: '12345678-5',
        address: 'Av. Ortúzar 750',
        city: 'Melipilla',
        documentType: 'factura'
      },
      fulfillment: {
        currentStep: 3,
        statusTitle: 'Preparando en Bodega Melipilla',
        statusDescription: 'Acondicionando instrumental'
      }
    }

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockTrackingData
    } as Response)

    const res = await fetchOrderTracking({ orderId: 'pronto-123456', rut: '12.345.678-5' })

    expect(res.success).toBe(true)
    expect(res.data?.orderId).toBe('PRONTO-123456')
    expect(res.data?.fulfillment.currentStep).toBe(3)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('should handle non-200 API response with error message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Pedido no encontrado' })
    } as Response)

    const res = await fetchOrderTracking({ orderId: 'PRONTO-000000', rut: '12.345.678-5' })
    expect(res.success).toBe(false)
    expect(res.error).toBe('Pedido no encontrado')
  })
})
