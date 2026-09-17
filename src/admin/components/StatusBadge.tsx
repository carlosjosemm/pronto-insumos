import React from 'react'
import type { OrderStatus } from '../../types'
import { Clock, CheckCircle2, AlertTriangle, Truck, Package, XCircle, FileText } from 'lucide-react'

interface StatusBadgeProps {
  status: OrderStatus
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'PENDIENTE_PAGO_MERCADOPAGO':
      return (
        <span className="admin-status-badge admin-status-badge--pending">
          <Clock size={12} />
          <span>Pendiente MP</span>
        </span>
      )
    case 'PENDIENTE_TRANSFERENCIA':
      return (
        <span className="admin-status-badge admin-status-badge--transfer-pending">
          <Clock size={12} />
          <span>Pend. Transferencia</span>
        </span>
      )
    case 'TRANSFERENCIA_COMPROBANTE_SUBIDO':
      return (
        <span className="admin-status-badge admin-status-badge--voucher-uploaded">
          <FileText size={12} />
          <span>Comprobante Subido</span>
        </span>
      )
    case 'PAGADO_MERCADOPAGO':
      return (
        <span className="admin-status-badge admin-status-badge--paid">
          <CheckCircle2 size={12} />
          <span>Pagado Mercado Pago</span>
        </span>
      )
    case 'TRANSFERENCIA_APROBADA':
    case 'PAGADO_TRANSFERENCIA':
      return (
        <span className="admin-status-badge admin-status-badge--paid">
          <CheckCircle2 size={12} />
          <span>Transferencia Aprobada</span>
        </span>
      )
    case 'EN_PREPARACION':
      return (
        <span className="admin-status-badge admin-status-badge--prep">
          <Package size={12} />
          <span>En Preparación</span>
        </span>
      )
    case 'DESPACHADO':
      return (
        <span className="admin-status-badge admin-status-badge--dispatched">
          <Truck size={12} />
          <span>Despachado</span>
        </span>
      )
    case 'ENTREGADO':
      return (
        <span className="admin-status-badge admin-status-badge--delivered">
          <CheckCircle2 size={12} />
          <span>Entregado</span>
        </span>
      )
    case 'CANCELADO':
      return (
        <span className="admin-status-badge admin-status-badge--cancelled">
          <XCircle size={12} />
          <span>Cancelado</span>
        </span>
      )
    case 'COTIZACION_SOLICITADA_WHATSAPP':
      return (
        <span className="admin-status-badge admin-status-badge--voucher-uploaded">
          <Clock size={12} />
          <span>Cotización WhatsApp</span>
        </span>
      )
    default:
      return (
        <span className="admin-status-badge admin-status-badge--pending">
          <AlertTriangle size={12} />
          <span>{status}</span>
        </span>
      )
  }
}
