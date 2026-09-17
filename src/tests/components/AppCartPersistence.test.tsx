import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'
import { saveCartToStorage, CART_STORAGE_KEY } from '../../services/cartStorage'
import { Product, PromoCode } from '../../types'

const MOCK_STORE_PRODUCT: Product = {
  id: 'odon-101',
  name: 'Turbina Odontológica LED MasterTorque',
  category: 'Instruments',
  manufacturer: 'NSK',
  price: 189990,
  rating: 4.9,
  reviewsCount: 86,
  inStock: true,
  stockCount: 10,
  prescriptionRequired: false,
  tag: 'Más Vendido',
  description: 'Pieza de mano de alta velocidad',
  specs: ['420.000 RPM'],
  placeholderTheme: 'gradient-teal',
  mediaBadge: 'LED',
  images: [],
  packageContents: ['1x Turbina']
}

const MOCK_PROMO: PromoCode = {
  code: 'DENT20',
  discountPercent: 20,
  label: '20% Convenio Clínicas'
}

vi.mock('../../services/api', () => ({
  fetchProducts: vi.fn().mockResolvedValue([
    {
      id: 'odon-101',
      name: 'Turbina Odontológica LED MasterTorque',
      category: 'Instruments',
      manufacturer: 'NSK',
      price: 189990,
      rating: 4.9,
      reviewsCount: 86,
      inStock: true,
      stockCount: 10,
      prescriptionRequired: false,
      tag: 'Más Vendido',
      description: 'Pieza de mano de alta velocidad',
      specs: ['420.000 RPM'],
      placeholderTheme: 'gradient-teal',
      mediaBadge: 'LED',
      images: [],
      packageContents: ['1x Turbina']
    }
  ]),
  validatePromo: vi.fn().mockResolvedValue({ success: false })
}))

import App from '../../App'

describe('App Shopping Cart Persistence (localStorage)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    window.localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('should hydrate cart items and applied promo code from localStorage on mount', async () => {
    saveCartToStorage([{ product: MOCK_STORE_PRODUCT, quantity: 3 }], MOCK_PROMO)

    render(<App />)

    const cartButton = screen.getByLabelText('Abrir Carro de Compras')
    expect(cartButton.querySelector('.cart-count-badge')).toHaveTextContent('3')

    // Open cart drawer
    fireEvent.click(cartButton)

    await waitFor(() => {
      expect(screen.getByText('Turbina Odontológica LED MasterTorque')).toBeInTheDocument()
      expect(screen.getByText(/20% Convenio Clínicas/i)).toBeInTheDocument()
    })
  })

  it('should clear localStorage when order succeeds via Mercado Pago return flow', async () => {
    saveCartToStorage([{ product: MOCK_STORE_PRODUCT, quantity: 2 }], null)
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull()

    window.history.replaceState({}, '', '/?status=approved&orderId=PRONTO-SUCCESS123')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('¡Pago Confirmado Exitosamente!')).toBeInTheDocument()
    })

    // localStorage should be cleared on success
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
  })

  it('should revalidate cart against live catalog stock on mount and display toast alert', async () => {
    // Saved cart has 15 units of MOCK_STORE_PRODUCT (whose catalog stockCount is 10)
    saveCartToStorage([{ product: MOCK_STORE_PRODUCT, quantity: 15 }], null)

    render(<App />)

    // Stock should be clamped down to 10
    const cartButton = screen.getByLabelText('Abrir Carro de Compras')
    await waitFor(() => {
      expect(cartButton.querySelector('.cart-count-badge')).toHaveTextContent('10')
      expect(screen.getByText(/Se actualizó el carro según el stock disponible en bodega/i)).toBeInTheDocument()
    })
  })
})
