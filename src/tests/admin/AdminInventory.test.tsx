import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminInventory } from '../../admin/components/AdminInventory'
import * as adminApi from '../../admin/services/adminApi'
import type { Product } from '../../types'

const mockProduct: Product = {
  id: 'odon-101',
  name: 'Turbina LED Push Button',
  category: 'Equipamiento',
  price: 189990,
  rating: 4.9,
  reviewsCount: 15,
  inStock: true,
  stockCount: 8,
  prescriptionRequired: false,
  tag: 'MÁS VENDIDO',
  description: 'Turbina odontológica',
  specs: ['Luz LED'],
  placeholderTheme: 'theme-teal',
  mediaBadge: 'LED'
}

describe('AdminInventory Component', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the stock adjustment modal for the selected product and submits the adjustment', async () => {
    vi.spyOn(adminApi, 'fetchAdminProducts').mockResolvedValue([mockProduct])
    const toggleSpy = vi.spyOn(adminApi, 'toggleProductVisibility').mockResolvedValue({ success: true })
    const updateSpy = vi.spyOn(adminApi, 'updateStockCount').mockResolvedValue({ success: true })

    render(<AdminInventory />)

    // The row appears only after the async catalog load resolves.
    expect(await screen.findByText('Turbina LED Push Button')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Ajustar unidades en bodega'))

    expect(screen.getByText('Ajuste Físico de Inventario')).toBeInTheDocument()
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('8')

    fireEvent.click(screen.getByText('Guardar Ajuste'))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        productId: 'odon-101',
        newStock: 8,
        reason: 'reposicion'
      })
    })
    expect(toggleSpy).not.toHaveBeenCalled()
  })
})
