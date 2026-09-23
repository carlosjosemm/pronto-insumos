import React, { useState, useEffect } from 'react'
import {
  X,
  Search,
  Truck,
  CheckCircle2,
  Clock,
  Upload,
  AlertCircle,
  MessageSquare,
  ExternalLink,
  Building2
} from 'lucide-react'
import { fetchOrderTracking } from '../services/orderTracking'
import { uploadTransferVoucher, validateVoucherFile } from '../services/transferVoucher'
import { OrderTrackingInfo } from '../types'
import { formatCLP } from '../utils/currency'
import { formatRut, validateRut } from '../utils/rut'
import { BANK_DETAILS } from '../config/bankDetails'
import { whatsappLink } from '../config/contact'
import { useScrollLock } from '../hooks/useScrollLock'
import { useFocusTrap } from '../hooks/useFocusTrap'

export interface OrderTrackingModalProps {
  isOpen: boolean
  onClose: () => void
  initialOrderId?: string
  initialRut?: string
}

export default function OrderTrackingModal({
  isOpen,
  onClose,
  initialOrderId = '',
  initialRut = ''
}: OrderTrackingModalProps) {
  const [orderId, setOrderId] = useState<string>(initialOrderId)
  const [rut, setRut] = useState<string>(initialRut)
  const [rutError, setRutError] = useState<string>('')
  // When the caller pre-fills valid credentials the modal auto-searches on
  // mount, so the spinner is already on for the first paint.
  const autoSearchOnMount = Boolean(initialOrderId && initialRut && validateRut(initialRut))
  const [loading, setLoading] = useState<boolean>(autoSearchOnMount)
  const [error, setError] = useState<string>('')
  const [trackingData, setTrackingData] = useState<OrderTrackingInfo | null>(null)

  // Voucher upload state in tracking view
  const [voucherFile, setVoucherFile] = useState<File | null>(null)
  const [voucherUploading, setVoucherUploading] = useState<boolean>(false)
  const [voucherSuccess, setVoucherSuccess] = useState<string>('')
  const [voucherError, setVoucherError] = useState<string>('')

  // Freeze the page behind the modal
  useScrollLock(isOpen)
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen)

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleRutChange = (val: string) => {
    const formatted = formatRut(val)
    setRut(formatted)
    if (rutError && validateRut(formatted)) {
      setRutError('')
    }
  }

  const performSearch = async (targetOrderId: string, targetRut: string) => {
    setError('')
    setTrackingData(null)
    setVoucherSuccess('')
    setVoucherError('')

    const cleanId = targetOrderId.trim().toUpperCase()
    if (!cleanId) {
      setError('Por favor ingresa el N° de Pedido.')
      return
    }

    if (!validateRut(targetRut)) {
      setRutError('Por favor ingresa un RUT válido con dígito verificador.')
      return
    }

    setLoading(true)
    const result = await fetchOrderTracking({ orderId: cleanId, rut: targetRut })
    setLoading(false)

    if (result?.success && result?.data) {
      setTrackingData(result.data)
    } else {
      setError(result?.error || 'No se encontró el pedido o los datos son incorrectos.')
    }
  }

  // Auto-search when the modal is opened with prefilled credentials. The form
  // state is initialized from the initial* props at mount (the caller mounts
  // this component only while open), and every state update here happens after
  // the awaited request, so no render is cascaded from the effect body.
  useEffect(() => {
    if (!autoSearchOnMount) return
    let cancelled = false

    const run = async () => {
      const result = await fetchOrderTracking({ orderId: initialOrderId.trim().toUpperCase(), rut: initialRut })
      if (cancelled) return
      setLoading(false)
      if (result?.success && result?.data) {
        setTrackingData(result.data)
      } else {
        setError(result?.error || 'No se encontró el pedido o los datos son incorrectos.')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [autoSearchOnMount, initialOrderId, initialRut])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    performSearch(orderId, rut)
  }

  const handleUploadVoucher = async () => {
    if (!voucherFile || !trackingData) return

    const validation = validateVoucherFile(voucherFile)
    if (!validation.isValid) {
      setVoucherError(validation.error || 'Archivo inválido.')
      return
    }

    setVoucherUploading(true)
    setVoucherError('')
    setVoucherSuccess('')

    const res = await uploadTransferVoucher({
      orderId: trackingData.orderId,
      customerRut: rut,
      file: voucherFile
    })

    setVoucherUploading(false)
    if (res.success) {
      setVoucherSuccess(res.message || 'Comprobante recibido exitosamente.')
      setVoucherFile(null)
      // Refresh tracking info
      performSearch(trackingData.orderId, rut)
    } else {
      setVoucherError(res.error || 'Error al subir el comprobante.')
    }
  }

  const getWhatsAppSupportUrl = () => {
    const cleanId = trackingData?.orderId || orderId || 'CONSULTA'
    const msg = `Hola PRONTO Insumos, necesito asistencia con el estado de mi pedido ${cleanId}.`
    return whatsappLink(msg)
  }

  const STEPS = [
    { num: 1, label: 'Registrado' },
    { num: 2, label: 'Pago / Validación' },
    { num: 3, label: 'Preparación' },
    { num: 4, label: 'En Ruta' },
    { num: 5, label: 'Entregado' }
  ]

  return (
    <div ref={dialogRef} className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card"
        style={{ maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar seguimiento de pedido">
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Truck size={22} style={{ color: 'var(--ink-800)' }} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--ink-800)', margin: 0 }}>
              Seguimiento de Pedido en Línea
            </h2>
          </div>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Consulta el estado de preparación, despacho y emisión tributaria de tus insumos odontológicos.
          </p>
        </div>

        {/* Scrollable Content Body */}
        <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1 }}>
          {/* Lookup Form */}
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.5rem' }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr auto',
                gap: '0.75rem',
                alignItems: 'flex-start'
              }}
            >
              <div>
                <label
                  htmlFor="tracking-order-id"
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: 'var(--ink-800)',
                    marginBottom: '0.25rem'
                  }}
                >
                  N° de Pedido *
                </label>
                <input
                  id="tracking-order-id"
                  type="text"
                  required
                  placeholder="Ej: PRONTO-738291"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    textTransform: 'uppercase',
                    fontWeight: '600'
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="tracking-rut"
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: 'var(--ink-800)',
                    marginBottom: '0.25rem'
                  }}
                >
                  RUT del Comprador / Clínica *
                </label>
                <input
                  id="tracking-rut"
                  type="text"
                  required
                  placeholder="12.345.678-5"
                  value={rut}
                  onChange={(e) => handleRutChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: `1px solid ${rutError ? 'var(--danger)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: '600'
                  }}
                />
                {rutError && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--danger)', display: 'block', marginTop: '0.2rem' }}>
                    {rutError}
                  </span>
                )}
              </div>

              <div style={{ alignSelf: 'flex-end' }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                  style={{ padding: '0.55rem 1rem', height: '38px', justifyContent: 'center' }}
                >
                  <Search size={16} />
                  <span>{loading ? 'Buscando...' : 'Consultar'}</span>
                </button>
              </div>
            </div>
          </form>

          {/* Error Banner */}
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'var(--signal-soft)',
                border: '1px solid var(--signal-border)',
                color: 'var(--danger)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.825rem',
                marginBottom: '1.25rem'
              }}
            >
              <AlertCircle size={17} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--ink-700)' }}>
              <Clock size={32} style={{ margin: '0 auto 0.5rem', animation: 'spin 2s linear infinite' }} />
              <p style={{ fontSize: '0.85rem', fontWeight: '600' }}>Consultando estado en sistema PRONTO...</p>
            </div>
          )}

          {/* Order Found View */}
          {trackingData && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Status Header Badge Card */}
              <div
                style={{
                  background: 'var(--accent-soft)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem 1.25rem'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        color: 'var(--ink-900)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}
                    >
                      Estado Actual del Pedido
                    </span>
                    <h3
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: '800',
                        color: 'var(--ink-800)',
                        margin: '0.2rem 0 0.35rem'
                      }}
                    >
                      {trackingData.fulfillment.statusTitle}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0 }}>
                      {trackingData.fulfillment.statusDescription}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>N° de Pedido</span>
                    <div
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: '800',
                        fontFamily: 'monospace',
                        color: 'var(--ink-800)'
                      }}
                    >
                      {trackingData.orderId}
                    </div>
                  </div>
                </div>
              </div>

              {/* 5-Step Visual Stepper */}
              <div
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1.25rem 1rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                  {/* Connecting background bar */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '14px',
                      left: '20px',
                      right: '20px',
                      height: '3px',
                      background: 'var(--border-subtle)',
                      zIndex: 0
                    }}
                  />

                  {/* Active fill bar */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '14px',
                      left: '20px',
                      width: `${((trackingData.fulfillment.currentStep - 1) / (STEPS.length - 1)) * 100}%`,
                      height: '3px',
                      background: 'var(--ink-800)',
                      transition: 'width 0.4s ease',
                      zIndex: 0
                    }}
                  />

                  {STEPS.map((s) => {
                    const isCompleted = trackingData.fulfillment.currentStep > s.num
                    const isCurrent = trackingData.fulfillment.currentStep === s.num

                    return (
                      <div
                        key={s.num}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          zIndex: 1,
                          minWidth: '55px'
                        }}
                      >
                        <div
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            background: isCompleted || isCurrent ? 'var(--ink-800)' : 'var(--surface-card)',
                            border: `2px solid ${isCompleted || isCurrent ? 'var(--ink-800)' : 'var(--border-subtle)'}`,
                            color: isCompleted || isCurrent ? 'var(--text-inverse)' : 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                            fontWeight: '800'
                          }}
                        >
                          {isCompleted ? <CheckCircle2 size={16} /> : s.num}
                        </div>
                        <span
                          style={{
                            fontSize: '0.675rem',
                            fontWeight: isCurrent ? '800' : '600',
                            color: isCurrent ? 'var(--ink-800)' : 'var(--text-secondary)',
                            marginTop: '0.4rem',
                            textAlign: 'center'
                          }}
                        >
                          {s.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Bank Transfer Voucher Upload Section if Pending */}
              {trackingData.status === 'PENDIENTE_TRANSFERENCIA' && (
                <div
                  style={{
                    background: 'var(--signal-soft)',
                    border: '1.5px solid var(--signal-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1.15rem'
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
                    <span>Pendiente de Comprobante de Transferencia Bancaria</span>
                  </div>

                  <p
                    style={{ margin: '0 0 0.75rem', fontSize: '0.775rem', color: 'var(--warning)', lineHeight: '1.4' }}
                  >
                    Para procesar el despacho de tu pedido, realiza la transferencia a nuestra cuenta de{' '}
                    <strong>{BANK_DETAILS.bankName}</strong> ({BANK_DETAILS.accountType} N° {BANK_DETAILS.accountNumber}
                    , RUT {BANK_DETAILS.rut}) y adjunta aquí tu comprobante.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <input
                      id="tracking-voucher-file"
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
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-card)',
                        cursor: 'pointer'
                      }}
                    />

                    {voucherFile && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.5rem'
                        }}
                      >
                        <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: '600' }}>
                          Archivo: {voucherFile.name} ({(voucherFile.size / 1024).toFixed(0)} KB)
                        </span>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleUploadVoucher}
                          disabled={voucherUploading}
                          style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem', background: 'var(--warning)' }}
                        >
                          <Upload size={14} />
                          <span>{voucherUploading ? 'Subiendo...' : 'Enviar Comprobante'}</span>
                        </button>
                      </div>
                    )}

                    {voucherSuccess && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: '700' }}>
                        ✓ {voucherSuccess}
                      </span>
                    )}

                    {voucherError && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: '600' }}>
                        {voucherError}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Order Info Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', fontSize: '0.8rem' }}>
                <div
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.85rem'
                  }}
                >
                  <div style={{ fontWeight: '700', color: 'var(--ink-800)', marginBottom: '0.35rem' }}>
                    Datos de Entrega
                  </div>
                  <div>
                    <strong>Destinatario:</strong> {trackingData.customer.fullName}
                  </div>
                  <div>
                    <strong>Dirección:</strong> {trackingData.customer.address}, {trackingData.customer.city}
                  </div>
                  <div>
                    <strong>Documento:</strong>{' '}
                    {trackingData.customer.documentType === 'factura'
                      ? `Factura (${trackingData.customer.razonSocial || 'Clínica'})`
                      : 'Boleta'}
                  </div>
                </div>

                <div
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.85rem'
                  }}
                >
                  <div style={{ fontWeight: '700', color: 'var(--ink-800)', marginBottom: '0.35rem' }}>
                    Logística & Despacho
                  </div>
                  <div>
                    <strong>Courier / Medio:</strong> {trackingData.fulfillment.courier}
                  </div>
                  <div>
                    <strong>Método de Pago:</strong> {trackingData.paymentMethod.toUpperCase()}
                  </div>
                  <div>
                    <strong>Total a Pagar:</strong> {formatCLP(trackingData.totalAmount)}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem'
                }}
              >
                <div style={{ fontWeight: '700', fontSize: '0.8rem', color: 'var(--ink-800)', marginBottom: '0.5rem' }}>
                  Insumos Incluidos
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {trackingData.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.775rem',
                        borderBottom: idx < trackingData.items.length - 1 ? '1px dashed var(--border-subtle)' : 'none',
                        paddingBottom: '0.25rem'
                      }}
                    >
                      <span>
                        <strong>{item.quantity}x</strong> {item.name}
                      </span>
                      <span style={{ fontWeight: '600' }}>{formatCLP(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* WhatsApp Support Action */}
              <a
                href={getWhatsAppSupportUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{
                  justifyContent: 'center',
                  gap: '0.5rem',
                  textDecoration: 'none',
                  color: 'var(--success)',
                  borderColor: 'var(--accent-border)',
                  background: 'var(--accent-soft)'
                }}
              >
                <MessageSquare size={17} />
                <span>Consultar por WhatsApp con Mesa de Ayuda Melipilla</span>
                <ExternalLink size={14} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
