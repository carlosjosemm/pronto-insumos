/**
 * Delivery zones & commercial thresholds — single source of truth.
 * Consumed by Cart, CheckoutModal, and any surface showing shipping rules.
 */
export const DELIVERY_ZONES = ['Melipilla', 'San Antonio'] as const
export type DeliveryZone = (typeof DELIVERY_ZONES)[number]
export const DEFAULT_DELIVERY_ZONE: DeliveryZone = 'Melipilla'

/**
 * Prefix of the internal dispatch reference minted per zone:
 * `MEL-260929-07`. A warehouse route code — never a courier guía.
 */
export const DELIVERY_ZONE_REFERENCE_CODES: Record<DeliveryZone, string> = {
  Melipilla: 'MEL',
  'San Antonio': 'SAN'
}

/** Free shipping — BOTH zones — once the product subtotal reaches this amount (CLP). */
export const FREE_SHIPPING_THRESHOLD = 150000

/** The ONLY minimum-sale amount in the system: delivery eligibility outside Melipilla. */
export const MIN_ORDER_OUTSIDE_MELIPILLA = 60000
export const MIN_ORDER_ZONE: DeliveryZone = 'San Antonio'

export function isBelowMinimumOrder(zone: unknown, subtotal: number): boolean {
  return normalizeDeliveryZone(zone) === MIN_ORDER_ZONE && subtotal < MIN_ORDER_OUTSIDE_MELIPILLA
}

function normalizeZoneName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Resolves a stored or typed commune to a canonical `DeliveryZone`, or `null`
 * when the value is not one of the configured zones. Matching ignores case,
 * accents and repeated whitespace, so a stale or hand-crafted `city: "san
 * antonio"` can never pose as a different zone than the checkout's select
 * would have written — and an out-of-zone commune ("Otra comuna" checkout
 * option, WhatsApp-only payment) is reported as `null` instead of being
 * silently pinned to a zone.
 */
export function normalizeDeliveryZone(value: unknown): DeliveryZone | null {
  if (typeof value !== 'string') return null
  const normalized = normalizeZoneName(value)
  if (!normalized) return null
  return DELIVERY_ZONES.find((candidate) => normalizeZoneName(candidate) === normalized) ?? null
}
