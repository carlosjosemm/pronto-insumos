import { TaxBreakdown } from '../types'
import { validateRut } from './rut'

/**
 * Pure Chilean Tax (SII 19% IVA) calculation and Factura validation utilities.
 * Conforms strictly to Chilean tax standards:
 * - Integer CLP only (no decimals)
 * - Neto + IVA 19% = Total Facturado
 * - Strict Modulo 11 check on RUT Empresa
 * - Mandatory SII Factura fields (RUT, Razón Social, Giro, Dirección Fiscal)
 */

/**
 * Calculates exact Chilean 19% IVA breakdown from an inclusive total amount in CLP.
 * Ensures the mathematical identity: neto + iva === total.
 */
export function calculateTaxBreakdown(totalAmount: number): TaxBreakdown {
  if (isNaN(totalAmount) || totalAmount <= 0) {
    return { neto: 0, iva: 0, total: 0 }
  }

  const integerTotal = Math.round(totalAmount)
  // Neto calculation: Total / 1.19 rounded to integer CLP
  const neto = Math.round(integerTotal / 1.19)
  // IVA extraction: Exact remainder ensuring zero rounding discrepancy
  const iva = integerTotal - neto

  return {
    neto,
    iva,
    total: integerTotal
  }
}

export interface FacturaValidationInput {
  rut: string
  razonSocial?: string
  giroComercial?: string
  address: string
  city: string
}

export interface FacturaValidationResult {
  isValid: boolean
  errors: {
    rut?: string
    razonSocial?: string
    giroComercial?: string
    address?: string
    city?: string
  }
}

/**
 * Validates mandatory legal fields required by the Chilean SII for Factura Electrónica.
 */
export function validateFacturaFields(fields: FacturaValidationInput): FacturaValidationResult {
  const errors: FacturaValidationResult['errors'] = {}

  const cleanRut = (fields.rut || '').trim()
  if (!cleanRut) {
    errors.rut = 'El RUT de la empresa o clínica es obligatorio para emitir Factura.'
  } else if (!validateRut(cleanRut)) {
    errors.rut = 'RUT de empresa inválido. Verifica el número y el dígito verificador.'
  }

  const cleanRazonSocial = (fields.razonSocial || '').trim()
  if (!cleanRazonSocial) {
    errors.razonSocial = 'La Razón Social o nombre legal de la clínica es obligatoria.'
  } else if (cleanRazonSocial.length < 3) {
    errors.razonSocial = 'La Razón Social debe contener al menos 3 caracteres.'
  }

  const cleanGiro = (fields.giroComercial || '').trim()
  if (!cleanGiro) {
    errors.giroComercial = 'El Giro Comercial registrado en el SII es obligatorio (ej: Servicios Odontológicos).'
  } else if (cleanGiro.length < 3) {
    errors.giroComercial = 'El Giro Comercial debe contener al menos 3 caracteres.'
  }

  const cleanAddress = (fields.address || '').trim()
  if (!cleanAddress) {
    errors.address = 'La Dirección Fiscal de la clínica es obligatoria para Factura.'
  }

  const cleanCity = (fields.city || '').trim()
  if (!cleanCity) {
    errors.city = 'La Comuna / Ciudad fiscal es obligatoria para Factura.'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}
