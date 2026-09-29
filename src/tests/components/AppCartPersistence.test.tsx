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
  fetchProducts: vi.fn().mockResolvedValue({
    source: 'firestore',
    catalog: [
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
    ],
    products: [
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
    ]
  }),
  validatePromo: vi.fn().mockResolvedValue({ success: false })
}))

import App from '../../App'
import { fetchProducts } from '../../services/api'

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

  it('keeps the saved cart intact when the catalog is unavailable (Task 2.11)', async () => {
    saveCartToStorage([{ product: MOCK_STORE_PRODUCT, quantity: 3 }], null)
    vi.mocked(fetchProducts).mockResolvedValue({
      products: [],
      catalog: [],
      source: 'unavailable',
      error: 'No pudimos cargar el catálogo de insumos. Revisa tu conexión y reintenta.'
    })

    render(<App />)

    const cartButton = screen.getByLabelText('Abrir Carro de Compras')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /No pudimos cargar el catálogo/i })).toBeInTheDocument()
    })

    // The cart must not be emptied, re-priced or reported as "updated" from a catalog
    // the storefront could not load — the regression this task exists for.
    expect(cartButton.querySelector('.cart-count-badge')).toHaveTextContent('3')
    expect(screen.queryByText(/Se actualizó el carro/i)).not.toBeInTheDocument()
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull()
  })

  it('never revalidates the cart from the fixture fallback catalog (Task 2.11)', async () => {
    saveCartToStorage([{ product: MOCK_STORE_PRODUCT, quantity: 4 }], null)
    // A realistic fallback: the prototype catalog is non-empty (11 `odon-*` items) and
    // contains none of the saved `pronto-*` lines — which is exactly why revalidating
    // against it used to classify every saved line as discontinued and empty the cart.
    vi.mocked(fetchProducts).mockResolvedValue({
      source: 'fixtures',
      catalog: [
        { ...MOCK_STORE_PRODUCT, id: 'odon-201', name: 'Alginato Cromático' },
        { ...MOCK_STORE_PRODUCT, id: 'odon-301', name: 'Lámpara de Fotocurado' }
      ],
      products: [
        { ...MOCK_STORE_PRODUCT, id: 'odon-201', name: 'Alginato Cromático' },
        { ...MOCK_STORE_PRODUCT, id: 'odon-301', name: 'Lámpara de Fotocurado' }
      ]
    })

    render(<App />)

    const cartButton = screen.getByLabelText('Abrir Carro de Compras')
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /No pudimos cargar el catálogo/i })).not.toBeInTheDocument()
    })

    // Only the source matters — an allowed fixture fallback is still not authoritative.
    expect(cartButton.querySelector('.cart-count-badge')).toHaveTextContent('4')
    expect(screen.queryByText(/Se actualizó el carro/i)).not.toBeInTheDocument()
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull()
  })

  it('recovers on retry and revalidates against the live catalog afterwards (Task 2.11)', async () => {
    saveCartToStorage([{ product: MOCK_STORE_PRODUCT, quantity: 15 }], null)
    vi.mocked(fetchProducts)
      .mockResolvedValueOnce({
        products: [],
        catalog: [],
        source: 'unavailable',
        error: 'No pudimos cargar el catálogo de insumos. Revisa tu conexión y reintenta.'
      })
      .mockResolvedValueOnce({
        source: 'firestore',
        catalog: [{ ...MOCK_STORE_PRODUCT, stockCount: 10 }],
        products: [{ ...MOCK_STORE_PRODUCT, stockCount: 10 }]
      })

    render(<App />)

    const retryButton = await screen.findByRole('button', { name: /Reintentar/i })
    fireEvent.click(retryButton)

    // The failed load must not have consumed the one-shot revalidation: the retry
    // clamps 15 → 10 and shows the toast.
    const cartButton = screen.getByLabelText('Abrir Carro de Compras')
    await waitFor(() => {
      expect(cartButton.querySelector('.cart-count-badge')).toHaveTextContent('10')
      expect(screen.getByText(/Se actualizó el carro según el stock disponible en bodega/i)).toBeInTheDocument()
    })
  })
})
