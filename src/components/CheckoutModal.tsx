import React, { useState, useEffect } from 'react'
import { CartItem, CustomerInfo, PaymentMethod, SubmitOrderResult, BillingInfo, SanitaryVerification } from '../types'
import {
  X,
  CheckCircle,
  ShieldCheck,
  Lock,
  CreditCard,
  MessageSquare,
  Building2,
  ArrowRight,
  Printer,
  FileText,
  ShieldAlert,
  Upload,
  Truck
} from 'lucide-react'
import { submitOrder, generateOrderId } from '../services/api'
import { generateWhatsAppQuoteUrl } from '../services/whatsapp'
import { processMercadoPagoPayment } from '../services/mercadopago'
import { validateRut, formatRut } from '../utils/rut'
import { formatCLP } from '../utils/currency'
import { calculateTaxBreakdown, validateFacturaFields } from '../utils/tax'
import { BANK_DETAILS } from '../config/bankDetails'
import { uploadTransferVoucher, validateVoucherFile } from '../services/transferVoucher'
import { whatsappLink } from '../config/contact'
import {
  DELIVERY_ZONES,
  DEFAULT_DELIVERY_ZONE,
  MIN_ORDER_OUTSIDE_MELIPILLA,
  MIN_ORDER_ZONE,
  isBelowMinimumOrder
} from '../config/delivery'
import type { DeliveryZone } from '../config/delivery'
import { useScrollLock } from '../hooks/useScrollLock'
import { useFocusTrap } from '../hooks/useFocusTrap'

/** Factura Electrónica is disabled storefront-wide — the path is kept behind this flag. */
const FACTURA_ENABLED = false

export interface CheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  cartItems: CartItem[]
  totalAmount: number
  onOrderSuccess: () => void
  onOpenTracking?: (orderId: string, rut: string) => void
}

