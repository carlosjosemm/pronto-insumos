import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// Mock the api module to avoid Firebase dependency
vi.mock('../../services/api', () => ({
  validatePromo: vi.fn()
}))

import Cart from '../../components/Cart'
import { CartItem, Product } from '../../types'

const mockProduct1: Product = {
  id: 'odon-101',
  name: 'Turbina Odontológica LED MasterTorque',
  category: 'Instruments',
  price: 189.99,
  rating: 4.9,
  reviewsCount: 86,
  inStock: true,
  stockCount: 18,
  prescriptionRequired: false,
  tag: 'Más Vendido',
  description: 'Pieza de mano de alta velocidad',
  specs: ['420.000 RPM'],
  placeholderTheme: 'gradient-teal',
  mediaBadge: 'LED'
}

const mockProduct2: Product = {
  id: 'odon-104',
  name: 'Kit de Resinas DentFill',
  category: 'Materials',
  price: 79.99,
  rating: 4.7,
  reviewsCount: 145,
  inStock: true,
  stockCount: 35,
  prescriptionRequired: false,
  tag: 'Alta Estética',
  description: 'Set de 8 jeringas de resina estética',
  specs: ['8 Jeringas'],
  placeholderTheme: 'gradient-emerald',
  mediaBadge: 'Nano-Híbrido'
}

const mockCartItems: CartItem[] = [
  { product: mockProduct1, quantity: 2 },
  { product: mockProduct2, quantity: 1 }
]

const defaultProps = {
  isOpen: true,
  onClose: () => {},
  items: mockCartItems,
  onUpdateQuantity: () => {},
  onRemoveItem: () => {},
  onCheckout: () => {},
  appliedPromo: null,
  onApplyPromo: () => {}
}

describe('Cart component', () => {
  it('should render nothing when isOpen is false', () => {
    const { container } = render(<Cart {...defaultProps} isOpen={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('should render the cart title when open', () => {
    render(<Cart {...defaultProps} />)
    expect(screen.getByText(/Carro Odontológico/)).toBeInTheDocument()
  })

  it('should display the total item count in the header', () => {
    render(<Cart {...defaultProps} />)
    // 2 + 1 = 3 items total, shown in "Carro Odontológico (3)"
    expect(screen.getByText(/Carro Odontológico/)).toHaveTextContent('3')
  })

  it('should display product names for cart items', () => {
    render(<Cart {...defaultProps} />)
    expect(screen.getByText('Turbina Odontológica LED MasterTorque')).toBeInTheDocument()
    expect(screen.getByText('Kit de Resinas DentFill')).toBeInTheDocument()
  })

  it('should display the subtotal correctly', () => {
    render(<Cart {...defaultProps} />)
    // 189.99 * 2 + 79.99 * 1 = 459.97
    const subtotalElements = screen.getAllByText('$459.97')
    expect(subtotalElements.length).toBeGreaterThanOrEqual(1)
  })

  it('should display the IVA (19%) line', () => {
    render(<Cart {...defaultProps} />)
    expect(screen.getByText(/IVA.*19%/)).toBeInTheDocument()
  })

  it('should display the "Proceder al Pago" button', () => {
    render(<Cart {...defaultProps} />)
    expect(screen.getByText('Proceder al Pago')).toBeInTheDocument()
  })

  it('should show empty cart message when no items', () => {
    render(<Cart {...defaultProps} items={[]} />)
    expect(screen.getByText('Tu carro está vacío')).toBeInTheDocument()
  })

  it('should NOT show checkout button when cart is empty', () => {
    render(<Cart {...defaultProps} items={[]} />)
    expect(screen.queryByText('Proceder al Pago')).not.toBeInTheDocument()
  })

  it('should display promo input placeholder', () => {
    render(<Cart {...defaultProps} />)
    expect(screen.getByPlaceholderText(/Código Convenio/)).toBeInTheDocument()
  })

  it('should display discount info when promo is applied', () => {
    render(
      <Cart
        {...defaultProps}
        appliedPromo={{ code: 'DENT20', discountPercent: 20, label: '20% Convenio Clínicas Melipilla' }}
      />
    )
    expect(screen.getByText(/DENT20/)).toBeInTheDocument()
    const discountElements = screen.getAllByText(/20%/)
    expect(discountElements.length).toBeGreaterThanOrEqual(1)
  })
})
