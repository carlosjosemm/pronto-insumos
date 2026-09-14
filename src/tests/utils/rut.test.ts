import { describe, it, expect } from 'vitest'
import { validateRut, formatRut, cleanRut } from '../../utils/rut'

describe('Chilean RUT Utility (Modulo 11)', () => {
  describe('validateRut', () => {
    it('should return true for valid Chilean RUTs', () => {
      // Valid Chilean RUTs verified with Modulo 11 algorithm
      expect(validateRut('12.345.678-5')).toBe(true)
      expect(validateRut('123456785')).toBe(true)
      expect(validateRut('11.111.111-1')).toBe(true)
      expect(validateRut('22.333.444-K')).toBe(true)
      expect(validateRut('22333444k')).toBe(true)
    })

    it('should return false for invalid RUTs', () => {
      expect(validateRut('12.345.678-9')).toBe(false)
      expect(validateRut('11.111.111-2')).toBe(false)
      expect(validateRut('12345')).toBe(false)
      expect(validateRut('abcdefgh-j')).toBe(false)
      expect(validateRut('')).toBe(false)
    })
  })

  describe('formatRut', () => {
    it('should format raw RUT digits into Chilean dots & hyphen notation', () => {
      expect(formatRut('123456785')).toBe('12.345.678-5')
      expect(formatRut('22333444k')).toBe('22.333.444-K')
    })
  })

  describe('cleanRut', () => {
    it('should strip dots, hyphens, spaces and uppercase the DV', () => {
      expect(cleanRut(' 12.345.678-k ')).toBe('12345678K')
    })
  })
})
