import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// Mock services before importing component
vi.mock('../../services/api', () => ({
  submitOrder: vi.fn(),
  generateOrderId: vi.fn(() => 'PRONTO-TEST1234')
}))

vi.mock('../../services/mercadopago', () => ({
  processMercadoPagoPayment: vi.fn().mockResolvedValue({
    id: 'MP-TEST-123',
    status: 'approved',
    orderId: 'PRONTO-TEST1234',
    total: 189990,
    paidAt: new Date().toISOString()
  })
}))

vi.mock('../../services/whatsapp', () => ({
  generateWhatsAppQuoteUrl: vi.fn(() => 'https://wa.me/56912345678?text=Test')
}))

import CheckoutModal, { CheckoutModalProps } from '../../components/CheckoutModal'
import { submitOrder } from '../../services/api'
import { processMercadoPagoPayment } from '../../services/mercadopago'
import { CartItem, Product } from '../../types'

const mockProduct: Product = {
  id: 'odon-101',
  name: 'Turbina Odontológica LED MasterTorque',
  category: 'Instruments',
  manufacturer: 'NSK',
  price: 189990,
  rating: 4.9,
  reviewsCount: 86,
  inStock: true,
  stockCount: 18,
  prescriptionRequired: false,
  tag: 'Más Vendido',
  description: 'Pieza de mano de alta velocidad',
  specs: ['420.000 RPM'],
  placeholderTheme: 'gradient-teal',
  mediaBadge: 'LED'
}

const mockCartItems: CartItem[] = [
  { product: mockProduct, quantity: 1 }
]

const defaultProps: CheckoutModalProps = {
  isOpen: true,
  onClose: vi.fn(),
  cartItems: mockCartItems,
  totalAmount: 189990,
  onOrderSuccess: vi.fn()
}

