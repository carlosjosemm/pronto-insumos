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
 * Resolves the discount percent for a promo code (case-insensitive, trimmed).
 * Returns 0 for unknown, empty or non-string codes — an unknown code never
 * discounts, so a forged promoCode can only ever reduce to the full price.
 */
export function resolvePromoPercent(code: unknown): number {
  if (typeof code !== 'string') return 0
  const promo = MOCK_PROMOS[code.trim().toUpperCase()]
  return promo ? promo.discountPercent : 0
}
