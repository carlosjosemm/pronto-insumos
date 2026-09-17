import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import ProductCard from '../../components/ProductCard'
import { Product } from '../../types'

const mockProduct: Product = {
  id: 'odon-test-001',
  name: 'Autoclave Clase B 18L SterilMax',
  category: 'Sterilization',
  manufacturer: 'SterilMax',
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

  it('should render empty rating placeholder when product has zero reviews', () => {
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
    expect(screen.getByText('Sin reseñas aún')).toBeInTheDocument()
  })

  it('should render discount badge when originalPrice exists and is greater than price', () => {
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.getByText('-18%')).toBeInTheDocument()
  })

  it('should NOT render discount badge when no originalPrice', () => {
    const productNoDiscount = {
      ...mockProduct,
      originalPrice: undefined
    }
    render(
      <ProductCard
        product={productNoDiscount}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.queryByText(/-\d+%/)).toBeNull()
  })

  it('should NOT render discount badge when originalPrice <= price', () => {
    const productSurgePrice = {
      ...mockProduct,
      originalPrice: 800000,
      price: 899000
    }
    render(
      <ProductCard
        product={productSurgePrice}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.queryByText(/-\d+%/)).toBeNull()
  })

  it('should render manufacturer line when manufacturer is provided', () => {
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.getByText('Sterilization · SterilMax')).toBeInTheDocument()
  })

  it('should omit manufacturer line when manufacturer is undefined', () => {
    const productNoMfr = {
      ...mockProduct,
      manufacturer: undefined
    }
    render(
      <ProductCard
        product={productNoMfr}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.queryByText(/Sterilization ·/)).toBeNull()
  })

  it('should render low-stock warning when stockCount <= 5', () => {
    render(
      <ProductCard
        product={mockProduct}
        onAddToCart={() => {}}
        onQuickView={() => {}}
      />
    )
    expect(screen.getByText('Últimas 4 unid.')).toBeInTheDocument()
  })
})
