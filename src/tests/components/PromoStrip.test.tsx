import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import PromoStrip from '../../components/PromoStrip'

describe('PromoStrip Component (Section 5.2)', () => {
  it('should render the brand slogan and commercial value propositions', () => {
    render(<PromoStrip />)
    expect(screen.getByText('Insumos a un click de distancia')).toBeInTheDocument()
    expect(screen.getByText('Despacho Express Melipilla y RM')).toBeInTheDocument()
    expect(screen.getByText('Factura Electrónica SII · 19% IVA')).toBeInTheDocument()
  })

  it('should have proper accessible container labeling', () => {
    render(<PromoStrip />)
    const aside = screen.getByRole('complementary')
    expect(aside).toHaveAttribute('aria-label', 'Beneficios y propuesta de valor comercial')
  })
})
