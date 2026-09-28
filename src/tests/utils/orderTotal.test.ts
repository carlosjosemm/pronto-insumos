import { describe, it, expect } from 'vitest'
import {
  computeDiscountedUnitPrice,
  computeOrderTotal,
  computeCartTotal,
  normalizeQuantity,
  toOrderLines
} from '../../utils/orderTotal'

describe('orderTotal (Task 0.9 — server-authoritative payable total, integer CLP)', () => {
  describe('normalizeQuantity', () => {
    it('passes through positive integer quantities', () => {
      expect(normalizeQuantity(1)).toBe(1)
      expect(normalizeQuantity(7)).toBe(7)
      expect(normalizeQuantity('3')).toBe(3)
    })

    it('collapses fractional, zero, negative and garbage quantities to 1', () => {
      expect(normalizeQuantity(2.4)).toBe(2)
      expect(normalizeQuantity(0)).toBe(1)
      expect(normalizeQuantity(-3)).toBe(1)
      expect(normalizeQuantity(NaN)).toBe(1)
      expect(normalizeQuantity(undefined)).toBe(1)
      expect(normalizeQuantity(null)).toBe(1)
      expect(normalizeQuantity('abc')).toBe(1)
    })
  })

  describe('computeDiscountedUnitPrice', () => {
    it('returns the list price untouched at 0% discount', () => {
      expect(computeDiscountedUnitPrice(189990, 0)).toBe(189990)
    })

    it('applies whole-percent discounts with Math.round (integer CLP, no cents)', () => {
      expect(computeDiscountedUnitPrice(189990, 10)).toBe(170991) // 189990 * 0.9 = 170991
      expect(computeDiscountedUnitPrice(79990, 20)).toBe(63992) // 79990 * 0.8 = 63992 exact
      expect(computeDiscountedUnitPrice(14990, 10)).toBe(13491) // 13491 -> rounds to 13491
    })

    it('returns 0 for non-finite, zero or negative prices', () => {
      expect(computeDiscountedUnitPrice(NaN, 10)).toBe(0)
      expect(computeDiscountedUnitPrice(0, 10)).toBe(0)
      expect(computeDiscountedUnitPrice(-5000, 10)).toBe(0)
      expect(computeDiscountedUnitPrice(Infinity, 10)).toBe(0)
    })

    it('clamps out-of-range discounts (0–100)', () => {
      expect(computeDiscountedUnitPrice(10000, -50)).toBe(10000)
      expect(computeDiscountedUnitPrice(10000, 150)).toBe(0)
      expect(computeDiscountedUnitPrice(10000, NaN)).toBe(10000)
    })
  })

  describe('computeOrderTotal', () => {
    it('sums list prices without discount (IVA incluido, no ×1.19 recomposition)', () => {
      expect(
        computeOrderTotal([
          { price: 189990, quantity: 2 },
          { price: 79990, quantity: 1 }
        ])
      ).toBe(459970)
    })

    it('matches the exact amount Mercado Pago charges for a discounted preference', () => {
      // MP charges Σ round(unit × (100−pct)/100) × qty — the helper IS that formula.
      const lines = [
        { price: 189990, quantity: 2 },
        { price: 79990, quantity: 1 }
      ]
      expect(computeOrderTotal(lines, 20)).toBe(Math.round(189990 * 0.8) * 2 + Math.round(79990 * 0.8))
      expect(computeOrderTotal(lines, 20)).toBe(367976)
    })

    it('normalizes untrusted quantities identically on every call site', () => {
      expect(computeOrderTotal([{ price: 10000, quantity: 2.7 }])).toBe(30000) // round(2.7)=3
      expect(computeOrderTotal([{ price: 10000, quantity: 0 }])).toBe(10000)
      expect(computeOrderTotal([{ price: 10000, quantity: -5 }])).toBe(10000)
    })

    it('returns 0 for empty, malformed or non-array input', () => {
      expect(computeOrderTotal([])).toBe(0)
      // @ts-expect-error deliberate invalid input to assert runtime resilience
      expect(computeOrderTotal(null)).toBe(0)
      expect(computeOrderTotal([{ price: NaN, quantity: 1 }])).toBe(0)
      expect(computeOrderTotal([{ price: 189990, quantity: Number('x') }])).toBe(189990)
    })

    it('keeps the identity the webhook relies on: preference total === computeOrderTotal', () => {
      // A preference built from these discounted unit prices charges exactly this sum.
      const catalog = [
        { price: 189990, quantity: 1 },
        { price: 38500, quantity: 3 }
      ]
      const preferenceTotal = catalog.reduce((acc, l) => acc + computeDiscountedUnitPrice(l.price, 20) * l.quantity, 0)
      expect(computeOrderTotal(catalog, 20)).toBe(preferenceTotal)
    })

    it('toOrderLines maps CartItem-shaped lines (price at .product.price) to payable lines', () => {
      const cartItems = [
        { product: { price: 189990 }, quantity: 2 },
        { product: { price: 79990 }, quantity: 1 }
      ]
      expect(toOrderLines(cartItems)).toEqual([
        { price: 189990, quantity: 2 },
        { price: 79990, quantity: 1 }
      ])
      expect(computeCartTotal(cartItems)).toBe(459970)
    })

    it('computeCartTotal applies the verified promo to CartItem-shaped lines', () => {
      const cartItems = [{ product: { price: 189990 }, quantity: 2 }]
      // 2 × round(189990 × 0.9) = 2 × 170991
      expect(computeCartTotal(cartItems, 10)).toBe(341982)
      expect(computeCartTotal(cartItems, 0)).toBe(379980)
    })

    it('documents the raw-CartItem pitfall: computeOrderTotal on unmapped cart lines charges 0', () => {
      // WHY the toOrderLines adapter exists: a CartItem carries the price at
      // .product.price, so raw cart lines fed to computeOrderTotal would charge $0.
      const cartItems = [{ product: { price: 189990 }, quantity: 2 }]
      expect(computeOrderTotal(cartItems as unknown as Array<{ price: number; quantity: number }>, 0)).toBe(0)
      expect(computeCartTotal(cartItems, 0)).toBe(379980)
    })
  })
})
