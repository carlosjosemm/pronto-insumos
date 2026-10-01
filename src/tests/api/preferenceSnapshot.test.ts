import { describe, it, expect } from 'vitest'
import {
  PREFERENCE_TTL_MS,
  buildPreferenceSnapshot,
  readFrozenPricedTotal,
  toChileanOffsetIso
} from '../../../api/_lib/preferenceSnapshot'

/**
 * The price-freeze authority. `/api/create-preference` writes the snapshot onto the
 * order at preference time and the Mercado Pago webhook asserts the paid amount
 * against it, so the shape and the timestamp format are load-bearing: a wrong
 * timestamp form makes Mercado Pago reject the whole preference
 * (`invalid_expiration_date_to`), which would fail every checkout.
 */
describe('Preference price snapshot (api/_lib/preferenceSnapshot.ts)', () => {
  describe('toChileanOffsetIso', () => {
    it('emits the offset form Mercado Pago documents and round-trips to the same instant', () => {
      const epoch = Date.UTC(2026, 9, 2, 12, 0, 0)
      const iso = toChileanOffsetIso(epoch)

      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000[+-]\d{2}:\d{2}$/)
      // A `Z` suffix is deliberately NOT emitted — MP's documented form is a numeric
      // offset.
      expect(iso.endsWith('Z')).toBe(false)
      expect(new Date(iso).getTime()).toBe(epoch)
    })

    it('tracks the Chilean DST transition (summer -03:00, winter -04:00)', () => {
      // 12:00 UTC is 09:00 in Santiago during summer DST and 08:00 in winter.
      expect(toChileanOffsetIso(Date.UTC(2026, 9, 2, 12, 0, 0))).toBe('2026-10-02T09:00:00.000-03:00')
      expect(toChileanOffsetIso(Date.UTC(2026, 5, 15, 12, 0, 0))).toBe('2026-06-15T08:00:00.000-04:00')
    })
  })

  describe('buildPreferenceSnapshot', () => {
    it('freezes the payable total, the per-line prices with quantities, and a TTL window', () => {
      const now = Date.UTC(2026, 9, 2, 12, 0, 0)
      const snapshot = buildPreferenceSnapshot(
        379980,
        [
          { productId: 'odon-100', quantity: 2, unitPrice: 189990 },
          { productId: 'odon-200', quantity: 1, unitPrice: 0 }
        ],
        now
      )

      expect(snapshot.pricedTotal).toBe(379980)
      expect(snapshot.priceSnapshot).toEqual([
        { productId: 'odon-100', quantity: 2, unitPrice: 189990 },
        { productId: 'odon-200', quantity: 1, unitPrice: 0 }
      ])
      // The line prices and quantities rebuild the frozen total.
      const rebuilt = snapshot.priceSnapshot.reduce((acc, line) => acc + line.unitPrice * line.quantity, 0)
      expect(rebuilt).toBe(snapshot.pricedTotal)

      expect(new Date(snapshot.preferenceCreatedAt).getTime()).toBe(now)
      expect(new Date(snapshot.preferenceExpiresAt).getTime() - now).toBe(PREFERENCE_TTL_MS)
      expect(snapshot.preferenceExpiresAt).toMatch(/[+-]\d{2}:\d{2}$/)
    })
  })

  describe('readFrozenPricedTotal', () => {
    it('returns the frozen integer total when the order carries a usable snapshot', () => {
      expect(readFrozenPricedTotal({ pricedTotal: 379980 })).toBe(379980)
    })

    it('returns null for an absent or malformed snapshot so the caller falls back', () => {
      expect(readFrozenPricedTotal(null)).toBeNull()
      expect(readFrozenPricedTotal(undefined)).toBeNull()
      expect(readFrozenPricedTotal({})).toBeNull()
      expect(readFrozenPricedTotal({ pricedTotal: 0 })).toBeNull()
      expect(readFrozenPricedTotal({ pricedTotal: -1 })).toBeNull()
      expect(readFrozenPricedTotal({ pricedTotal: 1899.9 })).toBeNull()
      expect(readFrozenPricedTotal({ pricedTotal: '189990' })).toBeNull()
    })
  })
})
