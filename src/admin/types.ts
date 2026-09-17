import type { OrderStatus, Order, Product } from '../types'

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
