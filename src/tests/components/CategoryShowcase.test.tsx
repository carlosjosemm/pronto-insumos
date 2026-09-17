import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import CategoryShowcase, { CATEGORY_BANNERS } from '../../components/CategoryShowcase'

describe('CategoryShowcase Component (Section 5.4 Category Assets)', () => {
  it('should render all 4 delivered category showcase cards when selectedCategory is "all"', () => {
    const onSelect = vi.fn()
    render(<CategoryShowcase selectedCategory="all" onSelectCategory={onSelect} />)

    expect(screen.getByText('Líneas Clínicas Especializadas')).toBeInTheDocument()
    expect(screen.getByText('Instrumental Quirúrgico y Rotatorio')).toBeInTheDocument()
    expect(screen.getByText('Operatoria y Materiales Restauradores')).toBeInTheDocument()
    expect(screen.getByText('Esterilización, Bioseguridad y Pabellón')).toBeInTheDocument()
    expect(screen.getByText('Endodoncia y Diagnóstico Clínico')).toBeInTheDocument()

    // Clicking a category card should invoke onSelectCategory
    const instrumentalCard = screen.getByTitle(/Filtrar por Instrumental Quirúrgico y Rotatorio/i)
    fireEvent.click(instrumentalCard)
    expect(onSelect).toHaveBeenCalledWith('INSTRUMENTAL Y ACCESORIOS')
  })

  it('should render the contextual category banner when a specific category is active', () => {
    const onSelect = vi.fn()
    render(
      <CategoryShowcase
        selectedCategory="OPERATORIA"
        onSelectCategory={onSelect}
      />
    )

    expect(screen.getByText('Operatoria y Materiales Restauradores')).toBeInTheDocument()
    expect(screen.getByText(/Resinas nanohíbridas de alta estética/i)).toBeInTheDocument()
    expect(screen.getByText('Estética & Adhesión Clínica')).toBeInTheDocument()

    // Clicking "Ver todas las categorías" resets filter
    const resetBtn = screen.getByText('Ver todas las categorías')
    fireEvent.click(resetBtn)
    expect(onSelect).toHaveBeenCalledWith('all')
  })
})
