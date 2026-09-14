import { describe, it, expect } from 'vitest'
import { formatCLP, calculateIVA, parseCLP } from '../../utils/currency'

describe('Chilean Currency Utility (formatCLP, calculateIVA, parseCLP)', () => {
  describe('formatCLP', () => {
    it('should format standard whole CLP numbers with period separators', () => {
      expect(formatCLP(189990)).toBe('$189.990')
      expect(formatCLP(79990)).toBe('$79.990')
      expect(formatCLP(245000)).toBe('$245.000')
      expect(formatCLP(1250000)).toBe('$1.250.000')
    })

    it('should format small amounts and zero correctly', () => {
      expect(formatCLP(0)).toBe('$0')
      expect(formatCLP(500)).toBe('$500')
      expect(formatCLP(1000)).toBe('$1.000')
    })

    it('should round decimal numbers to whole Chilean Peso integers', () => {
      expect(formatCLP(189.99)).toBe('$190')
      expect(formatCLP(189.49)).toBe('$189')
      expect(formatCLP(79990.4)).toBe('$79.990')
      expect(formatCLP(79990.6)).toBe('$79.991')
    })

    it('should format negative amounts cleanly with minus prefix before dollar sign', () => {
      expect(formatCLP(-15000)).toBe('-$15.000')
      expect(formatCLP(-100)).toBe('-$100')
    })

    it('should handle NaN, null, and undefined gracefully by returning $0', () => {
      expect(formatCLP(NaN)).toBe('$0')
      // @ts-ignore
      expect(formatCLP(null)).toBe('$0')
      // @ts-ignore
      expect(formatCLP(undefined)).toBe('$0')
    })
  })

  describe('calculateIVA', () => {
    it('should calculate 19% Chilean IVA rounded to whole integer CLP', () => {
      expect(calculateIVA(10000)).toBe(1900)
      expect(calculateIVA(100000)).toBe(19000)
      // 79990 * 0.19 = 15198.1 -> rounded to 15198
      expect(calculateIVA(79990)).toBe(15198)
      // 189990 * 0.19 = 36098.1 -> rounded to 36098
      expect(calculateIVA(189990)).toBe(36098)
    })

    it('should return 0 for zero or negative values', () => {
      expect(calculateIVA(0)).toBe(0)
      expect(calculateIVA(-5000)).toBe(0)
    })
  })

  describe('parseCLP', () => {
    it('should parse formatted CLP strings back to integer numbers', () => {
      expect(parseCLP('$189.990')).toBe(189990)
      expect(parseCLP('$1.250.000')).toBe(1250000)
      expect(parseCLP('79.990')).toBe(79990)
      expect(parseCLP('$0')).toBe(0)
    })

    it('should parse negative formatted strings', () => {
      expect(parseCLP('-$15.000')).toBe(-15000)
    })

    it('should return 0 for invalid or empty strings', () => {
      expect(parseCLP('')).toBe(0)
      expect(parseCLP('abc')).toBe(0)
      // @ts-ignore
      expect(parseCLP(null)).toBe(0)
    })
  })
})
