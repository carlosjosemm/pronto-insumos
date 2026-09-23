import React, { useEffect } from 'react'
import { CheckCircle2, AlertCircle, Clock, X, MessageSquare, ArrowRight, RefreshCw } from 'lucide-react'
import { useScrollLock } from '../hooks/useScrollLock'

export interface PaymentReturnModalProps {
  isOpen: boolean
  status: 'approved' | 'failure' | 'pending' | null
  orderId?: string
  paymentId?: string
  onClose: () => void
  onRetryPayment?: () => void
}

export default function PaymentReturnModal({
  isOpen,
  status,
  orderId,
  paymentId,
  onClose,
  onRetryPayment
}: PaymentReturnModalProps) {
  // Freeze the page behind the modal
  useScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !status) return null

  const rawPhone = import.meta.env.VITE_WHATSAPP_NUMBER || '56912345678'
  const phone = rawPhone.replace(/[^0-9]/g, '')
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(
    `🏥 *COORDINACIÓN DE PEDIDO PAGADO - PRONTO INSUMOS*\n\nHola, acabo de pagar mi pedido *${orderId || 'PRONTO'}* vía Mercado Pago. Quisiera consultar los tiempos y condiciones de entrega para mi clínica.`
  )}`

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-return-title"
    >
      <div
        className="modal-card"
        style={{ maxWidth: '540px', textAlign: 'center', padding: '2rem 1.75rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar modal">
          <X size={18} />
        </button>

        {/* Status: APPROVED */}
        {status === 'approved' && (
          <div>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--teal-50)',
                color: 'var(--teal-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem'
              }}
            >
              <CheckCircle2 size={40} />
            </div>

            <h2
              id="payment-return-title"
              style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--navy-900)', marginBottom: '0.35rem' }}
            >
              ¡Pago Confirmado Exitosamente!
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Tu transacción ha sido acreditada vía Mercado Pago Chile / Webpay.
            </p>

            <div
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '1rem 1.25rem',
                textAlign: 'left',
                marginBottom: '1.25rem',
                fontSize: '0.825rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem'
              }}
            >
              {orderId && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Código de Pedido:</span>
                  <span style={{ fontWeight: '800', color: 'var(--navy-900)', fontFamily: 'monospace' }}>
                    {orderId}
                  </span>
                </div>
              )}
              {paymentId && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>ID Transacción MP:</span>
                  <span style={{ fontWeight: '600', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    {paymentId}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Estado:</span>
                <span style={{ fontWeight: '700', color: 'var(--teal-700)' }}>● Pago Acreditado (PAGADO)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Fulfillment:</span>
                <span style={{ fontWeight: '600', color: 'var(--ink-800)' }}>
                  Despacho desde Bodega Melipilla (Av. Ortúzar)
                </span>
              </div>
            </div>

            <div
              style={{
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-border)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.75rem',
                fontSize: '0.775rem',
                color: 'var(--teal-800)',
                textAlign: 'left',
                marginBottom: '1.5rem',
                lineHeight: '1.4'
              }}
            >
              📄 <strong>Comprobante:</strong> Tu Boleta Electrónica (IVA 19%) será emitida por nuestro equipo y
              remitida a tu correo electrónico registrado.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ background: 'var(--success)', justifyContent: 'center', textDecoration: 'none' }}
              >
                <MessageSquare size={17} />
                <span>Coordinar Despacho por WhatsApp</span>
                <ArrowRight size={17} />
              </a>
              <button type="button" className="btn-secondary" onClick={onClose} style={{ justifyContent: 'center' }}>
                Continuar en la Tienda
              </button>
            </div>
          </div>
        )}

        {/* Status: FAILURE */}
        {status === 'failure' && (
          <div>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--signal-soft)',
                color: 'var(--danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem'
              }}
            >
              <AlertCircle size={40} />
            </div>

            <h2
              id="payment-return-title"
              style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--navy-900)', marginBottom: '0.35rem' }}
            >
              Pago No Completado o Rechazado
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              La transacción en Mercado Pago no pudo procesarse o fue cancelada.
            </p>

            <div
              style={{
                background: 'var(--signal-soft)',
                border: '1px solid var(--signal-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '1rem',
                fontSize: '0.8rem',
                color: 'var(--warning)',
                textAlign: 'left',
                marginBottom: '1.5rem',
                lineHeight: '1.45'
              }}
            >
              ℹ️ <strong>Tus insumos continúan guardados:</strong> No se ha realizado ningún cobro a tu tarjeta. Puedes
              reintentar el pago con otro medio o seleccionar <strong>Transferencia Bancaria Directa</strong> a nuestra
              cuenta de Banco de Chile.
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Cerrar
              </button>
              {onRetryPayment && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onRetryPayment}
                  style={{ flex: 2, justifyContent: 'center' }}
                >
                  <RefreshCw size={16} />
                  <span>Reintentar / Opciones de Pago</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Status: PENDING */}
        {status === 'pending' && (
          <div>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem'
              }}
            >
              <Clock size={40} />
            </div>

            <h2
              id="payment-return-title"
              style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--navy-900)', marginBottom: '0.35rem' }}
            >
              Pago en Proceso de Validación
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Mercado Pago está validando la transacción con tu entidad bancaria.
            </p>

            {orderId && (
              <div
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem 1rem',
                  fontSize: '0.825rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>Código de Pedido:</span>
                <span style={{ fontWeight: '800', color: 'var(--navy-900)', fontFamily: 'monospace' }}>{orderId}</span>
              </div>
            )}

            <p
              style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.45', marginBottom: '1.5rem' }}
            >
              Tan pronto como el banco confirme la recepción de los fondos, tu pedido será aprobado y despachado desde
              nuestra bodega en Melipilla. Recibirás una notificación por correo electrónico.
            </p>

            <button
              type="button"
              className="btn-primary"
              onClick={onClose}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Entendido, Volver a la Tienda
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
