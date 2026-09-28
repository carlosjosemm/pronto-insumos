import { describe, it, expect } from 'vitest'
import { MOCK_PROMOS, resolvePromo, resolvePromoPercent } from '../../config/promos'

describe('promos (single source of truth for discount codes)', () => {
  describe('MOCK_PROMOS catalog', () => {
    it('keys every entry by its own upper-case code', () => {
      for (const key of Object.keys(MOCK_PROMOS)) {
        expect(key).toBe(MOCK_PROMOS[key].code)
        expect(key).toBe(key.toUpperCase())
      }
    })
  })

  describe('resolvePromo', () => {
    it('returns the canonical catalog entry for a known code', () => {
      expect(resolvePromo('PRONTO10')).toEqual(MOCK_PROMOS.PRONTO10)
      expect(resolvePromo('DENT20')).toEqual(MOCK_PROMOS.DENT20)
    })

    it('is case-insensitive and trims surrounding whitespace', () => {
      expect(resolvePromo('  pronto10  ')).toEqual(MOCK_PROMOS.PRONTO10)
      expect(resolvePromo('dEnT20')).toEqual(MOCK_PROMOS.DENT20)
    })

    it('returns null for unknown, empty or non-string codes', () => {
      expect(resolvePromo('HACKED100')).toBeNull()
      expect(resolvePromo('')).toBeNull()
      expect(resolvePromo('   ')).toBeNull()
      expect(resolvePromo(undefined)).toBeNull()
      expect(resolvePromo(null)).toBeNull()
      expect(resolvePromo(10)).toBeNull()
      expect(resolvePromo({ code: 'PRONTO10' })).toBeNull()
    })

    it('never resolves inherited Object.prototype members', () => {
      expect(resolvePromo('constructor')).toBeNull()
      expect(resolvePromo('toString')).toBeNull()
      expect(resolvePromo('__proto__')).toBeNull()
      expect(resolvePromo('hasOwnProperty')).toBeNull()
    })
  })

  describe('resolvePromoPercent (the forged-code gate)', () => {
    it('returns the catalog percent for a valid code', () => {
      expect(resolvePromoPercent('PRONTO10')).toBe(10)
      expect(resolvePromoPercent(' dent20 ')).toBe(20)
    })

    it('returns 0 — full price — for every non-catalog input', () => {
      for (const forged of ['HACKED100', '', '   ', undefined, null, 0, 100, [], {}, true, NaN]) {
        expect(resolvePromoPercent(forged)).toBe(0)
      }
    })

    it('never returns undefined (the value the amount math would propagate)', () => {
      expect(typeof resolvePromoPercent('constructor')).toBe('number')
      expect(resolvePromoPercent('constructor')).toBe(0)
    })
  })
})
