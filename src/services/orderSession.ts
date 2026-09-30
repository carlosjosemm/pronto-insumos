/**
 * Session-scoped record of the order this browser tab created (Task 2.12).
 *
 * The Mercado Pago return URL (`/?status=approved&orderId=…`) is trivially
 * forgeable, and Mercado Pago writes it *before* our webhook has verified the
 * payment — so it can never be trusted on its own. The one thing the storefront
 * may act on is "this tab just created this order", which is what this marker
 * records and the only condition under which the persisted cart is reset on a
 * payment return.
 *
 * `sessionStorage` (not `localStorage`): the marker is per-tab and dies with the
 * tab, and the Checkout Pro return is a same-tab navigation
 * (`src/services/mercadopago.ts`), so the marker survives the round trip while a
 * crafted link opened elsewhere can never match it.
 */

export const SESSION_ORDER_STORAGE_KEY = 'pronto_session_order_v1'

/** Canonical form used for every comparison: trimmed, upper-cased, empty ⇒ null. */
function normalizeOrderId(orderId: string | null | undefined): string | null {
  if (typeof orderId !== 'string') return null
  const normalized = orderId.trim().toUpperCase()
  return normalized === '' ? null : normalized
}

/**
 * The session store, or null when it is unavailable (SSR/Node, locked-down
 * browsing modes where even reading `window.sessionStorage` throws).
 */
function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage ?? null
  } catch {
    return null
  }
}

/**
 * Records the canonical order id created by this tab. A no-op when the id is
 * unusable or the store is unavailable — the marker is a safety net for the
 * payment return, never a requirement for checkout to succeed.
 */
export function rememberSessionOrderId(orderId: string | null | undefined): void {
  const normalized = normalizeOrderId(orderId)
  const storage = getSessionStorage()
  if (!normalized || !storage) return

  try {
    storage.setItem(SESSION_ORDER_STORAGE_KEY, normalized)
  } catch (err) {
    console.warn('[orderSession] Failed to record the session order id:', err)
  }
}

/** The canonical order id this tab created, or null when there is none. */
export function getSessionOrderId(): string | null {
  const storage = getSessionStorage()
  if (!storage) return null

  try {
    return normalizeOrderId(storage.getItem(SESSION_ORDER_STORAGE_KEY))
  } catch (err) {
    console.warn('[orderSession] Failed to read the session order id:', err)
    return null
  }
}

/**
 * True when `orderId` names the order this tab created. Fails safe: an
 * unavailable store, an empty id or a non-match all answer `false`, so a
 * payment-return URL can never reset a cart it did not create.
 */
export function isSessionOrder(orderId: string | null | undefined): boolean {
  const normalized = normalizeOrderId(orderId)
  if (!normalized) return false
  return normalized === getSessionOrderId()
}

/**
 * Drops the marker once its payment return has been consumed, so a replayed
 * `/?status=approved&orderId=…` (browser history, a bookmark) cannot reset a cart
 * the shopper refilled after paying. Idempotent and safe to call anywhere.
 */
export function forgetSessionOrderId(): void {
  const storage = getSessionStorage()
  if (!storage) return

  try {
    storage.removeItem(SESSION_ORDER_STORAGE_KEY)
  } catch (err) {
    console.warn('[orderSession] Failed to clear the session order id:', err)
  }
}
