import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InventoryTable } from '../../admin/components/InventoryTable'
import type { Product } from '../../types'

const mockProducts: Product[] = [
  {
    id: 'odon-101',
    name: 'Turbina LED Push Button',
    category: 'Equipamiento',
    price: 189990,
    rating: 4.9,
    reviewsCount: 12,
    inStock: true,
    stockCount: 8,
    prescriptionRequired: false,
    tag: 'MÁS VENDIDO',
    description: 'Turbina LED',
    specs: [],
    placeholderTheme: 'theme-teal',
    mediaBadge: 'LED'
  },
  {
    id: 'odon-102',
    name: 'Kit Composite Estético',
    category: 'Materiales Restauradores',
    price: 79990,
    rating: 4.8,
    reviewsCount: 8,
    inStock: false,
    stockCount: 0,
    prescriptionRequired: true,
    tag: 'CLÍNICA',
    description: 'Kit resina',
    specs: [],
    placeholderTheme: 'theme-teal',
    mediaBadge: 'Resina'
  }
]

describe('InventoryTable Component', () => {
  it('renders product inventory rows, search filters and action triggers', () => {
    const handleAdjust = vi.fn()
    const handleEdit = vi.fn()
    const handleToggle = vi.fn()

    render(
      <InventoryTable
        products={mockProducts}
        onAdjustStock={handleAdjust}
        onEditProduct={handleEdit}
        onToggleVisibility={handleToggle}
      />
    )

    expect(screen.getByText('Turbina LED Push Button')).toBeInTheDocument()
    expect(screen.getByText('Kit Composite Estético')).toBeInTheDocument()
    expect(screen.getByText('8 unid.')).toBeInTheDocument()
    expect(screen.getByText('Sin Stock')).toBeInTheDocument()
    expect(screen.getByText('⚕️ Regulado SIS')).toBeInTheDocument()

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Buscar insumos odontológicos/i)
    fireEvent.change(searchInput, { target: { value: 'Turbina' } })

    expect(screen.getByText('Turbina LED Push Button')).toBeInTheDocument()
    expect(screen.queryByText('Kit Composite Estético')).not.toBeInTheDocument()

    // Action button clicks
    const stockButtons = screen.getAllByRole('button', { name: /stock/i })
    fireEvent.click(stockButtons[0])
    expect(handleAdjust).toHaveBeenCalledWith(mockProducts[0])
  })
})
