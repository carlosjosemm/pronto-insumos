/**
 * Canonical incident kinds for the manual order operations — a cancellation note,
 * a refund, a return or a chargeback recorded against an order.
 *
 * Shared by the admin console (the operator's dropdown and the audit timeline) and
 * the serverless handler that validates the request: both sides must accept exactly
 * the same values. Two independent copies would drift, and the drift would surface
 * as a `400` on a money-adjacent operations screen with no compile-time warning.
 *
 * Pure data — no DOM, no network, no `import.meta.env` — so it is importable from
 * the browser bundle and from Node (the `api/` runtime) alike.
 */

export const ORDER_INCIDENT_KINDS = ['CANCELACION', 'REEMBOLSO', 'DEVOLUCION', 'CONTRACARGO'] as const

export type OrderIncidentKind = (typeof ORDER_INCIDENT_KINDS)[number]

/** Spanish labels for the operator-facing select and the order-history timeline. */
export const INCIDENT_KIND_LABELS: Record<OrderIncidentKind, string> = {
  CANCELACION: 'Cancelación',
  REEMBOLSO: 'Reembolso',
  DEVOLUCION: 'Devolución',
  CONTRACARGO: 'Contracargo'
}
