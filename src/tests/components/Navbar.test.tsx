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

  it('should render the brand badge "ODONTOLOGÍA"', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByText('ODONTOLOGÍA')).toBeInTheDocument()
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

  it('should display "Melipilla & RM" trust badge', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByText('Melipilla & RM')).toBeInTheDocument()
  })
})
