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

describe('processMercadoPagoPayment — success semantics (no fabricated paid state)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const baseParams = {
    orderId: 'PRONTO-500000',
    items: mockItems,
    total: 189.99,
    customer: mockCustomer
  }

  it('reports success only as "redirect initiated" and echoes the orderId', async () => {
    // Dev simulation path: the endpoint is unreachable outside production, the
    // demo flow may continue — but nothing about a payment is invented.
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'))

    const result = await processMercadoPagoPayment({ ...baseParams, orderId: 'PRONTO-777777' })

    expect(result.success).toBe(true)
    expect(result.orderId).toBe('PRONTO-777777')
  })

  it('never fabricates a payment id, approved status or paid timestamp', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'))

    const result = await processMercadoPagoPayment(baseParams)

    // The exact result shape: nothing beyond success/orderId(/initPoint) may
    // exist, so a fabricated paymentId/status/paidAt cannot sneak back in.
    expect(result).toEqual({ success: true, orderId: 'PRONTO-500000' })
  })

  it('echoes the real initPoint and redirects when the endpoint provides one', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ initPoint: 'https://www.mercadopago.cl/checkout/v1/redirect?pref=123' })
    } as Response)

    const result = await processMercadoPagoPayment(baseParams)

    expect(result.success).toBe(true)
    expect(result.initPoint).toBe('https://www.mercadopago.cl/checkout/v1/redirect?pref=123')
  })

  it('fails when the endpoint answers 200 without a redirect target (invalid MP success response)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    } as Response)

    const result = await processMercadoPagoPayment(baseParams)

    expect(result.success).toBe(false)
    expect(result.error).toContain('no devolvió un enlace de pago válido')
    errorSpy.mockRestore()
  })

  it('keeps the dev simulation usable without inventing payment state', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'))

    const result = await processMercadoPagoPayment(baseParams)

    expect(result.success).toBe(true)
    expect(result.initPoint).toBeUndefined()
    expect(result.error).toBeUndefined()
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

  it('treats a 200 without a redirect target as a failure — never a silent success', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    } as Response)

    const res = await createMercadoPagoPreference(params)

    expect(res.success).toBe(false)
    expect(res.error).toContain('no devolvió un enlace de pago válido')
    errorSpy.mockRestore()
  })

  it('accepts a simulated 200 without a redirect target (dev fallback contract)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, isSimulated: true })
    } as Response)

    const res = await createMercadoPagoPreference(params)

    expect(res.success).toBe(true)
    expect(res.initPoint).toBeUndefined()
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
    expect(res).toEqual({
      success: false,
      orderId: 'PRONTO-500000',
      error: 'Stock insuficiente para uno o más productos'
    })
  })
})

describe('MERCADOPAGO_PUBLIC_KEY', () => {
  it('should be a string (possibly placeholder)', () => {
    expect(typeof MERCADOPAGO_PUBLIC_KEY).toBe('string')
  })
})
