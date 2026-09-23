/**
 * Delivery zones & commercial thresholds — single source of truth.
 * Consumed by Cart, CheckoutModal, and any surface showing shipping rules.
 */
export const DELIVERY_ZONES = ['Melipilla', 'San Antonio'] as const
export type DeliveryZone = (typeof DELIVERY_ZONES)[number]
export const DEFAULT_DELIVERY_ZONE: DeliveryZone = 'Melipilla'

/** Free shipping — BOTH zones — once the product subtotal reaches this amount (CLP). */
export const FREE_SHIPPING_THRESHOLD = 150000

/** The ONLY minimum-sale amount in the system: delivery eligibility outside Melipilla. */
export const MIN_ORDER_OUTSIDE_MELIPILLA = 60000
export const MIN_ORDER_ZONE: DeliveryZone = 'San Antonio'

export function isBelowMinimumOrder(zone: DeliveryZone, subtotal: number): boolean {
  return zone === MIN_ORDER_ZONE && subtotal < MIN_ORDER_OUTSIDE_MELIPILLA
}
