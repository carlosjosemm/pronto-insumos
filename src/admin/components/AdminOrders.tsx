import React, { useEffect, useRef, useState } from 'react'
import { OrderTable } from './OrderTable'
import { OrderDetailPanel } from './OrderDetailPanel'
import { fetchAdminOrders, fetchAdminOrder } from '../services/adminApi'
import { AlertCircle, RefreshCw } from 'lucide-react'
import type { Order } from '../../types'

interface AdminOrdersProps {
  initialOrderId?: string
}

export const AdminOrders: React.FC<AdminOrdersProps> = ({ initialOrderId }) => {
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Monotonic token: a slow detail response must never overwrite a newer selection (or
  // reopen the panel after it was closed).
  const selectionToken = useRef(0)

  /**
   * Opens an order in the slide-over panel.
   *
   * The list projection deliberately omits `voucherUrl` (a legacy Base64 voucher would
   * blow the response cap), so the row is shown immediately and the detail request then
   * supplies the full document — including the voucher URL.
   */
  const openOrder = async (order: Order) => {
    const token = ++selectionToken.current
    setSelectedOrder(order)
    const detail = await fetchAdminOrder(order.orderId)
    if (detail && token === selectionToken.current) setSelectedOrder(detail)
  }

  const loadOrders = async ({ openInitial = true }: { openInitial?: boolean } = {}) => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetchAdminOrders()
      const loaded = res.orders || []
      setOrders(loaded)

      // REFRESH PATH WINS — when an order is already selected, re-find it in the
      // freshly loaded page so a deep link in the URL cannot re-assert itself over
      // the order the operator just acted on. The list projection omits `voucherUrl`,
      // so the refreshed snapshot is completed by the detail request.
      if (selectedOrder) {
        const updated = loaded.find(o => o.orderId === selectedOrder.orderId)
        if (updated) {
          const token = ++selectionToken.current
          setSelectedOrder(updated)
          const detail = await fetchAdminOrder(updated.orderId)
          if (detail && token === selectionToken.current) setSelectedOrder(detail)
          return
        }
      }

      if (openInitial && initialOrderId) {
        const found = loaded.find(o => o.orderId === initialOrderId)
        if (found) {
          await openOrder(found)
        } else {
          // Deep link beyond the first page: the list only renders a bounded
          // window, so `#orders/<id>` fetches the order directly to open the
          // inspector from any queue depth.
          const direct = await fetchAdminOrder(initialOrderId)
          if (direct) {
            await openOrder(direct)
          } else {
            // A deep link to a missing/unreadable order must say so — the same
            // failure-vs-empty honesty the list banner provides.
            setLoadError(`No se encontró el pedido ${initialOrderId}. Verifica el código e reintenta.`)
          }
        }
      }
    } catch (err) {
      console.error('[Admin Orders] Error loading orders:', err)
      setLoadError('No fue posible cargar los pedidos. Verifica tu conexión y reintenta.')
    } finally {
      setLoading(false)
    }
  }

  /** Refreshes the open order document after an action (approve/dispatch/…). */
  const refreshSelectedOrder = async () => {
    if (!selectedOrder) return
    const token = ++selectionToken.current
    const detail = await fetchAdminOrder(selectedOrder.orderId)
    if (detail && token === selectionToken.current) setSelectedOrder(detail)
  }

  useEffect(() => {
    loadOrders()
  }, [initialOrderId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Supervisión y cumplimiento de órdenes para depósitos dentales en Melipilla y RM.
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadOrders()}
          className="admin-btn admin-btn-secondary"
          disabled={loading}
          style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem' }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Actualizar Lista</span>
        </button>
      </div>

      {/* Read failure — distinct from an empty queue: without this banner a failed
          load renders the same blank table a genuinely empty filter would. */}
      {loadError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: 'var(--danger-bg)',
            border: '1px solid #fecaca',
            color: 'var(--danger)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem',
            fontWeight: '600'
          }}
        >
          <AlertCircle size={17} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{loadError}</span>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => loadOrders()}
            disabled={loading}
            style={{ padding: '0.35rem 0.7rem', fontSize: '0.775rem' }}
          >
            Reintentar
          </button>
        </div>
      )}

      <OrderTable
        orders={orders}
        selectedOrderId={selectedOrder?.orderId}
        onSelectOrder={openOrder}
      />

      <OrderDetailPanel
        order={selectedOrder}
        onClose={() => {
          selectionToken.current++
          setSelectedOrder(null)
        }}
        onOrderUpdated={() => {
          // `openInitial: false` keeps this to a single detail request: the list refresh
          // must not re-open the deep link while the panel's own refresh runs below.
          loadOrders({ openInitial: false })
          refreshSelectedOrder()
        }}
      />
    </div>
  )
}
