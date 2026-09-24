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

vi.mock('../../services/orderConfirmation', () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(true)
}))

import CheckoutModal, { CheckoutModalProps } from '../../components/CheckoutModal'
import { submitOrder } from '../../services/api'
import { processMercadoPagoPayment } from '../../services/mercadopago'
import { sendOrderConfirmationEmail } from '../../services/orderConfirmation'
import { CartItem, Product } from '../../types'

const mockProduct: Product = {
  id: 'odon-101',
  name: 'Turbina Odontológica LED MasterTorque',
  category: 'Instruments',
  manufacturer: 'NSK',
  price: 189990,
  rating: 0,
  reviewsCount: 0,
  inStock: true,
  stockCount: 18,
  prescriptionRequired: false,
  tag: 'Más Vendido',
  description: 'Pieza de mano de alta velocidad',
  specs: ['420.000 RPM'],
  placeholderTheme: 'gradient-teal',
  mediaBadge: 'LED'
}

const mockCartItems: CartItem[] = [{ product: mockProduct, quantity: 1 }]

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

  /** Advances one step by clicking the step's "Continuar" submit button. */
  const advance = () => fireEvent.click(screen.getByRole('button', { name: /Continuar/i }))

  /** Step 1 (Contacto): name, email, phone. */
  const fillContactStep = (overrides: Record<string, string> = {}) => {
    const values: Record<string, string> = {
      name: 'Dra. Andrea Morales',
      email: 'andrea@moralesdental.cl',
      phone: '+56 9 5555 4444',
      ...overrides
    }
    fireEvent.change(screen.getByPlaceholderText(/Dra\. Camila Fuentes/i), { target: { value: values.name } })
    fireEvent.change(screen.getByPlaceholderText('contacto@clinica.cl'), { target: { value: values.email } })
    fireEvent.change(screen.getByPlaceholderText('+56 9 1234 5678'), { target: { value: values.phone } })
  }

  /** Step 2 (Despacho): address, zip. The delivery commune is a select defaulting to Melipilla. */
  const fillDespatchStep = (overrides: Record<string, string> = {}) => {
    const values: Record<string, string> = {
      address: 'Av. Ortúzar 100',
      zip: '9500000',
      ...overrides
    }
    fireEvent.change(screen.getByPlaceholderText(/Av\. Ortúzar/i), { target: { value: values.address } })
    fireEvent.change(screen.getByPlaceholderText('Ej: 9500000'), { target: { value: values.zip } })
  }

  const selectZone = (zone: 'Melipilla' | 'San Antonio') => {
    fireEvent.change(screen.getByLabelText('Comuna de Despacho'), { target: { value: zone } })
  }

  /** Step 3 (Documento): RUT (Boleta is the only document card). */
  const fillDocumentStep = (overrides: Record<string, string> = {}) => {
    const values: Record<string, string> = {
      rut: '12.345.678-5',
      ...overrides
    }
    fireEvent.change(screen.getByPlaceholderText('12.345.678-K'), { target: { value: values.rut } })
  }

  /** Walks the guided flow from Contacto through Pago's gate (steps 1 → 4). */
  const completeDataEntry = () => {
    fillContactStep()
    advance()
    fillDespatchStep()
    advance()
    fillDocumentStep()
    advance()
  }

  it('should not render anything when isOpen is false', () => {
    const { container } = render(<CheckoutModal {...defaultProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('should initialize with empty form fields and not expose prefilled mock identity data', () => {
    render(<CheckoutModal {...defaultProps} />)

    // Contacto step fields start empty
    expect((screen.getByPlaceholderText(/Dra\. Camila Fuentes/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByPlaceholderText('contacto@clinica.cl') as HTMLInputElement).value).toBe('')
    expect((screen.getByPlaceholderText('+56 9 1234 5678') as HTMLInputElement).value).toBe('')

    // Despacho step: the delivery commune select defaults to Melipilla (no free-text city input)
    fillContactStep()
    advance()
    expect((screen.getByLabelText('Comuna de Despacho') as HTMLSelectElement).value).toBe('Melipilla')
    expect((screen.getByPlaceholderText(/Av\. Ortúzar/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByPlaceholderText('Ej: 9500000') as HTMLInputElement).value).toBe('')

    // Documento step: RUT starts empty
    fillDespatchStep()
    advance()
    expect((screen.getByPlaceholderText('12.345.678-K') as HTMLInputElement).value).toBe('')
  })

  it('should format Chilean RUT as the user inputs characters', () => {
    render(<CheckoutModal {...defaultProps} />)

    fillContactStep()
    advance()
    fillDespatchStep()
    advance()

    const rutInput = screen.getByPlaceholderText('12.345.678-K') as HTMLInputElement
    fireEvent.change(rutInput, { target: { value: '123456785' } })

    expect(rutInput.value).toBe('12.345.678-5')
  })

  it('should use the correct mobile keyboard hints on the checkout inputs', () => {
    render(<CheckoutModal {...defaultProps} />)

    const phoneInput = screen.getByPlaceholderText('+56 9 1234 5678') as HTMLInputElement
    expect(phoneInput.type).toBe('tel')
    expect(phoneInput.getAttribute('inputmode')).toBe('tel')

    expect((screen.getByPlaceholderText('contacto@clinica.cl') as HTMLInputElement).type).toBe('email')

    fillContactStep()
    advance()

    expect((screen.getByPlaceholderText('Ej: 9500000') as HTMLInputElement).getAttribute('inputmode')).toBe('numeric')

    fillDespatchStep()
    advance()

    // A numeric keypad cannot produce the K check digit, so the RUT stays on a text keyboard
    const rutInput = screen.getByPlaceholderText('12.345.678-K') as HTMLInputElement
    expect(rutInput.type).toBe('text')
    expect(rutInput.getAttribute('inputmode')).toBe('text')
  })

  it('should offer only Boleta and route Factura through the WhatsApp quotation path', () => {
    render(<CheckoutModal {...defaultProps} />)

    fillContactStep()
    advance()
    fillDespatchStep()
    advance()

    // Boleta is the only document card on offer
    expect(screen.getByText('📄 Boleta Electrónica')).toBeInTheDocument()
    expect(screen.queryByText(/Factura Electrónica \(Clínicas\)/i)).not.toBeInTheDocument()
    // The Factura tax fields are therefore never rendered
    expect(screen.queryByPlaceholderText('Ej: Centro Dental San Pedro SpA')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Ej: Servicios Odontológicos')).not.toBeInTheDocument()

    // …and the shopper is told where to get one
    expect(screen.getByText(/¿Necesitas Factura Electrónica para tu clínica\?/i)).toBeInTheDocument()
    const quoteLink = screen.getByRole('link', { name: /Cotízala por WhatsApp/i })
    expect(quoteLink).toHaveAttribute('href', expect.stringContaining('wa.me'))
  })

  it('should block advancing to Pago if RUT fails Modulo 11 check', () => {
    render(<CheckoutModal {...defaultProps} />)

    fillContactStep()
    advance()
    fillDespatchStep()
    advance()
    fillDocumentStep({ rut: '11.111.111-2' })

    advance()

    expect(screen.getByText(/RUT inválido/i)).toBeInTheDocument()
    expect(screen.queryByText(/Selecciona la Opción Preferida/i)).not.toBeInTheDocument()
  })

  it('should reach the Pago step when customer details and valid Chilean RUT are provided', () => {
    render(<CheckoutModal {...defaultProps} />)
    completeDataEntry()

    expect(screen.getByText(/Selecciona la Opción Preferida para tu Clínica/i)).toBeInTheDocument()
  })

  it('should navigate back one step when clicking Volver', () => {
    render(<CheckoutModal {...defaultProps} />)
    fillContactStep()
    advance()
    expect(screen.getByLabelText('Comuna de Despacho')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Volver'))
    expect(screen.getByPlaceholderText(/Dra\. Camila Fuentes/i)).toBeInTheDocument()
  })

  it('PCI-DSS Compliance: should never include cardNumber, expDate, or cvc in order submission payload', async () => {
    render(<CheckoutModal {...defaultProps} />)
    completeDataEntry()
    fireEvent.click(screen.getByText('Confirmar Pedido'))

    await waitFor(() => {
      expect(submitOrder).toHaveBeenCalledTimes(1)
    })

    const customerPayload = vi.mocked(submitOrder).mock.calls[0][0].customer as unknown as Record<string, unknown>
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
    completeDataEntry()

    fireEvent.click(screen.getByLabelText(/Pago Inmediato Mercado Pago Chile/i))
    fireEvent.click(screen.getByText('Confirmar Pedido'))

    await waitFor(() => {
      expect(submitOrder).toHaveBeenCalledTimes(1)
      expect(processMercadoPagoPayment).toHaveBeenCalledTimes(1)
    })

    const mpCustomer = vi.mocked(processMercadoPagoPayment).mock.calls[0][0].customer as unknown as Record<
      string,
      unknown
    >
    expect(mpCustomer).not.toHaveProperty('cardNumber')
    expect(mpCustomer).not.toHaveProperty('expDate')
    expect(mpCustomer).not.toHaveProperty('cvc')
  })

  it('should trim whitespace from text inputs when preparing submission payload', async () => {
    render(<CheckoutModal {...defaultProps} />)
    fillContactStep({
      name: '  Dra. Andrea Morales   ',
      email: ' andrea@moralesdental.cl  ',
      phone: ' +56 9 5555 4444 '
    })
    advance()
    fillDespatchStep({ address: '  Av. Ortúzar 100  ', zip: ' 9500000 ' })
    advance()
    fillDocumentStep({ rut: ' 12.345.678-5  ' })
    advance()
    fireEvent.click(screen.getByText('Confirmar Pedido'))

    await waitFor(() => {
      expect(submitOrder).toHaveBeenCalledTimes(1)
    })

    const { customer } = vi.mocked(submitOrder).mock.calls[0][0]
    expect(customer.fullName).toBe('Dra. Andrea Morales')
    expect(customer.email).toBe('andrea@moralesdental.cl')
    expect(customer.phone).toBe('+56 9 5555 4444')
    expect(customer.rut).toBe('12.345.678-5')
    expect(customer.address).toBe('Av. Ortúzar 100')
    expect(customer.city).toBe('Melipilla')
    expect(customer.zip).toBe('9500000')
  })

  it('should reset form state and step to 1 when Volver a la Tienda is clicked after order', async () => {
    const { rerender } = render(<CheckoutModal {...defaultProps} />)
    completeDataEntry()
    fireEvent.click(screen.getByText('Confirmar Pedido'))

    await waitFor(() => {
      expect(screen.getByText(/¡Pedido Registrado con Éxito!/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Volver a la Tienda'))
    expect(defaultProps.onClose).toHaveBeenCalled()

    rerender(<CheckoutModal {...defaultProps} isOpen={true} />)
    expect(screen.getByText(/Finalizar Pedido/i)).toBeInTheDocument()
    expect((screen.getByPlaceholderText(/Dra\. Camila Fuentes/i) as HTMLInputElement).value).toBe('')
  })

  it('should submit a Boleta billing payload and render the pro-forma voucher in the confirmation step', async () => {
    render(<CheckoutModal {...defaultProps} totalAmount={189990} />)
    fillContactStep({ name: 'Dra. Camila Fuentes' })
    advance()
    fillDespatchStep()
    advance()
    fillDocumentStep()
    advance()
    fireEvent.click(screen.getByText('Confirmar Pedido'))

    await waitFor(() => {
      expect(submitOrder).toHaveBeenCalledTimes(1)
    })

    const submitCall = vi.mocked(submitOrder).mock.calls[0][0]
    expect(submitCall.billing).toBeDefined()
    expect(submitCall.billing?.documentType).toBe('boleta')
    expect(submitCall.billing?.rut).toBe('12.345.678-5')
    expect(submitCall.billing?.taxBreakdown.total).toBe(189990)
    expect(submitCall.billing?.taxBreakdown.neto).toBe(159655)
    expect(submitCall.billing?.taxBreakdown.iva).toBe(30335)
    expect(submitCall.billing?.status).toBe('PENDIENTE_EMISION_SII')

    // Confirmation step UI shows Boleta, not Factura
    expect(screen.getByText('Boleta Electrónica')).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Ver Comprobante de Compra/i))
    expect(screen.getByText('PRONTO INSUMOS ODONTOLÓGICOS')).toBeInTheDocument()
    expect(screen.getByText(/RUT Distribuidor: 77.892.410-K/i)).toBeInTheDocument()
    expect(screen.getByText('COMPROBANTE BOLETA')).toBeInTheDocument()
    expect(screen.getByText('$159.655')).toBeInTheDocument() // Neto
    expect(screen.getByText('$30.335')).toBeInTheDocument() // IVA
    expect(screen.getByText('Imprimir / Guardar en PDF')).toBeInTheDocument()
  })

  describe('Delivery zone minimum order (San Antonio $60.000)', () => {
    it('should show the San Antonio minimum hint only when that commune is selected', () => {
      render(<CheckoutModal {...defaultProps} />)

      fillContactStep()
      advance()

      expect(screen.queryByText(/Compra mínima para despacho a San Antonio/i)).not.toBeInTheDocument()
      selectZone('San Antonio')
      expect(screen.getByText('Compra mínima para despacho a San Antonio: $60.000')).toBeInTheDocument()
    })

    it('should block leaving Despacho for San Antonio when the product subtotal is below $60.000', () => {
      render(
        <CheckoutModal
          {...defaultProps}
          cartItems={[{ product: { ...mockProduct, price: 18500 }, quantity: 1 }]}
          totalAmount={22015}
        />
      )
      fillContactStep()
      advance()
      selectZone('San Antonio')
      fillDespatchStep()

      advance()

      expect(screen.getByText('La compra mínima para despacho a San Antonio es de $60.000')).toBeInTheDocument()
      expect(screen.queryByText(/Selecciona la Opción Preferida para tu Clínica/i)).not.toBeInTheDocument()
      expect(screen.getByLabelText('Comuna de Despacho')).toBeInTheDocument()
    })

    it('should allow leaving Despacho for San Antonio once the subtotal reaches $60.000', () => {
      render(
        <CheckoutModal
          {...defaultProps}
          cartItems={[{ product: { ...mockProduct, price: 60000 }, quantity: 1 }]}
          totalAmount={71400}
        />
      )
      fillContactStep()
      advance()
      selectZone('San Antonio')
      fillDespatchStep()

      advance()

      // The gate passed: we land on Documento, from which the valid RUT reaches Pago
      expect(screen.getByPlaceholderText('12.345.678-K')).toBeInTheDocument()
      fillDocumentStep()
      advance()
      expect(screen.getByText(/Selecciona la Opción Preferida para tu Clínica/i)).toBeInTheDocument()
    })

    it('should apply NO minimum order for Melipilla deliveries', () => {
      render(
        <CheckoutModal
          {...defaultProps}
          cartItems={[{ product: { ...mockProduct, price: 18500 }, quantity: 1 }]}
          totalAmount={22015}
        />
      )
      fillContactStep()
      advance()
      fillDespatchStep()

      advance()

      // The gate passed: we land on Documento, from which the valid RUT reaches Pago
      expect(screen.getByPlaceholderText('12.345.678-K')).toBeInTheDocument()
      fillDocumentStep()
      advance()
      expect(screen.getByText(/Selecciona la Opción Preferida para tu Clínica/i)).toBeInTheDocument()
    })
  })

  describe('ISP sanitary verification', () => {
    const mockRegulatedProduct: Product = {
      id: 'odon-501',
      name: 'Anestésico Dental Lidocaína 2% con Epinefrina 1:100.000',
      category: 'Materials',
      price: 38500,
      rating: 0,
      reviewsCount: 0,
      inStock: true,
      stockCount: 45,
      prescriptionRequired: true,
      tag: 'Controlado ISP',
      description: 'Anestésico local inyectable odontológico',
      specs: ['Registro ISP F-14220'],
      placeholderTheme: 'gradient-blue',
      mediaBadge: 'ISP F-14220'
    }

    it('should require N° de Registro SIS and block leaving Despacho if missing', () => {
      render(
        <CheckoutModal
          {...defaultProps}
          cartItems={[{ product: mockRegulatedProduct, quantity: 1 }]}
          totalAmount={38500}
        />
      )

      fillContactStep({ name: 'Dr. Rodrigo Soto' })
      advance()

      expect(screen.getByText(/Validación Sanitaria Requerida/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/N° Registro SIS/i)).toBeInTheDocument()

      fillDespatchStep()
      advance()

      expect(screen.getByText(/Debe ingresar un N° de Registro SIS válido/i)).toBeInTheDocument()
      expect(screen.queryByText(/Transferencia Bancaria Directa/i)).not.toBeInTheDocument()
    })

    it('should advance to Pago and submit sanitaryVerification when a valid SIS number is entered', async () => {
      render(
        <CheckoutModal
          {...defaultProps}
          cartItems={[{ product: mockRegulatedProduct, quantity: 1 }]}
          totalAmount={38500}
        />
      )

      fillContactStep({ name: 'Dr. Rodrigo Soto' })
      advance()
      fireEvent.change(screen.getByLabelText(/N° Registro SIS/i), { target: { value: '148925' } })
      fillDespatchStep()
      advance()
      fillDocumentStep()
      advance()

      expect(screen.getByText(/Transferencia Bancaria Directa/i)).toBeInTheDocument()

      fireEvent.click(screen.getByText('Confirmar Pedido'))

      await waitFor(() => {
        expect(submitOrder).toHaveBeenCalledTimes(1)
      })

      const submitCall = vi.mocked(submitOrder).mock.calls[0][0]
      expect(submitCall.sanitaryVerification).toBeDefined()
      expect(submitCall.sanitaryVerification?.sisRegistryNumber).toBe('148925')
      expect(submitCall.sanitaryVerification?.verified).toBe(true)

      expect(screen.getByText(/148925 \(Acreditado\)/i)).toBeInTheDocument()

      fireEvent.click(screen.getByText(/Ver Comprobante de Compra/i))
      expect(screen.getByText(/148925 \(Acreditación ISP\)/i)).toBeInTheDocument()
    })
  })

  describe('Inventory validation guards', () => {
    it('should block leaving Despacho and display error when cart item exceeds available stock', () => {
      const overStockProduct: Product = { ...mockProduct, id: 'odon-over', stockCount: 2, inStock: true }
      render(
        <CheckoutModal
          {...defaultProps}
          cartItems={[{ product: overStockProduct, quantity: 5 }]}
          totalAmount={overStockProduct.price * 5}
        />
      )

      fillContactStep()
      advance()
      fillDespatchStep()
      advance()

      expect(screen.getByText(/supera el stock disponible \(5 solicitados, 2 disponibles\)/i)).toBeInTheDocument()
      expect(screen.queryByText(/Selecciona la Opción Preferida para tu Clínica/i)).not.toBeInTheDocument()
      // Still on the Despacho step: the commune select and the Continuar action remain
      expect(screen.getByLabelText('Comuna de Despacho')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Continuar/i })).toBeInTheDocument()
    })

    it('should block leaving Despacho and display error when cart item is out of stock', () => {
      const outOfStockProduct: Product = { ...mockProduct, id: 'odon-oos', stockCount: 0, inStock: false }
      render(
        <CheckoutModal
          {...defaultProps}
          cartItems={[{ product: outOfStockProduct, quantity: 1 }]}
          totalAmount={outOfStockProduct.price}
        />
      )

      fillContactStep()
      advance()
      fillDespatchStep()
      advance()

      expect(screen.getByText(/no cuenta con stock disponible/i)).toBeInTheDocument()
      expect(screen.queryByText(/Selecciona la Opción Preferida para tu Clínica/i)).not.toBeInTheDocument()
      expect(screen.getByLabelText('Comuna de Despacho')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Continuar/i })).toBeInTheDocument()
    })
  })

  describe('Guided flow stepper & panels (Task 2.6)', () => {
    it('should render the four stepper labels with correct active/done states', () => {
      render(<CheckoutModal {...defaultProps} />)

      // Step 1 active, others upcoming
      expect(screen.getByText('Contacto')).toBeInTheDocument()
      expect(screen.getByText('Despacho')).toBeInTheDocument()
      expect(screen.getByText('Documento')).toBeInTheDocument()
      expect(screen.getByText('Pago')).toBeInTheDocument()
      expect(screen.getByText('Contacto').closest('.checkout-step')).toHaveClass('checkout-step--active')
      expect(screen.getByText('Pago').closest('.checkout-step')).not.toHaveClass('checkout-step--done')

      // Advance to step 2: Contacto done, Despacho active
      fillContactStep()
      advance()
      expect(screen.getByText('Contacto').closest('.checkout-step')).toHaveClass('checkout-step--done')
      expect(screen.getByText('Despacho').closest('.checkout-step')).toHaveClass('checkout-step--active')
      expect(screen.getByText('Despacho').closest('.checkout-step')).toHaveAttribute('aria-current', 'step')
    })

    it('should preserve entered values when navigating back and forward', () => {
      render(<CheckoutModal {...defaultProps} />)

      fillContactStep({ name: 'Dra. Valentina Rojas' })
      advance()
      fillDespatchStep({ address: 'Los Alerces 220' })
      advance()
      fillDocumentStep()
      advance()

      // Back from Pago to Documento: RUT preserved
      fireEvent.click(screen.getByText('Volver'))
      expect((screen.getByPlaceholderText('12.345.678-K') as HTMLInputElement).value).toBe('12.345.678-5')

      // Back to Despacho: address preserved
      fireEvent.click(screen.getByText('Volver'))
      expect((screen.getByPlaceholderText(/Av\. Ortúzar/i) as HTMLInputElement).value).toBe('Los Alerces 220')

      // Back to Contacto: name preserved
      fireEvent.click(screen.getByText('Volver'))
      expect((screen.getByPlaceholderText(/Dra\. Camila Fuentes/i) as HTMLInputElement).value).toBe(
        'Dra. Valentina Rojas'
      )
    })

    it('should show the compact order summary with item lines and tax breakdown on the Pago step', () => {
      render(<CheckoutModal {...defaultProps} />)
      completeDataEntry()

      expect(screen.getByText(/1 × Turbina Odontológica LED MasterTorque/i)).toBeInTheDocument()
      // The item subtotal and the grand total coincide for a single-item cart
      expect(screen.getAllByText('$189.990').length).toBeGreaterThan(0)
      expect(screen.getByText('Monto Neto:')).toBeInTheDocument()
      expect(screen.getByText('IVA (19%):')).toBeInTheDocument()
      expect(screen.getByText('$159.655')).toBeInTheDocument()
      expect(screen.getByText('$30.335')).toBeInTheDocument()
      expect(screen.getByText('Total a Pagar:')).toBeInTheDocument()
    })

    it('should submit each step form on Enter (every step is a real form)', () => {
      render(<CheckoutModal {...defaultProps} />)

      fillContactStep()
      fireEvent.submit(screen.getByText('Continuar').closest('form')!)

      // Only one step form is mounted at a time; submitting advanced to Despacho
      expect(screen.getByLabelText('Comuna de Despacho')).toBeInTheDocument()

      fillDespatchStep()
      fireEvent.submit(screen.getByText('Continuar').closest('form')!)
      expect(screen.getByPlaceholderText('12.345.678-K')).toBeInTheDocument()

      fillDocumentStep()
      fireEvent.submit(screen.getByText('Continuar').closest('form')!)
      expect(screen.getByText(/Selecciona la Opción Preferida para tu Clínica/i)).toBeInTheDocument()
    })

    it('should swap the stepper for the success header on the confirmation step', async () => {
      render(<CheckoutModal {...defaultProps} />)
      completeDataEntry()
      fireEvent.click(screen.getByText('Confirmar Pedido'))

      await waitFor(() => {
        expect(screen.getByText(/¡Pedido Registrado con Éxito!/i)).toBeInTheDocument()
      })

      expect(screen.getByText('Pedido Registrado')).toBeInTheDocument()
      expect(screen.queryByText('Contacto')).not.toBeInTheDocument()
      expect(screen.queryByText('Despacho')).not.toBeInTheDocument()
    })
  })

  describe('Bank transfer workflow & order tracking integration (Task 2.4 & 2.5)', () => {
    it('should display bank transfer instructions, voucher upload, and order tracking button in the confirmation step', async () => {
      const onOpenTrackingMock = vi.fn()
      render(<CheckoutModal {...defaultProps} onOpenTracking={onOpenTrackingMock} />)

      completeDataEntry()

      expect(screen.getByText(/Datos Bancarios Oficiales/i)).toBeInTheDocument()
      expect(screen.getAllByText(/Banco de Chile/i).length).toBeGreaterThanOrEqual(1)

      fireEvent.click(screen.getByText('Confirmar Pedido'))

      await waitFor(() => {
        expect(submitOrder).toHaveBeenCalledTimes(1)
      })

      expect(screen.getByText(/Instrucciones de Transferencia Bancaria Directa/i)).toBeInTheDocument()
      expect(screen.getByText(/Adjuntar Comprobante de Transferencia/i)).toBeInTheDocument()

      const trackBtn = screen.getByText('Seguir Estado de mi Pedido en Línea')
      expect(trackBtn).toBeInTheDocument()
      fireEvent.click(trackBtn)

      expect(onOpenTrackingMock).toHaveBeenCalledWith(expect.stringMatching(/^PRONTO-/), '12.345.678-5')
    })
  })

  describe('Transactional order-confirmation email (Phase 5.1)', () => {
    it('should fire sendOrderConfirmationEmail after a bank transfer order is registered', async () => {
      render(<CheckoutModal {...defaultProps} />)
      completeDataEntry()
      fireEvent.click(screen.getByText('Confirmar Pedido'))

      await waitFor(() => {
        expect(submitOrder).toHaveBeenCalledTimes(1)
        expect(sendOrderConfirmationEmail).toHaveBeenCalledWith('PRONTO-TEST1234', '12.345.678-5')
      })
    })

    it('should fire sendOrderConfirmationEmail after a WhatsApp quote order is registered', async () => {
      render(<CheckoutModal {...defaultProps} />)
      completeDataEntry()
      fireEvent.click(screen.getByLabelText(/Cotización Formal Asistida por WhatsApp/i))
      fireEvent.click(screen.getByText('Generar Cotización'))

      await waitFor(() => {
        expect(submitOrder).toHaveBeenCalledTimes(1)
        expect(sendOrderConfirmationEmail).toHaveBeenCalledWith('PRONTO-TEST1234', '12.345.678-5')
      })
    })

    it('should NOT fire sendOrderConfirmationEmail for Mercado Pago orders (webhook covers it)', async () => {
      render(<CheckoutModal {...defaultProps} />)
      completeDataEntry()
      fireEvent.click(screen.getByLabelText(/Pago Inmediato Mercado Pago Chile/i))
      fireEvent.click(screen.getByText('Confirmar Pedido'))

      await waitFor(() => {
        expect(submitOrder).toHaveBeenCalledTimes(1)
        expect(processMercadoPagoPayment).toHaveBeenCalledTimes(1)
      })
      expect(sendOrderConfirmationEmail).not.toHaveBeenCalled()
    })

    it('should NOT fire sendOrderConfirmationEmail when order registration fails', async () => {
      vi.mocked(submitOrder).mockResolvedValue({
        success: false,
        orderId: '',
        timestamp: '',
        total: 0,
        itemsCount: 0
      })
      render(<CheckoutModal {...defaultProps} />)
      completeDataEntry()
      fireEvent.click(screen.getByText('Confirmar Pedido'))

      await waitFor(() => {
        expect(submitOrder).toHaveBeenCalledTimes(1)
      })
      expect(sendOrderConfirmationEmail).not.toHaveBeenCalled()
    })
  })
})
