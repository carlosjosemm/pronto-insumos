import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  describe('search submit & clear affordances (Task 2.7)', () => {
    it('should wrap the desktop search input in a form[role=search] and submit via Enter', () => {
      const onSearchSubmit = vi.fn()
      const { container } = render(<Navbar {...defaultProps} onSearchSubmit={onSearchSubmit} />)

      const form = container.querySelector('.nav-search')
      expect(form?.tagName).toBe('FORM')
      expect(form).toHaveAttribute('role', 'search')

      const input = screen.getByLabelText('Buscar en el catálogo') as HTMLInputElement
      input.focus()
      fireEvent.submit(form!)

      expect(onSearchSubmit).toHaveBeenCalledTimes(1)
      expect(document.activeElement).not.toBe(input)
    })

    it('should submit via the visible search button (exact label "Buscar")', () => {
      const onSearchSubmit = vi.fn()
      const { container } = render(<Navbar {...defaultProps} onSearchSubmit={onSearchSubmit} />)

      // Scope to the desktop bar: the mobile bar renders an identical button
      const submitBtn = container.querySelector('.nav-search .nav-search-submit') as HTMLElement
      expect(submitBtn).toHaveAttribute('aria-label', 'Buscar')
      fireEvent.click(submitBtn)

      expect(onSearchSubmit).toHaveBeenCalledTimes(1)
    })

    it('should hide the clear button when search is empty and show it when non-empty', () => {
      const { rerender } = render(<Navbar {...defaultProps} search="" />)
      expect(screen.queryByLabelText('Limpiar búsqueda')).not.toBeInTheDocument()

      rerender(<Navbar {...defaultProps} search="turbina" />)
      expect(screen.getAllByLabelText('Limpiar búsqueda').length).toBe(2) // desktop + mobile
    })

    it('should clear the search and refocus the input when the clear button is clicked', () => {
      const setSearch = vi.fn()
      const { container } = render(<Navbar {...defaultProps} search="turbina" setSearch={setSearch} />)

      const desktopClear = container.querySelector('.nav-search .nav-search-clear') as HTMLElement
      fireEvent.click(desktopClear)

      expect(setSearch).toHaveBeenCalledWith('')
      const input = screen.getByLabelText('Buscar en el catálogo')
      expect(document.activeElement).toBe(input)
    })

    it('should submit the mobile search form identically', () => {
      const onSearchSubmit = vi.fn()
      const { container } = render(<Navbar {...defaultProps} onSearchSubmit={onSearchSubmit} />)

      const mobileForm = container.querySelector('.nav-search-mobile')
      expect(mobileForm?.tagName).toBe('FORM')
      fireEvent.submit(mobileForm!)

      expect(onSearchSubmit).toHaveBeenCalledTimes(1)
    })

    it('should keep live filtering on typing (setSearch called per change, no double path)', () => {
      const setSearch = vi.fn()
      render(<Navbar {...defaultProps} setSearch={setSearch} />)

      fireEvent.change(screen.getByLabelText('Buscar en el catálogo'), { target: { value: 'resina' } })

      expect(setSearch).toHaveBeenCalledWith('resina')
    })

    it('should still call onSearchSubmit when submitting an empty search (scroll-to-catalog is harmless)', () => {
      const onSearchSubmit = vi.fn()
      const { container } = render(<Navbar {...defaultProps} search="" onSearchSubmit={onSearchSubmit} />)

      fireEvent.submit(container.querySelector('.nav-search')!)

      expect(onSearchSubmit).toHaveBeenCalledTimes(1)
    })
  })
})
