import { describe, it, expect, vi, afterEach } from 'vitest'
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

const secondProduct: Product = {
  ...mockProduct,
  id: 'odon-202',
  name: 'Resina Compuesta Flow',
  stockCount: 3
}

describe('StockAdjustModal Component', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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
  })

  it('renders nothing for a null product and recovers on a null-to-product rerender', async () => {
    const updateSpy = vi.spyOn(adminApi, 'updateStockCount').mockResolvedValue({ success: true })
    const handleClose = vi.fn()
    const handleSuccess = vi.fn()

    const { rerender } = render(<StockAdjustModal product={null} onClose={handleClose} onSuccess={handleSuccess} />)
    expect(screen.queryByText('Ajuste Físico de Inventario')).not.toBeInTheDocument()

    // Same component instance, now with a product: the hook order must not change.
    rerender(<StockAdjustModal product={mockProduct} onClose={handleClose} onSuccess={handleSuccess} />)

    expect(screen.getByText('Ajuste Físico de Inventario')).toBeInTheDocument()
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('8')

    fireEvent.click(screen.getByText('Guardar Ajuste'))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        productId: 'odon-101',
        newStock: 8,
        reason: 'reposicion'
      })
      expect(handleSuccess).toHaveBeenCalledTimes(1)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })
  })

  it('sends the traceability note with the adjustment', async () => {
    const updateSpy = vi.spyOn(adminApi, 'updateStockCount').mockResolvedValue({ success: true })

    render(<StockAdjustModal product={mockProduct} onClose={vi.fn()} onSuccess={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/devolución del pedido/i), {
      target: { value: 'devolución del pedido PRONTO-7K3M9Q2Z, 2 cajas en buen estado' }
    })
    fireEvent.click(screen.getByText('Guardar Ajuste'))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        productId: 'odon-101',
        newStock: 8,
        reason: 'reposicion',
        notes: 'devolución del pedido PRONTO-7K3M9Q2Z, 2 cajas en buen estado'
      })
    })
  })

  it('re-seeds the stock draft when a different product is opened', () => {
    const handleClose = vi.fn()
    const handleSuccess = vi.fn()

    const { rerender } = render(
      <StockAdjustModal product={mockProduct} onClose={handleClose} onSuccess={handleSuccess} />
    )
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('8')

    rerender(<StockAdjustModal product={secondProduct} onClose={handleClose} onSuccess={handleSuccess} />)

    expect(screen.getByText('Resina Compuesta Flow')).toBeInTheDocument()
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('3')
  })
})
