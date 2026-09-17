import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdminSidebar } from '../../admin/components/AdminSidebar'

describe('AdminSidebar Component', () => {
  it('renders navigation buttons and triggers onNavigate on click', () => {
    const handleNavigate = vi.fn()
    render(<AdminSidebar activeView="dashboard" onNavigate={handleNavigate} />)

    expect(screen.getByText('PRONTO')).toBeInTheDocument()
    expect(screen.getByText('Bodega Melipilla')).toBeInTheDocument()

    const ordersBtn = screen.getByText('Pedidos Clínicos')
    fireEvent.click(ordersBtn)
    expect(handleNavigate).toHaveBeenCalledWith('orders')

    const inventoryBtn = screen.getByText('Inventario y Stock')
    fireEvent.click(inventoryBtn)
    expect(handleNavigate).toHaveBeenCalledWith('inventory')
  })
})
