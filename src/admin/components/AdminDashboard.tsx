import React, { useEffect, useState } from 'react'
import { DollarSign, Clock, AlertTriangle, TrendingUp, BarChart2, PackageOpen, ArrowRight, CheckCircle2 } from 'lucide-react'
import { MetricCard } from './MetricCard'
import { StatusBadge } from './StatusBadge'
import { fetchDashboardStats, fetchAdminOrders, fetchAdminProducts } from '../services/adminApi'
import { formatCLP } from '../../utils/currency'
import type { DashboardStats } from '../types'
import type { Order, Product } from '../../types'

interface AdminDashboardProps {
  onNavigateToOrders: (orderId?: string) => void
  onNavigateToInventory: () => void
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onNavigateToOrders,
  onNavigateToInventory
}) => {
  const [stats, setStats] = useState<DashboardStats>({
    salesToday: 0,
    pendingOrders: 0,
    lowStockProducts: 0,
    ordersThisMonth: 0
  })
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [criticalProducts, setCriticalProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    async function loadDashboard() {
      try {
        const [statsData, ordersData, productsData] = await Promise.all([
          fetchDashboardStats(),
          fetchAdminOrders({ limit: 10 }),
          fetchAdminProducts()
        ])

        if (isMounted) {
          setStats(statsData)
          setRecentOrders(ordersData.orders || [])
          const critical = (productsData || [])
            .filter(p => typeof p.stockCount === 'number' && p.stockCount <= 5)
            .sort((a, b) => a.stockCount - b.stockCount)
          setCriticalProducts(critical)
        }
      } catch (err) {
        console.error('[Admin Dashboard] Error loading data:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadDashboard()
    return () => { isMounted = false }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 4 Primary KPI Metric Cards */}
      <div className="admin-metric-grid">
        <MetricCard
          label="Ventas Hoy"
          value={formatCLP(stats.salesToday)}
          subtitle="Facturación neta confirmada hoy"
          icon={<DollarSign size={20} />}
          accentColor="var(--teal-600)"
        />
        <MetricCard
          label="Pedidos Pendientes"
          value={stats.pendingOrders}
          subtitle="Por verificar o preparar despacho"
          icon={<Clock size={20} />}
          accentColor="var(--warning)"
        />
        <MetricCard
          label="Stock Bajo / Crítico"
          value={stats.lowStockProducts}
          subtitle="Insumos con 5 o menos unidades"
          icon={<AlertTriangle size={20} />}
          accentColor="var(--danger)"
        />
        <MetricCard
          label="Pedidos del Mes"
          value={stats.ordersThisMonth}
          subtitle="Volumen registrado este mes"
          icon={<TrendingUp size={20} />}
          accentColor="var(--text-primary)"
        />
      </div>

      {/* Analytics Placeholders Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        <div className="admin-placeholder-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <BarChart2 size={20} style={{ color: 'var(--text-muted)' }} />
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.85rem', color: 'var(--navy-900)' }}>Visitas Web y Sesiones</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Próximamente — Conexión Google Tag Manager</div>
            </div>
          </div>
          <span style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', background: '#e2e8f0', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Fase 5</span>
        </div>

        <div className="admin-placeholder-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <TrendingUp size={20} style={{ color: 'var(--text-muted)' }} />
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.85rem', color: 'var(--navy-900)' }}>Tasa de Conversión Checkout</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Próximamente — Telemetría Google Analytics 4</div>
            </div>
          </div>
          <span style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', background: '#e2e8f0', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Fase 5</span>
        </div>
      </div>

      {/* Bottom Split Layout: Recent Orders (65%) & Critical Stock (35%) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Recent Orders Section */}
        <div className="admin-card">
          <div className="admin-card-header">
            <h2 className="admin-card-title">Últimos Pedidos Recibidos</h2>
            <button
              type="button"
              onClick={() => onNavigateToOrders()}
              className="admin-btn admin-btn-ghost"
              style={{ fontSize: '0.775rem', padding: '0.35rem 0.6rem' }}
            >
              <span>Ver todos los pedidos</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="admin-table-container">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>ID Pedido</th>
                  <th>Estado</th>
                  <th>Cliente / Clínica</th>
                  <th>Monto CLP</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      No hay pedidos recientes registrados.
                    </td>
                  </tr>
                ) : (
                  recentOrders.map(order => (
                    <tr
                      key={order.orderId}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onNavigateToOrders(order.orderId)}
                    >
                      <td>
                        <span className="admin-code">{order.orderId}</span>
                      </td>
                      <td>
                        <StatusBadge status={order.status} />
                      </td>
                      <td>
                        <div style={{ fontWeight: '600' }}>
                          {order.customer?.razonSocial || order.customer?.fullName || 'Clínica Dental'}
                        </div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                          {order.customer?.city || 'Melipilla'}
                        </div>
                      </td>
                      <td style={{ fontWeight: '700', fontFamily: 'var(--font-mono)' }}>
                        {formatCLP(order.totalAmount)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            onNavigateToOrders(order.orderId)
                          }}
                        >
                          Inspeccionar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Critical Stock Alerts Section */}
        <div className="admin-card">
          <div className="admin-card-header">
            <h2 className="admin-card-title">Stock Crítico en Bodega</h2>
            <button
              type="button"
              onClick={onNavigateToInventory}
              className="admin-btn admin-btn-ghost"
              style={{ fontSize: '0.775rem', padding: '0.35rem 0.6rem' }}
            >
              <span>Inventario</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {criticalProducts.length === 0 ? (
              <div style={{
                background: 'var(--success-bg)',
                border: '1px solid #a7f3d0',
                borderRadius: 'var(--radius-sm)',
                padding: '1.25rem',
                textAlign: 'center',
                color: 'var(--success)'
              }}>
                <CheckCircle2 size={24} style={{ margin: '0 auto 0.5rem auto' }} />
                <div style={{ fontWeight: '700', fontSize: '0.875rem' }}>Inventario Óptimo</div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>No hay insumos odontológicos con stock crítico.</div>
              </div>
            ) : (
              criticalProducts.map(p => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem',
                    background: 'var(--surface-muted)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <div style={{ maxWidth: '65%' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.825rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      REF: {p.id.toUpperCase()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={`admin-stock-badge ${p.stockCount <= 2 ? 'admin-stock-badge--critical' : 'admin-stock-badge--low'}`}>
                      {p.stockCount} unid.
                    </span>
                    <button
                      type="button"
                      onClick={onNavigateToInventory}
                      className="admin-btn admin-btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                    >
                      Reponer
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
