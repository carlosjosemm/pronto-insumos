import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'

function getChileDate(dateInput?: any): string {
  if (!dateInput) return ''
  let d: Date
  if (typeof dateInput?.toDate === 'function') {
    d = dateInput.toDate()
  } else if (dateInput instanceof Date) {
    d = dateInput
  } else {
    d = new Date(dateInput)
  }
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setAdminResponseHeaders(res, 'GET, OPTIONS')

  if (isAdminPreflight(req)) {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método no permitido' })
  }

  const authResult = await verifyAdminToken(req)
  if (!authResult.authenticated) {
    return res.status(403).json({ success: false, error: authResult.error })
  }

  const db = getAdminFirestore()
  if (!db) {
    return res.status(500).json({ success: false, error: 'Base de datos no inicializada' })
  }

  try {
    const todayStr = getChileDate(new Date())
    const currentMonthStr = todayStr.slice(0, 7)

    // PENDING COUNT — a `count()` aggregation over the exact all-time pending set,
    // so an unresolved order (e.g. a months-old transfer never cleared) can never
    // disappear from the KPI the way it would inside a bounded recent-orders page.
    // The list must mirror every PENDIENTE_* member of the OrderStatus union plus
    // the two unresolved-money states the webhook and the voucher flow produce.
    const pendingStatuses = [
      'PENDIENTE_PAGO_MERCADOPAGO',
      'PENDIENTE_TRANSFERENCIA',
      'PENDIENTE_PAGO',
      'TRANSFERENCIA_COMPROBANTE_SUBIDO',
      'PAGO_EN_REVISION'
    ]
    const pendingSnap = await db
      .collection(getCollectionName('orders'))
      .where('status', 'in', pendingStatuses)
      .count()
      .get()
    const pendingOrders = Number(pendingSnap.data().count) || 0

    // LOW-STOCK COUNT — the `stockCount <= 5` query returns only the low-stock
    // candidates (inherently a small set for one store), so the published filter
    // runs in memory over a bounded read instead of needing a composite index
    // for two `!=` ranges plus the inequality.
    const lowStockSnap = await db.collection(getCollectionName('products')).where('stockCount', '<=', 5).get()
    let lowStockProducts = 0
    lowStockSnap.forEach(doc => {
      const data = doc.data()
      const isPublished = data.inStock !== false && data.isActive !== false
      if (isPublished) {
        lowStockProducts++
      }
    })

    // SALES TODAY + MONTHLY VOLUME — one bounded recent-orders page covers any
    // realistic settlement window: an order confirmed today was created at most
    // days ago, so it is inside the page unless hundreds of newer orders exist
    // (recorded as an accepted edge for a single-store console).
    const ordersSnap = await db.collection(getCollectionName('orders')).orderBy('createdAt', 'desc').limit(400).get()

    let salesToday = 0
    let ordersThisMonth = 0

    ordersSnap.forEach(doc => {
      const data = doc.data()
      const status = data.status || ''
      const total = typeof data.totalAmount === 'number' ? data.totalAmount : 0
      const createdAtChile = getChileDate(data.createdAt)

      // Count orders this month
      if (createdAtChile.startsWith(currentMonthStr)) {
        ordersThisMonth++
      }

      // KPI FIX — the settlement timestamp decides the sales date, and an order
      // carrying a settlement marker (`paidAt` for Mercado Pago, `approvedAt` for
      // an admin-verified transfer) counts regardless of its current fulfillment
      // status. The previous shape dropped shipped money out of "Ventas Hoy" the
      // moment the status changed, and counted a transfer approved today on its
      // creation date because `approvedAt` was never consulted.
      //
      // REVERSAL EXCEPTION — the webhook parks a refunded/charged-back payment in
      // `PAGO_EN_REVISION` WITHOUT clearing `paidAt` (it only flips the status), so
      // review + marker ≡ money that was collected and then returned. Such an
      // order must not count as confirmed revenue; amount-mismatch parkings never
      // carry `paidAt`, so they are unaffected by this guard.
      const settledAtRaw = data.paidAt || data.approvedAt || null
      const isReversal = status === 'PAGO_EN_REVISION' && Boolean(data.paidAt)
      const isSettled =
        !isReversal &&
        (Boolean(settledAtRaw) ||
          status === 'PAGADO_MERCADOPAGO' ||
          status === 'TRANSFERENCIA_APROBADA' ||
          status === 'PAGADO_TRANSFERENCIA')
      if (isSettled && getChileDate(settledAtRaw || (isSettled ? data.createdAt : null)) === todayStr) {
        salesToday += total
      }
    })

    return res.status(200).json({
      success: true,
      stats: {
        salesToday,
        pendingOrders,
        lowStockProducts,
        ordersThisMonth
      }
    })
  } catch (err: any) {
    console.error('[Admin API Dashboard Stats] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al calcular estadísticas' })
  }
}
