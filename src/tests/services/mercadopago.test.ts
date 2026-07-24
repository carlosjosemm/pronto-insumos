import { describe, it, expect } from 'vitest'
import { processMercadoPagoPayment, MERCADOPAGO_PUBLIC_KEY } from '../../services/mercadopago'
import { CartItem, CustomerInfo } from '../../types'

const mockCustomer: CustomerInfo = {
  fullName: 'Clínica Dental Sur',
  email: 'admin@clinicasur.cl',
  phone: '+56 9 8765 4321',
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
      total: 245.50,
      customer: mockCustomer
    })

    expect(result.totalPaid).toBe(245.50)
  })

  it('should include a valid ISO timestamp in paidAt', async () => {
    const result = await processMercadoPagoPayment({
      orderId: 'PRONTO-500000',
      items: mockItems,
      total: 189.99,
      customer: mockCustomer
    })

    const parsed = new Date(result.paidAt)
    expect(parsed.getTime()).not.toBeNaN()
  })
})

describe('MERCADOPAGO_PUBLIC_KEY', () => {
  it('should be a string (possibly placeholder)', () => {
    expect(typeof MERCADOPAGO_PUBLIC_KEY).toBe('string')
  })
})
