import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import CategoryShowcase from '../../components/CategoryShowcase'

describe('CategoryShowcase Component (Section 5.4 Category Assets)', () => {
  it('should render all 4 delivered category showcase cards when selectedCategory is "all"', () => {
    const onSelect = vi.fn()
    const { container } = render(<CategoryShowcase selectedCategory="all" onSelectCategory={onSelect} />)

    expect(screen.getByText('Líneas Clínicas Especializadas')).toBeInTheDocument()
    expect(screen.getByText('Instrumental Quirúrgico y Rotatorio')).toBeInTheDocument()
    expect(screen.getByText('Operatoria y Materiales Restauradores')).toBeInTheDocument()
    expect(screen.getByText('Esterilización, Bioseguridad y Pabellón')).toBeInTheDocument()
    expect(screen.getByText('Endodoncia y Diagnóstico Clínico')).toBeInTheDocument()

    // The hub is unboxed and the per-card tag pill overlay is gone (§10.4)
    expect(container.querySelectorAll('.category-card-tag-pill')).toHaveLength(0)

    // Clicking a category card should invoke onSelectCategory
    const instrumentalCard = screen.getByRole('button', { name: /Instrumental Quirúrgico y Rotatorio/i })
    fireEvent.click(instrumentalCard)
    expect(onSelect).toHaveBeenCalledWith('INSTRUMENTAL Y ACCESORIOS')
  })

  it('should select a category when the showcase card is activated from the keyboard', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<CategoryShowcase selectedCategory="all" onSelectCategory={onSelect} />)

    const operatoriaCard = screen.getByRole('button', { name: /Operatoria y Materiales Restauradores/i })
    operatoriaCard.focus()
    expect(operatoriaCard).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('OPERATORIA')
  })

  it('should render nothing when the active category has no showcase banner', () => {
    const { container } = render(<CategoryShowcase selectedCategory="HIGIENE BUCAL" onSelectCategory={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('should render the contextual category banner when a specific category is active', () => {
    const onSelect = vi.fn()
    render(<CategoryShowcase selectedCategory="OPERATORIA" onSelectCategory={onSelect} />)

    expect(screen.getByText('Operatoria y Materiales Restauradores')).toBeInTheDocument()
    expect(screen.getByText(/Resinas nanohíbridas de alta estética/i)).toBeInTheDocument()
    expect(screen.getByText('Estética & Adhesión Clínica')).toBeInTheDocument()

    // Clicking "Ver todas las categorías" resets filter
    const resetBtn = screen.getByText('Ver todas las categorías')
    fireEvent.click(resetBtn)
    expect(onSelect).toHaveBeenCalledWith('all')
  })
})
