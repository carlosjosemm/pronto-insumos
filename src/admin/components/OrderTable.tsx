import React, { useState, useMemo } from 'react'
import { Search, Eye, CreditCard, Building2, MessageCircle, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { formatCLP } from '../../utils/currency'
import { formatRut } from '../../utils/rut'
import type { Order } from '../../types'

interface OrderTableProps {
  orders: Order[]
  selectedOrderId?: string
  onSelectOrder: (order: Order) => void
}

const STATUS_FILTER_CHIPS = [
  { id: 'all', label: 'Todos' },
  { id: 'PENDIENTE_TRANSFERENCIA', label: 'Pend. Transferencia' },
  { id: 'TRANSFERENCIA_COMPROBANTE_SUBIDO', label: 'Comprobante Subido' },
  { id: 'PAGADO_MERCADOPAGO', label: 'Pagado MP' },
  { id: 'TRANSFERENCIA_APROBADA', label: 'Transferencia Aprobada' },
  { id: 'DESPACHADO', label: 'Despachado' },
  { id: 'ENTREGADO', label: 'Entregado' }
]

export const OrderTable: React.FC<OrderTableProps> = ({
  orders,
  selectedOrderId,
  onSelectOrder
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<'createdAt' | 'totalAmount' | 'orderId'>('createdAt')
  const [sortAsc, setSortAsc] = useState(false)
  const pageSize = 15

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Filter by status chip
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'TRANSFERENCIA_APROBADA') {
          if (order.status !== 'TRANSFERENCIA_APROBADA' && order.status !== 'PAGADO_TRANSFERENCIA') return false
        } else if (order.status !== selectedStatus) {
          return false
        }
      }

      // Filter by search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim()
        const matchId = order.orderId.toLowerCase().includes(query)
        const matchName = (order.customer?.fullName || '').toLowerCase().includes(query)
        const matchRazon = (order.customer?.razonSocial || '').toLowerCase().includes(query)
        const matchRut = (order.customer?.rut || '').toLowerCase().includes(query)
        if (!matchId && !matchName && !matchRazon && !matchRut) return false
      }

      return true
    }).sort((a, b) => {
      if (sortField === 'totalAmount') {
        return sortAsc ? a.totalAmount - b.totalAmount : b.totalAmount - a.totalAmount
      }
      if (sortField === 'orderId') {
        return sortAsc ? a.orderId.localeCompare(b.orderId) : b.orderId.localeCompare(a.orderId)
      }
      // createdAt sort default
      const dateA = new Date(a.createdAt || 0).getTime()
      const dateB = new Date(b.createdAt || 0).getTime()
      return sortAsc ? dateA - dateB : dateB - dateA
    })
  }, [orders, selectedStatus, searchTerm, sortField, sortAsc])

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredOrders.slice(start, start + pageSize)
  }, [filteredOrders, currentPage, pageSize])

  const toggleSort = (field: 'createdAt' | 'totalAmount' | 'orderId') => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  return (
    <div className="admin-card">
      <div style={{ padding: '1.25rem 1.25rem 0.5rem 1.25rem' }}>
        <div className="admin-filter-bar">
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="admin-search-input"
              placeholder="Buscar por ID de pedido (PRONTO-...), nombre del doctor, clínica o RUT..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              style={{ paddingLeft: '2.4rem' }}
            />
            <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          </div>

          <div className="admin-filter-chips">
            {STATUS_FILTER_CHIPS.map(chip => (
              <button
                key={chip.id}
                type="button"
                className={`admin-chip ${selectedStatus === chip.id ? 'admin-chip--active' : ''}`}
                onClick={() => {
                  setSelectedStatus(chip.id)
                  setCurrentPage(1)
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-table-container">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('orderId')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>ID Pedido</span>
                  <ArrowUpDown size={13} />
                </div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('createdAt')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>Fecha</span>
                  <ArrowUpDown size={13} />
                </div>
              </th>
              <th>Cliente / Razón Social</th>
              <th>RUT</th>
              <th>Método</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('totalAmount')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>Total CLP</span>
                  <ArrowUpDown size={13} />
                </div>
              </th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {paginatedOrders.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                  No se encontraron pedidos con los filtros aplicados.
                </td>
              </tr>
            ) : (
              paginatedOrders.map(order => {
                const isSelected = order.orderId === selectedOrderId
                return (
                  <tr
                    key={order.orderId}
                    onClick={() => onSelectOrder(order)}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(8, 131, 149, 0.07)' : undefined
                    }}
                  >
                    <td>
                      <span className="admin-code">{order.orderId}</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Reciente'}
                    </td>
                    <td>
                      <div style={{ fontWeight: '700', color: 'var(--navy-900)' }}>
                        {order.customer?.razonSocial || order.customer?.fullName || 'Clínica Dental'}
                      </div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                        {order.customer?.city || 'Melipilla'}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {formatRut(order.customer?.rut || '')}
                    </td>
                    <td>
                      {order.paymentMethod === 'mercadopago' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--teal-700)', fontSize: '0.75rem', fontWeight: '600' }}>
                          <CreditCard size={14} />
                          <span>Mercado Pago</span>
                        </div>
                      )}
                      {order.paymentMethod === 'transferencia' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#b45309', fontSize: '0.75rem', fontWeight: '600' }}>
                          <Building2 size={14} />
                          <span>Banco Chile</span>
                        </div>
                      )}
                      {order.paymentMethod === 'whatsapp' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#0284c7', fontSize: '0.75rem', fontWeight: '600' }}>
                          <MessageCircle size={14} />
                          <span>Cotización WA</span>
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: '800', fontFamily: 'var(--font-mono)' }}>
                      {formatCLP(order.totalAmount)}
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectOrder(order)
                        }}
                      >
                        <Eye size={13} />
                        <span>Ver</span>
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <div>
          Mostrando {paginatedOrders.length} de {filteredOrders.length} pedidos
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            style={{ padding: '0.25rem 0.5rem' }}
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          >
            <ChevronLeft size={15} />
            <span>Anterior</span>
          </button>
          <span>Página {currentPage} de {totalPages}</span>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            style={{ padding: '0.25rem 0.5rem' }}
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          >
            <span>Siguiente</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
