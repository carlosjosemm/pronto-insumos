/**
 * Chilean RUT (Rol Único Tributario) validation and formatting utilities
 * Uses standard Modulo 11 verification algorithm.
 */

/**
 * Clean a RUT string by removing dots, hyphens, and whitespace.
 */
export function cleanRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, '').toUpperCase()
}

/**
 * Calculate the Modulo 11 verification digit (DV) for a Chilean RUT body.
 */
export function calculateDv(body: string): string {
  let sum = 0
  let multiplier = 2

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }

  const remainder = 11 - (sum % 11)
  if (remainder === 11) return '0'
  if (remainder === 10) return 'K'
  return remainder.toString()
}

/**
 * Validate a Chilean RUT string using Modulo 11 algorithm.
 * Accepts formats: "12345678-9", "12.345.678-k", "12345678K", etc.
 */
export function validateRut(rut: string): boolean {
  if (!rut || typeof rut !== 'string') return false

  const cleaned = cleanRut(rut)
  if (cleaned.length < 8 || cleaned.length > 9) return false

  const body = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)

  // Ensure body contains only digits
  if (!/^\d+$/.test(body)) return false

  const expectedDv = calculateDv(body)
  return dv === expectedDv
}

/**
 * Format a RUT string into standard Chilean notation: "12.345.678-K"
 */
export function formatRut(rut: string): string {
  const cleaned = cleanRut(rut)
  if (cleaned.length < 2) return cleaned

  const body = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)

  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formattedBody}-${dv}`
}
