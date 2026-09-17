import { describe, it, expect } from 'vitest'
import { BANK_DETAILS } from '../../config/bankDetails'
import { validateRut } from '../../utils/rut'

describe('Bank Details Configuration (src/config/bankDetails)', () => {
  it('should export valid Chilean bank configuration', () => {
    expect(BANK_DETAILS.bankName).toBe('Banco de Chile')
    expect(BANK_DETAILS.accountType).toBe('Cuenta Corriente')
    expect(BANK_DETAILS.accountNumber).toBe('849-01284-01')
    expect(BANK_DETAILS.companyName).toBe('PRONTO INSUMOS ODONTOLÓGICOS SPA')
    expect(BANK_DETAILS.email).toBe('pagos@prontoinsumos.cl')
  })

  it('should have a valid Chilean Modulo 11 RUT', () => {
    expect(validateRut(BANK_DETAILS.rut)).toBe(true)
    expect(BANK_DETAILS.rut).toBe('77.892.410-2')
  })
})
