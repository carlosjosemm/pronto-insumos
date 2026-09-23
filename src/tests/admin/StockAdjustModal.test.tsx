import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StockAdjustModal } from '../../admin/components/StockAdjustModal'
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

describe('StockAdjustModal Component', () => {
  it('allows stepping stock up and down and submits update', async () => {
    const updateSpy = vi.spyOn(adminApi, 'updateStockCount').mockResolvedValue({ success: true })
    const handleClose = vi.fn()
    const handleSuccess = vi.fn()

    render(<StockAdjustModal product={mockProduct} onClose={handleClose} onSuccess={handleSuccess} />)

    expect(screen.getByText('Turbina LED Push Button')).toBeInTheDocument()
    expect(screen.getByText(/Stock actual en bodega Melipilla/i)).toBeInTheDocument()

    // Step up
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(input.value).toBe('8')

    // Submit form
    const saveBtn = screen.getByText('Guardar Ajuste')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        productId: 'odon-101',
        newStock: 8,
        reason: 'reposicion'
      })
      expect(handleSuccess).toHaveBeenCalledTimes(1)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    updateSpy.mockRestore()
  })
})
