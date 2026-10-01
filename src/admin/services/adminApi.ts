import { auth } from '../../services/firebase'
import type {
  DashboardStats,
  OrderListParams,
  OrderListResult,
  OrderIncidentKind,
  StockAdjustmentPayload,
  DispatchOrderPayload,
  DispatchOrderResult,
  ProductUpdatePayload,
  VoucherHousekeepingResult
} from '../types'
import type { Order, Product } from '../../types'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth?.currentUser
  if (!user) {
    return { 'Content-Type': 'application/json' }
  }
  try {
    const token = await user.getIdToken()
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  } catch (err) {
    console.warn('[Admin API] Failed to get user ID token:', err)
    return { 'Content-Type': 'application/json' }
  }
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/dashboard-stats', { headers })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    const data = await res.json()
    return data.stats
  } catch (err: any) {
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      console.warn('[Admin API] Fallback to simulated dashboard stats:', err.message)
      return {
        salesToday: 428900,
        pendingOrders: 3,
        lowStockProducts: 2,
        ordersThisMonth: 18
      }
    }
    throw err
  }
}

export async function fetchAdminOrders(params: OrderListParams = {}): Promise<OrderListResult> {
  const headers = await getAuthHeaders()
  const query = new URLSearchParams()
  if (params.status && params.status !== 'all') query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  if (params.limit) query.set('limit', String(params.limit))
  if (params.cursor) query.set('cursor', params.cursor)

  try {
    const res = await fetch(`/api/admin/orders?${query.toString()}`, { headers })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    return await res.json()
  } catch (err: any) {
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      console.warn('[Admin API] Fallback to simulated orders:', err.message)
      return {
        orders: [
          {
            orderId: 'PRONTO-102941',
            status: 'PENDIENTE_TRANSFERENCIA',
            totalAmount: 189990,
            paymentMethod: 'transferencia',
            createdAt: new Date().toISOString(),
            customer: {
              fullName: 'Dra. Camila Fuentes',
              email: 'contacto@fuentesdental.cl',
              phone: '+56 9 8765 4321',
              rut: '12.345.678-5',
              documentType: 'factura',
              razonSocial: 'Sociedad Odontológica Fuentes SpA',
              giroComercial: 'Servicios Odontológicos',
              address: 'Av. Ortúzar 750, Of. 302',
              city: 'Melipilla',
              zip: '9500000'
            },
            items: [
              { productId: 'odon-101', name: 'Turbina LED Push Button', quantity: 1, price: 189990 }
            ]
          }
        ],
        total: 1
      }
    }
    throw err
  }
}

export async function fetchAdminOrder(orderId: string): Promise<Order | null> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch(`/api/admin/orders?orderId=${encodeURIComponent(orderId)}`, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.order || null
  } catch (err: any) {
    console.warn('[Admin API] Failed to fetch single order:', err.message)
    return null
  }
}

/**
 * Approves a bank transfer. `reconciliationReference` is the operator's
 * attestation that the deposit settled in the Banco de Chile ledger (the
 * cartola line) — the server requires it and records it in the order history;
 * never pass bank credentials.
 */
export async function approveBankTransfer(
  orderId: string,
  reconciliationReference: string
): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/approve-transfer', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId, reconciliationReference })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}

/**
 * Closes a `PAGO_EN_REVISION` order: `approve` settles it as PAGADO_MERCADOPAGO
 * (stock deducted server-side, in one transaction) and `cancel` closes it as
 * CANCELADO with no stock movement.
 */