describe('CheckoutModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(submitOrder).mockResolvedValue({
      success: true,
      orderId: 'PRONTO-TEST1234',
      timestamp: new Date().toISOString(),
      total: 189990,
      itemsCount: 1
    })
  })

  it('should not render anything when isOpen is false', () => {
    const { container } = render(<CheckoutModal {...defaultProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('should initialize with empty form fields and not expose prefilled mock identity data', () => {
    render(<CheckoutModal {...defaultProps} />)

    // Form inputs should start empty
    const nameInput = screen.getByPlaceholderText(/Dra\. Camila Fuentes/i) as HTMLInputElement
    expect(nameInput.value).toBe('')

    const emailInput = screen.getByPlaceholderText('contacto@clinica.cl') as HTMLInputElement
    expect(emailInput.value).toBe('')

    const phoneInput = screen.getByPlaceholderText('+56 9 1234 5678') as HTMLInputElement
    expect(phoneInput.value).toBe('')

    const rutInput = screen.getByPlaceholderText('12.345.678-K') as HTMLInputElement
    expect(rutInput.value).toBe('')

    const addressInput = screen.getByPlaceholderText(/Av\. Ortúzar/i) as HTMLInputElement
    expect(addressInput.value).toBe('')

    const cityInput = screen.getByPlaceholderText(/Melipilla/i) as HTMLInputElement
    expect(cityInput.value).toBe('')

    const zipInput = screen.getByPlaceholderText('Ej: 9500000') as HTMLInputElement
    expect(zipInput.value).toBe('')
  })

  it('should format Chilean RUT as the user inputs characters', () => {
    render(<CheckoutModal {...defaultProps} />)

    const rutInput = screen.getByPlaceholderText('12.345.678-K') as HTMLInputElement
    fireEvent.change(rutInput, { target: { value: '123456785' } })

    expect(rutInput.value).toBe('12.345.678-5')
  })

  it('should display Factura tax fields only when Factura Electrónica is selected', () => {
    render(<CheckoutModal {...defaultProps} />)

    // Initially Boleta is selected, Factura fields should not be in document
    expect(screen.queryByPlaceholderText('Ej: Centro Dental San Pedro SpA')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Ej: Servicios Odontológicos')).not.toBeInTheDocument()

    // Click Factura Electrónica button
    const facturaBtn = screen.getByText(/Factura Electrónica/i)
    fireEvent.click(facturaBtn)

    // Factura fields should now appear
    expect(screen.getByPlaceholderText('Ej: Centro Dental San Pedro SpA')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ej: Servicios Odontológicos')).toBeInTheDocument()
  })

  it('should block navigation to Step 2 if RUT fails Modulo 11 check', () => {
    render(<CheckoutModal {...defaultProps} />)

    const nameInput = screen.getByPlaceholderText(/Dra\. Camila Fuentes/i)
    fireEvent.change(nameInput, { target: { value: 'Dr. Roberto Gomez' } })

    const rutInput = screen.getByPlaceholderText('12.345.678-K')
    fireEvent.change(rutInput, { target: { value: '11.111.111-2' } }) // Invalid check digit

    const emailInput = screen.getByPlaceholderText('contacto@clinica.cl')
    fireEvent.change(emailInput, { target: { value: 'roberto@clinica.cl' } })

    const phoneInput = screen.getByPlaceholderText('+56 9 1234 5678')
    fireEvent.change(phoneInput, { target: { value: '+56 9 9876 5432' } })

    const addressInput = screen.getByPlaceholderText(/Av\. Ortúzar/i)
    fireEvent.change(addressInput, { target: { value: 'Calle Real 123' } })

    const cityInput = screen.getByPlaceholderText(/Melipilla/i)
    fireEvent.change(cityInput, { target: { value: 'Melipilla' } })

    const zipInput = screen.getByPlaceholderText('Ej: 9500000')
    fireEvent.change(zipInput, { target: { value: '9500000' } })

    const submitBtn = screen.getByText(/Seleccionar Método de Pago/i)
    fireEvent.click(submitBtn)

    // Should display validation error and stay on Step 1
    expect(screen.getByText(/RUT inválido/i)).toBeInTheDocument()
    expect(screen.queryByText(/Selecciona la Opción Preferida/i)).not.toBeInTheDocument()
  })

  it('should advance to Step 2 when customer details and valid Chilean RUT are provided', () => {
    render(<CheckoutModal {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/Dra\. Camila Fuentes/i), { target: { value: 'Dr. Roberto Gomez' } })
    fireEvent.change(screen.getByPlaceholderText('12.345.678-K'), { target: { value: '12.345.678-5' } }) // Valid check digit
    fireEvent.change(screen.getByPlaceholderText('contacto@clinica.cl'), { target: { value: 'roberto@clinica.cl' } })
    fireEvent.change(screen.getByPlaceholderText('+56 9 1234 5678'), { target: { value: '+56 9 9876 5432' } })
    fireEvent.change(screen.getByPlaceholderText(/Av\. Ortúzar/i), { target: { value: 'Calle Real 123' } })
    fireEvent.change(screen.getByPlaceholderText(/Melipilla/i), { target: { value: 'Melipilla' } })
    fireEvent.change(screen.getByPlaceholderText('Ej: 9500000'), { target: { value: '9500000' } })

    fireEvent.click(screen.getByText(/Seleccionar Método de Pago/i))

    // Should advance to Step 2
    expect(screen.getByText(/Selecciona la Opción Preferida para tu Clínica/i)).toBeInTheDocument()
  })

  it('should navigate back to Step 1 when clicking Volver in Step 2', () => {
    render(<CheckoutModal {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/Dra\. Camila Fuentes/i), { target: { value: 'Dr. Roberto Gomez' } })
    fireEvent.change(screen.getByPlaceholderText('12.345.678-K'), { target: { value: '12.345.678-5' } })
    fireEvent.change(screen.getByPlaceholderText('contacto@clinica.cl'), { target: { value: 'roberto@clinica.cl' } })
    fireEvent.change(screen.getByPlaceholderText('+56 9 1234 5678'), { target: { value: '+56 9 9876 5432' } })
    fireEvent.change(screen.getByPlaceholderText(/Av\. Ortúzar/i), { target: { value: 'Calle Real 123' } })
    fireEvent.change(screen.getByPlaceholderText(/Melipilla/i), { target: { value: 'Melipilla' } })
    fireEvent.change(screen.getByPlaceholderText('Ej: 9500000'), { target: { value: '9500000' } })

    fireEvent.click(screen.getByText(/Seleccionar Método de Pago/i))
    expect(screen.getByText(/Selecciona la Opción Preferida para tu Clínica/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Volver'))
    expect(screen.getByText(/Seleccionar Método de Pago \/ Cotización/i)).toBeInTheDocument()
  })

  it('PCI-DSS Compliance: should never include cardNumber, expDate, or cvc in order submission payload', async () => {
    render(<CheckoutModal {...defaultProps} />)

    // Complete Step 1
    fireEvent.change(screen.getByPlaceholderText(/Dra\. Camila Fuentes/i), { target: { value: 'Dra. Andrea Morales' } })
    fireEvent.change(screen.getByPlaceholderText('12.345.678-K'), { target: { value: '12.345.678-5' } })
    fireEvent.change(screen.getByPlaceholderText('contacto@clinica.cl'), { target: { value: 'andrea@moralesdental.cl' } })
    fireEvent.change(screen.getByPlaceholderText('+56 9 1234 5678'), { target: { value: '+56 9 5555 4444' } })
    fireEvent.change(screen.getByPlaceholderText(/Av\. Ortúzar/i), { target: { value: 'Av. Ortúzar 100' } })
    fireEvent.change(screen.getByPlaceholderText(/Melipilla/i), { target: { value: 'Melipilla' } })
    fireEvent.change(screen.getByPlaceholderText('Ej: 9500000'), { target: { value: '9500000' } })

    fireEvent.click(screen.getByText(/Seleccionar Método de Pago/i))

    // Confirm in Step 2
    const confirmBtn = screen.getByText('Confirmar Pedido')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(submitOrder).toHaveBeenCalledTimes(1)
    })

    const callPayload = vi.mocked(submitOrder).mock.calls[0][0]
    const customerPayload = (callPayload.customer as unknown) as Record<string, unknown>

    // Verify critical privacy & PCI-DSS rules
    expect(customerPayload).toBeDefined()
    expect(customerPayload).not.toHaveProperty('cardNumber')
    expect(customerPayload).not.toHaveProperty('expDate')
    expect(customerPayload).not.toHaveProperty('cvc')
    expect(customerPayload.fullName).toBe('Dra. Andrea Morales')
    expect(customerPayload.email).toBe('andrea@moralesdental.cl')
    expect(customerPayload.rut).toBe('12.345.678-5')
  })

  it('should delegate online payment to processMercadoPagoPayment without card data when mercadopago is selected', async () => {
    render(<CheckoutModal {...defaultProps} />)

    // Complete Step 1
    fireEvent.change(screen.getByPlaceholderText(/Dra\. Camila Fuentes/i), { target: { value: 'Dr. Felipe Rios' } })
    fireEvent.change(screen.getByPlaceholderText('12.345.678-K'), { target: { value: '12.345.678-5' } })
    fireEvent.change(screen.getByPlaceholderText('contacto@clinica.cl'), { target: { value: 'felipe@riosdental.cl' } })
    fireEvent.change(screen.getByPlaceholderText('+56 9 1234 5678'), { target: { value: '+56 9 7777 8888' } })
    fireEvent.change(screen.getByPlaceholderText(/Av\. Ortúzar/i), { target: { value: 'Av. Ortúzar 500' } })
    fireEvent.change(screen.getByPlaceholderText(/Melipilla/i), { target: { value: 'Melipilla' } })
    fireEvent.change(screen.getByPlaceholderText('Ej: 9500000'), { target: { value: '9500000' } })

    fireEvent.click(screen.getByText(/Seleccionar Método de Pago/i))

    // Select Mercado Pago
    const mpRadio = screen.getByLabelText(/Pago Inmediato Mercado Pago Chile/i)
    fireEvent.click(mpRadio)

    // Submit
    const confirmBtn = screen.getByText('Confirmar Pedido')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(submitOrder).toHaveBeenCalledTimes(1)
      expect(processMercadoPagoPayment).toHaveBeenCalledTimes(1)
    })

    const mpCallPayload = vi.mocked(processMercadoPagoPayment).mock.calls[0][0]
    const mpCustomer = (mpCallPayload.customer as unknown) as Record<string, unknown>

    expect(mpCustomer).not.toHaveProperty('cardNumber')
    expect(mpCustomer).not.toHaveProperty('expDate')
    expect(mpCustomer).not.toHaveProperty('cvc')
  })

  it('should trim whitespace from text inputs when preparing submission payload', async () => {
    render(<CheckoutModal {...defaultProps} />)

    // Complete Step 1 with extra spaces
    fireEvent.change(screen.getByPlaceholderText(/Dra\. Camila Fuentes/i), { target: { value: '  Dra. Andrea Morales   ' } })
    fireEvent.change(screen.getByPlaceholderText('12.345.678-K'), { target: { value: ' 12.345.678-5  ' } })
    fireEvent.change(screen.getByPlaceholderText('contacto@clinica.cl'), { target: { value: ' andrea@moralesdental.cl  ' } })
    fireEvent.change(screen.getByPlaceholderText('+56 9 1234 5678'), { target: { value: ' +56 9 5555 4444 ' } })
    fireEvent.change(screen.getByPlaceholderText(/Av\. Ortúzar/i), { target: { value: '  Av. Ortúzar 100  ' } })
    fireEvent.change(screen.getByPlaceholderText(/Melipilla/i), { target: { value: ' Melipilla ' } })
    fireEvent.change(screen.getByPlaceholderText('Ej: 9500000'), { target: { value: ' 9500000 ' } })

    fireEvent.click(screen.getByText(/Seleccionar Método de Pago/i))

    // Confirm in Step 2
    fireEvent.click(screen.getByText('Confirmar Pedido'))

    await waitFor(() => {
      expect(submitOrder).toHaveBeenCalledTimes(1)
    })

    const callPayload = vi.mocked(submitOrder).mock.calls[0][0]
    expect(callPayload.customer.fullName).toBe('Dra. Andrea Morales')
    expect(callPayload.customer.email).toBe('andrea@moralesdental.cl')
    expect(callPayload.customer.phone).toBe('+56 9 5555 4444')
    expect(callPayload.customer.rut).toBe('12.345.678-5')
    expect(callPayload.customer.address).toBe('Av. Ortúzar 100')
    expect(callPayload.customer.city).toBe('Melipilla')
    expect(callPayload.customer.zip).toBe('9500000')
  })

  it('should reset form state and step to 1 when Volver a la Tienda is clicked after order', async () => {
    const { rerender } = render(<CheckoutModal {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/Dra\. Camila Fuentes/i), { target: { value: 'Dra. Andrea Morales' } })
    fireEvent.change(screen.getByPlaceholderText('12.345.678-K'), { target: { value: '12.345.678-5' } })
    fireEvent.change(screen.getByPlaceholderText('contacto@clinica.cl'), { target: { value: 'andrea@moralesdental.cl' } })
    fireEvent.change(screen.getByPlaceholderText('+56 9 1234 5678'), { target: { value: '+56 9 5555 4444' } })
    fireEvent.change(screen.getByPlaceholderText(/Av\. Ortúzar/i), { target: { value: 'Av. Ortúzar 100' } })
    fireEvent.change(screen.getByPlaceholderText(/Melipilla/i), { target: { value: 'Melipilla' } })
    fireEvent.change(screen.getByPlaceholderText('Ej: 9500000'), { target: { value: '9500000' } })

    fireEvent.click(screen.getByText(/Seleccionar Método de Pago/i))
    fireEvent.click(screen.getByText('Confirmar Pedido'))

    await waitFor(() => {
      expect(screen.getByText(/¡Pedido Registrado con Éxito!/i)).toBeInTheDocument()
    })

    // Click Volver a la Tienda
    fireEvent.click(screen.getByText('Volver a la Tienda'))
    expect(defaultProps.onClose).toHaveBeenCalled()

    // Simulate modal re-opening
    rerender(<CheckoutModal {...defaultProps} isOpen={true} />)
    expect(screen.getByText(/Gestión de Pedido y Pago/i)).toBeInTheDocument()
    const nameInput = screen.getByPlaceholderText(/Dra\. Camila Fuentes/i) as HTMLInputElement
    expect(nameInput.value).toBe('')
  })

  it('should require and validate Razón Social and Giro Comercial when Factura is selected', () => {
    render(<CheckoutModal {...defaultProps} />)

    // Select Factura
    fireEvent.click(screen.getByText(/Factura Electrónica/i))

    // Fill common fields
    fireEvent.change(screen.getByPlaceholderText(/Contacto \/ Solicitante/i), { target: { value: 'Dra. Camila Fuentes' } })
    fireEvent.change(screen.getByPlaceholderText('12.345.678-K'), { target: { value: '12.345.678-5' } })
    fireEvent.change(screen.getByPlaceholderText('contacto@clinica.cl'), { target: { value: 'camila@clinica.cl' } })
    fireEvent.change(screen.getByPlaceholderText('+56 9 1234 5678'), { target: { value: '+56 9 1234 5678' } })
    fireEvent.change(screen.getByPlaceholderText(/Av\. Ortúzar/i), { target: { value: 'Av. Ortúzar 750' } })
    fireEvent.change(screen.getByPlaceholderText(/Región Metropolitana/i), { target: { value: 'Melipilla' } })
    fireEvent.change(screen.getByPlaceholderText('Ej: 9500000'), { target: { value: '9500000' } })

    // Try to advance without Razón Social and Giro
    fireEvent.click(screen.getByText(/Seleccionar Método de Pago/i))

    // Should stay on Step 1 and display errors
    expect(screen.getByText(/Razón Social.*obligatoria/i)).toBeInTheDocument()
    expect(screen.getByText(/Giro Comercial.*obligatorio/i)).toBeInTheDocument()
    expect(screen.queryByText(/Transferencia Bancaria Directa/i)).not.toBeInTheDocument()

    // Fill Razón Social and Giro
    fireEvent.change(screen.getByPlaceholderText(/Centro Dental San Pedro/i), { target: { value: 'Centro Dental Melipilla SpA' } })
    fireEvent.change(screen.getByPlaceholderText(/Servicios Odontológicos/i), { target: { value: 'Servicios Odontológicos' } })

    // Advance
    fireEvent.click(screen.getByText(/Seleccionar Método de Pago/i))

    // Should now reach Step 2
    expect(screen.getByText(/Transferencia Bancaria Directa/i)).toBeInTheDocument()
  })

  it('should include structured billing payload and display pro-forma voucher in Step 3', async () => {
    render(<CheckoutModal {...defaultProps} totalAmount={189990} />)

    // Select Factura
    fireEvent.click(screen.getByText(/Factura Electrónica/i))

    fireEvent.change(screen.getByPlaceholderText(/Contacto \/ Solicitante/i), { target: { value: 'Dra. Camila Fuentes' } })
    fireEvent.change(screen.getByPlaceholderText('12.345.678-K'), { target: { value: '12.345.678-5' } })
    fireEvent.change(screen.getByPlaceholderText('contacto@clinica.cl'), { target: { value: 'camila@clinica.cl' } })
    fireEvent.change(screen.getByPlaceholderText('+56 9 1234 5678'), { target: { value: '+56 9 1234 5678' } })
    fireEvent.change(screen.getByPlaceholderText(/Av\. Ortúzar/i), { target: { value: 'Av. Ortúzar 750' } })
    fireEvent.change(screen.getByPlaceholderText(/Región Metropolitana/i), { target: { value: 'Melipilla' } })
    fireEvent.change(screen.getByPlaceholderText('Ej: 9500000'), { target: { value: '9500000' } })
    fireEvent.change(screen.getByPlaceholderText(/Centro Dental San Pedro/i), { target: { value: 'Centro Dental Melipilla SpA' } })
    fireEvent.change(screen.getByPlaceholderText(/Servicios Odontológicos/i), { target: { value: 'Servicios Odontológicos' } })

    // Step 2
    fireEvent.click(screen.getByText(/Seleccionar Método de Pago/i))

    // Confirm Order
    fireEvent.click(screen.getByText('Confirmar Pedido'))

    await waitFor(() => {
      expect(submitOrder).toHaveBeenCalledTimes(1)
    })

    // Verify structured billing payload
    const submitCall = vi.mocked(submitOrder).mock.calls[0][0]
    expect(submitCall.billing).toBeDefined()
    expect(submitCall.billing?.documentType).toBe('factura')
    expect(submitCall.billing?.rut).toBe('12.345.678-5')
    expect(submitCall.billing?.razonSocial).toBe('Centro Dental Melipilla SpA')
    expect(submitCall.billing?.giroComercial).toBe('Servicios Odontológicos')
    expect(submitCall.billing?.taxBreakdown.total).toBe(189990)
    expect(submitCall.billing?.taxBreakdown.neto).toBe(159655)
    expect(submitCall.billing?.taxBreakdown.iva).toBe(30335)
    expect(submitCall.billing?.status).toBe('PENDIENTE_EMISION_SII')

    // Step 3 UI
    expect(screen.getByText(/Factura Electrónica \(Clínica\)/i)).toBeInTheDocument()

    // Toggle Voucher
    const voucherBtn = screen.getByText(/Ver Comprobante de Compra/i)
    fireEvent.click(voucherBtn)

    // Verify Voucher Content
    expect(screen.getByText('PRONTO INSUMOS ODONTOLÓGICOS')).toBeInTheDocument()
    expect(screen.getByText(/RUT Distribuidor: 77.892.410-K/i)).toBeInTheDocument()
    expect(screen.getByText('COMPROBANTE FACTURA')).toBeInTheDocument()
    expect(screen.getByText('Centro Dental Melipilla SpA')).toBeInTheDocument()
    expect(screen.getByText('$159.655')).toBeInTheDocument() // Neto
    expect(screen.getByText('$30.335')).toBeInTheDocument()  // IVA
    expect(screen.getByText('Imprimir / Guardar en PDF')).toBeInTheDocument()
  })
})