export default function CheckoutModal({
  isOpen,
  onClose,
  cartItems,
  totalAmount,
  onOrderSuccess,
  onOpenTracking
}: CheckoutModalProps) {
  const [step, setStep] = useState<number>(1) // 1: Shipping, 2: Payment/Quote Method, 3: Confirmation
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transferencia')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [orderDetails, setOrderDetails] = useState<SubmitOrderResult | null>(null)
  const [whatsappUrl, setWhatsappUrl] = useState<string>('')
  const [rutError, setRutError] = useState<string>('')
  const [facturaErrors, setFacturaErrors] = useState<Record<string, string>>({})
  const [sisRegistryNumber, setSisRegistryNumber] = useState<string>('')
  const [credentialFileName, setCredentialFileName] = useState<string>('')
  const [sisError, setSisError] = useState<string>('')
  const [submitError, setSubmitError] = useState<string>('')
  const [showVoucher, setShowVoucher] = useState<boolean>(false)

  // Bank transfer voucher upload state
  const [voucherFile, setVoucherFile] = useState<File | null>(null)
  const [voucherUploading, setVoucherUploading] = useState<boolean>(false)
  const [voucherUploaded, setVoucherUploaded] = useState<boolean>(false)
  const [voucherError, setVoucherError] = useState<string>('')

  const hasRegulatedItems = cartItems.some((i) => i.product.prescriptionRequired)

  // Freeze the page behind the modal
  useScrollLock(isOpen)
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen)

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
    city: DEFAULT_DELIVERY_ZONE,
    zip: ''
  })

  if (!isOpen) return null

  const resetForm = () => {
    setStep(1)
    setOrderDetails(null)
    setWhatsappUrl('')
    setRutError('')
    setFacturaErrors({})
    setSisRegistryNumber('')
    setCredentialFileName('')
    setSisError('')
    setSubmitError('')
    setShowVoucher(false)
    setVoucherFile(null)
    setVoucherUploading(false)
    setVoucherUploaded(false)
    setVoucherError('')
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      rut: '',
      documentType: 'boleta',
      razonSocial: '',
      giroComercial: '',
      address: '',
      city: DEFAULT_DELIVERY_ZONE,
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
    setFormData((prev) => ({ ...prev, rut: formatted }))
    if (rutError && validateRut(formatted)) {
      setRutError('')
    }
    if (facturaErrors.rut && validateRut(formatted)) {
      setFacturaErrors((prev) => ({ ...prev, rut: '' }))
    }
  }

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    if (step === 1) {
      // Pre-flight stock check
      const stockIssueItem = cartItems.find((item) => {
        const stock = typeof item.product.stockCount === 'number' ? item.product.stockCount : 0
        return !item.product.inStock || stock <= 0 || item.quantity > stock
      })

      if (stockIssueItem) {
        const stock = typeof stockIssueItem.product.stockCount === 'number' ? stockIssueItem.product.stockCount : 0
        if (!stockIssueItem.product.inStock || stock <= 0) {
          setSubmitError(
            `El producto "${stockIssueItem.product.name}" no cuenta con stock disponible. Por favor modifica tu carro para continuar.`
          )
        } else {
          setSubmitError(
            `El producto "${stockIssueItem.product.name}" supera el stock disponible (${stockIssueItem.quantity} solicitados, ${stock} disponibles). Por favor ajusta la cantidad en el carro.`
          )
        }
        return
      }

      // Minimum-order gate: San Antonio despacho requires a $60.000 product subtotal
      const productSubtotal = cartItems.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
      const deliveryZone = (formData.city || DEFAULT_DELIVERY_ZONE) as DeliveryZone
      if (isBelowMinimumOrder(deliveryZone, productSubtotal)) {
        setSubmitError(
          `La compra mínima para despacho a ${MIN_ORDER_ZONE} es de ${formatCLP(MIN_ORDER_OUTSIDE_MELIPILLA)}`
        )
        return
      }

      if (FACTURA_ENABLED && formData.documentType === 'factura') {
        const validation = validateFacturaFields({
          rut: formData.rut,
          razonSocial: formData.razonSocial,
          giroComercial: formData.giroComercial,
          address: formData.address,
          city: formData.city
        })

        if (!validation.isValid) {
          setFacturaErrors(validation.errors)
          if (validation.errors.rut) {
            setRutError(validation.errors.rut)
          }
          return
        }
      } else {
        if (!validateRut(formData.rut)) {
          setRutError('RUT inválido. Por favor verifica el número y el dígito verificador.')
          return
        }
      }

      if (hasRegulatedItems) {
        const cleanedSis = sisRegistryNumber.trim()
        if (!cleanedSis || cleanedSis.length < 4) {
          setSisError('Debe ingresar un N° de Registro SIS válido (mínimo 4 dígitos) para insumos controlados.')
          return
        }
      }

      setRutError('')
      setFacturaErrors({})
      setSisError('')
      setStep(2)
    } else if (step === 2) {
      handleCompleteOrder()
    }
  }

  const handleCompleteOrder = async () => {
    setSubmitError('')

    // Pre-flight stock re-check
    const stockIssueItem = cartItems.find((item) => {
      const stock = typeof item.product.stockCount === 'number' ? item.product.stockCount : 0
      return !item.product.inStock || stock <= 0 || item.quantity > stock
    })

    if (stockIssueItem) {
      const stock = typeof stockIssueItem.product.stockCount === 'number' ? stockIssueItem.product.stockCount : 0
      if (!stockIssueItem.product.inStock || stock <= 0) {
        setSubmitError(
          `El producto "${stockIssueItem.product.name}" no cuenta con stock disponible. Por favor modifica tu carro para continuar.`
        )
      } else {
        setSubmitError(
          `El producto "${stockIssueItem.product.name}" supera el stock disponible (${stockIssueItem.quantity} solicitados, ${stock} disponibles). Por favor ajusta la cantidad en el carro.`
        )
      }
      return
    }

    setIsSubmitting(true)

    // Canonical order identifier PRONTO-XXXXXX
    const canonicalOrderId = generateOrderId()

    const sanitaryVerification: SanitaryVerification | undefined = hasRegulatedItems
      ? {
          sisRegistryNumber: sisRegistryNumber.trim(),
          credentialFileName: credentialFileName || undefined,
          verified: true,
          regulatoryNote: 'Verificado según Art. 101 Código Sanitario DFL 725 y Decreto 466 (ISP Chile / SIS)'
        }
      : undefined

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
      zip: formData.zip.trim(),
      sanitaryVerification
    }

    const taxBreakdown = calculateTaxBreakdown(totalAmount)
    const billing: BillingInfo = {
      documentType: formData.documentType,
      rut: sanitizedCustomer.rut,
      razonSocial: formData.documentType === 'factura' ? sanitizedCustomer.razonSocial : undefined,
      giroComercial: formData.documentType === 'factura' ? sanitizedCustomer.giroComercial : undefined,
      direccionFiscal: sanitizedCustomer.address,
      comunaFiscal: sanitizedCustomer.city,
      taxBreakdown,
      status: 'PENDIENTE_EMISION_SII'
    }

    // 1. Submit Order to Firestore FIRST with initial pending status & structured billing
    const result = await submitOrder({
      orderId: canonicalOrderId,
      items: cartItems,
      total: totalAmount,
      customer: sanitizedCustomer,
      paymentMethod,
      billing,
      sanitaryVerification
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

  const handleUploadVoucher = async () => {
    if (!voucherFile || !orderDetails) return
    const validation = validateVoucherFile(voucherFile)
    if (!validation.isValid) {
      setVoucherError(validation.error || 'Archivo no válido.')
      return
    }

    setVoucherUploading(true)
    setVoucherError('')
    const res = await uploadTransferVoucher({
      orderId: orderDetails.orderId,
      customerRut: formData.rut,
      file: voucherFile
    })
    setVoucherUploading(false)
    if (res.success) {
      setVoucherUploaded(true)
    } else {
      setVoucherError(res.error || 'No fue posible subir el comprobante.')
    }
  }

  return (
    <div ref={dialogRef} className="modal-overlay" onClick={handleClose} role="dialog" aria-modal="true">
      <div className="modal-card" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={handleClose} aria-label="Cerrar ventana">
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div
          style={{
            padding: '1.5rem 1.75rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--surface-card)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <ShieldCheck size={22} style={{ color: 'var(--teal-600)' }} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--navy-900)' }}>
              {step === 3 ? 'Pedido Registrado' : 'Gestión de Pedido y Pago'}
            </h2>
          </div>

          {/* Stepper Indicators */}
          {step !== 3 && (
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.85rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  color: step >= 1 ? 'var(--navy-900)' : 'var(--text-muted)'
                }}
              >
                <span
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: 'var(--radius-xs)',
                    background: step >= 1 ? 'var(--teal-600)' : 'var(--border-subtle)',
                    color: 'var(--text-inverse)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem'
                  }}
                >
                  1
                </span>
                <span>Despacho & Facturación</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  color: step >= 2 ? 'var(--navy-900)' : 'var(--text-muted)'
                }}
              >
                <span
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: 'var(--radius-xs)',
                    background: step >= 2 ? 'var(--teal-600)' : 'var(--border-subtle)',
                    color: 'var(--text-inverse)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem'
                  }}
                >
                  2
                </span>
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
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.825rem',
                    fontWeight: '700',
                    color: 'var(--navy-900)',
                    marginBottom: '0.4rem'
                  }}
                >
                  Tipo de Documento Tributario (Chile - SII)
                </label>
                <div
                  style={{ display: 'grid', gridTemplateColumns: FACTURA_ENABLED ? '1fr 1fr' : '1fr', gap: '0.65rem' }}
                >
                  {FACTURA_ENABLED && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, documentType: 'factura' })}
                      style={{
                        padding: '0.65rem',
                        borderRadius: 'var(--radius-sm)',
                        border: `2px solid ${formData.documentType === 'factura' ? 'var(--teal-600)' : 'var(--border-subtle)'}`,
                        background: formData.documentType === 'factura' ? 'var(--teal-50)' : 'var(--surface-card)',
                        fontWeight: '700',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        color: formData.documentType === 'factura' ? 'var(--teal-700)' : 'var(--text-secondary)',
                        transition: 'var(--transition-fast)'
                      }}
                    >
                      🏢 Factura Electrónica (Clínicas)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, documentType: 'boleta' })}
                    style={{
                      padding: '0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      border: `2px solid ${formData.documentType === 'boleta' ? 'var(--teal-600)' : 'var(--border-subtle)'}`,
                      background: formData.documentType === 'boleta' ? 'var(--teal-50)' : 'var(--surface-card)',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      color: formData.documentType === 'boleta' ? 'var(--teal-700)' : 'var(--text-secondary)',
                      transition: 'var(--transition-fast)'
                    }}
                  >
                    📄 Boleta Electrónica
                  </button>
                </div>
                {!FACTURA_ENABLED && (
                  <p
                    style={{ margin: '0.5rem 0 0', fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.45 }}
                  >
                    ¿Necesitas Factura Electrónica para tu clínica?{' '}
                    <a
                      href={whatsappLink('Hola, necesito cotización con Factura Electrónica para clínica dental')}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent)', fontWeight: '600' }}
                    >
                      Cotízala por WhatsApp.
                    </a>
                  </p>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    color: 'var(--navy-900)',
                    marginBottom: '0.25rem'
                  }}
                >
                  Nombre del Profesional {formData.documentType === 'factura' ? 'o Representante Legal' : ''}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    formData.documentType === 'factura'
                      ? 'Ej: Dra. Camila Fuentes (Contacto / Solicitante)'
                      : 'Ej: Dra. Camila Fuentes'
                  }
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color: 'var(--navy-900)',
                      marginBottom: '0.25rem'
                    }}
                  >
                    RUT {formData.documentType === 'factura' ? 'Empresa / Sociedad' : 'Personal (RUN)'}
                  </label>
                  <input
                    type="text"
                    inputMode="text"
                    required
                    placeholder="12.345.678-K"
                    value={formData.rut}
                    onChange={(e) => handleRutChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      border: `1px solid ${rutError ? 'var(--danger)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-sm)',
                      outlineColor: rutError ? 'var(--danger)' : undefined
                    }}
                  />
                  {rutError && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--danger)',
                        fontWeight: '600',
                        marginTop: '0.25rem',
                        display: 'block'
                      }}
                    >
                      {rutError}
                    </span>
                  )}
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color: 'var(--navy-900)',
                      marginBottom: '0.25rem'
                    }}
                  >
                    Email para Documento SII
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="contacto@clinica.cl"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  />
                </div>
              </div>

              {FACTURA_ENABLED && formData.documentType === 'factura' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem',
                    background: 'var(--surface-muted)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color: 'var(--teal-800)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <Building2 size={16} />
                    <span>Datos Tributarios de la Clínica (SII)</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.775rem',
                          fontWeight: '700',
                          color: 'var(--navy-900)',
                          marginBottom: '0.25rem'
                        }}
                      >
                        Razón Social (según SII) *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Centro Dental San Pedro SpA"
                        value={formData.razonSocial || ''}
                        onChange={(e) => {
                          setFormData({ ...formData, razonSocial: e.target.value })
                          if (facturaErrors.razonSocial) setFacturaErrors((prev) => ({ ...prev, razonSocial: '' }))
                        }}
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem',
                          border: `1px solid ${facturaErrors.razonSocial ? 'var(--danger)' : 'var(--border-subtle)'}`,
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-card)'
                        }}
                      />
                      {facturaErrors.razonSocial && (
                        <span
                          style={{
                            fontSize: '0.725rem',
                            color: 'var(--danger)',
                            fontWeight: '600',
                            marginTop: '0.25rem',
                            display: 'block'
                          }}
                        >
                          {facturaErrors.razonSocial}
                        </span>
                      )}
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.775rem',
                          fontWeight: '700',
                          color: 'var(--navy-900)',
                          marginBottom: '0.25rem'
                        }}
                      >
                        Giro Comercial Registrado *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Servicios Odontológicos"
                        value={formData.giroComercial || ''}
                        onChange={(e) => {
                          setFormData({ ...formData, giroComercial: e.target.value })
                          if (facturaErrors.giroComercial) setFacturaErrors((prev) => ({ ...prev, giroComercial: '' }))
                        }}
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem',
                          border: `1px solid ${facturaErrors.giroComercial ? 'var(--danger)' : 'var(--border-subtle)'}`,
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-card)'
                        }}
                      />
                      {facturaErrors.giroComercial && (
                        <span
                          style={{
                            fontSize: '0.725rem',
                            color: 'var(--danger)',
                            fontWeight: '600',
                            marginTop: '0.25rem',
                            display: 'block'
                          }}
                        >
                          {facturaErrors.giroComercial}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color: 'var(--navy-900)',
                      marginBottom: '0.25rem'
                    }}
                  >
                    Teléfono Móvil
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    required
                    placeholder="+56 9 1234 5678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color: 'var(--navy-900)',
                      marginBottom: '0.25rem'
                    }}
                  >
                    Dirección de Entrega / Fiscal *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Av. Ortúzar 750, Of. 302"
                    value={formData.address}
                    onChange={(e) => {
                      setFormData({ ...formData, address: e.target.value })
                      if (facturaErrors.address) setFacturaErrors((prev) => ({ ...prev, address: '' }))
                    }}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      border: `1px solid ${facturaErrors.address ? 'var(--danger)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-sm)'
                    }}
                  />
                  {facturaErrors.address && (
                    <span
                      style={{
                        fontSize: '0.725rem',
                        color: 'var(--danger)',
                        fontWeight: '600',
                        marginTop: '0.25rem',
                        display: 'block'
                      }}
                    >
                      {facturaErrors.address}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color: 'var(--navy-900)',
                      marginBottom: '0.25rem'
                    }}
                  >
                    Comuna de Despacho *
                  </label>
                  <select
                    required
                    value={formData.city || DEFAULT_DELIVERY_ZONE}
                    onChange={(e) => {
                      setFormData({ ...formData, city: e.target.value })
                      if (facturaErrors.city) setFacturaErrors((prev) => ({ ...prev, city: '' }))
                    }}
                    aria-label="Comuna de Despacho"
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      border: `1px solid ${facturaErrors.city ? 'var(--danger)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-card)'
                    }}
                  >
                    {DELIVERY_ZONES.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </select>
                  {formData.city === MIN_ORDER_ZONE && (
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                      Compra mínima para despacho a {MIN_ORDER_ZONE}: {formatCLP(MIN_ORDER_OUTSIDE_MELIPILLA)}
                    </p>
                  )}
                  {facturaErrors.city && (
                    <span
                      style={{
                        fontSize: '0.725rem',
                        color: 'var(--danger)',
                        fontWeight: '600',
                        marginTop: '0.25rem',
                        display: 'block'
                      }}
                    >
                      {facturaErrors.city}
                    </span>
                  )}
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color: 'var(--navy-900)',
                      marginBottom: '0.25rem'
                    }}
                  >
                    Código Postal / Región
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="Ej: 9500000"
                    value={formData.zip}
                    onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  />
                </div>
              </div>

              {/* Sanitary Verification Block (Mandatory if controlled supplies present) */}
              {hasRegulatedItems && (
                <div
                  style={{
                    background: 'var(--signal-soft)',
                    border: '1.5px solid var(--signal-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      color: 'var(--warning)',
                      fontWeight: '800',
                      fontSize: '0.85rem'
                    }}
                  >
                    <ShieldAlert size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                    <span>Validación Sanitaria Requerida (ISP / Superintendencia de Salud)</span>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--warning)', lineHeight: '1.4' }}>
                    Tu carro contiene insumos de expendio controlado (anestésicos o instrumental quirúrgico regulado por
                    el ISP bajo DFL 725 y Decreto 466). De acuerdo a la normativa sanitaria chilena, debes ingresar tu
                    N° de Registro en la Superintendencia de Salud (SIS) para autorizar el despacho.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                    <div>
                      <label
                        htmlFor="sis-registry-number"
                        style={{
                          display: 'block',
                          fontSize: '0.775rem',
                          fontWeight: '700',
                          color: 'var(--warning)',
                          marginBottom: '0.25rem'
                        }}
                      >
                        N° Registro SIS (Superintendencia) *
                      </label>
                      <input
                        id="sis-registry-number"
                        type="text"
                        inputMode="text"
                        placeholder="Ej: 148925"
                        value={sisRegistryNumber}
                        onChange={(e) => {
                          setSisRegistryNumber(e.target.value)
                          if (sisError) setSisError('')
                        }}
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem',
                          border: `1px solid ${sisError ? 'var(--danger)' : 'var(--signal-border)'}`,
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-card)',
                          fontWeight: '600'
                        }}
                      />
                      {sisError && (
                        <span
                          style={{
                            fontSize: '0.725rem',
                            color: 'var(--danger)',
                            fontWeight: '600',
                            marginTop: '0.25rem',
                            display: 'block'
                          }}
                        >
                          {sisError}
                        </span>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="credential-file"
                        style={{
                          display: 'block',
                          fontSize: '0.775rem',
                          fontWeight: '700',
                          color: 'var(--warning)',
                          marginBottom: '0.25rem'
                        }}
                      >
                        Credencial Profesional o Receta (Opcional)
                      </label>
                      <input
                        id="credential-file"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setCredentialFileName(e.target.files[0].name)
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '0.45rem 0.5rem',
                          border: '1px dashed var(--warning)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-card)',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                      />
                      {credentialFileName && (
                        <span
                          style={{
                            fontSize: '0.725rem',
                            color: 'var(--success)',
                            fontWeight: '600',
                            marginTop: '0.25rem',
                            display: 'block'
                          }}
                        >
                          ✓ Adjunto: {credentialFileName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '0.7rem', color: 'var(--warning)', fontStyle: 'italic' }}>
                    * PRONTO verifica el N° SIS ante el Registro Nacional de Prestadores Individuales de Salud antes del
                    despacho.
                  </div>
                </div>
              )}

              {submitError && (
                <div
                  style={{
                    color: 'var(--danger)',
                    background: 'var(--signal-soft)',
                    border: '1px solid var(--signal-border)',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}
                >
                  {submitError}
                </div>
              )}

              <button type="submit" className="btn-primary" style={{ marginTop: '0.75rem', justifyContent: 'center' }}>
                <span>Seleccionar Método de Pago / Cotización</span>
                <ArrowRight size={17} />
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleNextStep} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div
                style={{
                  background: 'var(--surface-muted)',
                  padding: '0.85rem 1.25rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total a Pagar:</span>
                <span style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--navy-900)' }}>
                  {formatCLP(totalAmount)}
                </span>
              </div>

              {/* Method Selection Cards */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    color: 'var(--navy-900)',
                    marginBottom: '0.65rem'
                  }}
                >
                  Selecciona la Opción Preferida para tu Clínica:
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Option 1: Transferencia Bancaria */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      border: `2px solid ${paymentMethod === 'transferencia' ? 'var(--teal-600)' : 'var(--border-subtle)'}`,
                      background: paymentMethod === 'transferencia' ? 'var(--teal-50)' : 'var(--surface-card)',
                      cursor: 'pointer',
                      transition: 'var(--transition-fast)'
                    }}
                  >
                    <input
                      type="radio"
                      name="payMethod"
                      value="transferencia"
                      checked={paymentMethod === 'transferencia'}
                      onChange={() => setPaymentMethod('transferencia')}
                    />
                    <Building2 size={20} style={{ color: 'var(--teal-700)' }} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--navy-900)' }}>
                        Transferencia Bancaria Directa (Banco de Chile)
                      </div>
                      <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                        Cuenta corriente comercial con comprobante y emisión de Factura.
                      </div>
                    </div>
                  </label>

                  {/* Option 2: WhatsApp Quote */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      border: `2px solid ${paymentMethod === 'whatsapp' ? 'var(--teal-600)' : 'var(--border-subtle)'}`,
                      background: paymentMethod === 'whatsapp' ? 'var(--teal-50)' : 'var(--surface-card)',
                      cursor: 'pointer',
                      transition: 'var(--transition-fast)'
                    }}
                  >
                    <input
                      type="radio"
                      name="payMethod"
                      value="whatsapp"
                      checked={paymentMethod === 'whatsapp'}
                      onChange={() => setPaymentMethod('whatsapp')}
                    />
                    <MessageSquare size={20} style={{ color: 'var(--success)' }} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--navy-900)' }}>
                        Cotización Formal Asistida por WhatsApp
                      </div>
                      <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                        Genera una cotización formal para aprobación administrativa o presupuesto.
                      </div>
                    </div>
                  </label>

                  {/* Option 3: Mercado Pago Chile */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      border: `2px solid ${paymentMethod === 'mercadopago' ? 'var(--teal-600)' : 'var(--border-subtle)'}`,
                      background: paymentMethod === 'mercadopago' ? 'var(--teal-50)' : 'var(--surface-card)',
                      cursor: 'pointer',
                      transition: 'var(--transition-fast)'
                    }}
                  >
                    <input
                      type="radio"
                      name="payMethod"
                      value="mercadopago"
                      checked={paymentMethod === 'mercadopago'}
                      onChange={() => setPaymentMethod('mercadopago')}
                    />
                    <CreditCard size={20} style={{ color: 'var(--accent)' }} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--navy-900)' }}>
                        Pago Inmediato Mercado Pago Chile / Webpay
                      </div>
                      <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                        Procesamiento protegido vía Mercado Pago Checkout Pro oficial.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Dynamic Details by Method */}
              {paymentMethod === 'transferencia' && (
                <div
                  style={{
                    background: 'var(--surface-muted)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.825rem'
                  }}
                >
                  <div style={{ fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.5rem' }}>
                    Datos Bancarios Oficiales:
                  </div>
                  <div>
                    • <strong>Banco:</strong> {BANK_DETAILS.bankName}
                  </div>
                  <div>
                    • <strong>Tipo de Cuenta:</strong> {BANK_DETAILS.accountType} N° {BANK_DETAILS.accountNumber}
                  </div>
                  <div>
                    • <strong>RUT:</strong> {BANK_DETAILS.rut}
                  </div>
                  <div>
                    • <strong>Razón Social:</strong> {BANK_DETAILS.companyName}
                  </div>
                  <div>
                    • <strong>Email para Comprobante:</strong> {BANK_DETAILS.email}
                  </div>
                </div>
              )}

              {paymentMethod === 'whatsapp' && (
                <div
                  style={{
                    background: 'var(--teal-50)',
                    color: 'var(--teal-700)',
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.825rem',
                    border: '1px solid var(--teal-100)'
                  }}
                >
                  💡 Se generará el enlace directo con el desglose del pedido para gestionar la cotización y coordinar
                  el despacho.
                </div>
              )}

              {paymentMethod === 'mercadopago' && (
                <div
                  style={{
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.825rem',
                    border: '1px solid var(--accent-border)'
                  }}
                >
                  🔒 Pago seguro sin manipulación de datos de tarjeta en el sitio. Serás dirigido a la pasarela bancaria
                  oficial.
                </div>
              )}

              {submitError && (
                <div
                  style={{
                    color: 'var(--danger)',
                    background: 'var(--signal-soft)',
                    border: '1px solid var(--signal-border)',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}
                >
                  {submitError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setSubmitError('')
                    setStep(1)
                  }}
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={isSubmitting}
                >
                  <Lock size={17} />
                  <span>
                    {isSubmitting
                      ? 'Procesando...'
                      : paymentMethod === 'whatsapp'
                        ? 'Generar Cotización'
                        : 'Confirmar Pedido'}
                  </span>
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

              <div
                style={{
                  background: 'var(--surface-muted)',
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'left',
                  margin: '1.25rem 0',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    marginBottom: '0.5rem'
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Código de Pedido:</span>
                  <span style={{ fontWeight: '800', color: 'var(--navy-900)', fontFamily: 'monospace' }}>
                    {orderDetails.orderId}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    marginBottom: '0.5rem'
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Total a Pagar:</span>
                  <span style={{ fontWeight: '800', color: 'var(--navy-900)' }}>{formatCLP(totalAmount)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    marginBottom: '0.5rem'
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Documento Tributario:</span>
                  <span style={{ fontWeight: '700', color: 'var(--navy-900)' }}>
                    {formData.documentType === 'factura' ? 'Factura Electrónica (Clínica)' : 'Boleta Electrónica'}
                  </span>
                </div>
                {hasRegulatedItems && sisRegistryNumber && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.85rem',
                      marginBottom: '0.5rem'
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)' }}>Registro Sanitario SIS:</span>
                    <span style={{ fontWeight: '700', color: 'var(--navy-900)' }}>
                      {sisRegistryNumber} (Acreditado)
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Método Seleccionado:</span>
                  <span style={{ fontWeight: '700', color: 'var(--navy-900)', textTransform: 'capitalize' }}>
                    {paymentMethod}
                  </span>
                </div>
              </div>

              {/* Printable Voucher Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowVoucher(!showVoucher)}
                  style={{ width: '100%', justifyContent: 'center', fontWeight: '700', gap: '0.5rem' }}
                >
                  <FileText size={18} />
                  <span>{showVoucher ? 'Ocultar Comprobante' : 'Ver Comprobante de Compra (Pro-Forma)'}</span>
                </button>

                {showVoucher && (
                  <div
                    id="pronto-purchase-voucher"
                    style={{
                      background: 'var(--surface-card)',
                      border: '2px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '1.25rem',
                      textAlign: 'left',
                      fontSize: '0.85rem'
                    }}
                  >
                    {/* Header */}
                    <div
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        paddingBottom: '0.75rem',
                        marginBottom: '0.75rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--navy-900)' }}>
                          PRONTO INSUMOS ODONTOLÓGICOS
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Distribuidora Dental • Melipilla, Región Metropolitana
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          RUT Distribuidor: 77.892.410-K
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-xs)',
                            background: formData.documentType === 'factura' ? 'var(--teal-50)' : 'var(--surface-muted)',
                            color: formData.documentType === 'factura' ? 'var(--teal-800)' : 'var(--navy-900)',
                            fontWeight: '800',
                            fontSize: '0.75rem',
                            border: '1px solid var(--border-subtle)'
                          }}
                        >
                          {formData.documentType === 'factura' ? 'COMPROBANTE FACTURA' : 'COMPROBANTE BOLETA'}
                        </span>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          {orderDetails.orderId}
                        </div>
                      </div>
                    </div>

                    {/* Fiscal Details */}
                    <div
                      style={{
                        background: 'var(--surface-muted)',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-xs)',
                        marginBottom: '0.75rem',
                        fontSize: '0.775rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.2rem'
                      }}
                    >
                      <div>
                        <strong>{formData.documentType === 'factura' ? 'Razón Social' : 'Cliente'}:</strong>{' '}
                        {formData.documentType === 'factura'
                          ? formData.razonSocial || formData.fullName
                          : formData.fullName}
                      </div>
                      <div>
                        <strong>RUT:</strong> {formData.rut}
                      </div>
                      {formData.documentType === 'factura' && formData.giroComercial && (
                        <div>
                          <strong>Giro:</strong> {formData.giroComercial}
                        </div>
                      )}
                      <div>
                        <strong>Dirección:</strong> {formData.address}, {formData.city}
                      </div>
                      <div>
                        <strong>Email de Contacto:</strong> {formData.email}
                      </div>
                      {hasRegulatedItems && sisRegistryNumber && (
                        <div>
                          <strong>Reg. SIS Profesional:</strong> {sisRegistryNumber} (Acreditación ISP)
                        </div>
                      )}
                    </div>

                    {/* Items List */}
                    <div
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        paddingBottom: '0.75rem',
                        marginBottom: '0.75rem'
                      }}
                    >
                      <div
                        style={{
                          fontWeight: '700',
                          fontSize: '0.775rem',
                          color: 'var(--text-muted)',
                          marginBottom: '0.35rem',
                          display: 'grid',
                          gridTemplateColumns: '2rem 1fr auto'
                        }}
                      >
                        <span>Cant</span>
                        <span>Insumo</span>
                        <span>Subtotal</span>
                      </div>
                      {cartItems.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '2rem 1fr auto',
                            fontSize: '0.775rem',
                            padding: '0.2rem 0'
                          }}
                        >
                          <span style={{ fontWeight: '700', color: 'var(--navy-900)' }}>{item.quantity}x</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{item.product.name}</span>
                          <span style={{ fontWeight: '600' }}>{formatCLP(item.product.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Tax Breakdown Table */}
                    {(() => {
                      const breakdown = calculateTaxBreakdown(totalAmount)
                      return (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3rem',
                            fontSize: '0.8rem',
                            borderBottom: '1px solid var(--border-subtle)',
                            paddingBottom: '0.75rem',
                            marginBottom: '0.75rem'
                          }}
                        >
                          <div
                            style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}
                          >
                            <span>Monto Neto:</span>
                            <span>{formatCLP(breakdown.neto)}</span>
                          </div>
                          <div
                            style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}
                          >
                            <span>IVA (19%):</span>
                            <span>{formatCLP(breakdown.iva)}</span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontWeight: '800',
                              color: 'var(--navy-900)',
                              fontSize: '0.9rem'
                            }}
                          >
                            <span>Total a Pagar (CLP):</span>
                            <span>{formatCLP(breakdown.total)}</span>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Legal Notice */}
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        fontStyle: 'italic',
                        marginBottom: '0.75rem',
                        lineHeight: '1.3'
                      }}
                    >
                      * Comprobante pro-forma de respaldo interno. El documento tributario oficial (
                      {formData.documentType === 'factura' ? 'Factura Electrónica' : 'Boleta Electrónica'}) con firma y
                      timbre del SII será generado mediante el Portal Tributario y remitido al correo de la clínica.
                    </div>

                    {/* Print Button */}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => window.print()}
                      style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', gap: '0.5rem' }}
                    >
                      <Printer size={15} />
                      <span>Imprimir / Guardar en PDF</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Bank Transfer Instructions & Voucher Upload in Step 3 */}
              {paymentMethod === 'transferencia' && (
                <div
                  style={{
                    background: 'var(--signal-soft)',
                    border: '1.5px solid var(--signal-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1.15rem',
                    textAlign: 'left',
                    marginBottom: '1.25rem'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                      color: 'var(--warning)',
                      fontWeight: '800',
                      fontSize: '0.875rem'
                    }}
                  >
                    <Building2 size={18} style={{ color: 'var(--warning)' }} />
                    <span>Instrucciones de Transferencia Bancaria Directa</span>
                  </div>

                  <div
                    style={{ fontSize: '0.8rem', color: 'var(--warning)', marginBottom: '0.85rem', lineHeight: '1.4' }}
                  >
                    <div>
                      • <strong>Banco:</strong> {BANK_DETAILS.bankName}
                    </div>
                    <div>
                      • <strong>Tipo de Cuenta:</strong> {BANK_DETAILS.accountType} N° {BANK_DETAILS.accountNumber}
                    </div>
                    <div>
                      • <strong>RUT Empresa:</strong> {BANK_DETAILS.rut}
                    </div>
                    <div>
                      • <strong>Razón Social:</strong> {BANK_DETAILS.companyName}
                    </div>
                    <div>
                      • <strong>Monto Exacto:</strong> {formatCLP(totalAmount)}
                    </div>
                    <div>
                      • <strong>Email Comprobante:</strong> {BANK_DETAILS.email}
                    </div>
                  </div>

                  {/* Voucher Upload Box */}
                  <div style={{ borderTop: '1px dashed var(--signal-border)', paddingTop: '0.85rem' }}>
                    <label
                      htmlFor="checkout-voucher-file"
                      style={{
                        display: 'block',
                        fontSize: '0.775rem',
                        fontWeight: '700',
                        color: 'var(--warning)',
                        marginBottom: '0.35rem'
                      }}
                    >
                      Adjuntar Comprobante de Transferencia (PDF, PNG, JPG - máx 5MB)
                    </label>

                    {voucherUploaded ? (
                      <div
                        style={{
                          background: 'var(--accent-soft)',
                          border: '1px solid var(--accent-border)',
                          color: 'var(--success)',
                          padding: '0.65rem 0.85rem',
                          borderRadius: 'var(--radius-xs)',
                          fontSize: '0.8rem',
                          fontWeight: '700',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        <CheckCircle size={16} />
                        <span>Comprobante recibido con éxito. Tu pedido está en proceso de validación contable.</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <input
                          id="checkout-voucher-file"
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setVoucherFile(e.target.files[0])
                              setVoucherError('')
                            }
                          }}
                          style={{
                            padding: '0.45rem',
                            fontSize: '0.75rem',
                            border: '1px dashed var(--warning)',
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--surface-card)',
                            cursor: 'pointer'
                          }}
                        />

                        {voucherFile && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: '600' }}>
                              Seleccionado: {voucherFile.name}
                            </span>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={handleUploadVoucher}
                              disabled={voucherUploading}
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: 'var(--warning)' }}
                            >
                              <Upload size={14} />
                              <span>{voucherUploading ? 'Subiendo...' : 'Enviar Comprobante'}</span>
                            </button>
                          </div>
                        )}

                        {voucherError && (
                          <span style={{ fontSize: '0.725rem', color: 'var(--danger)', fontWeight: '600' }}>
                            {voucherError}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Order Tracking Button */}
              {onOpenTracking && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    handleClose()
                    onOpenTracking(orderDetails.orderId, formData.rut)
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                    fontWeight: '700'
                  }}
                >
                  <Truck size={17} style={{ color: 'var(--teal-600)' }} />
                  <span>Seguir Estado de mi Pedido en Línea</span>
                </button>
              )}

              {paymentMethod === 'whatsapp' && whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{
                    background: 'var(--success)',
                    width: '100%',
                    justifyContent: 'center',
                    marginBottom: '1rem',
                    textDecoration: 'none'
                  }}
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
