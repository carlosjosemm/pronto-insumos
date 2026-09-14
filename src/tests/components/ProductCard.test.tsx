import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import ProductCard from '../../components/ProductCard'
import { Product } from '../../types'

const mockProduct: Product = {
  id: 'odon-test-001',
  name: 'Autoclave Clase B 18L SterilMax',
  category: 'Sterilization',
  price: 899000,
  originalPrice: 1100000,
  rating: 5.0,
  reviewsCount: 42,
  inStock: true,
  stockCount: 4,
  prescriptionRequired: false,
  tag: 'Normativa ISP',
  description: 'Esterilizador a vapor automático de vacío fraccionado.',
  specs: ['18 Litros', 'Bomba de vacío silenciosa', 'Impresora térmica'],
  placeholderTheme: 'gradient-indigo',
  mediaBadge: 'Clase B Vacío'
}

describe('ProductCard component', () => {
  it('should render the product name', () => {
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    const nameElements = screen.getAllByText('Autoclave Clase B 18L SterilMax')
    expect(nameElements.length).toBeGreaterThanOrEqual(1)
  })

  it('should render the current price formatted', () => {
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.getByText('$899.000')).toBeInTheDocument()
  })

  it('should render the original (strikethrough) price when present', () => {
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.getByText('$1.100.000')).toBeInTheDocument()
  })

  it('should render the product category', () => {
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.getByText('Sterilization')).toBeInTheDocument()
  })

  it('should render the product tag', () => {
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.getByText('Normativa ISP')).toBeInTheDocument()
  })

  it('should render the "Agregar" button', () => {
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.getByText('Agregar')).toBeInTheDocument()
  })

  it('should call onAddToCart when "Agregar" button is clicked', () => {
    const onAddToCart = vi.fn()
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={onAddToCart}
        onQuickView={() => {}}
      />
    )
    fireEvent.click(screen.getByText(/Agregar/i))
    expect(onAddToCart).toHaveBeenCalledTimes(1)
    expect(onAddToCart).toHaveBeenCalledWith(mockProduct)
  })

  it('should call onQuickView when product card is clicked', () => {
    const onQuickView = vi.fn()
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={() => {}}
        onQuickView={onQuickView}
      />
    )
    const card = screen.getByRole('article')
    fireEvent.click(card)
    expect(onQuickView).toHaveBeenCalledTimes(1)
    expect(onQuickView).toHaveBeenCalledWith(mockProduct)
  })

  it('should display the rating value', () => {
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    // Rating 5.0 is rendered as "5" in a styled span
    const ratingElements = screen.getAllByText('5')
    expect(ratingElements.length).toBeGreaterThanOrEqual(1)
  })

  it('should display the media badge text', () => {
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.getByText('Clase B Vacío')).toBeInTheDocument()
  })

  it('should omit rating section when product has zero reviews', () => {
    const productZeroReviews = {
      ...mockProduct,
      reviewsCount: 0,
      rating: 0
    }
    render(
      <ProductCard
        product={productZeroReviews}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.queryByText('(0)')).toBeNull()
  })
})
