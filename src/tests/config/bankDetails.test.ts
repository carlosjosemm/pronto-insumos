import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
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

describe('Fiscal RUT single-source guard (Task 1.4)', () => {
  const rootDir = path.resolve(__dirname, '../../..')

  it('Footer.tsx renders the distributor RUT from BANK_DETAILS, never a hardcoded fiscal literal', () => {
    const source = fs.readFileSync(path.join(rootDir, 'src/components/Footer.tsx'), 'utf8')
    expect(source).not.toMatch(/77.{0,3}892.{0,3}410/)
  })

  it('CheckoutModal.tsx renders the distributor RUT from BANK_DETAILS, never a hardcoded fiscal literal', () => {
    const source = fs.readFileSync(path.join(rootDir, 'src/components/CheckoutModal.tsx'), 'utf8')
    expect(source).not.toMatch(/77.{0,3}892.{0,3}410/)
  })
})
