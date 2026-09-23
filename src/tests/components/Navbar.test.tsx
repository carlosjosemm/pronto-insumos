import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import Navbar from '../../components/Navbar'

describe('Navbar component', () => {
  const defaultProps = {
    search: '',
    setSearch: () => {},
    cartCount: 0,
    onOpenCart: () => {}
  }

  it('should render the brand name "PRONTO"', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByText('PRONTO')).toBeInTheDocument()
  })

  it('should render the canonical brand descriptor "INSUMOS ODONTOLÓGICOS"', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByText('INSUMOS ODONTOLÓGICOS')).toBeInTheDocument()
    // The retired 'ODONTOLOGÍA' sticker must not come back
    expect(screen.queryByText('ODONTOLOGÍA')).not.toBeInTheDocument()
  })

  it('should expose the wordmark lockup as a labelled link and not as an image', () => {
    const { container } = render(<Navbar {...defaultProps} />)
    expect(screen.getByRole('link', { name: 'PRONTO Insumos Odontológicos' })).toBeInTheDocument()
    expect(container.querySelector('.brand-underline')).toBeInTheDocument()
    expect(container.querySelector('.brand-logo img')).toBeNull()
  })

  it('should render a desktop search input', () => {
    render(<Navbar {...defaultProps} />)
    const inputs = screen.getAllByPlaceholderText(/buscar/i)
    expect(inputs.length).toBeGreaterThanOrEqual(1)
  })

  it('should render a cart button with label', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByLabelText('Abrir Carro de Compras')).toBeInTheDocument()
  })

  it('should NOT show cart badge when count is 0', () => {
    render(<Navbar {...defaultProps} cartCount={0} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('should show cart badge with correct count when > 0', () => {
    render(<Navbar {...defaultProps} cartCount={5} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('should display "Melipilla · San Antonio" trust badge', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByText('Melipilla · San Antonio')).toBeInTheDocument()
  })

  it('should render the mobile utility row with the phone and tracking actions', () => {
    const { container } = render(<Navbar {...defaultProps} onOpenTracking={() => {}} />)
    const row = container.querySelector('.nav-mobile-utility')
    expect(row).toBeInTheDocument()
    expect(screen.getByText('Mesa Clínica')).toBeInTheDocument()
    expect(screen.getByText('Seguimiento')).toBeInTheDocument()
  })

  it('should omit the mobile tracking action when no tracking handler is provided', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByText('Mesa Clínica')).toBeInTheDocument()
    expect(screen.queryByText('Seguimiento')).not.toBeInTheDocument()
  })

  it('should pulse cart badge when count increases', () => {
    const { rerender } = render(<Navbar {...defaultProps} cartCount={1} />)
    expect(screen.getByText('1')).not.toHaveClass('cart-count-badge--pulse')

    rerender(<Navbar {...defaultProps} cartCount={2} />)
    expect(screen.getByText('2')).toHaveClass('cart-count-badge--pulse')
  })

  it('should NOT pulse cart badge when count decreases', () => {
    const { rerender } = render(<Navbar {...defaultProps} cartCount={2} />)
    rerender(<Navbar {...defaultProps} cartCount={1} />)
    expect(screen.getByText('1')).not.toHaveClass('cart-count-badge--pulse')
  })
})
