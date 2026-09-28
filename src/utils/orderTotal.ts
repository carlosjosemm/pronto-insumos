/**
 * Server-authoritative order total mathematics — the single formula for the
 * payable amount of an order (integer CLP, IVA incluido).
 *
 * Every surface that states or verifies a payable amount MUST derive it through
 * this module so the four amounts can never drift apart:
 *
 *   1. Cart/checkout display  (src/App.tsx, src/components/Cart.tsx)
 *   2. Persisted order total  (src/services/api.ts → submitOrder)
 *   3. Mercado Pago preference items (api/create-preference.ts)
 *   4. Webhook amount assertion (api/webhooks/mercadopago.ts)
 *
 * Catalog prices are documented as IVA-inclusive (SERNAC) — the total is the
 * sum of discounted unit prices, never a net×1.19 recomposition.
 * Pure module: integer CLP only, no DOM, no network, no side effects.
 */

export interface OrderLineInput {
  price: number
  quantity: number
}

/**
 * Adapts storefront cart lines (`CartItem` — price lives at `item.product.price`)
 * to the plain `{ price, quantity }` lines this module computes with. Keeping the
 * mapping in ONE place prevents a call site from silently passing raw `CartItem[]`
 * (whose `price` is undefined) and charging $0.
 */
export function toOrderLines(items: Array<{ product?: { price?: number }; quantity?: number }>): OrderLineInput[] {
  if (!Array.isArray(items)) return []
  return items.map((item) => ({ price: Number(item?.product?.price), quantity: normalizeQuantity(item?.quantity) }))
}

/**
 * Normalizes an untrusted quantity to a positive integer (minimum 1).
 * Fractional, NaN or non-positive inputs collapse to 1 — the same rule the
 * webhook and preference builder apply, so both sides always agree.
 */
export function normalizeQuantity(quantity: unknown): number {
  const rounded = Math.round(Number(quantity))
  return Number.isFinite(rounded) && rounded >= 1 ? rounded : 1
}

/**
 * Applies a whole-percent discount to a single IVA-inclusive unit price.
 * `Math.round` at every step — CLP has no cents and floating residues are
 * forbidden (payment gateway / SII rejection risk).
 * Returns 0 for non-finite or non-positive prices.
 */
export function computeDiscountedUnitPrice(price: number, discountPercent: number): number {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return 0
  const pct = Math.max(0, Math.min(100, Math.round(discountPercent) || 0))
  return Math.round((price * (100 - pct)) / 100)
}

/**
 * Payable total for a set of lines: Σ discountedUnitPrice × quantity.
 * This is exactly the amount Mercado Pago charges for a preference built
 * with the same discounted unit prices, so the storefront display, the
 * Firestore order document, the Checkout Pro charge and the webhook's
 * expectation are mathematically identical by construction.
 */
export function computeOrderTotal(lines: OrderLineInput[], discountPercent: number = 0): number {
  if (!Array.isArray(lines)) return 0
  return lines.reduce((acc, line) => {
    const unit = computeDiscountedUnitPrice(Number(line?.price), discountPercent)
    return acc + unit * normalizeQuantity(line?.quantity)
  }, 0)
}

/**
 * Payable total for storefront cart lines (`CartItem[]`) — the cart-facing wrapper
 * over `computeOrderTotal(toOrderLines(items), pct)`. Used by App (checkout total),
 * Cart (drawer total) and submitOrder so every surface derives ONE amount.
 */
export function computeCartTotal(
  items: Array<{ product?: { price?: number }; quantity?: number }>,
  discountPercent: number = 0
): number {
  return computeOrderTotal(toOrderLines(items), discountPercent)
}
