import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'

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

  const { orderId, status, search, limit, cursor } = req.query
  const ordersCol = getCollectionName('orders')

  try {
    // If orderId requested specifically
    if (orderId && typeof orderId === 'string') {
      const doc = await db.collection(ordersCol).doc(orderId.trim()).get()
      if (!doc.exists) {
        // Try searching by orderId field
        const snap = await db.collection(ordersCol).where('orderId', '==', orderId.trim()).limit(1).get()
        if (snap.empty) {
          return res.status(404).json({ success: false, error: 'Pedido no encontrado' })
        }
        const data = snap.docs[0].data()
        // Detail request: returns the FULL document, `voucherUrl` included — this is the
        // only response allowed to carry a legacy Base64 voucher, and a single order
        // document is always within Vercel's 4.5 MB cap.
        return res.status(200).json({ success: true, order: { ...data, orderId: snap.docs[0].id } })
      }
      return res.status(200).json({ success: true, order: { ...doc.data(), orderId: doc.id } })
    }

    // BOUNDED PAGE READ — the list never loads the whole collection: it reads one
    // sorted page of `limit` documents (default 50, hard-capped at 200 so a huge
    // `?limit=` cannot restore the unbounded read) starting after the client's
    // cursor, so per-page read cost stays flat as order volume grows and the
    // response can never approach Vercel's 4.5 MB body cap.
    const maxCount = Math.min(200, Math.max(1, limit ? parseInt(String(limit), 10) || 50 : 50))
    let pageQuery = db.collection(ordersCol).orderBy('createdAt', 'desc')

    // SERVER-SIDE STATUS FILTER — equality (and the dual-status `in` for the
    // transfer-approved chip) run in Firestore, so filtering cost no longer grows
    // with the collection. An equality-family filter on `status` combined with a
    // sort on a DIFFERENT field (`createdAt`) requires the manual composite index
    // `orders(status ASC, createdAt DESC)` — declared in `firestore.indexes.json`
    // and deployed with `firebase deploy --only firestore:indexes`; without it
    // Firestore answers `failed-precondition` and this handler returns `500`.
    if (status && typeof status === 'string' && status !== 'all') {
      if (status === 'TRANSFERENCIA_APROBADA') {
        pageQuery = pageQuery.where('status', 'in', ['TRANSFERENCIA_APROBADA', 'PAGADO_TRANSFERENCIA'])
      } else {
        pageQuery = pageQuery.where('status', '==', status)
      }
    }

    // The cursor is the `createdAt` ISO timestamp of the last order the client
    // already rendered; `startAfter` needs a value matching the orderBy field
    // (a server Timestamp), so the string is parsed to a Date first.
    if (cursor && typeof cursor === 'string') {
      const cursorDate = new Date(cursor)
      if (!isNaN(cursorDate.getTime())) {
        pageQuery = pageQuery.startAfter(cursorDate)
      }
    }

    const snap = await pageQuery.limit(maxCount).get()
    const orders: Record<string, unknown>[] = []

    // A `createdAt` that is not a real timestamp (a legacy or crafted document) must
    // never be echoed as a cursor: `startAfter` needs a value matching the orderBy
    // field, and a client re-requesting with an unparseable cursor would loop on the
    // first page forever. Such rows are flagged instead of echoed.
    const toIsoCreatedAt = (raw: unknown): string | null => {
      if (raw && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
        const date = (raw as { toDate: () => Date }).toDate()
        return Number.isFinite(date.getTime()) ? date.toISOString() : null
      }
      if (typeof raw === 'string' || typeof raw === 'number') {
        const parsed = new Date(raw).getTime()
        return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
      }
      return null
    }

    snap.forEach(doc => {
      const data = doc.data()
      const createdAt = toIsoCreatedAt(data.createdAt) ?? ''
      if (!createdAt) {
        console.warn(
          `[Admin API Orders] Order "${doc.id}" has a non-timestamp createdAt (${String(
            data.createdAt
          )}); flagging the row and refusing to paginate past it.`
        )
      }
      // The LIST must never carry `voucherUrl`: a legacy pre-2.9 document holds the whole
      // voucher as a Base64 `data:` URL (up to ~1 MiB each), so a handful of them exceeds
      // Vercel's 4.5 MB response cap and breaks the entire order list. Report existence
      // instead (`hasVoucher`, the same predicate /api/track-order uses) and let the
      // `?orderId=` detail request supply the real URL.
      const { voucherUrl, ...rest } = data
      orders.push({
        ...rest,
        orderId: data.orderId || doc.id,
        createdAt,
        ...(createdAt ? {} : { createdAtInvalid: true }),
        hasVoucher: Boolean(voucherUrl || data.voucherStoragePath)
      })
    })

    // Search filters the loaded page in memory — a full-text search across the
    // whole collection would need either an index per field or a third-party
    // search service, both out of scope for a single-store console.
    let filteredOrders = orders
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.toLowerCase().trim()
      filteredOrders = orders.filter(o => {
        const record = o as Record<string, unknown>
        const customer = (record.customer || {}) as Record<string, unknown>
        const idMatch = String(record.orderId || '').toLowerCase().includes(q)
        const nameMatch = String(customer.fullName || '').toLowerCase().includes(q)
        const razonMatch = String(customer.razonSocial || '').toLowerCase().includes(q)
        const rutMatch = String(customer.rut || '').toLowerCase().includes(q)
        return idMatch || nameMatch || razonMatch || rutMatch
      })
    }

    // FULL FILTERED-SET COUNT — a `count()` aggregation on the same status filter
    // (without the page cursor) charges index-entry reads only and transfers no
    // documents, so the UI's `total` stays the size of the whole filtered queue.
    // Built in one expression: a `where()` returns a Query, so reassigning a
    // CollectionReference variable would not type-check.
    const wantsStatusFilter = Boolean(status && typeof status === 'string' && status !== 'all')
    const statusOp = status === 'TRANSFERENCIA_APROBADA' ? 'in' : '=='
    const statusValues =
      status === 'TRANSFERENCIA_APROBADA' ? ['TRANSFERENCIA_APROBADA', 'PAGADO_TRANSFERENCIA'] : status
    const baseForCount = wantsStatusFilter
      ? db.collection(ordersCol).where('status', statusOp, statusValues)
      : db.collection(ordersCol)
    const totalSnap = await baseForCount.count().get()
    const total = Number(totalSnap.data().count) || 0

    // A full page means there may be more: the client continues from the last
    // PAGE document's `createdAt` — never from the search-filtered view, whose
    // last match can sit before unfiltered orders and would skip them. When that
    // last document carries no real timestamp the cursor is omitted rather than
    // echoed, so the client stops instead of looping on the first page.
    const lastCreatedAt = orders.length > 0 ? String(orders[orders.length - 1].createdAt || '') : ''
    const canPaginate =
      orders.length === maxCount && orders.length > 0 && lastCreatedAt !== '' && !isNaN(new Date(lastCreatedAt).getTime())

    return res.status(200).json({
      success: true,
      orders: filteredOrders,
      total,
      ...(canPaginate ? { nextCursor: lastCreatedAt } : {})
    })
  } catch (err: any) {
    console.error('[Admin API Orders] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al obtener pedidos' })
  }
}
