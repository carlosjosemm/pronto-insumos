import React, { useEffect, useState } from 'react'
import { OrderTable } from './OrderTable'
import { OrderDetailPanel } from './OrderDetailPanel'
import { fetchAdminOrders } from '../services/adminApi'
import { RefreshCw } from 'lucide-react'
import type { Order } from '../../types'

interface AdminOrdersProps {
  initialOrderId?: string
}

export const AdminOrders: React.FC<AdminOrdersProps> = ({ initialOrderId }) => {
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  const loadOrders = async () => {
    setLoading(true)
    try {
      const res = await fetchAdminOrders()
      setOrders(res.orders || [])
      if (initialOrderId) {
        const found = res.orders?.find(o => o.orderId === initialOrderId)
        if (found) setSelectedOrder(found)
      }
    } catch (err) {
      console.error('[Admin Orders] Error loading orders:', err)
    } finally {
      setLoading(false)
    }
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
          onClick={loadOrders}
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
        onSelectOrder={order => setSelectedOrder(order)}
      />

      <OrderDetailPanel
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onOrderUpdated={() => {
          loadOrders()
        }}
      />
    </div>
  )
}
