import { auth } from '../../services/firebase'
import type {
  DashboardStats,
  OrderListParams,
  OrderListResult,
  StockAdjustmentPayload,
  DispatchOrderPayload,
  ProductUpdatePayload
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
    console.warn('[Admin API] Fallback to simulated dashboard stats:', err.message)
    return {
      salesToday: 428900,
      pendingOrders: 3,
      lowStockProducts: 2,
      ordersThisMonth: 18
    }
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

export async function approveBankTransfer(orderId: string): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders()
  try {
    const res = await fetch('/api/admin/approve-transfer', {
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

export async function dispatchAdminOrder(payload: DispatchOrderPayload): Promise<{ success: boolean; error?: string }> {
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
    return { success: true }
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
    console.warn('[Admin API] Fallback to local products fixture:', err.message)
    const { PRODUCTS } = await import('../../data/products')
    return PRODUCTS
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
