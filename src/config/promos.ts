import type { PromoCode } from '../types'

/**
 * Single source of truth for promo codes (PRONTO storefront).
 *
 * Consumed by the storefront (`validatePromo`), checkout order registration and —
 * critically — the serverless payment layer (`api/create-preference.ts` and the
 * Mercado Pago webhook), which must recompute the discounted payable amount
 * from this same catalog so a tampered client payload can never dictate prices.
 *
 * Pure module: no DOM, no `import.meta.env`, importable from Node (api/) and tsx scripts.
 */
export const MOCK_PROMOS: Record<string, PromoCode> = {
  PRONTO10: { discountPercent: 10, code: 'PRONTO10', label: '10% Descuento Primer Pedido Odontológico' },
  DENT20: { discountPercent: 20, code: 'DENT20', label: '20% Convenio Clínicas Melipilla' }
}

/**
 * Canonical catalog entry for a promo code (case-insensitive, trimmed), or `null`.
 *
 * This is the ONLY sanctioned way to turn a code into a discount: the percent and
 * label are always read back from the table, never from a persisted snapshot. A
 * `PromoCode` object hydrated from `localStorage` (or any other client storage) is
 * a display artifact and must be re-resolved through here before it can influence
 * a total — otherwise a hand-edited cart entry could render a discount the
 * serverless payment layer would refuse to charge (display ≠ charge).
 */
export function resolvePromo(code: unknown): PromoCode | null {
  if (typeof code !== 'string') return null
  const key = code.trim().toUpperCase()
  return Object.prototype.hasOwnProperty.call(MOCK_PROMOS, key) ? MOCK_PROMOS[key] : null
}

/**
 * Resolves the discount percent for a promo code (case-insensitive, trimmed).
 * Returns 0 for unknown, empty or non-string codes — an unknown code never
 * discounts, so a forged promoCode can only ever reduce to the full price.
 */
export function resolvePromoPercent(code: unknown): number {
  return resolvePromo(code)?.discountPercent ?? 0
}
