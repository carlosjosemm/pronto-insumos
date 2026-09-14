import React, { useState, useEffect } from 'react'
import { CartItem, CustomerInfo, PaymentMethod, SubmitOrderResult } from '../types'
import { X, CheckCircle, ShieldCheck, Lock, CreditCard, MessageSquare, Building2, ArrowRight } from 'lucide-react'
import { submitOrder, generateOrderId } from '../services/api'
import { generateWhatsAppQuoteUrl } from '../services/whatsapp'
import { processMercadoPagoPayment } from '../services/mercadopago'
import { validateRut, formatRut } from '../utils/rut'

export interface CheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  cartItems: CartItem[]
  totalAmount: number
  onOrderSuccess: () => void
}

export default function CheckoutModal({ isOpen, onClose, cartItems, totalAmount, onOrderSuccess }: CheckoutModalProps) {
  const [step, setStep] = useState<number>(1) // 1: Shipping, 2: Payment/Quote Method, 3: Confirmation
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transferencia')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [orderDetails, setOrderDetails] = useState<SubmitOrderResult | null>(null)
  const [whatsappUrl, setWhatsappUrl] = useState<string>('')
  const [rutError, setRutError] = useState<string>('')
  const [submitError, setSubmitError] = useState<string>('')

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Clean form state without mock card details (PCI-DSS compliant)
  const [formData, setFormData] = useState<CustomerInfo>({
    fullName: '',
    email: '',
    phone: '',
    rut: '',
    documentType: 'boleta',
    razonSocial: '',
    giroComercial: '',
    address: '',
    city: '',
    zip: ''
  })

  if (!isOpen) return null

  const resetForm = () => {
    setStep(1)
    setOrderDetails(null)
    setWhatsappUrl('')
    setRutError('')
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      rut: '',
      documentType: 'boleta',
      razonSocial: '',
      giroComercial: '',
      address: '',
      city: '',
      zip: ''
    })
  }

  const handleClose = () => {
    if (step === 3) {
      resetForm()
    }
    onClose()
  }

  const handleRutChange = (raw: string) => {
    const formatted = formatRut(raw)
    setFormData(prev => ({ ...prev, rut: formatted }))
    if (rutError && validateRut(formatted)) {
      setRutError('')
    }
  }

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault()
    if (step === 1) {
      if (!validateRut(formData.rut)) {
        setRutError('RUT inválido. Por favor verifica el número y el dígito verificador.')
        return
      }
      setRutError('')
      setStep(2)
    } else if (step === 2) {
      handleCompleteOrder()
    }
  }

  const handleCompleteOrder = async () => {
    setSubmitError('')
    setIsSubmitting(true)

    // Canonical order identifier PRONTO-XXXXXX
    const canonicalOrderId = generateOrderId()

    const sanitizedCustomer: CustomerInfo = {
      fullName: formData.fullName.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      rut: formData.rut.trim(),
      documentType: formData.documentType,
      razonSocial: formData.razonSocial ? formData.razonSocial.trim() : undefined,
      giroComercial: formData.giroComercial ? formData.giroComercial.trim() : undefined,
      address: formData.address.trim(),
      city: formData.city.trim(),
      zip: formData.zip.trim()
    }

    // 1. Submit Order to Firestore FIRST with initial pending status
    const result = await submitOrder({
      orderId: canonicalOrderId,
      items: cartItems,
      total: totalAmount,
      customer: sanitizedCustomer,
      paymentMethod
    })

    if (!result.success) {
      console.error('Failed to register initial pending order in database')
      setSubmitError('No fue posible registrar el pedido en el sistema. Por favor reintenta o comunícate vía WhatsApp.')
      setIsSubmitting(false)
      return
    }

    // 2. Initiate Mercado Pago Online Payment Processing if selected
    if (paymentMethod === 'mercadopago') {
      await processMercadoPagoPayment({
        orderId: canonicalOrderId,
        items: cartItems,
        total: totalAmount,
        customer: sanitizedCustomer
      })
    }

    setIsSubmitting(false)
    setOrderDetails(result)

    if (paymentMethod === 'whatsapp') {
      const url = generateWhatsAppQuoteUrl({
        orderId: canonicalOrderId,
        customer: sanitizedCustomer,
        items: cartItems,
        total: totalAmount
      })
      setWhatsappUrl(url)
    }

    setStep(3)
    onOrderSuccess()
  }

  return (
    <div className="modal-overlay" onClick={handleClose} role="dialog" aria-modal="true">
      <div className="modal-card" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={handleClose} aria-label="Cerrar ventana">
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div style={{ padding: '1.5rem 1.75rem 1rem', borderBottom: '1px solid var(--border-subtle)', background: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <ShieldCheck size={22} style={{ color: 'var(--teal-600)' }} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--navy-900)' }}>
              {step === 3 ? 'Pedido Registrado' : 'Gestión de Pedido y Pago'}
            </h2>
          </div>

          {/* Stepper Indicators */}
          {step !== 3 && (
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', fontWeight: '700', color: step >= 1 ? 'var(--navy-900)' : 'var(--text-muted)' }}>
                <span style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: 'var(--radius-xs)',
                  background: step >= 1 ? 'var(--teal-600)' : 'var(--border-subtle)',
                  color: '#ffffff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem'
                }}>1</span>
                <span>Despacho & Facturación</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', fontWeight: '700', color: step >= 2 ? 'var(--navy-900)' : 'var(--text-muted)' }}>
                <span style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: 'var(--radius-xs)',
                  background: step >= 2 ? 'var(--teal-600)' : 'var(--border-subtle)',
                  color: '#ffffff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem'
                }}>2</span>
                <span>Modalidad de Pago / Cotización</span>
              </div>
            </div>
          )}
        </div>

        {/* Form Body */}
        <div style={{ padding: '1.75rem' }}>
          {step === 1 && (
            <form onSubmit={handleNextStep} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              {/* Document Type Selector (Boleta vs Factura) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.4rem' }}>
                  Tipo de Documento Tributario (Chile - SII)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, documentType: 'factura' })}
                    style={{
                      padding: '0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      border: `2px solid ${formData.documentType === 'factura' ? 'var(--teal-600)' : 'var(--border-subtle)'}`,
                      background: formData.documentType === 'factura' ? 'var(--teal-50)' : '#ffffff',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      color: formData.documentType === 'factura' ? 'var(--teal-700)' : 'var(--text-secondary)',
                      transition: 'var(--transition-fast)'
                    }}
                  >
                    🏢 Factura Electrónica (Clínicas)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, documentType: 'boleta' })}
                    style={{
                      padding: '0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      border: `2px solid ${formData.documentType === 'boleta' ? 'var(--teal-600)' : 'var(--border-subtle)'}`,
                      background: formData.documentType === 'boleta' ? 'var(--teal-50)' : '#ffffff',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      color: formData.documentType === 'boleta' ? 'var(--teal-700)' : 'var(--text-secondary)',
                      transition: 'var(--transition-fast)'
                    }}
                  >
                    📄 Boleta Electrónica (Personal)
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.25rem' }}>
                  Nombre del Profesional {formData.documentType === 'factura' ? 'o Representante Legal' : ''}
                </label>
                <input
                  type="text"
                  required
                  placeholder={formData.documentType === 'factura' ? 'Ej: Clínica Odontológica Melipilla SpA' : 'Ej: Dra. Camila Fuentes'}
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.25rem' }}>
                    RUT {formData.documentType === 'factura' ? 'Empresa / Sociedad' : 'Personal (RUN)'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="12.345.678-K"
                    value={formData.rut}
                    onChange={(e) => handleRutChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      border: `1px solid ${rutError ? '#dc2626' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-sm)',
                      outlineColor: rutError ? '#dc2626' : undefined
                    }}
                  />
                  {rutError && (
                    <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: '600', marginTop: '0.25rem', display: 'block' }}>
                      {rutError}
                    </span>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.25rem' }}>
                    Email para Documento SII
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="contacto@clinica.cl"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              </div>

              {formData.documentType === 'factura' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'var(--surface-muted)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.25rem' }}>
                      Razón Social (según SII)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Clínica Odontológica SpA"
                      value={formData.razonSocial || ''}
                      onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: '#ffffff' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.25rem' }}>
                      Giro Comercial
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Servicios Odontológicos"
                      value={formData.giroComercial || ''}
                      onChange={(e) => setFormData({ ...formData, giroComercial: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: '#ffffff' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.25rem' }}>
                    Teléfono Móvil
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+56 9 1234 5678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.25rem' }}>
                    Dirección de Entrega / Consulta
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Av. Ortúzar 750, Of. 302"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.25rem' }}>
                    Ciudad / Comuna
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Melipilla, Región Metropolitana"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.25rem' }}>
                    Código Postal / Región
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 9500000"
                    value={formData.zip}
                    onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '0.75rem', justifyContent: 'center' }}>
                <span>Seleccionar Método de Pago / Cotización</span>
                <ArrowRight size={17} />
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleNextStep} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ background: 'var(--surface-muted)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total Facturado a Pagar:</span>
                <span style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--navy-900)' }}>${totalAmount.toFixed(2)}</span>
              </div>

              {/* Method Selection Cards */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.65rem' }}>
                  Selecciona la Opción Preferida para tu Clínica:
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Option 1: Transferencia Bancaria */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${paymentMethod === 'transferencia' ? 'var(--teal-600)' : 'var(--border-subtle)'}`,
                    background: paymentMethod === 'transferencia' ? 'var(--teal-50)' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'var(--transition-fast)'
                  }}>
                    <input
                      type="radio"
                      name="payMethod"
                      value="transferencia"
                      checked={paymentMethod === 'transferencia'}
                      onChange={() => setPaymentMethod('transferencia')}
                    />
                    <Building2 size={20} style={{ color: 'var(--teal-700)' }} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--navy-900)' }}>Transferencia Bancaria Directa (Banco de Chile)</div>
                      <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>Cuenta corriente comercial con comprobante y emisión de Factura.</div>
                    </div>
                  </label>

                  {/* Option 2: WhatsApp Quote */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${paymentMethod === 'whatsapp' ? 'var(--teal-600)' : 'var(--border-subtle)'}`,
                    background: paymentMethod === 'whatsapp' ? 'var(--teal-50)' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'var(--transition-fast)'
                  }}>
                    <input
                      type="radio"
                      name="payMethod"
                      value="whatsapp"
                      checked={paymentMethod === 'whatsapp'}
                      onChange={() => setPaymentMethod('whatsapp')}
                    />
                    <MessageSquare size={20} style={{ color: '#059669' }} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--navy-900)' }}>Cotización Formal Asistida por WhatsApp</div>
                      <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>Genera una cotización formal para aprobación administrativa o presupuesto.</div>
                    </div>
                  </label>

                  {/* Option 3: Mercado Pago Chile */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${paymentMethod === 'mercadopago' ? 'var(--teal-600)' : 'var(--border-subtle)'}`,
                    background: paymentMethod === 'mercadopago' ? 'var(--teal-50)' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'var(--transition-fast)'
                  }}>
                    <input
                      type="radio"
                      name="payMethod"
                      value="mercadopago"
                      checked={paymentMethod === 'mercadopago'}
                      onChange={() => setPaymentMethod('mercadopago')}
                    />
                    <CreditCard size={20} style={{ color: '#0284c7' }} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--navy-900)' }}>Pago Inmediato Mercado Pago Chile / Webpay</div>
                      <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>Procesamiento protegido vía Mercado Pago Checkout Pro oficial.</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Dynamic Details by Method */}
              {paymentMethod === 'transferencia' && (
                <div style={{ background: 'var(--surface-muted)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.825rem' }}>
                  <div style={{ fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.5rem' }}>Datos Bancarios Oficiales:</div>
                  <div>• <strong>Banco:</strong> Banco de Chile</div>
                  <div>• <strong>Tipo de Cuenta:</strong> Cuenta Corriente N° 849-01284-01</div>
                  <div>• <strong>RUT:</strong> 77.892.410-K</div>
                  <div>• <strong>Razón Social:</strong> PRONTO INSUMOS ODONTOLÓGICOS SPA</div>
                  <div>• <strong>Email para Comprobante:</strong> pagos@prontoinsumos.cl</div>
                </div>
              )}

              {paymentMethod === 'whatsapp' && (
                <div style={{ background: 'var(--teal-50)', color: 'var(--teal-700)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.825rem', border: '1px solid var(--teal-100)' }}>
                  💡 Se generará el enlace directo con el desglose del pedido para gestionar la cotización y coordinar el despacho.
                </div>
              )}

              {paymentMethod === 'mercadopago' && (
                <div style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.825rem', border: '1px solid #bae6fd' }}>
                  🔒 Pago seguro sin manipulación de datos de tarjeta en el sitio. Serás dirigido a la pasarela bancaria oficial.
                </div>
              )}

              {submitError && (
                <div style={{ color: '#dc2626', background: '#fef2f2', border: '1px solid #fecdd3', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: '600' }}>
                  {submitError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn-secondary" onClick={() => { setSubmitError(''); setStep(1); }}>
                  Volver
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={isSubmitting}>
                  <Lock size={17} />
                  <span>{isSubmitting ? 'Procesando...' : paymentMethod === 'whatsapp' ? 'Generar Cotización' : 'Confirmar Pedido'}</span>
                </button>
              </div>
            </form>
          )}

          {step === 3 && orderDetails && (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <CheckCircle size={52} style={{ color: 'var(--teal-600)', margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--navy-900)', marginBottom: '0.25rem' }}>
                {paymentMethod === 'whatsapp' ? '¡Cotización Generada!' : '¡Pedido Registrado con Éxito!'}
              </h3>

              <div style={{ background: 'var(--surface-muted)', padding: '1.25rem', borderRadius: 'var(--radius-sm)', textAlign: 'left', margin: '1.25rem 0', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Código de Pedido:</span>
                  <span style={{ fontWeight: '800', color: 'var(--navy-900)', fontFamily: 'monospace' }}>{orderDetails.orderId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Facturado:</span>
                  <span style={{ fontWeight: '800', color: 'var(--navy-900)' }}>${totalAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Método Seleccionado:</span>
                  <span style={{ fontWeight: '700', color: 'var(--navy-900)', textTransform: 'capitalize' }}>{paymentMethod}</span>
                </div>
              </div>

              {paymentMethod === 'whatsapp' && whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ background: '#059669', width: '100%', justifyContent: 'center', marginBottom: '1rem', textDecoration: 'none' }}
                >
                  <MessageSquare size={18} />
                  <span>Enviar Cotización a WhatsApp</span>
                  <ArrowRight size={18} />
                </a>
              )}

              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleClose}>
                <span>Volver a la Tienda</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
