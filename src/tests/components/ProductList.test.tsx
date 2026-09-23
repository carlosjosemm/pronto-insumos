import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import ProductList from '../../components/ProductList'

const noop = () => {}

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
