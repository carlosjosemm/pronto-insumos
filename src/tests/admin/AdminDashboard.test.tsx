import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AdminDashboard } from '../../admin/components/AdminDashboard'
import * as adminApi from '../../admin/services/adminApi'

describe('AdminDashboard Component', () => {
  it('renders 4 KPI metric cards and analytics placeholders', async () => {
    vi.spyOn(adminApi, 'fetchDashboardStats').mockResolvedValue({
      salesToday: 540000,
      pendingOrders: 4,
      lowStockProducts: 2,
      ordersThisMonth: 21
    })

    vi.spyOn(adminApi, 'fetchAdminOrders').mockResolvedValue({
      orders: [],
      total: 0
    })

    vi.spyOn(adminApi, 'fetchAdminProducts').mockResolvedValue([])

    render(
      <AdminDashboard
        onNavigateToOrders={vi.fn()}
        onNavigateToInventory={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Ventas Hoy')).toBeInTheDocument()
      expect(screen.getByText('$540.000')).toBeInTheDocument()
      expect(screen.getByText('Pedidos Pendientes')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
      expect(screen.getByText('Stock Bajo / Crítico')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('Pedidos del Mes')).toBeInTheDocument()
      expect(screen.getByText('21')).toBeInTheDocument()
      expect(screen.getByText(/Visitas Web y Sesiones/i)).toBeInTheDocument()
      expect(screen.getByText(/Tasa de Conversión Checkout/i)).toBeInTheDocument()
    })
  })
})