export async function resolvePaymentReview(
  orderId: string,
  resolution: 'approve' | 'cancel',
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/resolve-payment-review', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId, resolution, notes })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}

/**
 * Closes a WhatsApp quote order. `resolution: 'convert'` settles the lead as a
 * verified sale (PAGADO_TRANSFERENCIA, stock deducted server-side) and requires
 * `reconciliationReference` — the operator's attestation that the off-platform
 * payment settled (bank cartola line or receipt; never bank credentials).
 * `resolution: 'decline'` closes it as CANCELADO with no stock movement.
 */
export async function resolveQuote(
  orderId: string,
  resolution: 'convert' | 'decline',
  reconciliationReference?: string,
  notes?: string
): Promise<{ success: boolean; duplicate?: boolean; error?: string }> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/resolve-quote', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId, resolution, reconciliationReference, notes })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { success: true, duplicate: Boolean(data.duplicate) }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}

/**
 * Resends a customer-facing transactional email (`confirmation` = order
 * received, `payment` = paid/approved notice). The server refuses the payment
 * kind for orders without a verified payment, caps resends per kind, and
 * reports provider failures as `success: false` so the operator sees them.
 */
export async function resendOrderEmail(
  orderId: string,
  kind: 'confirmation' | 'payment'
): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/resend-order-email', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId, kind })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}

export async function dispatchAdminOrder(payload: DispatchOrderPayload): Promise<DispatchOrderResult> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/dispatch-order', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return {
      success: true,
      dispatchReference: typeof data.dispatchReference === 'string' ? data.dispatchReference : undefined,
      referenceSource:
        data.referenceSource === 'manual'
          ? 'manual'
          : data.referenceSource === 'generated'
            ? 'generated'
            : undefined
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}

export async function markOrderDelivered(orderId: string): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/mark-delivered', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}

export async function fetchAdminProducts(category?: string): Promise<Product[]> {
  const headers = await getAuthHeaders()
  const query = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : ''
  try {
    const res = await fetch(`/api/admin/products${query}`, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.products || []
  } catch (err: any) {
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      console.warn('[Admin API] Fallback to local products fixture:', err.message)
      const { PRODUCTS } = await import('../../data/products')
      return PRODUCTS
    }
    throw err
  }
}

export async function updateStockCount(payload: StockAdjustmentPayload): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/update-stock', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}

export async function updateProductDetails(payload: ProductUpdatePayload): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/update-product', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}

export interface CreateProductPayload {
  name: string
  category: string
  price: number
  stockCount?: number
  brand?: string
  manufacturer?: string
  description?: string
  prescriptionRequired?: boolean
  tag?: string
}

export async function createProductDetails(payload: CreateProductPayload): Promise<{ success: boolean; product?: Product; error?: string }> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/create-product', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { success: true, product: data.product }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}

export async function toggleProductVisibility(productId: string, visible: boolean): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/toggle-visibility', {
      method: 'POST',
      headers,
      body: JSON.stringify({ productId, visible })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}

export async function fetchOrderHistory(orderId: string): Promise<import('../../types').OrderStatusHistory[]> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch(`/api/admin/order-history?orderId=${encodeURIComponent(orderId)}`, { headers })
    if (!res.ok) {
      return []
    }
    const data = await res.json()
    return Array.isArray(data.history) ? data.history : []
  } catch (err) {
    console.warn('[Admin API] Fallback order history:', err)
    return []
  }
}

/**
 * Reclaims abandoned voucher objects (signed and uploaded but never confirmed).
 *
 * `dryRun` reports what would be removed without deleting; the sweep only ever touches
 * objects an order does not reference and that are older than the server's grace window,
 * so it can never delete a voucher that is currently attached to an order.
 */
export async function runVoucherHousekeeping(
  options: { orderId?: string; dryRun?: boolean; limit?: number } = {}
): Promise<VoucherHousekeepingResult> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/voucher-housekeeping', {
      method: 'POST',
      headers,
      body: JSON.stringify(options)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { ...data, success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}

/**
 * Cancels an order that was never settled and never shipped.
 *
 * `reason` is required: it is the operator's justification (e.g. "no llegó el
 * abono", verified against the bank cartola), recorded in the order history. A
 * paid, approved, in-preparation, dispatched or delivered order is refused by the
 * server with `409` — those go through `recordOrderIncident` and the manual
 * refund runbook instead, never a silent cancellation.
 */
export async function cancelAdminOrder(
  orderId: string,
  reason: string
): Promise<{ success: boolean; duplicate?: boolean; error?: string }> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/cancel-order', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId, reason })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { success: true, duplicate: Boolean(data.duplicate) }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}

/**
 * Records a manual order incident (cancellation note, refund, return or
 * chargeback) as an append-only, same-status entry in the order history.
 *
 * `note` is required — the evidence (gateway/bank ledger line or customer
 * contact). Nothing else changes: no status, no stock, no email.
 */
export async function recordOrderIncident(
  orderId: string,
  kind: OrderIncidentKind,
  note: string
): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/record-order-incident', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId, kind, note })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión' }
  }
}
