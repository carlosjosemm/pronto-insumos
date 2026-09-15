import { describe, it, expect } from 'vitest'
import { calculateTaxBreakdown, validateFacturaFields } from '../../utils/tax'

describe('calculateTaxBreakdown (Chilean 19% IVA)', () => {
  it('should return zeros for non-positive or NaN values', () => {
    expect(calculateTaxBreakdown(0)).toEqual({ neto: 0, iva: 0, total: 0 })
    expect(calculateTaxBreakdown(-5000)).toEqual({ neto: 0, iva: 0, total: 0 })
    expect(calculateTaxBreakdown(NaN)).toEqual({ neto: 0, iva: 0, total: 0 })
  })

  it('should calculate exact integer tax breakdown where neto + iva === total', () => {
    const amounts = [189990, 79990, 1250000, 899000, 150000, 1000]

    for (const total of amounts) {
      const breakdown = calculateTaxBreakdown(total)
      expect(Number.isInteger(breakdown.neto)).toBe(true)
      expect(Number.isInteger(breakdown.iva)).toBe(true)
      expect(Number.isInteger(breakdown.total)).toBe(true)
      expect(breakdown.neto + breakdown.iva).toBe(total)
      expect(breakdown.total).toBe(total)
    }
  })

  it('should compute correct breakdown for standard $189.990 CLP product', () => {
    // 189990 / 1.19 = 159655.46... -> rounded to 159655
    // 189990 - 159655 = 30335
    const breakdown = calculateTaxBreakdown(189990)
    expect(breakdown.neto).toBe(159655)
    expect(breakdown.iva).toBe(30335)
    expect(breakdown.total).toBe(189990)
  })
})

describe('validateFacturaFields (Chilean SII Compliance)', () => {
  const validFacturaInput = {
    rut: '76.123.456-7',
    razonSocial: 'Clínica Odontológica Melipilla SpA',
    giroComercial: 'Servicios Odontológicos Integrales',
    address: 'Av. Ortúzar 750, Of. 302',
    city: 'Melipilla'
  }

  it('should validate successfully when all Factura fields are valid', () => {
    // Let's use a real valid RUT according to Modulo 11: 76.123.456-7 -> let's test with a mathematically valid one
    // 76.123.456: sum = 7*2 + 6*7 + 5*6 + 4*5 + 3*4 + 2*3 + 1*2 + 7*1 = let's use 12.345.678-5 (valid)
    const result = validateFacturaFields({
      ...validFacturaInput,
      rut: '12.345.678-5'
    })

    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('should reject invalid or missing RUT', () => {
    const resultEmpty = validateFacturaFields({
      ...validFacturaInput,
      rut: ''
    })
    expect(resultEmpty.isValid).toBe(false)
    expect(resultEmpty.errors.rut).toBeDefined()

    const resultInvalidDigit = validateFacturaFields({
      ...validFacturaInput,
      rut: '12.345.678-9' // invalid check digit for 12345678
    })
    expect(resultInvalidDigit.isValid).toBe(false)
    expect(resultInvalidDigit.errors.rut).toContain('inválido')
  })

  it('should reject missing or too short Razón Social', () => {
    const resultEmpty = validateFacturaFields({
      ...validFacturaInput,
      rut: '12.345.678-5',
      razonSocial: '  '
    })
    expect(resultEmpty.isValid).toBe(false)
    expect(resultEmpty.errors.razonSocial).toBeDefined()

    const resultShort = validateFacturaFields({
      ...validFacturaInput,
      rut: '12.345.678-5',
      razonSocial: 'AB'
    })
    expect(resultShort.isValid).toBe(false)
    expect(resultShort.errors.razonSocial).toContain('al menos 3')
  })

  it('should reject missing or too short Giro Comercial', () => {
    const resultEmpty = validateFacturaFields({
      ...validFacturaInput,
      rut: '12.345.678-5',
      giroComercial: ''
    })
    expect(resultEmpty.isValid).toBe(false)
    expect(resultEmpty.errors.giroComercial).toBeDefined()
  })

  it('should reject missing fiscal address or city', () => {
    const result = validateFacturaFields({
      ...validFacturaInput,
      rut: '12.345.678-5',
      address: '',
      city: ''
    })
    expect(result.isValid).toBe(false)
    expect(result.errors.address).toBeDefined()
    expect(result.errors.city).toBeDefined()
  })
})
