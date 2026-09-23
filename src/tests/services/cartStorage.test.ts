import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  saveCartToStorage,
  loadCartFromStorage,
  clearCartFromStorage,
  revalidateCartAgainstCatalog,
  CART_STORAGE_KEY,
  CART_STORAGE_VERSION,
  CART_MAX_TTL_MS
} from '../../services/cartStorage'
import { CartItem, Product, PromoCode } from '../../types'

const MOCK_PRODUCT: Product = {
  id: 'odon-101',
  name: 'Turbina Odontológica LED MasterTorque',
  category: 'Instruments',
  manufacturer: 'NSK',
  price: 189990,
  originalPrice: 229990,
  rating: 4.9,
  reviewsCount: 86,
  inStock: true,
  stockCount: 10,
  prescriptionRequired: false,
  tag: 'Más Vendido',
  description: 'Pieza de mano de alta velocidad.',
  specs: ['Midwest 4 vías'],
  placeholderTheme: 'gradient-teal',
  mediaBadge: 'LED',
  images: [],
  packageContents: ['1x Turbina']
}

const MOCK_PROMO: PromoCode = {
  code: 'DENT20',
  discountPercent: 20,
  label: '20% Convenio Clínicas'
}

describe('cartStorage service', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('saveCartToStorage & loadCartFromStorage', () => {
    it('should save and load cart items with applied promo correctly', () => {
      const cartItems: CartItem[] = [{ product: MOCK_PRODUCT, quantity: 2 }]

      const success = saveCartToStorage(cartItems, MOCK_PROMO)
      expect(success).toBe(true)

      const loaded = loadCartFromStorage()
      expect(loaded).not.toBeNull()
      expect(loaded!.items).toHaveLength(1)
      expect(loaded!.items[0].product.id).toBe('odon-101')
      expect(loaded!.items[0].quantity).toBe(2)
      expect(loaded!.appliedPromo).toEqual(MOCK_PROMO)
    })

    it('should return null when localStorage is empty', () => {
      const loaded = loadCartFromStorage()
      expect(loaded).toBeNull()
    })

    it('should remove storage entry when saving empty items and null promo', () => {
      saveCartToStorage([{ product: MOCK_PRODUCT, quantity: 1 }], null)
      expect(window.localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull()

      saveCartToStorage([], null)
      expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
    })

    it('should handle corrupted JSON string gracefully by clearing storage and returning null', () => {
      window.localStorage.setItem(CART_STORAGE_KEY, '{ invalid_json: true, ...')

      const loaded = loadCartFromStorage()
      expect(loaded).toBeNull()
      expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
    })

    it('should reject and purge entries with incompatible schema version', () => {
      const invalidData = {
        version: 999,
        savedAt: Date.now(),
        items: [{ product: MOCK_PRODUCT, quantity: 1 }],
        appliedPromo: null
      }
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(invalidData))

      const loaded = loadCartFromStorage()
      expect(loaded).toBeNull()
      expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
    })

    it('should reject and purge entries that exceed the 7-day max TTL', () => {
      const expiredTimestamp = Date.now() - (CART_MAX_TTL_MS + 1000)
      const expiredData = {
        version: CART_STORAGE_VERSION,
        savedAt: expiredTimestamp,
        items: [{ product: MOCK_PRODUCT, quantity: 1 }],
        appliedPromo: null
      }
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(expiredData))

      const loaded = loadCartFromStorage()
      expect(loaded).toBeNull()
      expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
    })

    it('should retain entries that are within the 7-day TTL window', () => {
      const validRecentTimestamp = Date.now() - 24 * 60 * 60 * 1000 // 1 day ago
      const validData = {
        version: CART_STORAGE_VERSION,
        savedAt: validRecentTimestamp,
        items: [{ product: MOCK_PRODUCT, quantity: 3 }],
        appliedPromo: null
      }
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(validData))

      const loaded = loadCartFromStorage()
      expect(loaded).not.toBeNull()
      expect(loaded!.items).toHaveLength(1)
      expect(loaded!.items[0].quantity).toBe(3)
    })

    it('should filter out malformed or non-positive quantity items on load', () => {
      const dataWithInvalidItems = {
        version: CART_STORAGE_VERSION,
        savedAt: Date.now(),
        items: [
          { product: MOCK_PRODUCT, quantity: 2 },
          { product: null, quantity: 5 },
          { product: { id: 'bad-item' }, quantity: -1 },
          { product: MOCK_PRODUCT, quantity: 'not-a-number' }
        ],
        appliedPromo: null
      }
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(dataWithInvalidItems))

      const loaded = loadCartFromStorage()
      expect(loaded).not.toBeNull()
      expect(loaded!.items).toHaveLength(1)
      expect(loaded!.items[0].quantity).toBe(2)
    })

    it('should return false gracefully when window.localStorage.setItem throws QuotaExceededError', () => {
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError: DOM Exception 22')
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const success = saveCartToStorage([{ product: MOCK_PRODUCT, quantity: 1 }], null)

      expect(success).toBe(false)
      expect(warnSpy).toHaveBeenCalled()
    })
  })

  describe('clearCartFromStorage', () => {
    it('should remove the storage key from localStorage', () => {
      saveCartToStorage([{ product: MOCK_PRODUCT, quantity: 1 }], MOCK_PROMO)
      expect(window.localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull()

      clearCartFromStorage()
      expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
    })

    it('should catch and handle unexpected storage exceptions without throwing', () => {
      vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError: Access denied')
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(() => clearCartFromStorage()).not.toThrow()
      expect(warnSpy).toHaveBeenCalled()
    })
  })

  describe('revalidateCartAgainstCatalog', () => {
    const catalog: Product[] = [
      { ...MOCK_PRODUCT, id: 'item-1', stockCount: 5, price: 100000, inStock: true },
      { ...MOCK_PRODUCT, id: 'item-2', stockCount: 0, price: 50000, inStock: false }, // out of stock
      { ...MOCK_PRODUCT, id: 'item-3', stockCount: 2, price: 75000, inStock: true }
    ]

    it('should return original items unchanged if catalog is empty', () => {
      const stored: CartItem[] = [{ product: catalog[0], quantity: 2 }]
      const result = revalidateCartAgainstCatalog(stored, [])

      expect(result.items).toEqual(stored)
      expect(result.hasChanges).toBe(false)
      expect(result.removedCount).toBe(0)
      expect(result.adjustedCount).toBe(0)
    })

    it('should remove items that are discontinued (missing from catalog)', () => {
      const stored: CartItem[] = [
        { product: { ...MOCK_PRODUCT, id: 'discontinued-999' }, quantity: 1 },
        { product: catalog[0], quantity: 2 }
      ]

      const result = revalidateCartAgainstCatalog(stored, catalog)
      expect(result.items).toHaveLength(1)
      expect(result.items[0].product.id).toBe('item-1')
      expect(result.removedCount).toBe(1)
      expect(result.hasChanges).toBe(true)
    })

    it('should remove items that are out of stock (inStock: false or stockCount: 0)', () => {
      const stored: CartItem[] = [
        { product: catalog[1], quantity: 1 }, // inStock: false
        { product: catalog[0], quantity: 2 }
      ]

      const result = revalidateCartAgainstCatalog(stored, catalog)
      expect(result.items).toHaveLength(1)
      expect(result.items[0].product.id).toBe('item-1')
      expect(result.removedCount).toBe(1)
      expect(result.hasChanges).toBe(true)
    })

    it('should clamp item quantity down to maximum available stock count', () => {
      const stored: CartItem[] = [
        { product: catalog[0], quantity: 10 } // stockCount is 5
      ]

      const result = revalidateCartAgainstCatalog(stored, catalog)
      expect(result.items).toHaveLength(1)
      expect(result.items[0].quantity).toBe(5)
      expect(result.adjustedCount).toBe(1)
      expect(result.hasChanges).toBe(true)
    })

    it('should update product price and metadata to live catalog values', () => {
      const oldItemProduct: Product = {
        ...catalog[0],
        price: 90000 // old price
      }
      const stored: CartItem[] = [{ product: oldItemProduct, quantity: 2 }]

      const result = revalidateCartAgainstCatalog(stored, catalog)
      expect(result.items[0].product.price).toBe(100000) // updated to catalog price
      expect(result.hasChanges).toBe(true)
    })

    it('should preserve valid items when all stock and prices match', () => {
      const stored: CartItem[] = [
        { product: catalog[0], quantity: 2 },
        { product: catalog[2], quantity: 1 }
      ]

      const result = revalidateCartAgainstCatalog(stored, catalog)
      expect(result.items).toHaveLength(2)
      expect(result.hasChanges).toBe(false)
      expect(result.removedCount).toBe(0)
      expect(result.adjustedCount).toBe(0)
    })
  })
})
