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

  it('renders create mode, supports custom category, and invokes createProductDetails', async () => {
    const createSpy = vi.spyOn(adminApi, 'createProductDetails').mockResolvedValue({
      success: true,
      product: {
        id: 'prod-new-1',
        name: 'Guantes de Látex Quirúrgico',
        category: 'BIOSEGURIDAD',
        price: 9990,
        priceNeto: 8395,
        rating: 5,
        reviewsCount: 0,
        inStock: true,
        stockCount: 25,
        prescriptionRequired: false,
        tag: 'NUEVO',
        description: 'Caja de guantes estériles',
        specs: [],
        packageContents: [],
        images: [],
        placeholderTheme: 'gradient-teal',
        mediaBadge: 'Nuevo'
      }
    })
    const handleClose = vi.fn()
    const handleSuccess = vi.fn()

    render(
      <ProductEditModal
        product={null}
        existingCategories={['OPERATORIA', 'ENDODONCIA']}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    )

    expect(screen.getByText('Registrar Nuevo Insumo Odontológico')).toBeInTheDocument()
    expect(screen.getByText('Stock Inicial en Bodega Melipilla *')).toBeInTheDocument()

    // Fill in product name
    const nameInput = screen.getByPlaceholderText('Ej: Turbina LED Push Button Triple Spray')
    fireEvent.change(nameInput, { target: { value: 'Guantes de Látex Quirúrgico' } })

    // Select custom category option
    const categorySelect = screen.getByRole('combobox')
    fireEvent.change(categorySelect, { target: { value: '__NEW__' } })

    // Fill custom category name
    const customCategoryInput = screen.getByPlaceholderText('Ej: ORTODONCIA, PERIODONCIA, CIRUGIA')
    fireEvent.change(customCategoryInput, { target: { value: 'Bioseguridad' } })

    // Fill in price and stock
    const priceInput = screen.getByPlaceholderText('18990')
    fireEvent.change(priceInput, { target: { value: '9990' } })

    const stockInput = screen.getByDisplayValue('10') // default is 10
    fireEvent.change(stockInput, { target: { value: '25' } })

    // Submit form
    const submitBtn = screen.getByText('Registrar Insumo')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Guantes de Látex Quirúrgico',
        category: 'BIOSEGURIDAD', // normalized to uppercase
        price: 9990,
        stockCount: 25
      }))
      expect(handleSuccess).toHaveBeenCalledTimes(1)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    createSpy.mockRestore()
  })
})
