import React, { useState } from 'react'
import { X, CheckCircle2, Truck, Package, FileText, Building2, Phone, Mail, User, ShieldAlert, ExternalLink } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { formatCLP } from '../../utils/currency'
import { formatRut } from '../../utils/rut'
import { approveBankTransfer, dispatchAdminOrder, markOrderDelivered } from '../services/adminApi'
import { CARRIER_LABELS, type CarrierType } from '../types'
import type { Order } from '../../types'

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
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  if (!order) return null

  const handleApproveTransfer = async () => {
    setActionLoading(true)
    setActionError('')
    setActionSuccess('')
    const res = await approveBankTransfer(order.orderId)
    setActionLoading(false)
    if (res.success) {
      setActionSuccess('¡Transferencia bancaria aprobada exitosamente y stock rebajado en bodega!')
      onOrderUpdated()
    } else {
      setActionError(res.error || 'Error al aprobar la transferencia')
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
      setActionSuccess('¡Pedido marcado como despachado con courier asignado!')
      onOrderUpdated()
    } else {
      setActionError(res.error || 'Error al despachar el pedido')
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
      onOrderUpdated()
    } else {
      setActionError(res.error || 'Error al marcar como entregado')
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

          {/* Transfer Voucher Section */}
          {order.voucherUrl && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-sm)', padding: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
              <a
                href={order.voucherUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="admin-btn admin-btn-secondary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
              >
                <span>Ver Comprobante</span>
                <ExternalLink size={13} />
              </a>
            </div>
          )}

          {/* Operational Action Controls */}
          <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.825rem', fontWeight: '800', color: 'var(--navy-900)' }}>
              Acciones de Despacho y Estado
            </div>

            {isPendingTransfer && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleApproveTransfer}
                className="admin-btn admin-btn-primary"
                style={{ width: '100%', padding: '0.7rem' }}
              >
                <CheckCircle2 size={16} />
                <span>{actionLoading ? 'Aprobando transferencia...' : 'Aprobar Transferencia y Rebajar Stock'}</span>
              </button>
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
          </div>
        </div>
      </div>
    </div>
  )
}
