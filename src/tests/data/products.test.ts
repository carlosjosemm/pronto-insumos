import { describe, it, expect } from 'vitest'
import { PRODUCTS, CATEGORIES, MOCK_PROMOS } from '../../data/products'

describe('PRODUCTS catalog data integrity', () => {
  it('should contain exactly 11 dental products', () => {
    expect(PRODUCTS).toHaveLength(11)
  })

  it('should contain items flagged with prescriptionRequired for ISP compliance', () => {
    const controlledItems = PRODUCTS.filter(p => p.prescriptionRequired)
    expect(controlledItems.length).toBeGreaterThanOrEqual(1)
  })

  it('every product should have all required fields', () => {
    const requiredFields = [
      'id', 'name', 'category', 'price', 'rating',
      'reviewsCount', 'inStock', 'stockCount', 'prescriptionRequired',
      'tag', 'description', 'specs', 'placeholderTheme', 'mediaBadge'
    ]

    for (const product of PRODUCTS) {
      for (const field of requiredFields) {
        expect(product).toHaveProperty(field)
      }
    }
  })

  it('every product should have a positive integer price', () => {
    for (const product of PRODUCTS) {
      expect(product.price).toBeGreaterThan(0)
      expect(Number.isInteger(product.price)).toBe(true)
    }
  })

  it('originalPrice should be greater than price and an integer when present', () => {
    for (const product of PRODUCTS) {
      if (product.originalPrice !== undefined) {
        expect(product.originalPrice).toBeGreaterThan(product.price)
        expect(Number.isInteger(product.originalPrice)).toBe(true)
      }
    }
  })

  it('every product should have a rating between 0 and 5', () => {
    for (const product of PRODUCTS) {
      expect(product.rating).toBeGreaterThanOrEqual(0)
      expect(product.rating).toBeLessThanOrEqual(5)
    }
  })

  it('every product should have at least 1 spec', () => {
    for (const product of PRODUCTS) {
      expect(product.specs.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('should have no duplicate product IDs', () => {
    const ids = PRODUCTS.map(p => p.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('every product category should be one of the defined categories', () => {
    const validCategories = CATEGORIES
      .filter(c => c.id !== 'all')
      .map(c => c.id as string)

    for (const product of PRODUCTS) {
      expect(validCategories).toContain(product.category)
    }
  })

  it('every defined category (except "all") should have at least one product', () => {
    const productCategories = new Set(PRODUCTS.map(p => p.category))
    for (const cat of CATEGORIES) {
      if (cat.id !== 'all') {
        expect(productCategories.has(cat.id)).toBe(true)
      }
    }
  })

  it('every product in the catalog should have a defined manufacturer', () => {
    for (const p of PRODUCTS) {
      expect(p.manufacturer).toBeDefined()
      expect(typeof p.manufacturer).toBe('string')
      expect(p.manufacturer!.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('CATEGORIES data integrity', () => {
  it('should include an "all" category', () => {
    const allCat = CATEGORIES.find(c => c.id === 'all')
    expect(allCat).toBeDefined()
  })

  it('every category should have a name and icon', () => {
    for (const cat of CATEGORIES) {
      expect(cat.name).toBeTruthy()
      expect(cat.icon).toBeTruthy()
    }
  })
})

describe('MOCK_PROMOS data integrity', () => {
  it('should have at least one promo code', () => {
    expect(Object.keys(MOCK_PROMOS).length).toBeGreaterThanOrEqual(1)
  })

  it('every promo should have a discount between 1 and 100', () => {
    for (const key of Object.keys(MOCK_PROMOS)) {
      const promo = MOCK_PROMOS[key]
      expect(promo.discountPercent).toBeGreaterThanOrEqual(1)
      expect(promo.discountPercent).toBeLessThanOrEqual(100)
    }
  })

  it('every promo should have a non-empty code and label', () => {
    for (const key of Object.keys(MOCK_PROMOS)) {
      const promo = MOCK_PROMOS[key]
      expect(promo.code).toBeTruthy()
      expect(promo.label).toBeTruthy()
    }
  })

  it('promo keys should match their .code property (uppercase)', () => {
    for (const key of Object.keys(MOCK_PROMOS)) {
      expect(key).toBe(MOCK_PROMOS[key].code)
    }
  })
})
