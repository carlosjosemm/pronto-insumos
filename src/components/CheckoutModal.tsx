import React, { useState } from 'react'
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
    setIsSubmitting(true)

    // Generate canonical order identifier shared across database and gateway preference
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
    // (Must guarantee the order exists in database before redirecting away from the page)
    const result = await submitOrder({
      orderId: canonicalOrderId,
      items: cartItems,
      total: totalAmount,
      customer: sanitizedCustomer,
      paymentMethod
    })

    if (!result.success) {
      console.error('Failed to register initial pending order in database')
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
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={handleClose} aria-label="Cerrar ventana">
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid var(--slate-200)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <ShieldCheck size={20} style={{ color: 'var(--emerald-dark)' }} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800' }}>
              {step === 3 ? 'Pedido Registrado' : 'Gestión de Pedido y Pago'}
            </h2>
          </div>

          {/* Stepper Indicators */}
          {step !== 3 && (
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: '700', color: step >= 1 ? 'var(--emerald-dark)' : 'var(--slate-400)' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: step >= 1 ? 'var(--emerald)' : 'var(--slate-200)', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>1</span>
                <span>Despacho</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: '700', color: step >= 2 ? 'var(--emerald-dark)' : 'var(--slate-400)' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: step >= 2 ? 'var(--emerald)' : 'var(--slate-200)', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>2</span>
                <span>Forma de Pago / Cotización</span>
              </div>
            </div>
          )}
        </div>

        {/* Form Body */}
        <div style={{ padding: '1.5rem' }}>
          {step === 1 && (
            <form onSubmit={handleNextStep} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Document Type Selector (Boleta vs Factura) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.35rem' }}>
                  Tipo de Documento Tributario (Chile)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, documentType: 'boleta' })}
                    style={{
                      padding: '0.55rem',
                      borderRadius: 'var(--radius-sm)',
                      border: `2px solid ${formData.documentType === 'boleta' ? 'var(--emerald)' : 'var(--slate-200)'}`,
                      background: formData.documentType === 'boleta' ? '#f0fdf4' : 'white',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      color: formData.documentType === 'boleta' ? 'var(--emerald-dark)' : 'var(--slate-700)'
                    }}
                  >
                    📄 Boleta Electrónica
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, documentType: 'factura' })}
                    style={{
                      padding: '0.55rem',
                      borderRadius: 'var(--radius-sm)',
                      border: `2px solid ${formData.documentType === 'factura' ? 'var(--emerald)' : 'var(--slate-200)'}`,
                      background: formData.documentType === 'factura' ? '#f0fdf4' : 'white',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      color: formData.documentType === 'factura' ? 'var(--emerald-dark)' : 'var(--slate-700)'
                    }}
                  >
                    🏢 Factura Electrónica
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>
                  Nombre Completo {formData.documentType === 'factura' ? '/ Razón Social' : 'o Clínica'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={formData.documentType === 'factura' ? 'Ej: Clínica Odontológica Melipilla SpA' : 'Ej: Dra. Camila Fuentes'}
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid var(--slate-200)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>
                    RUT {formData.documentType === 'factura' ? 'Empresa' : 'Personal / Profesional'}
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
                      border: `1px solid ${rutError ? '#ef4444' : 'var(--slate-200)'}`,
                      borderRadius: 'var(--radius-sm)',
                      outlineColor: rutError ? '#ef4444' : undefined
                    }}
                  />
                  {rutError && (
                    <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: '600', marginTop: '0.2rem', display: 'block' }}>
                      {rutError}
                    </span>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Email para Documento SII</label>
                  <input
                    type="email"
                    required
                    placeholder="contacto@clinica.cl"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid var(--slate-200)', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              </div>

              {formData.documentType === 'factura' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#f8fafc', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--slate-200)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Razón Social Factura</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Clínica Odontológica SpA"
                      value={formData.razonSocial || ''}
                      onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid var(--slate-200)', borderRadius: 'var(--radius-sm)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Giro Comercial SII</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Servicios Odontológicos"
                      value={formData.giroComercial || ''}
                      onChange={(e) => setFormData({ ...formData, giroComercial: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid var(--slate-200)', borderRadius: 'var(--radius-sm)' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Teléfono Contacto</label>
                  <input
                    type="text"
                    required
                    placeholder="+56 9 1234 5678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid var(--slate-200)', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Dirección Gabinete / Consulta</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Av. Ortúzar 750, Of. 302"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid var(--slate-200)', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Ciudad / Región</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Melipilla, Región Metropolitana"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid var(--slate-200)', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Comuna / Código Postal</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 9500000"
                    value={formData.zip}
                    onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid var(--slate-200)', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '1rem', justifyContent: 'center' }}>
                <span>Seleccionar Método de Pago / Cotización</span>
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleNextStep} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ background: 'var(--slate-50)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--slate-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--slate-600)' }}>Total Pedido:</span>
                <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--slate-900)' }}>${totalAmount.toFixed(2)}</span>
              </div>

              {/* Method Selection Tabs */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                  Selecciona la Opción Preferida para tu Clínica:
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {/* Option 1: Transferencia Bancaria */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${paymentMethod === 'transferencia' ? 'var(--emerald)' : 'var(--slate-200)'}`,
                    background: paymentMethod === 'transferencia' ? '#f0fdf4' : 'white',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="radio"
                      name="payMethod"
                      value="transferencia"
                      checked={paymentMethod === 'transferencia'}
                      onChange={() => setPaymentMethod('transferencia')}
                    />
                    <Building2 size={20} style={{ color: 'var(--emerald-dark)' }} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>Transferencia Bancaria Directa (BCO)</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--slate-600)' }}>Datos bancarios para transferencia electrónica con boleta/factura.</div>
                    </div>
                  </label>

                  {/* Option 2: WhatsApp Quote */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${paymentMethod === 'whatsapp' ? 'var(--emerald)' : 'var(--slate-200)'}`,
                    background: paymentMethod === 'whatsapp' ? '#f0fdf4' : 'white',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="radio"
                      name="payMethod"
                      value="whatsapp"
                      checked={paymentMethod === 'whatsapp'}
                      onChange={() => setPaymentMethod('whatsapp')}
                    />
                    <MessageSquare size={20} style={{ color: '#25D366' }} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>Cotización por WhatsApp Melipilla</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--slate-600)' }}>Genera un mensaje de cotización instantáneo directo a nuestro ejecutivo.</div>
                    </div>
                  </label>

                  {/* Option 3: Mercado Pago Chile */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${paymentMethod === 'mercadopago' ? 'var(--emerald)' : 'var(--slate-200)'}`,
                    background: paymentMethod === 'mercadopago' ? '#f0fdf4' : 'white',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="radio"
                      name="payMethod"
                      value="mercadopago"
                      checked={paymentMethod === 'mercadopago'}
                      onChange={() => setPaymentMethod('mercadopago')}
                    />
                    <CreditCard size={20} style={{ color: '#009EE3' }} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>Pago Inmediato Mercado Pago Chile / Webpay</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--slate-600)' }}>Tarjeta de Crédito/Débito (descontará el stock de Firestore al instante).</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Dynamic Details by Method */}
              {paymentMethod === 'transferencia' && (
                <div style={{ background: 'var(--slate-50)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--slate-200)', fontSize: '0.825rem' }}>
                  <div style={{ fontWeight: '700', color: 'var(--slate-900)', marginBottom: '0.5rem' }}>Datos Bancarios PRONTO INSUMOS:</div>
                  <div>• <strong>Banco:</strong> Banco de Chile</div>
                  <div>• <strong>Tipo Cuenta:</strong> Cuenta Corriente N° 849-01284-01</div>
                  <div>• <strong>RUT:</strong> 77.892.410-K</div>
                  <div>• <strong>Email Transferencias:</strong> pagos@prontoinsumos.cl</div>
                  <div style={{ marginTop: '0.5rem', color: 'var(--slate-500)', fontSize: '0.75rem' }}>
                    *El stock no será descontado hasta que el pago sea verificado por el área de tesorería.
                  </div>
                </div>
              )}

              {paymentMethod === 'whatsapp' && (
                <div style={{ background: '#ecfdf5', color: '#047857', padding: '0.85rem', borderRadius: 'var(--radius-md)', fontSize: '0.825rem' }}>
                  💡 Al continuar, serás redirigido a WhatsApp con el detalle formateado del pedido para coordinar despacho directo a Melipilla.
                </div>
              )}

              {paymentMethod === 'mercadopago' && (
                <div style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.85rem', borderRadius: 'var(--radius-md)', fontSize: '0.825rem' }}>
                  ⚡ **Descuento de Stock Automático**: Al aprobarse el pago, se actualizará el stock real en Firestore.
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn-secondary" style={{ color: 'var(--slate-800)', borderColor: 'var(--slate-300)' }} onClick={() => setStep(1)}>
                  Volver
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={isSubmitting}>
                  <Lock size={18} />
                  <span>{isSubmitting ? 'Procesando...' : paymentMethod === 'whatsapp' ? 'Generar Cotización' : 'Confirmar Pedido'}</span>
                </button>
              </div>
            </form>
          )}

          {step === 3 && orderDetails && (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <CheckCircle size={56} style={{ color: 'var(--emerald)', margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '0.25rem' }}>
                {paymentMethod === 'whatsapp' ? '¡Cotización Registrada!' : '¡Pedido Registrado con Éxito!'}
              </h3>

              <div style={{ background: 'var(--slate-50)', padding: '1.25rem', borderRadius: 'var(--radius-md)', textAlign: 'left', margin: '1.25rem 0', border: '1px solid var(--slate-200)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--slate-500)' }}>ID de Pedido:</span>
                  <span style={{ fontWeight: '800', color: 'var(--slate-900)' }}>{orderDetails.orderId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--slate-500)' }}>Total:</span>
                  <span style={{ fontWeight: '800', color: 'var(--emerald-dark)' }}>${totalAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--slate-500)' }}>Método Seleccionado:</span>
                  <span style={{ fontWeight: '700', color: 'var(--slate-800)', textTransform: 'capitalize' }}>{paymentMethod}</span>
                </div>
              </div>

              {paymentMethod === 'whatsapp' && whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ background: '#25D366', width: '100%', justifyContent: 'center', marginBottom: '1rem', textDecoration: 'none' }}
                >
                  <MessageSquare size={18} />
                  <span>Enviar Cotización por WhatsApp Ahora</span>
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
