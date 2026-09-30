import React, { useEffect, useRef, useState } from 'react'
import { OrderTable } from './OrderTable'
import { OrderDetailPanel } from './OrderDetailPanel'
import { fetchAdminOrders, fetchAdminOrder } from '../services/adminApi'
import { RefreshCw } from 'lucide-react'
import type { Order } from '../../types'

interface AdminOrdersProps {
  initialOrderId?: string
}

export const AdminOrders: React.FC<AdminOrdersProps> = ({ initialOrderId }) => {
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
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
    try {
      const res = await fetchAdminOrders()
      setOrders(res.orders || [])
      if (openInitial && initialOrderId) {
        const found = res.orders?.find(o => o.orderId === initialOrderId)
        if (found) await openOrder(found)
      }
    } catch (err) {
      console.error('[Admin Orders] Error loading orders:', err)
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
