/**
 * Chilean Peso (CLP) currency formatting and calculation utilities.
 * Conforms to Chilean legal and commercial standards:
 * - Currency: CLP (Chilean Peso)
 * - Zero decimal subdivisions (integers only)
 * - Period as thousands separator, dollar prefix: $189.990
 * - Negative amounts formatted cleanly: -$10.000
 * - 19% IVA calculated with Math.round()
 */

/**
 * Format a monetary amount into Chilean Peso format: "$189.990"
 * Fractional amounts are rounded to the nearest whole integer.
 */
export function formatCLP(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '$0'
  }
  const rounded = Math.round(amount)
  const isNegative = rounded < 0
  const absoluteValue = Math.abs(rounded)

  // Standard Chilean thousands separator using period
  const formatted = absoluteValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return isNegative ? `-$${formatted}` : `$${formatted}`
}

/**
 * Calculate the 19% Chilean IVA (Impuesto al Valor Agregado).
 * Uses Math.round() to ensure a whole integer CLP result.
 */
export function calculateIVA(netAmount: number, rate: number = 0.19): number {
  if (isNaN(netAmount) || netAmount <= 0) return 0
  return Math.round(netAmount * rate)
}

/**
 * Parse a Chilean formatted currency string (e.g. "$189.990" or "189.990") back to integer number.
 */
export function parseCLP(formatted: string): number {
  if (!formatted || typeof formatted !== 'string') return 0
  const isNegative = formatted.includes('-')
  const cleanDigits = formatted.replace(/\D/g, '')
  if (!cleanDigits) return 0
  const num = parseInt(cleanDigits, 10)
  return isNegative ? -num : num
}
