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
