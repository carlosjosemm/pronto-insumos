import React, { useState, useEffect } from 'react'
import { X, CheckCircle2, Truck, Package, FileText, Building2, Phone, Mail, User, ShieldAlert, ExternalLink, History, Clock } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { formatCLP } from '../../utils/currency'
import { formatRut } from '../../utils/rut'
import {
  approveBankTransfer,
  cancelAdminOrder,
  dispatchAdminOrder,
  markOrderDelivered,
  fetchOrderHistory,
  recordOrderIncident,
  resolvePaymentReview,
  resolveQuote,
  resendOrderEmail
} from '../services/adminApi'
import { CARRIER_LABELS, INCIDENT_KIND_LABELS, type CarrierType, type OrderIncidentKind } from '../types'
import type { EmailDeliveryEntry, Order, OrderStatusHistory } from '../../types'
import { EMAIL_CLAIM_TTL_MS, isSettledOrderStatus } from '../../utils/orderLifecycle'
import { classifyVoucherUrl, normalizeAllowedVoucherMime, type VoucherLinkKind } from '../../utils/voucherUrl'

interface OrderDetailPanelProps {
  order: Order | null
  onClose: () => void
  onOrderUpdated: () => void
}

export const OrderDetailPanel: React.FC<OrderDetailPanelProps> = ({
  order,
  onClose,
  onOrderUpdated
}) => {
  const [carrier, setCarrier] = useState<CarrierType>('despacho_local_melipilla')
  const [trackingCode, setTrackingCode] = useState('')
  const [transferReference, setTransferReference] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [quoteReference, setQuoteReference] = useState('')
  const [quoteNotes, setQuoteNotes] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [incidentKind, setIncidentKind] = useState<OrderIncidentKind>('REEMBOLSO')
  const [incidentNote, setIncidentNote] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [history, setHistory] = useState<OrderStatusHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  useEffect(() => {
    if (!order?.orderId) return
    let isMounted = true
    setHistoryLoading(true)
    fetchOrderHistory(order.orderId).then(events => {
      if (isMounted) {
        setHistory(events)
        setHistoryLoading(false)
      }
    })
    return () => {
      isMounted = false
    }
  }, [order?.orderId, order?.status, order?.updatedAt, historyRefreshKey])

  if (!order) return null

  // The stored voucher URL decides how (or whether) it can be opened:
  // 'storage' → direct link, 'legacy-data' → Blob conversion behind a MIME gate,
  // 'unsafe' → plain text, no anchor, no click handler.
  const voucherUrl = order.voucherUrl
  const voucherKind: VoucherLinkKind = classifyVoucherUrl(voucherUrl)

  const handleApproveTransfer = async () => {
    const reference = transferReference.trim()
    if (!reference) {
      setActionError('Verifica el abono en la cartola de Banco de Chile y registra la referencia antes de aprobar.')
      return
    }
    setActionLoading(true)
    setActionError('')
    setActionSuccess('')
    const res = await approveBankTransfer(order.orderId, reference)
    setActionLoading(false)
    if (res.success) {
      setActionSuccess('¡Transferencia bancaria aprobada exitosamente y stock rebajado en bodega!')
      setTransferReference('')
      setHistoryRefreshKey(k => k + 1)
      onOrderUpdated()
    } else {
      setActionError(res.error || 'Error al aprobar la transferencia')
    }
  }

  const handleResolvePaymentReview = async (resolution: 'approve' | 'cancel') => {
    setActionLoading(true)
    setActionError('')
    setActionSuccess('')
    const res = await resolvePaymentReview(order.orderId, resolution, reviewNotes.trim() || undefined)
    setActionLoading(false)
    if (res.success) {
      setActionSuccess(
        resolution === 'approve'
          ? '¡Pago conciliado y confirmado! Stock rebajado en bodega y cliente notificado.'
          : 'Pedido cancelado tras la conciliación. No se rebajó stock — gestiona el reembolso manualmente.'
      )
      setReviewNotes('')
      setHistoryRefreshKey(k => k + 1)
      onOrderUpdated()
    } else {
      setActionError(res.error || 'Error al conciliar el pago en revisión')
    }
  }

  const handleResolveQuote = async (resolution: 'convert' | 'decline') => {
    if (resolution === 'convert' && quoteReference.trim().length === 0) {
      setActionError('Verifica la venta fuera de la plataforma y registra la referencia antes de confirmar.')
      return
    }
    setActionLoading(true)
    setActionError('')
    setActionSuccess('')
    const res = await resolveQuote(
      order.orderId,
      resolution,
      resolution === 'convert' ? quoteReference.trim() || undefined : undefined,
      resolution === 'decline' ? quoteNotes.trim() || undefined : undefined
    )
    setActionLoading(false)
    if (res.success) {
      setActionSuccess(
        res.duplicate
          ? 'La cotización ya estaba cerrada; no se realizó ningún cambio adicional.'
          : resolution === 'convert'
            ? '¡Cotización convertida en venta verificada! Stock rebajado en bodega y cliente notificado.'
            : 'Cotización cerrada sin venta. No se rebajó stock.'
      )
      setQuoteReference('')
      setQuoteNotes('')
      setHistoryRefreshKey(k => k + 1)
      onOrderUpdated()
    } else {
      setActionError(res.error || 'Error al cerrar la cotización')
    }
  }

  /**
   * Cancels a never-settled order. The server re-asserts the eligible statuses, so
   * this only needs the operator's reason (the required evidence).
   */
  const handleCancelOrder = async () => {
    const reason = cancelReason.trim()
    if (!reason) {
      setActionError('Registra el motivo de la cancelación antes de continuar.')
      return
    }
    setActionLoading(true)
    setActionError('')
    setActionSuccess('')
    const res = await cancelAdminOrder(order.orderId, reason)
    setActionLoading(false)
    if (res.success) {
      setActionSuccess(
        res.duplicate
          ? 'El pedido ya estaba cancelado; no se realizó ningún cambio adicional.'
          : '¡Pedido cancelado! No se movió stock; la bodega fue notificada.'
      )
      setCancelReason('')
      setHistoryRefreshKey(k => k + 1)
      onOrderUpdated()
    } else {
      setActionError(res.error || 'Error al cancelar el pedido')
    }
  }

  /**
   * Records a manual incident (refund, return, chargeback) as a same-status history
   * entry. No status change and no stock movement — the audit trail only.
   */
  const handleRecordIncident = async () => {
    const note = incidentNote.trim()
    if (!note) {
      setActionError('Registra la evidencia de la incidencia antes de continuar.')
      return
    }
    setActionLoading(true)
    setActionError('')
    setActionSuccess('')
    const res = await recordOrderIncident(order.orderId, incidentKind, note)
    setActionLoading(false)
    if (res.success) {
      setActionSuccess(
        'Incidencia registrada en el historial del pedido. No se modificó el estado ni el stock.'
      )
      setIncidentNote('')
      setHistoryRefreshKey(k => k + 1)
      onOrderUpdated()
    } else {
      setActionError(res.error || 'Error al registrar la incidencia')
    }
  }

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionLoading(true)
    setActionError('')
    setActionSuccess('')
    const res = await dispatchAdminOrder({
      orderId: order.orderId,
      carrier,
      trackingCode: trackingCode.trim() || undefined
    })
    setActionLoading(false)
    if (res.success) {
      const referenceLabel = res.referenceSource === 'manual' ? 'N° Guía' : 'Ref. Despacho'
      setActionSuccess(
        res.dispatchReference
          ? `¡Pedido marcado como despachado! ${referenceLabel}: ${res.dispatchReference}`
          : '¡Pedido marcado como despachado con courier asignado!'
      )
      setHistoryRefreshKey(k => k + 1)
      onOrderUpdated()
    } else {
      setActionError(res.error || 'Error al despachar el pedido')
    }
  }

  /**
   * Operator-triggered resend of a customer-facing transactional notice. The
   * server claims the send inside a transaction, refuses the `payment` kind
   * for unpaid orders, and caps resends per kind — a Resend failure surfaces
   * here as `actionError` and is stamped on the order for visibility.
   */
  const handleResendEmail = async (kind: 'confirmation' | 'payment') => {
    setActionLoading(true)
    setActionError('')
    setActionSuccess('')
    const res = await resendOrderEmail(order.orderId, kind)
    setActionLoading(false)
    if (res.success) {
      setActionSuccess(
        kind === 'confirmation'
          ? '¡Correo de confirmación de pedido reenviado al cliente!'
          : '¡Correo de confirmación de pago reenviado al cliente!'
      )
      setHistoryRefreshKey(k => k + 1)
      onOrderUpdated()
    } else {
      setActionError(res.error || 'Error al reenviar el correo')
    }
  }

  const handleMarkDelivered = async () => {
    setActionLoading(true)
    setActionError('')
    setActionSuccess('')
    const res = await markOrderDelivered(order.orderId)
    setActionLoading(false)
    if (res.success) {
      setActionSuccess('¡Pedido marcado como entregado en la clínica dental!')
      setHistoryRefreshKey(k => k + 1)
      onOrderUpdated()
    } else {
      setActionError(res.error || 'Error al marcar como entregado')
    }
  }

  /**
   * Legacy vouchers were stored as Base64 `data:` URLs, which Chrome
   * refuses to open through top-frame navigation. Convert those to a Blob URL on
   * click, but ALWAYS re-wrap the bytes with the allowlisted type: a
   * `blob:` URL inherits this origin, so an un-typed (or HTML-typed) Blob would
   * become script running in the ADMIN origin. The `blob.type` check below is
   * belt-and-braces — for a `data:` URL the fetched type IS the declared one, which
   * `classifyVoucherUrl` already gated. Storage URLs are linked directly and never
   * reach this handler.
   */
  const handleOpenVoucher = async (voucherUrl: string) => {
    if (classifyVoucherUrl(voucherUrl) !== 'legacy-data') return
    try {
      const blob = await (await fetch(voucherUrl)).blob()
      const forcedType = normalizeAllowedVoucherMime(blob.type)
      if (!forcedType) {
        setActionError('El comprobante almacenado no es un PDF ni una imagen, así que no se abrió.')
        return
      }
      const objectUrl = URL.createObjectURL(new Blob([blob], { type: forcedType }))
      window.open(objectUrl, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch {
      setActionError('No fue posible abrir el comprobante almacenado en formato antiguo.')
    }
  }

  const isPendingTransfer =
    order.status === 'PENDIENTE_TRANSFERENCIA' ||
    order.status === 'TRANSFERENCIA_COMPROBANTE_SUBIDO'

  const isReadyToDispatch =
    order.status === 'PAGADO_MERCADOPAGO' ||
    order.status === 'TRANSFERENCIA_APROBADA' ||
    order.status === 'PAGADO_TRANSFERENCIA' ||
    order.status === 'EN_PREPARACION'

  const isDispatched = order.status === 'DESPACHADO'

  // The Mercado Pago webhook flags a mismatch here instead of marking the order
  // paid — a human must reconcile before anything is dispatched.
  const isInPaymentReview = order.status === 'PAGO_EN_REVISION'

  // A WhatsApp quote is a lead, not a paid sale: it leaves the quote state only
  // through the operator's resolution (verified sale or declined/timeout close).
  const isQuote = order.status === 'COTIZACION_SOLICITADA_WHATSAPP'

  // Cancellation is offered only for orders that were never settled and never
  // shipped; the server re-asserts exactly this set. Paid/approved/dispatched/
  // delivered orders are handled through the incident note + manual refund runbook.
  const isCancelable =
    order.status === 'PENDIENTE_PAGO_MERCADOPAGO' ||
    order.status === 'PENDIENTE_PAGO' ||
    order.status === 'PENDIENTE_TRANSFERENCIA' ||
    order.status === 'TRANSFERENCIA_COMPROBANTE_SUBIDO'

  // The real reason the order was parked lives in its history event: a duplicate
  // payment, an invalid source state or a refund/chargeback all land in
  // PAGO_EN_REVISION, not just an amount mismatch.
  const reviewIncidentEvent = [...history].reverse().find(ev => ev.newStatus === 'PAGO_EN_REVISION')
  const reviewIncidentLabel = (() => {
    switch (reviewIncidentEvent?.metadata?.event) {
      case 'PAGO_DUPLICADO':
        return 'Posible doble cobro detectado'
      case 'PAGO_ESTADO_INVALIDO':
        return 'El pedido no admitía pago automático'
      case 'PAGO_ACREDITADO_TARDIO':
        return 'El pago se acreditó después de que el pedido dejara de estar pendiente'
      case 'PAGO_REEMBOLSADO':
        return 'Pago reembolsado o contracargado'
      case 'PAGO_EN_REVISION':
        return 'Monto pagado no coincide con el total verificado'
      default:
        return 'Revisión manual de pago'
    }
  })()

  // Transactional-mail telemetry (server-written `emailDelivery` map). The
  // confirmation kind also honors the legacy `confirmationEmailSentAt` marker;
  // a `claimedAt` younger than the server claim TTL means a send is still in
  // flight. The paid-status set and the TTL are the same constants the server
  // enforces — the server stays authoritative either way.
  const isPaidOrder = isSettledOrderStatus(order.status)
  const emailEntry = (kind: 'confirmation' | 'payment'): EmailDeliveryEntry | undefined =>
    order.emailDelivery?.[kind]
  const emailSentAt = (kind: 'confirmation' | 'payment'): string | undefined =>
    emailEntry(kind)?.sentAt ||
    (kind === 'confirmation' ? order.confirmationEmailSentAt : undefined)
  const emailInFlight = (entry?: EmailDeliveryEntry): boolean => {
    const claimedAt = entry?.claimedAt ? Date.parse(entry.claimedAt) : NaN
    return Number.isFinite(claimedAt) && Date.now() - claimedAt < EMAIL_CLAIM_TTL_MS
  }
  const emailFailureLabel = (reason?: string): string => {
    if (!reason) return 'envío fallido'
    if (reason.startsWith('http_')) return `proveedor rechazó (${reason.replace('_', ' ')})`
    return (
      {
        missing_api_key: 'Resend API key no configurada',
        missing_recipient: 'sin destinatario',
        missing_customer_email: 'el pedido no tiene correo',
        network_error: 'error de red o del proveedor',
        send_failed: 'envío fallido'
      }[reason] || reason
    )
  }

  // The dispatch record: carrier + reference (the typed courier guía,
  // or the internal route code minted by the dispatch handler).
  const hasDispatchRecord = Boolean(order.dispatch || order.trackingNumber)
  const dispatchCarrierLabel = order.dispatch?.carrier
    ? (CARRIER_LABELS as Record<string, string>)[order.dispatch.carrier] || order.dispatch.carrier
    : order.courier || 'No especificado'
  const dispatchReference = order.dispatch?.reference || order.trackingNumber || ''
  const dispatchReferenceLabel = order.dispatch?.referenceSource === 'generated' ? 'Ref. Despacho' : 'N° Guía'

  /**
   * Label for a manual incident in the audit timeline. Without it a refund, a
   * return, a chargeback and a cancellation note all render as the same repeated
   * status plus free text — the kind is stored precisely so it can be told apart.
   */
  const incidentKindLabel = (ev: OrderStatusHistory): string | null => {
    if (ev.metadata?.event !== 'INCIDENTE_MANUAL') return null
    const kind = ev.metadata?.incidentKind
    if (typeof kind !== 'string') return null
    return INCIDENT_KIND_LABELS[kind as OrderIncidentKind] || kind
  }

  return (
    <div className="admin-slide-overlay" onClick={onClose}>
      <div className="admin-slide-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="admin-slide-header">
          <div>
            <span className="admin-code" style={{ fontSize: '1rem' }}>{order.orderId}</span>
            <div style={{ marginTop: '0.35rem' }}>
              <StatusBadge status={order.status} />
            </div>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            style={{ padding: '0.4rem' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="admin-slide-body">
          {actionSuccess && (
            <div style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid #a7f3d0', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: '600' }}>
              {actionSuccess}
            </div>
          )}

          {actionError && (
            <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid #fecaca', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: '600' }}>
              {actionError}
            </div>
          )}

          {/* Customer and Contact Details */}
          <div style={{ background: 'var(--surface-muted)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ fontWeight: '800', fontSize: '0.85rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <User size={16} style={{ color: 'var(--teal-600)' }} />
              <span>Datos del Solicitante / Profesional</span>
            </div>

            <div style={{ fontSize: '0.825rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div><strong>Nombre:</strong> {order.customer?.fullName}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Mail size={14} style={{ color: 'var(--text-muted)' }} />
                <span><strong>Email SII:</strong> {order.customer?.email}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Phone size={14} style={{ color: 'var(--text-muted)' }} />
                <span><strong>Teléfono Móvil:</strong> {order.customer?.phone}</span>
              </div>
              <div><strong>RUT / RUN:</strong> {formatRut(order.customer?.rut || '')}</div>
              <div><strong>Documento Solicitado:</strong> {order.customer?.documentType === 'factura' ? '🏢 Factura Electrónica' : '📄 Boleta Electrónica'}</div>
            </div>
          </div>

          {/* Factura Electrónica Block */}
          {order.customer?.documentType === 'factura' && (
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontWeight: '800', fontSize: '0.85rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Building2 size={16} style={{ color: 'var(--teal-600)' }} />
                <span>Datos Tributarios de Facturación (SII)</span>
              </div>
              <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div><strong>Razón Social:</strong> {order.customer?.razonSocial || 'No especificado'}</div>
                <div><strong>RUT Empresa:</strong> {formatRut(order.customer?.rut || '')}</div>
                <div><strong>Giro Comercial:</strong> {order.customer?.giroComercial || 'No especificado'}</div>
                <div><strong>Dirección Fiscal:</strong> {order.customer?.address}, {order.customer?.city}</div>
              </div>
            </div>
          )}

          {/* Sanitary Verification (ISP / SIS) */}
          {(order.sanitaryVerification || order.customer?.sanitaryVerification) && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: '#92400e' }}>
              <div style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                <ShieldAlert size={16} style={{ color: '#d97706' }} />
                <span>Validación Sanitaria ISP / SIS</span>
              </div>
              <div><strong>N° Registro SIS:</strong> {(order.sanitaryVerification || order.customer?.sanitaryVerification)?.sisRegistryNumber}</div>
              {(order.sanitaryVerification || order.customer?.sanitaryVerification)?.credentialFileName && (
                <div><strong>Documento Adjunto:</strong> {(order.sanitaryVerification || order.customer?.sanitaryVerification)?.credentialFileName}</div>
              )}
            </div>
          )}

          {/* Delivery Destination */}
          <div style={{ fontSize: '0.825rem' }}>
            <strong>Dirección de Despacho:</strong>
            <div style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              {order.customer?.address}, {order.customer?.city} (CP {order.customer?.zip || '9500000'})
            </div>
          </div>

          {/* Dispatch record */}
          {hasDispatchRecord && (
            <div style={{ background: 'var(--surface-muted)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <div style={{ fontWeight: '800', fontSize: '0.85rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Truck size={16} style={{ color: 'var(--teal-600)' }} />
                <span>Despacho Registrado</span>
              </div>
              <div>
                <strong>Courier:</strong> {dispatchCarrierLabel}
              </div>
              {dispatchReference && (
                <div>
                  <strong>{dispatchReferenceLabel}:</strong> {dispatchReference}
                  {order.dispatch?.referenceSource === 'generated' && (
                    <span style={{ color: 'var(--text-muted)' }}> (código interno)</span>
                  )}
                </div>
              )}
              {order.dispatch?.dispatchedAt && (
                <div>
                  <strong>Despachado el:</strong> {new Date(order.dispatch.dispatchedAt).toLocaleString('es-CL')}
                </div>
              )}
            </div>
          )}

          {/* Itemized Products Table */}
          <div>
            <div style={{ fontWeight: '700', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--navy-900)' }}>
              Insumos Solicitados ({order.items?.length || 0})
            </div>
            <table className="admin-data-table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Cant.</th>
                  <th>Unit. CLP</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <div style={{ fontWeight: '600' }}>{item.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {item.productId}
                      </div>
                    </td>
                    <td style={{ fontWeight: '700', textAlign: 'center' }}>{item.quantity}</td>
                    <td>{formatCLP(item.price)}</td>
                    <td style={{ fontWeight: '700' }}>{formatCLP(item.price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem', fontSize: '0.95rem', fontWeight: '800', color: 'var(--navy-900)' }}>
              <span>Total Pedido: {formatCLP(order.totalAmount)}</span>
            </div>
          </div>

          {/* Transfer Voucher Section (only allowlisted URLs are openable) */}
          {(voucherUrl || order.hasVoucher) && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-sm)', padding: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.825rem', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <FileText size={16} />
                  <span>Comprobante de Transferencia Adjunto</span>
                </div>
                {order.voucherUploadedAt && (
                  <div style={{ fontSize: '0.725rem', color: '#3b82f6', marginTop: '0.2rem' }}>
                    Subido el {new Date(order.voucherUploadedAt).toLocaleString('es-CL')}
                  </div>
                )}
              </div>

              {voucherUrl && voucherKind === 'storage' && (
                <a
                  href={voucherUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-btn admin-btn-secondary"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                >
                  <span>Ver Comprobante</span>
                  <ExternalLink size={13} />
                </a>
              )}

              {voucherUrl && voucherKind === 'legacy-data' && (
                <button
                  type="button"
                  onClick={() => handleOpenVoucher(voucherUrl)}
                  className="admin-btn admin-btn-secondary"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                >
                  <span>Ver Comprobante</span>
                  <ExternalLink size={13} />
                </button>
              )}

              {voucherUrl && voucherKind === 'unsafe' && (
                <span style={{ fontSize: '0.725rem', fontWeight: '700', color: 'var(--danger)', textAlign: 'right' }}>
                  Enlace no verificable — revisa el documento en Firestore
                </span>
              )}

              {/* The order list reports `hasVoucher` but omits the URL; if the detail
                  fetch did not supply it, say so instead of silently hiding a voucher. */}
              {!voucherUrl && order.hasVoucher && (
                <span style={{ fontSize: '0.725rem', fontWeight: '700', color: 'var(--text-muted)', textAlign: 'right' }}>
                  No se pudo cargar el enlace del comprobante. Reintenta o revisa Firestore.
                </span>
              )}
            </div>
          )}

          {/* Transactional customer emails: delivery state + manual resend */}
          <div style={{ background: 'var(--surface-muted)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <div style={{ fontWeight: '800', fontSize: '0.825rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Mail size={16} style={{ color: 'var(--teal-600)' }} />
              <span>Correos al Cliente</span>
            </div>

            {(['confirmation', 'payment'] as const).map(kind => {
              const entry = emailEntry(kind)
              const sentAt = emailSentAt(kind)
              const inFlight = emailInFlight(entry)
              const label = kind === 'confirmation' ? 'Confirmación de pedido' : 'Confirmación de pago'
              const resendLabel = kind === 'confirmation' ? 'Reenviar confirmación' : 'Reenviar correo de pago'
              const resendable = kind === 'confirmation' || isPaidOrder
              return (
                <div key={kind} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.775rem' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: 'var(--navy-900)' }}>{label}</div>
                    {sentAt && (
                      <div style={{ color: 'var(--success)', fontWeight: '600' }}>
                        Enviado el {new Date(sentAt).toLocaleString('es-CL')}
                      </div>
                    )}
                    {entry?.failedAt && (
                      <div style={{ color: 'var(--danger)', fontWeight: '600' }}>
                        Último intento falló el {new Date(entry.failedAt).toLocaleString('es-CL')} — {emailFailureLabel(entry.failureReason)}
                      </div>
                    )}
                    {!sentAt && !entry?.failedAt && !inFlight && (
                      <div style={{ color: 'var(--text-muted)' }}>No enviado</div>
                    )}
                    {inFlight && (
                      <div style={{ color: 'var(--warning)', fontWeight: '600' }}>Envío en curso…</div>
                    )}
                  </div>
                  {resendable && (
                    <button
                      type="button"
                      disabled={actionLoading || inFlight}
                      onClick={() => handleResendEmail(kind)}
                      className="admin-btn admin-btn-secondary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.725rem', whiteSpace: 'nowrap' }}
                    >
                      {resendLabel}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Status & Lifecycle Audit Trail */}
          <div style={{ background: '#f8fafc', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.85rem' }}>
            <div style={{ fontWeight: '800', fontSize: '0.825rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
              <History size={16} style={{ color: 'var(--teal-600)' }} />
              <span>Historial de Estados y Auditoría</span>
            </div>

            {historyLoading ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cargando eventos de auditoría...</div>
            ) : history.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Registro inicial creado junto con el pedido.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {history.map(ev => {
                  const kindLabel = incidentKindLabel(ev)
                  return (
                    <div key={ev.id} style={{ borderLeft: '2px solid var(--teal-600)', paddingLeft: '0.6rem', fontSize: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                        <span style={{ fontWeight: '700', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          {ev.newStatus}
                          {kindLabel && (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                fontWeight: '800',
                                color: 'var(--accent-info)',
                                background: 'var(--accent-info-bg)',
                                border: '1px solid var(--accent-info)',
                                borderRadius: '999px',
                                padding: '0.05rem 0.4rem'
                              }}
                            >
                              {kindLabel}
                            </span>
                          )}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                          {new Date(ev.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} ({new Date(ev.timestamp).toLocaleDateString('es-CL')})
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginBottom: '0.1rem' }}>{ev.reason}</div>
                      <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
                        Por: <strong>{ev.changedByEmail || ev.changedBy}</strong> ({ev.actorRole})
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Operational Action Controls */}
          <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.825rem', fontWeight: '800', color: 'var(--navy-900)' }}>
              Acciones de Despacho y Estado
            </div>

            {isInPaymentReview && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  background: 'var(--danger-bg)',
                  border: '1px solid var(--danger)',
                  padding: '0.85rem',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--danger)' }}>
                    {reviewIncidentLabel}. No despachar hasta conciliar.
                  </div>
                  {reviewIncidentEvent?.reason && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      {reviewIncidentEvent.reason}
                    </div>
                  )}
                </div>

                <div className="admin-form-group">
                  <label className="admin-label">Nota de conciliación (obligatoria para confirmar)</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Ej: pago confirmado en cartola Mercado Pago"
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  disabled={actionLoading || reviewNotes.trim().length === 0}
                  onClick={() => handleResolvePaymentReview('approve')}
                  className="admin-btn admin-btn-primary"
                  style={{ width: '100%', padding: '0.7rem' }}
                >
                  <CheckCircle2 size={16} />
                  <span>{actionLoading ? 'Procesando...' : 'Confirmar Pago y Rebajar Stock'}</span>
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleResolvePaymentReview('cancel')}
                  className="admin-btn admin-btn-danger"
                  style={{ width: '100%', padding: '0.7rem' }}
                >
                  <X size={16} />
                  <span>Cancelar Pedido (sin rebajar stock)</span>
                </button>
              </div>
            )}

            {isQuote && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                  background: 'var(--accent-info-bg)',
                  border: '1px solid var(--accent-info)',
                  padding: '0.85rem',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--accent-info)' }}>
                  Cotización WhatsApp — verifica la venta fuera de la plataforma antes de confirmar.
                </div>

                <div className="admin-form-group">
                  <label className="admin-label">Referencia de conciliación (obligatoria para confirmar la venta)</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Ej: cartola 30-09, abono $189.990"
                    value={quoteReference}
                    onChange={e => setQuoteReference(e.target.value)}
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Registra la cartola de Banco de Chile o el comprobante recibido. No ingreses credenciales bancarias.
                  </div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-label">Nota de cierre (opcional al declinar)</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Ej: sin respuesta tras 7 días"
                    value={quoteNotes}
                    onChange={e => setQuoteNotes(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  disabled={actionLoading || quoteReference.trim().length === 0}
                  onClick={() => handleResolveQuote('convert')}
                  className="admin-btn admin-btn-primary"
                  style={{ width: '100%', padding: '0.7rem' }}
                >
                  <CheckCircle2 size={16} />
                  <span>{actionLoading ? 'Procesando...' : 'Confirmar Venta y Rebajar Stock'}</span>
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleResolveQuote('decline')}
                  className="admin-btn admin-btn-danger"
                  style={{ width: '100%', padding: '0.7rem' }}
                >
                  <X size={16} />
                  <span>Declinar Cotización (sin rebajar stock)</span>
                </button>
              </div>
            )}

            {isPendingTransfer && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div className="admin-form-group">
                  <label className="admin-label">Referencia de conciliación bancaria (Banco de Chile)</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Ej: cartola 30-09, abono $189.990"
                    value={transferReference}
                    onChange={e => setTransferReference(e.target.value)}
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Verifica el abono en la cartola antes de aprobar. No ingreses credenciales bancarias.
                  </div>
                </div>
                <button
                  type="button"
                  disabled={actionLoading || transferReference.trim().length === 0}
                  onClick={handleApproveTransfer}
                  className="admin-btn admin-btn-primary"
                  style={{ width: '100%', padding: '0.7rem' }}
                >
                  <CheckCircle2 size={16} />
                  <span>{actionLoading ? 'Aprobando transferencia...' : 'Aprobar Transferencia y Rebajar Stock'}</span>
                </button>
              </div>
            )}

            {isReadyToDispatch && (
              <form onSubmit={handleDispatch} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#f8fafc', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div className="admin-form-group">
                  <label className="admin-label">Courier de Despacho</label>
                  <select
                    className="admin-select"
                    value={carrier}
                    onChange={e => setCarrier(e.target.value as CarrierType)}
                  >
                    {Object.entries(CARRIER_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="admin-form-group">
                  <label className="admin-label">Código de Seguimiento / N° Guía</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Ej: STK-948124 o CHX-84192"
                    value={trackingCode}
                    onChange={e => setTrackingCode(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="admin-btn admin-btn-primary"
                  style={{ width: '100%', padding: '0.65rem' }}
                >
                  <Truck size={16} />
                  <span>{actionLoading ? 'Registrando despacho...' : 'Marcar como Despachado'}</span>
                </button>
              </form>
            )}

            {isDispatched && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleMarkDelivered}
                className="admin-btn admin-btn-primary"
                style={{ width: '100%', padding: '0.7rem', background: 'var(--success)' }}
              >
                <CheckCircle2 size={16} />
                <span>{actionLoading ? 'Actualizando...' : 'Marcar como Entregado en Clínica'}</span>
              </button>
            )}

            {/* Manual operations: cancellation for never-settled orders, and the
                incident note that gives refunds/returns/chargebacks an audit trail
                without inventing a status change. */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                background: '#f8fafc',
                padding: '0.85rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--navy-900)' }}>
                Operaciones Manuales
              </div>

              {isCancelable && (
                <div className="admin-form-group">
                  <label className="admin-label">Motivo de cancelación (obligatorio)</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Ej: sin abono en cartola tras 7 días"
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={actionLoading || cancelReason.trim().length === 0}
                    onClick={handleCancelOrder}
                    className="admin-btn admin-btn-danger"
                    style={{ width: '100%', padding: '0.65rem', marginTop: '0.5rem' }}
                  >
                    <X size={16} />
                    <span>{actionLoading ? 'Cancelando...' : 'Cancelar Pedido'}</span>
                  </button>
                </div>
              )}

              <div className="admin-form-group">
                <label className="admin-label">Tipo de incidencia</label>
                <select
                  className="admin-select"
                  value={incidentKind}
                  onChange={e => setIncidentKind(e.target.value as OrderIncidentKind)}
                >
                  {Object.entries(INCIDENT_KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Evidencia: cartola, comprobante o contacto con el cliente"
                  value={incidentNote}
                  onChange={e => setIncidentNote(e.target.value)}
                  style={{ marginTop: '0.4rem' }}
                />
                <button
                  type="button"
                  disabled={actionLoading || incidentNote.trim().length === 0}
                  onClick={handleRecordIncident}
                  className="admin-btn admin-btn-secondary"
                  style={{ width: '100%', padding: '0.65rem', marginTop: '0.5rem' }}
                >
                  <FileText size={16} />
                  <span>{actionLoading ? 'Registrando...' : 'Registrar Incidencia'}</span>
                </button>
              </div>

              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                La reposición de stock se hace en Inventario (ajuste auditado), solo por unidades
                recibidas y utilizables. Sigue el SOP de operaciones manuales.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
