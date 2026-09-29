import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  processMercadoPagoPayment,
  createMercadoPagoPreference,
  MERCADOPAGO_PUBLIC_KEY
} from '../../services/mercadopago'
import { CartItem, CustomerInfo } from '../../types'

const mockCustomer: CustomerInfo = {
  fullName: 'Clínica Dental Sur',
  email: 'admin@clinicasur.cl',
  phone: '+56 9 8765 4321',
  rut: '76.543.210-3',
  documentType: 'factura',
  address: 'Calle Comercio 100',
  city: 'Melipilla',
  zip: '9500000'
}

const mockItems: CartItem[] = [
  {
    product: {
      id: 'odon-101',
      name: 'Turbina Odontológica LED MasterTorque',
      category: 'Instruments',
      manufacturer: 'NSK',
      price: 189.99,
      rating: 4.9,
      reviewsCount: 86,
      inStock: true,
      stockCount: 18,
      prescriptionRequired: false,
      tag: 'Más Vendido',
      description: 'Pieza de mano',
      specs: ['420.000 RPM'],
      placeholderTheme: 'gradient-teal',
      mediaBadge: 'LED'
    },
    quantity: 1
  }
]

describe('processMercadoPagoPayment', () => {
  it('should return a successful payment result', async () => {
    const result = await processMercadoPagoPayment({
      orderId: 'PRONTO-500000',
      items: mockItems,
      total: 189.99,
      customer: mockCustomer
    })

    expect(result.success).toBe(true)
  })

  it('should return an approved status', async () => {
    const result = await processMercadoPagoPayment({
      orderId: 'PRONTO-500000',
      items: mockItems,
      total: 189.99,
      customer: mockCustomer
    })

    expect(result.status).toBe('approved')
    expect(result.statusDetail).toBe('accredited')
  })

  it('should return a payment ID starting with MP-', async () => {
    const result = await processMercadoPagoPayment({
      orderId: 'PRONTO-500000',
      items: mockItems,
      total: 189.99,
      customer: mockCustomer
    })

    expect(result.paymentId).toMatch(/^MP-\d+$/)
  })

  it('should echo back the correct orderId', async () => {
    const result = await processMercadoPagoPayment({
      orderId: 'PRONTO-777777',
      items: mockItems,
      total: 189.99,
      customer: mockCustomer
    })

    expect(result.orderId).toBe('PRONTO-777777')
  })

  it('should echo back the correct total paid', async () => {
    const result = await processMercadoPagoPayment({
      orderId: 'PRONTO-500000',
      items: mockItems,
      total: 245.5,
      customer: mockCustomer
    })

    expect(result.totalPaid).toBe(245.5)
  })

  it('should include a valid ISO timestamp in paidAt', async () => {
    const result = await processMercadoPagoPayment({
      orderId: 'PRONTO-500000',
      items: mockItems,
      total: 189.99,
      customer: mockCustomer
    })

    expect(result.paidAt).toBeDefined()
    const parsed = new Date(result.paidAt as string)
    expect(parsed.getTime()).not.toBeNaN()
  })
})

describe('createMercadoPagoPreference — Task 2.8 error contract', () => {
  const params = { orderId: 'PRONTO-500000', items: mockItems, total: 189.99, customer: mockCustomer }
  const mutableEnv = import.meta.env as unknown as Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    delete mutableEnv.VITE_VERCEL_ENV
    delete mutableEnv.VITE_ALLOW_SIMULATED_PAYMENTS
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete mutableEnv.VITE_VERCEL_ENV
    delete mutableEnv.VITE_ALLOW_SIMULATED_PAYMENTS
  })

  it('returns success with the initPoint on a 200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ initPoint: 'https://www.mercadopago.cl/checkout/v1/redirect?pref=123' })
    } as Response)

    const res = await createMercadoPagoPreference(params)

    expect(res.success).toBe(true)
    expect(res.initPoint).toBe('https://www.mercadopago.cl/checkout/v1/redirect?pref=123')
  })

  it('surfaces a real HTTP 400 stock rejection as an error — never simulates success', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Stock insuficiente para uno o más productos' })
    } as Response)

    const res = await createMercadoPagoPreference(params)

    expect(res.success).toBe(false)
    expect(res.error).toBe('Stock insuficiente para uno o más productos')
    expect(res.initPoint).toBeUndefined()
  })

  it('returns a generic error on an HTTP 500 without a JSON body', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json')
      }
    } as unknown as Response)

    const res = await createMercadoPagoPreference(params)

    expect(res.success).toBe(false)
    expect(res.error).toContain('500')
  })

  it('keeps the dev simulation when the endpoint is unreachable outside production', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'))

    const res = await createMercadoPagoPreference(params)

    expect(res.success).toBe(true)
    expect(res.initPoint).toBeUndefined()
  })

  it('fails loudly when the endpoint is unreachable in a production runtime', async () => {
    mutableEnv.VITE_VERCEL_ENV = 'production'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'))

    const res = await createMercadoPagoPreference(params)

    expect(res.success).toBe(false)
    expect(res.error).toContain('No fue posible contactar al servicio de pagos')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('honors VITE_ALLOW_SIMULATED_PAYMENTS=true as the production escape hatch', async () => {
    mutableEnv.VITE_VERCEL_ENV = 'production'
    mutableEnv.VITE_ALLOW_SIMULATED_PAYMENTS = 'true'
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'))

    const res = await createMercadoPagoPreference(params)

    expect(res.success).toBe(true)
    expect(res.initPoint).toBeUndefined()
  })
})

describe('processMercadoPagoPayment — Task 2.8 failure propagation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('propagates a preference failure instead of fabricating an approved payment', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Stock insuficiente para uno o más productos' })
    } as Response)

    const res = await processMercadoPagoPayment({
      orderId: 'PRONTO-500000',
      items: mockItems,
      total: 189.99,
      customer: mockCustomer
    })

    expect(res.success).toBe(false)
    expect(res.error).toBe('Stock insuficiente para uno o más productos')
    expect(res.status).toBeUndefined()
    expect(res.paymentId).toBeUndefined()
  })
})

describe('MERCADOPAGO_PUBLIC_KEY', () => {
  it('should be a string (possibly placeholder)', () => {
    expect(typeof MERCADOPAGO_PUBLIC_KEY).toBe('string')
  })
})
