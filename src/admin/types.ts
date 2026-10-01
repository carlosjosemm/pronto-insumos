import type { OrderStatus, Order, Product, DispatchReferenceSource } from '../types'

export type AdminView = 'dashboard' | 'orders' | 'inventory' | 'settings'

export interface DashboardStats {
  salesToday: number          // Total CLP from orders paid today
  pendingOrders: number       // Count of orders with pending statuses
  lowStockProducts: number    // Count of products with stockCount <= 5 and inStock
  ordersThisMonth: number     // Total orders placed during current calendar month
}

export type StockAdjustmentReason = 'reposicion' | 'merma' | 'correccion' | 'venta_manual'

export const STOCK_REASON_LABELS: Record<StockAdjustmentReason, string> = {
  reposicion: 'Reposición de Proveedor (Ingreso)',
  merma: 'Merma, Daño o Vencimiento',
  correccion: 'Ajuste / Corrección de Inventario',
  venta_manual: 'Venta Directa en Bodega / Mesón'
}

export interface StockAdjustmentPayload {
  productId: string
  newStock: number
  reason: StockAdjustmentReason
  /** Free-text trace stored as `operatorNotes` on the audit entry (e.g. the order id a return came from). */
  notes?: string
}

export type CarrierType = 'starken' | 'chilexpress' | 'blue_express' | 'despacho_local_melipilla'

export const CARRIER_LABELS: Record<CarrierType, string> = {
  despacho_local_melipilla: 'Despacho Local Melipilla (Flota Directa)',
  starken: 'Starken (Courier Regional)',
  chilexpress: 'Chilexpress (Courier Express)',
  blue_express: 'Blue Express'
}

export interface DispatchOrderPayload {
  orderId: string
  carrier: CarrierType
  trackingCode?: string
}

export interface DispatchOrderResult {
  success: boolean
  error?: string
  /** The reference recorded on the order: minted route code or the typed guía. */
  dispatchReference?: string
  referenceSource?: DispatchReferenceSource
}

export interface ProductUpdatePayload {
  productId: string
  name?: string
  price?: number
  description?: string
  category?: string
  prescriptionRequired?: boolean
  tag?: string
}

export interface OrderListParams {
  status?: string
  search?: string
  limit?: number
  cursor?: string
}

export interface OrderListResult {
  orders: Order[]
  total: number
  nextCursor?: string
}

/**
 * Manual operations an operator performs outside the storefront (the order schema
 * models no refund, and the Mercado Pago webhook preserves a fulfilled status).
 * Each one is recorded on the order as a same-status incident — the same status on
 * both sides of the history entry — so the decision is auditable without
 * pretending the fulfillment state changed.
 *
 * The kinds and their labels live in `src/utils/orderIncidents.ts` because the
 * serverless handler validates against the very same list.
 */
export { ORDER_INCIDENT_KINDS, INCIDENT_KIND_LABELS, type OrderIncidentKind } from '../utils/orderIncidents'

/**
 * Result of the voucher-object housekeeping sweep (`/api/admin/voucher-housekeeping`).
 *
 * `dryRun: true` reports what *would* be removed without touching Storage. The sweep
 * deletes only objects an order does not reference and that are older than the grace
 * window, so a `deletedCount > 0` is always reclaimed abandoned upload space.
 */
export interface VoucherHousekeepingResult {
  success: boolean
  dryRun?: boolean
  scannedOrders?: number
  scannedObjects?: number
  deletedCount?: number
  keptReferenced?: number
  skippedRecent?: number
  deletedSample?: string[]
  failures?: string[]
  error?: string
}

/**
 * Result of the stale pending-order sweep (`/api/admin/close-stale-orders`).
 *
 * `dryRun: true` lists the candidates without writing anything — the action
 * cancels business records, so the safe direction is the default. A candidate
 * whose Mercado Pago ledger holds a settled payment is never cancelled: it is
 * counted in `parkedCount` and moved to `PAGO_EN_REVISION` for manual review.
 * A candidate whose ledger could not be read is left untouched and reported in
 * `failures`, never cancelled on an unverified ledger.
 */
export interface StalePendingOrdersResult {
  success: boolean
  dryRun?: boolean
  olderThanHours?: number
  cutoff?: string
  scannedOrders?: number
  /** Every pending order in the collection, whether or not this run scanned it. */
  pendingTotal?: number
  staleOrders?: number
  closedCount?: number
  parkedCount?: number
  skippedStatusChanged?: number
  closedSample?: string[]
  parkedSample?: string[]
  failures?: string[]
  /** More pending orders than this run could handle: run it again. */
  truncated?: boolean
  /** The run stopped on its own wall-clock budget instead of the scan bound. */
  timeBudgetExhausted?: boolean
  error?: string
}
