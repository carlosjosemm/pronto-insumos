import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProductEditModal } from '../../admin/components/ProductEditModal'
import * as adminApi from '../../admin/services/adminApi'
import type { Product } from '../../types'

const mockProduct: Product = {
  id: 'odon-102',
  name: 'Kit Composite Nanohíbrido',
  category: 'Materiales Restauradores',
  price: 79990,
  rating: 4.8,
  reviewsCount: 22,
  inStock: true,
  stockCount: 15,
  prescriptionRequired: false,
  tag: 'CLÍNICA',
  description: 'Kit de resina nanohíbrida',
  specs: ['8 jeringas'],
  placeholderTheme: 'theme-teal',
  mediaBadge: 'Resina'
}

describe('ProductEditModal Component', () => {
  it('renders editable fields and submits updates', async () => {
    const editSpy = vi.spyOn(adminApi, 'updateProductDetails').mockResolvedValue({ success: true })
    const handleClose = vi.fn()
    const handleSuccess = vi.fn()

    render(
      <ProductEditModal
        product={mockProduct}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    )

    expect(screen.getByDisplayValue('Kit Composite Nanohíbrido')).toBeInTheDocument()
    expect(screen.getByDisplayValue('79990')).toBeInTheDocument()

    const nameInput = screen.getByDisplayValue('Kit Composite Nanohíbrido')
    fireEvent.change(nameInput, { target: { value: 'Kit Composite Estético Plus' } })

    const saveBtn = screen.getByText('Guardar Cambios')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(editSpy).toHaveBeenCalledWith(expect.objectContaining({
        productId: 'odon-102',
        name: 'Kit Composite Estético Plus',
        price: 79990
      }))
      expect(handleSuccess).toHaveBeenCalledTimes(1)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    editSpy.mockRestore()
  })
})
