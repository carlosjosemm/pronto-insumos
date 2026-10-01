import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'
import { Product } from '../../types'

const { CATALOG, makeProduct, fetchProductsMock } = vi.hoisted(() => {
  const make = (id: string, category: string) => ({
    id,
    name: `Insumo ${id}`,
    category,
    price: 1000,
    rating: 0,
    reviewsCount: 0,
    inStock: true,
    stockCount: 10,
    prescriptionRequired: false,
    tag: '',
    description: 'Descripción de prueba',
    specs: [] as string[],
    placeholderTheme: 'gradient-indigo'
  })

  return {
    CATALOG: [
      make('pronto-001', 'INSTRUMENTAL Y ACCESORIOS'),
      make('pronto-002', 'INSTRUMENTAL Y ACCESORIOS'),
      make('pronto-003', 'OPERATORIA'),
      make('pronto-004', 'ENDODONCIA')
    ],
    makeProduct: make,
    fetchProductsMock: vi.fn()
  }
})

vi.mock('../../services/api', () => ({
  fetchProducts: fetchProductsMock,
  invalidateCatalogCache: vi.fn(),
  validatePromo: vi.fn().mockResolvedValue({ success: false })
}))

import App from '../../App'

const pillCount = (name: string): string => {
  const pill = screen.getByRole('tab', { name: new RegExp(name, 'i') })
  return pill.querySelector('.category-pill-count')?.textContent ?? ''
}

describe('App catalog wiring (Task 2.11)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
    fetchProductsMock.mockResolvedValue({ source: 'firestore', catalog: CATALOG, products: CATALOG })
  })

  afterEach(() => {
    window.localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('keeps the category pill counts on the full catalog when a filter is applied (review F1)', async () => {
    render(<App />)

    await waitFor(() => {
      expect(pillCount('Instrumental')).toBe('2')
    })
    expect(pillCount('Operatoria')).toBe('1')

    // The service returns the filtered view in `products` and the unfiltered set in
    // `catalog`; selecting a category must not zero the other pills.
    fetchProductsMock.mockResolvedValue({
      source: 'firestore',
      catalog: CATALOG,
      products: [makeProduct('pronto-001', 'INSTRUMENTAL Y ACCESORIOS') as Product]
    })
    fireEvent.click(screen.getByRole('tab', { name: /Instrumental/i }))

    await waitFor(() => {
      expect(screen.getByText(/Mostrando/)).toBeInTheDocument()
    })
    expect(pillCount('Instrumental')).toBe('2')
    expect(pillCount('Operatoria')).toBe('1')
    expect(pillCount('Endodoncia')).toBe('1')
  })

  it('shows the retryable catalog error when the fetch throws unexpectedly (review F5)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchProductsMock.mockRejectedValue(new Error('malformed catalog document'))

    render(<App />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /No pudimos cargar el catálogo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument()
    expect(screen.queryByText('No se encontraron insumos odontológicos')).toBeNull()
  })
})
