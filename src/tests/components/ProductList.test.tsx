import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import ProductList from '../../components/ProductList'
import { Product } from '../../types'

const noop = () => {}

const makeProduct = (id: string): Product => ({
  id,
  name: `Insumo ${id}`,
  category: 'BIOSEGURIDAD',
  price: 1000,
  rating: 5,
  reviewsCount: 1,
  inStock: true,
  stockCount: 10,
  prescriptionRequired: false,
  tag: '',
  description: 'Descripción de prueba',
  specs: [],
  placeholderTheme: 'gradient-indigo'
})

const makeProducts = (count: number): Product[] =>
  Array.from({ length: count }, (_, i) => makeProduct(`pronto-${String(i + 1).padStart(3, '0')}`))

describe('ProductList loading state (D.8)', () => {
  it('should render skeleton cards with an accessible loading label', () => {
    const { container } = render(<ProductList products={[]} loading onAddToCart={noop} onQuickView={noop} />)

    expect(screen.getByText('Cargando catálogo')).toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(container.querySelectorAll('.skeleton-card')).toHaveLength(8)
    expect(container.querySelectorAll('.skeleton-media')).toHaveLength(8)
    expect(container.querySelectorAll('.skeleton-line')).toHaveLength(24)
  })

  it('should not bring back the retired emoji loader', () => {
    const { container } = render(<ProductList products={[]} loading onAddToCart={noop} onQuickView={noop} />)

    expect(container.textContent).not.toContain('⏳')
    expect(screen.queryByText(/Cargando catálogo de insumos odontológicos/)).toBeNull()
  })

  it('should render the empty state when not loading and there are no results', () => {
    render(<ProductList products={[]} loading={false} onAddToCart={noop} onQuickView={noop} />)

    expect(screen.getByText('No se encontraron insumos odontológicos')).toBeInTheDocument()
    expect(screen.queryByText('Cargando catálogo')).toBeNull()
  })
})

describe('ProductList progressive reveal (Task 8.7)', () => {
  it('mounts only the first page of cards on initial render', () => {
    const { container } = render(
      <ProductList products={makeProducts(40)} loading={false} onAddToCart={noop} onQuickView={noop} />
    )

    expect(container.querySelectorAll('.product-card-entrance')).toHaveLength(16)
    expect(screen.getByText('Mostrando 16 de 40')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cargar más insumos/ })).toBeInTheDocument()
  })

  it('reveals exactly one additional page per click', () => {
    const { container } = render(
      <ProductList products={makeProducts(40)} loading={false} onAddToCart={noop} onQuickView={noop} />
    )

    fireEvent.click(screen.getByRole('button', { name: /Cargar más insumos/ }))

    expect(container.querySelectorAll('.product-card-entrance')).toHaveLength(32)
    expect(screen.getByText('Mostrando 32 de 40')).toBeInTheDocument()
  })

  it('hides the button once the end of the list is reached', () => {
    const { container } = render(
      <ProductList products={makeProducts(40)} loading={false} onAddToCart={noop} onQuickView={noop} />
    )
    const loadMore = () => screen.getByRole('button', { name: /Cargar más insumos/ })

    fireEvent.click(loadMore())
    fireEvent.click(loadMore())

    expect(container.querySelectorAll('.product-card-entrance')).toHaveLength(40)
    expect(screen.queryByRole('button', { name: /Cargar más insumos/ })).toBeNull()
    expect(screen.queryByText(/Mostrando/)).toBeNull()
  })

  it('renders no reveal controls for catalogs shorter than one page', () => {
    const { container } = render(
      <ProductList products={makeProducts(10)} loading={false} onAddToCart={noop} onQuickView={noop} />
    )

    expect(container.querySelectorAll('.product-card-entrance')).toHaveLength(10)
    expect(screen.queryByRole('button', { name: /Cargar más insumos/ })).toBeNull()
    expect(screen.queryByText(/Mostrando/)).toBeNull()
  })

  it('resets to page 1 when the catalog controls change (key remount)', () => {
    const { container, rerender } = render(
      <ProductList
        key="all||featured|false"
        products={makeProducts(40)}
        loading={false}
        onAddToCart={noop}
        onQuickView={noop}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Cargar más insumos/ }))
    expect(container.querySelectorAll('.product-card-entrance')).toHaveLength(32)

    rerender(
      <ProductList
        key="ESTERILIZACION|autoclave|precio-asc|true"
        products={makeProducts(40)}
        loading={false}
        onAddToCart={noop}
        onQuickView={noop}
      />
    )

    expect(container.querySelectorAll('.product-card-entrance')).toHaveLength(16)
    expect(screen.getByText('Mostrando 16 de 40')).toBeInTheDocument()
  })

  it('does not remount already-revealed cards (entrance animation runs once per card)', () => {
    const { container } = render(
      <ProductList products={makeProducts(40)} loading={false} onAddToCart={noop} onQuickView={noop} />
    )

    const firstCardBefore = container.querySelector('.product-card-entrance')
    expect(firstCardBefore).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Cargar más insumos/ }))

    const firstCardAfter = container.querySelector('.product-card-entrance')
    expect(firstCardAfter).toBe(firstCardBefore)
  })

  it('never renders reveal controls while loading', () => {
    const { container } = render(
      <ProductList products={makeProducts(40)} loading onAddToCart={noop} onQuickView={noop} />
    )

    expect(screen.queryByRole('button', { name: /Cargar más insumos/ })).toBeNull()
    expect(screen.queryByText(/Mostrando/)).toBeNull()
    expect(container.querySelectorAll('.product-card-entrance')).toHaveLength(0)
  })

  it('preserves the incoming array order across reveals', () => {
    const { container } = render(
      <ProductList products={makeProducts(40)} loading={false} onAddToCart={noop} onQuickView={noop} />
    )

    fireEvent.click(screen.getByRole('button', { name: /Cargar más insumos/ }))

    const cards = container.querySelectorAll('.product-card-entrance')
    expect(cards).toHaveLength(32)
    // The slice must preserve the incoming array order — the caller owns any
    // in-stock-first partition, the list only windows it.
    expect(cards[0].textContent).toContain('Insumo pronto-001')
    expect(cards[16].textContent).toContain('Insumo pronto-017')
  })
})
