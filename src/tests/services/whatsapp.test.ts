import { describe, it, expect } from 'vitest'
import { generateWhatsAppQuoteUrl } from '../../services/whatsapp'
import { CartItem, CustomerInfo } from '../../types'

const mockCustomer: CustomerInfo = {
  fullName: 'Dra. Camila Fuentes - Clínica Odontológica Melipilla',
  email: 'contacto@odontomelipilla.cl',
  phone: '+56 9 1234 5678',
  rut: '12.345.678-5',
  documentType: 'boleta',
  address: 'Av. Ortúzar 750, Of. 302',
  city: 'Melipilla, Región Metropolitana',
  zip: '9500000'
}

const mockCartItems: CartItem[] = [
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
      description: 'Pieza de mano de alta velocidad',
      specs: ['Velocidad: 420.000 RPM'],
      placeholderTheme: 'gradient-teal',
      mediaBadge: 'LED'
    },
    quantity: 2
  },
  {
    product: {
      id: 'odon-104',
      name: 'Kit de Resinas Compuestas Nano-Híbridas DentFill',
      category: 'Materials',
      price: 79.99,
      rating: 4.7,
      reviewsCount: 145,
      inStock: true,
      stockCount: 35,
      prescriptionRequired: false,
      tag: 'Alta Estética',
      description: 'Set de 8 jeringas de resina estética',
      specs: ['8 Jeringas de 4g'],
      placeholderTheme: 'gradient-emerald',
      mediaBadge: 'Nano-Híbrido'
    },
    quantity: 1
  }
]

describe('generateWhatsAppQuoteUrl', () => {
  it('should return a valid wa.me URL', () => {
    const url = generateWhatsAppQuoteUrl({
      orderId: 'PRONTO-123456',
      customer: mockCustomer,
      items: mockCartItems,
      total: 459.97
    })

    expect(url).toMatch(/^https:\/\/wa\.me\//)
  })

  it('should include the configured phone number', () => {
    const url = generateWhatsAppQuoteUrl({
      orderId: 'PRONTO-123456',
      customer: mockCustomer,
      items: mockCartItems,
      total: 459.97
    })

    expect(url).toContain('wa.me/56912345678')
  })

  it('should include the order ID in the encoded message', () => {
    const url = generateWhatsAppQuoteUrl({
      orderId: 'PRONTO-999999',
      customer: mockCustomer,
      items: mockCartItems,
      total: 459.97
    })

    const decoded = decodeURIComponent(url)
    expect(decoded).toContain('PRONTO-999999')
  })

  it('should include the customer name in the message', () => {
    const url = generateWhatsAppQuoteUrl({
      orderId: 'PRONTO-123456',
      customer: mockCustomer,
      items: mockCartItems,
      total: 459.97
    })

    const decoded = decodeURIComponent(url)
    expect(decoded).toContain('Dra. Camila Fuentes')
  })

  it('should include all product names in the itemized list', () => {
    const url = generateWhatsAppQuoteUrl({
      orderId: 'PRONTO-123456',
      customer: mockCustomer,
      items: mockCartItems,
      total: 459.97
    })

    const decoded = decodeURIComponent(url)
    expect(decoded).toContain('Turbina Odontológica LED MasterTorque')
    expect(decoded).toContain('Kit de Resinas Compuestas Nano-Híbridas DentFill')
  })

  it('should include the total amount formatted to 2 decimals', () => {
    const url = generateWhatsAppQuoteUrl({
      orderId: 'PRONTO-123456',
      customer: mockCustomer,
      items: mockCartItems,
      total: 459.97
    })

    const decoded = decodeURIComponent(url)
    expect(decoded).toContain('$459.97')
  })

  it('should include quantities with product prices', () => {
    const url = generateWhatsAppQuoteUrl({
      orderId: 'PRONTO-123456',
      customer: mockCustomer,
      items: mockCartItems,
      total: 459.97
    })

    const decoded = decodeURIComponent(url)
    // 2x Turbina @ 189.99 = $379.98
    expect(decoded).toContain('2x')
    expect(decoded).toContain('$379.98')
    // 1x Resinas @ 79.99 = $79.99
    expect(decoded).toContain('1x')
    expect(decoded).toContain('$79.99')
  })

  it('should include Melipilla delivery reference', () => {
    const url = generateWhatsAppQuoteUrl({
      orderId: 'PRONTO-123456',
      customer: mockCustomer,
      items: mockCartItems,
      total: 459.97
    })

    const decoded = decodeURIComponent(url)
    expect(decoded).toContain('Melipilla')
  })
})
