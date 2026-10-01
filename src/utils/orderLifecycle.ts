import type { OrderStatus } from '../types'

/**
 * Order-lifecycle constants shared by the serverless layer (`api/`) and the
 * admin backoffice. A status set or TTL declared inside `api/` cannot be
 * imported by the browser bundle, so the single copy lives here — adding a
 * new paid status once keeps the webhook, the resend gate and the panel UI
 * in agreement.
 */

/**
 * Statuses that carry a verified payment: stock was deducted and the customer
 * may be told "your money settled". Consumers: the Mercado Pago webhook's
 * double-payment/incident routing, the `resend-order-email` paid-only gate,
 * and the backoffice "Reenviar correo de pago" button.
 */
export const SETTLED_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'PAGADO_MERCADOPAGO',
  'TRANSFERENCIA_APROBADA',
  'PAGADO_TRANSFERENCIA',
  'EN_PREPARACION',
  'DESPACHADO',
  'ENTREGADO'
])

export function isSettledOrderStatus(status: unknown): status is OrderStatus {
  return typeof status === 'string' && SETTLED_ORDER_STATUSES.has(status as OrderStatus)
}

/**
 * How long an `emailDelivery.*.claimedAt` reservation counts as "a send is
 * still in progress". A claim abandoned by a crashed function expires after
 * this window and is reclaimable. The server enforces the TTL inside the
 * claim transaction; the admin panel reads the same value only to render
 * "envío en curso" — the server remains authoritative.
 */
export const EMAIL_CLAIM_TTL_MS = 5 * 60 * 1000
