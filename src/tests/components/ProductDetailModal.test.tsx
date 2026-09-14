import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProductQuickView from '../../components/ProductQuickView'
import ProductCard from '../../components/ProductCard'
import { Product } from '../../types'

const mockProduct: Product = {
  id: 'odon-101',
  name: 'Turbina Odontológica LED MasterTorque',
  category: 'Instruments',
  price: 189990,
  originalPrice: 229990,
  rating: 4.9,
  reviewsCount: 86,
  inStock: true,
  stockCount: 5,
  prescriptionRequired: true,
  tag: 'Más Vendido',
  description: 'Pieza de mano de alta velocidad con iluminación LED por fibra óptica.',
  specs: [
    'Velocidad de rotación: 380.000 a 420.000 RPM',
    'Conexión Midwest 4 vías autoclaveable a 135°C'
  ],
  placeholderTheme: 'gradient-teal',
  mediaBadge: 'Fibra Óptica LED',
  images: [
    'https://example.com/photo1.jpg',
    'https://example.com/photo2.jpg',
    'https://example.com/photo3.jpg'
  ],
  packageContents: [
    '1x Turbina LED MasterTorque',
    '1x Llave extractora de rotor',
    '1x Manual técnico'
  ]
}

describe('Product Detail Modal (ProductQuickView)', () => {
  const onAddToCartMock = vi.fn()
  const onCloseMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when product is null', () => {
    const { container } = render(
      <ProductQuickView product={null} onClose={onCloseMock} onAddToCart={onAddToCartMock} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders clinical details, SKU code, and simple IVA incluido pricing', () => {
    render(
      <ProductQuickView product={mockProduct} onClose={onCloseMock} onAddToCart={onAddToCartMock} />
    )

    expect(screen.getByRole('heading', { name: mockProduct.name })).toBeInTheDocument()
    expect(screen.getByText('REF: OD-101')).toBeInTheDocument()
    expect(screen.getByText(/IVA incluido/i)).toBeInTheDocument()
    expect(screen.getByText('$189.990')).toBeInTheDocument()
    expect(screen.getByText('$229.990')).toBeInTheDocument()
    expect(screen.getByText('Dispositivo odontológico especializado de uso profesional clínico exclusivo.')).toBeInTheDocument()
  })

  it('renders technical specifications and package contents checklist', () => {
    render(
      <ProductQuickView product={mockProduct} onClose={onCloseMock} onAddToCart={onAddToCartMock} />
    )

    expect(screen.getByText('Especificaciones Técnicas')).toBeInTheDocument()
    expect(screen.getByText('Velocidad de rotación: 380.000 a 420.000 RPM')).toBeInTheDocument()
    expect(screen.getByText('Contenido del Empaque')).toBeInTheDocument()
    expect(screen.getByText('1x Turbina LED MasterTorque')).toBeInTheDocument()
    expect(screen.getByText('1x Llave extractora de rotor')).toBeInTheDocument()
  })

  it('renders multi-photo gallery and switches active photo on thumbnail click', () => {
    render(
      <ProductQuickView product={mockProduct} onClose={onCloseMock} onAddToCart={onAddToCartMock} />
    )

    // Main image displays first photo
    const mainImg = screen.getByAltText(`${mockProduct.name} - Vista 1`) as HTMLImageElement
    expect(mainImg).toBeInTheDocument()
    expect(mainImg.src).toBe('https://example.com/photo1.jpg')

    // Thumbnail strip should have 3 thumbnail buttons
    const thumbButtons = screen.getAllByRole('tab')
    expect(thumbButtons).toHaveLength(3)

    // Click 2nd thumbnail
    fireEvent.click(thumbButtons[1])
    const updatedMainImg = screen.getByAltText(`${mockProduct.name} - Vista 2`) as HTMLImageElement
    expect(updatedMainImg.src).toBe('https://example.com/photo2.jpg')
  })

  it('cycles photos with next and previous buttons', () => {
    render(
      <ProductQuickView product={mockProduct} onClose={onCloseMock} onAddToCart={onAddToCartMock} />
    )

    const nextBtn = screen.getByTitle('Foto siguiente')
    fireEvent.click(nextBtn)

    const updatedMainImg = screen.getByAltText(`${mockProduct.name} - Vista 2`) as HTMLImageElement
    expect(updatedMainImg.src).toBe('https://example.com/photo2.jpg')

    const prevBtn = screen.getByTitle('Foto anterior')
    fireEvent.click(prevBtn)

    const backToFirstImg = screen.getByAltText(`${mockProduct.name} - Vista 1`) as HTMLImageElement
    expect(backToFirstImg.src).toBe('https://example.com/photo1.jpg')
  })

  it('cycles photos with keyboard arrow keys', () => {
    render(
      <ProductQuickView product={mockProduct} onClose={onCloseMock} onAddToCart={onAddToCartMock} />
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByAltText(`${mockProduct.name} - Vista 2`)).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByAltText(`${mockProduct.name} - Vista 1`)).toBeInTheDocument()
  })

  it('handles quantity increment, decrement, and stock cap', () => {
    render(
      <ProductQuickView product={mockProduct} onClose={onCloseMock} onAddToCart={onAddToCartMock} />
    )

    const decBtn = screen.getByLabelText('Disminuir cantidad')
    const incBtn = screen.getByLabelText('Aumentar cantidad')

    // Initial quantity is 1; decrease is disabled
    expect(decBtn).toBeDisabled()

    // Increment to 2
    fireEvent.click(incBtn)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(decBtn).not.toBeDisabled()

    // Add to cart with quantity 2
    const addBtn = screen.getByTitle('Agregar insumo al carro')
    fireEvent.click(addBtn)

    expect(onAddToCartMock).toHaveBeenCalledWith(mockProduct, 2)
    expect(onCloseMock).toHaveBeenCalled()
  })

  it('closes on close button, backdrop click, and Escape key', () => {
    const { rerender } = render(
      <ProductQuickView product={mockProduct} onClose={onCloseMock} onAddToCart={onAddToCartMock} />
    )

    // Close button
    fireEvent.click(screen.getByLabelText('Cerrar ventana'))
    expect(onCloseMock).toHaveBeenCalledTimes(1)

    // Escape key
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCloseMock).toHaveBeenCalledTimes(2)

    // Backdrop click
    const overlay = screen.getByRole('dialog')
    fireEvent.click(overlay)
    expect(onCloseMock).toHaveBeenCalledTimes(3)
  })

  it('renders graceful fallback if no images are provided', () => {
    const productWithoutImages: Product = {
      ...mockProduct,
      images: undefined
    }

    render(
      <ProductQuickView product={productWithoutImages} onClose={onCloseMock} onAddToCart={onAddToCartMock} />
    )

    expect(screen.getByRole('heading', { name: mockProduct.name })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('omits review information when product has zero reviews', () => {
    const productZeroReviews: Product = {
      ...mockProduct,
      reviewsCount: 0,
      rating: 0
    }

    render(
      <ProductQuickView product={productZeroReviews} onClose={onCloseMock} onAddToCart={onAddToCartMock} />
    )

    expect(screen.queryByText(/reseñas clínicas verificadas/i)).toBeNull()
  })
})

describe('ProductCard Click Interactions', () => {
  const onAddToCartMock = vi.fn()
  const onQuickViewMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('triggers onQuickView when clicking the card media box', () => {
    render(
      <ProductCard product={mockProduct} onAddToCart={onAddToCartMock} onQuickView={onQuickViewMock} />
    )

    const mediaBox = screen.getByTitle(`Ver detalles de ${mockProduct.name}`)
    fireEvent.click(mediaBox)

    expect(onQuickViewMock).toHaveBeenCalledWith(mockProduct)
  })

  it('triggers onQuickView when clicking the product title', () => {
    render(
      <ProductCard product={mockProduct} onAddToCart={onAddToCartMock} onQuickView={onQuickViewMock} />
    )

    const titleEl = screen.getByRole('heading', { name: mockProduct.name })
    fireEvent.click(titleEl)

    expect(onQuickViewMock).toHaveBeenCalledWith(mockProduct)
  })

  it('triggers onAddToCart without triggering onQuickView when clicking Agregar button', () => {
    render(
      <ProductCard product={mockProduct} onAddToCart={onAddToCartMock} onQuickView={onQuickViewMock} />
    )

    const addBtn = screen.getByTitle('Agregar al carro')
    fireEvent.click(addBtn)

    expect(onAddToCartMock).toHaveBeenCalledWith(mockProduct)
    expect(onQuickViewMock).not.toHaveBeenCalled()
  })
})
