import { CartItem, Product, PromoCode } from '../types'

export const CART_STORAGE_KEY = 'pronto_cart_v1'
export const CART_STORAGE_VERSION = 1
export const CART_MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds

export interface StoredCartData {
  version: number
  savedAt: number
  items: CartItem[]
  appliedPromo: PromoCode | null
}

export interface CartRevalidationResult {
  items: CartItem[]
  removedCount: number
  adjustedCount: number
  hasChanges: boolean
}

/**
 * Safely writes the current cart items and applied promo to browser localStorage.
 * Defensive against QuotaExceededError, SSR/Node runtimes, and restricted private browsing modes.
 */
export function saveCartToStorage(items: CartItem[], appliedPromo: PromoCode | null): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false
  }

  try {
    const safeItems = Array.isArray(items)
      ? items.filter(i => i && i.product && typeof i.product.id === 'string' && typeof i.quantity === 'number')
      : []

    if (safeItems.length === 0 && !appliedPromo) {
      window.localStorage.removeItem(CART_STORAGE_KEY)
      return true
    }

    const payload: StoredCartData = {
      version: CART_STORAGE_VERSION,
      savedAt: Date.now(),
      items: safeItems.map(item => ({
        product: item.product,
        quantity: Math.max(1, Math.floor(item.quantity || 1))
      })),
      appliedPromo: appliedPromo ? {
        code: appliedPromo.code,
        discountPercent: appliedPromo.discountPercent,
        label: appliedPromo.label
      } : null
    }

    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch (err) {
    console.warn('[cartStorage] Failed to save cart to localStorage:', err)
    return false
  }
}

/**
 * Safely retrieves and deserializes stored cart data from localStorage.
 * Validates schema version, TTL expiration, and array integrity.
 */
export function loadCartFromStorage(): { items: CartItem[]; appliedPromo: PromoCode | null } | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const data = JSON.parse(raw) as StoredCartData

    // Check schema integrity
    if (!data || typeof data !== 'object' || data.version !== CART_STORAGE_VERSION || typeof data.savedAt !== 'number') {
      window.localStorage.removeItem(CART_STORAGE_KEY)
      return null
    }

    // Check TTL (7-day max retention)
    if (Date.now() - data.savedAt > CART_MAX_TTL_MS) {
      window.localStorage.removeItem(CART_STORAGE_KEY)
      return null
    }

    // Validate and sanitize items
    if (!Array.isArray(data.items)) {
      window.localStorage.removeItem(CART_STORAGE_KEY)
      return null
    }

    const validItems: CartItem[] = data.items.filter(
      item =>
        item &&
        item.product &&
        typeof item.product.id === 'string' &&
        typeof item.quantity === 'number' &&
        item.quantity > 0
    )

    // Consolidate duplicates by product ID if any existed
    const consolidated = new Map<string, CartItem>()
    for (const item of validItems) {
      const existing = consolidated.get(item.product.id)
      if (existing) {
        existing.quantity += item.quantity
      } else {
        consolidated.set(item.product.id, { ...item })
      }
    }

    // Validate appliedPromo
    let validPromo: PromoCode | null = null
    if (
      data.appliedPromo &&
      typeof data.appliedPromo.code === 'string' &&
      typeof data.appliedPromo.discountPercent === 'number' &&
      typeof data.appliedPromo.label === 'string'
    ) {
      validPromo = {
        code: data.appliedPromo.code,
        discountPercent: data.appliedPromo.discountPercent,
        label: data.appliedPromo.label
      }
    }

    return {
      items: Array.from(consolidated.values()),
      appliedPromo: validPromo
    }
  } catch (err) {
    console.warn('[cartStorage] Failed to parse stored cart data, purging entry:', err)
    try {
      window.localStorage.removeItem(CART_STORAGE_KEY)
    } catch {
      // Ignore secondary storage error
    }
    return null
  }
}

/**
 * Purges the persisted cart record from localStorage.
 */
export function clearCartFromStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }

  try {
    window.localStorage.removeItem(CART_STORAGE_KEY)
  } catch (err) {
    console.warn('[cartStorage] Failed to clear cart from localStorage:', err)
  }
}

/**
 * Revalidates stored cart items against the active product catalog.
 * - Removes discontinued or out-of-stock items.
 * - Clamps quantities that exceed live inventory stock.
 * - Synchronizes product metadata (live prices, manufacturer, ISP requirements).
 */
export function revalidateCartAgainstCatalog(
  storedItems: CartItem[],
  catalog: Product[]
): CartRevalidationResult {
  if (!catalog || catalog.length === 0 || !storedItems || storedItems.length === 0) {
    return {
      items: storedItems || [],
      removedCount: 0,
      adjustedCount: 0,
      hasChanges: false
    }
  }

  const catalogMap = new Map<string, Product>(catalog.map(p => [p.id, p]))
  let removedCount = 0
  let adjustedCount = 0
  let hasChanges = false

  const revalidatedItems: CartItem[] = []

  for (const item of storedItems) {
    const liveProduct = catalogMap.get(item.product.id)

    // Discontinued, out of stock, or non-positive stock
    if (!liveProduct || !liveProduct.inStock || (typeof liveProduct.stockCount === 'number' && liveProduct.stockCount <= 0)) {
      removedCount++
      hasChanges = true
      continue
    }

    // Determine current max stock boundary
    const maxStock = typeof liveProduct.stockCount === 'number' && liveProduct.stockCount > 0
      ? liveProduct.stockCount
      : 99

    let finalQuantity = Math.max(1, Math.min(item.quantity, maxStock))
    if (finalQuantity !== item.quantity) {
      adjustedCount++
      hasChanges = true
    }

    // Check if price or other critical specs changed
    if (item.product.price !== liveProduct.price) {
      hasChanges = true
    }

    revalidatedItems.push({
      product: liveProduct,
      quantity: finalQuantity
    })
  }

  return {
    items: revalidatedItems,
    removedCount,
    adjustedCount,
    hasChanges
  }
}
