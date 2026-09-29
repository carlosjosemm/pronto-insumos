import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import CategoryFilter from '../../components/CategoryFilter'
import { PRODUCTS } from '../../data/products'
import { Product } from '../../types'

const makeProduct = (id: string, category: string): Product => ({
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
  specs: [],
  placeholderTheme: 'gradient-indigo'
})

const renderFilter = (catalog: Product[]) =>
  render(
    <CategoryFilter
      selectedCategory="all"
      onSelectCategory={vi.fn()}
      sortBy="featured"
      onSortChange={vi.fn()}
      inStockOnly={false}
      onToggleInStock={vi.fn()}
      totalResults={catalog.length}
      catalog={catalog}
    />
  )

const pillCount = (name: string): string => {
  const pill = screen.getByRole('tab', { name: new RegExp(name, 'i') })
  return pill.querySelector('.category-pill-count')?.textContent ?? ''
}

describe('CategoryFilter pill counts (Task 2.11)', () => {
  it('counts the live catalog it is handed, never the prototype fixtures', () => {
    // Two live products in one real specialty. The prototype fixture catalog holds
    // three `odon-*` items in this same category, so the previous `products || PRODUCTS`
    // fallback would have rendered 3 here.
    renderFilter([
      makeProduct('pronto-001', 'INSTRUMENTAL Y ACCESORIOS'),
      makeProduct('pronto-002', 'INSTRUMENTAL Y ACCESORIOS')
    ])

    expect(pillCount('Instrumental')).toBe('2')
    expect(pillCount('Instrumental')).not.toBe(
      String(PRODUCTS.filter((p) => p.category === 'INSTRUMENTAL Y ACCESORIOS').length)
    )
  })

  it('reports zero counts when the catalog is empty, instead of falling back to fixtures', () => {
    renderFilter([])

    expect(pillCount('Instrumental')).toBe('0')
    expect(pillCount('Todos los Insumos')).toBe('0')
    // The canonical taxonomy still renders — it is a static storefront list, not fixture data.
    expect(screen.getAllByRole('tab').length).toBeGreaterThanOrEqual(6)
  })

  it('still surfaces catalog categories that are not in the canonical taxonomy', () => {
    renderFilter([makeProduct('pronto-900', 'ORTODONCIA')])

    expect(pillCount('Ortodoncia')).toBe('1')
  })
})
