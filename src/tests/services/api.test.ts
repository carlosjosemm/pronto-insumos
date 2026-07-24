import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Firebase entirely before importing api.ts
vi.mock('../../services/firebase', () => ({
  db: {}
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  doc: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => 'mock-timestamp')
}))

import { fetchProducts, validatePromo } from '../../services/api'
import { PRODUCTS } from '../../data/products'

describe('fetchProducts - filtering', () => {
  it('should return all products when no filters applied', async () => {
    const result = await fetchProducts()
    expect(result.length).toBe(PRODUCTS.length)
  })

  it('should filter by category "Instruments"', async () => {
    const result = await fetchProducts({ category: 'Instruments' })
    expect(result.length).toBeGreaterThan(0)
    for (const p of result) {
      expect(p.category.toLowerCase()).toBe('instruments')
    }
  })

  it('should filter by category "Materials"', async () => {
    const result = await fetchProducts({ category: 'Materials' })
    expect(result.length).toBeGreaterThan(0)
    for (const p of result) {
      expect(p.category.toLowerCase()).toBe('materials')
    }
  })

  it('should return all products when category is "all"', async () => {
    const result = await fetchProducts({ category: 'all' })
    expect(result.length).toBe(PRODUCTS.length)
  })

  it('should return no products for a non-existent category', async () => {
    const result = await fetchProducts({ category: 'NonExistent' })
    expect(result.length).toBe(0)
  })

  it('should filter by search term matching product name', async () => {
    const result = await fetchProducts({ search: 'turbina' })
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].name.toLowerCase()).toContain('turbina')
  })

  it('should filter by search term matching description', async () => {
    const result = await fetchProducts({ search: 'fotocurado' })
    expect(result.length).toBeGreaterThan(0)
  })

  it('should return no products for an unmatched search', async () => {
    const result = await fetchProducts({ search: 'xyznonexistenttermxyz' })
    expect(result.length).toBe(0)
  })

  it('should filter by inStockOnly', async () => {
    const result = await fetchProducts({ inStockOnly: true })
    for (const p of result) {
      expect(p.inStock).toBe(true)
    }
  })

  it('should combine category and search filters', async () => {
    const result = await fetchProducts({ category: 'Instruments', search: 'turbina' })
    expect(result.length).toBeGreaterThan(0)
    for (const p of result) {
      expect(p.category.toLowerCase()).toBe('instruments')
      expect(p.name.toLowerCase()).toContain('turbina')
    }
  })
})

describe('fetchProducts - sorting', () => {
  it('should sort by price low to high', async () => {
    const result = await fetchProducts({ sortBy: 'price-low' })
    for (let i = 1; i < result.length; i++) {
      expect(result[i].price).toBeGreaterThanOrEqual(result[i - 1].price)
    }
  })

  it('should sort by price high to low', async () => {
    const result = await fetchProducts({ sortBy: 'price-high' })
    for (let i = 1; i < result.length; i++) {
      expect(result[i].price).toBeLessThanOrEqual(result[i - 1].price)
    }
  })

  it('should sort by rating descending', async () => {
    const result = await fetchProducts({ sortBy: 'rating' })
    for (let i = 1; i < result.length; i++) {
      expect(result[i].rating).toBeLessThanOrEqual(result[i - 1].rating)
    }
  })

  it('should sort by reviews descending', async () => {
    const result = await fetchProducts({ sortBy: 'reviews' })
    for (let i = 1; i < result.length; i++) {
      expect(result[i].reviewsCount).toBeLessThanOrEqual(result[i - 1].reviewsCount)
    }
  })
})

describe('validatePromo', () => {
  it('should accept PRONTO10 and return 10% discount', async () => {
    const result = await validatePromo('PRONTO10')
    expect(result.success).toBe(true)
    expect(result.promo?.discountPercent).toBe(10)
    expect(result.promo?.code).toBe('PRONTO10')
  })

  it('should accept DENT20 and return 20% discount', async () => {
    const result = await validatePromo('DENT20')
    expect(result.success).toBe(true)
    expect(result.promo?.discountPercent).toBe(20)
  })

  it('should be case-insensitive (accept lowercase)', async () => {
    const result = await validatePromo('pronto10')
    expect(result.success).toBe(true)
  })

  it('should trim whitespace around the code', async () => {
    const result = await validatePromo('  DENT20  ')
    expect(result.success).toBe(true)
  })

  it('should reject an invalid promo code', async () => {
    const result = await validatePromo('INVALIDCODE')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('should reject an empty string', async () => {
    const result = await validatePromo('')
    expect(result.success).toBe(false)
  })
})
