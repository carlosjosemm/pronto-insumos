import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'
import { sendEmail, getWarehouseEmail } from '../email.js'
import {
  buildPaymentReviewResolvedEmail,
  buildWarehouseAlertEmail,
  toOrderEmailData
} from '../emailTemplates.js'

const RESOLUTIONS = ['approve', 'cancel'] as const
const MAX_NOTES_LENGTH = 500

/** Transaction outcome — discriminated so the response/email path narrows cleanly. */
type ReviewOutcome =
  | { outcome: 'duplicate'; currentStatus: string }
  | { outcome: 'conflict'; currentStatus: string }
  | { outcome: 'resolved'; resolution: 'approve' | 'cancel'; status: string }

/**
 * Closes a `PAGO_EN_REVISION` order — the manual-review state the Mercado Pago
 * webhook sets when the paid amount does not match the catalog-recomputed total.
 *
 *   - `approve`: the money is confirmed (after verifying the gateway/bank ledger),
 *     so the order is marked `PAGADO_MERCADOPAGO` and stock is deducted in the same
 *     transaction — the same trust level as `approve-transfer`, which already lets
 *     an administrator settle a manual payment and rebajar stock.
 *   - `cancel`: the order is closed as `CANCELADO` with **no** stock movement. Any
 *     refund is handled off-platform (refunds are not modelled — see
 *     `src/types/AGENTS.md` §2.1).
 *
 * Any other starting status is refused: an order must be in review before it can be
 * reconciled, which keeps this action from racing the webhook (a concurrently
 * approved order returns `duplicate`, never a double stock deduction).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' })
  }

  const authResult = await verifyAdminToken(req)
  if (!authResult.authenticated) {
    return res.status(403).json({ success: false, error: authResult.error })
  }

  const { orderId, resolution, notes } = req.body || {}

  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "orderId" es obligatorio' })
  }

  if (typeof resolution !== 'string' || !RESOLUTIONS.includes(resolution as (typeof RESOLUTIONS)[number])) {
    return res.status(400).json({
      success: false,
      error: `El parámetro "resolution" debe ser uno de: ${RESOLUTIONS.join(', ')}`
    })
  }

  const cleanOrderId = orderId.trim()
  const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, MAX_NOTES_LENGTH) : ''

  const db = getAdminFirestore()
  if (!db) {
    return res.status(500).json({ success: false, error: 'Base de datos no inicializada' })
  }

  const ordersCol = getCollectionName('orders')

  try {
    let orderRef = db.collection(ordersCol).doc(cleanOrderId)
    const initialCheck = await orderRef.get()
    if (!initialCheck.exists) {
      const querySnap = await db.collection(ordersCol).where('orderId', '==', cleanOrderId).limit(1).get()
      if (querySnap.empty) {
        return res.status(404).json({
          success: false,
          error: `Pedido "${cleanOrderId}" no encontrado en Firestore`
        })
      }
      orderRef = querySnap.docs[0].ref
    }

    let orderDataForEmail: Record<string, unknown> | null = null

    const result = await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef)
      if (!orderDoc.exists) {
        throw new Error(`Pedido "${cleanOrderId}" no encontrado en Firestore`)
      }

      const orderData = orderDoc.data() || {}
      orderDataForEmail = orderData
      const currentStatus = String(orderData.status || '')

      // Idempotency: re-resolving an already-resolved order is a no-op, never a
      // second stock deduction.
      const targetStatus = resolution === 'approve' ? 'PAGADO_MERCADOPAGO' : 'CANCELADO'
      if (currentStatus === targetStatus) {
        return { outcome: 'duplicate', currentStatus } satisfies ReviewOutcome
      }

      // Only a flagged order can be reconciled — this is what stops the action from
      // double-processing alongside the webhook or a second administrator.
      if (currentStatus !== 'PAGO_EN_REVISION') {
        return { outcome: 'conflict', currentStatus } satisfies ReviewOutcome
      }

      const nowIso = new Date().toISOString()
      const adminActor = authResult.email || authResult.uid || 'admin'

      if (resolution === 'cancel') {
        transaction.update(orderRef, {
          status: 'CANCELADO',
          updatedAt: nowIso
        })

        const cancelHistoryRef = db.collection(getCollectionName('order_status_history')).doc()
        transaction.set(cancelHistoryRef, {
          id: cancelHistoryRef.id,
          orderId: cleanOrderId,
          previousStatus: currentStatus,
          newStatus: 'CANCELADO',
          changedBy: authResult.uid || 'admin',
          changedByEmail: authResult.email || null,
          actorRole: 'ADMIN',
          timestamp: nowIso,
          reason: cleanNotes || 'Pedido cancelado al conciliar un pago inconsistente (sin movimiento de stock)',
          metadata: { resolvedBy: adminActor, resolution: 'cancel' }
        })

        return { outcome: 'resolved', resolution: 'cancel', status: 'CANCELADO' } satisfies ReviewOutcome
      }

      const items: Array<Record<string, unknown>> = Array.isArray(orderData.items) ? orderData.items : []

      // Consolidate duplicate line items by productId to prevent transactional overwrite
      const consolidatedQty = new Map<string, { qty: number; name?: string }>()
      for (const item of items) {
        const productId = (item.productId || item.id) as string | undefined
        if (!productId) continue
        const existing = consolidatedQty.get(productId) || { qty: 0, name: item.name as string | undefined }
        existing.qty += typeof item.quantity === 'number' ? Math.max(1, item.quantity) : 1
        if (item.name) existing.name = item.name as string
        consolidatedQty.set(productId, existing)
      }

      // Read every product first (all reads before all writes)
      const productDocsToUpdate: Array<{
        ref: FirebaseFirestore.DocumentReference
        productId: string
        name: string
        sku: string
        previousStock: number
        newStock: number
        delta: number
        isActive: boolean
      }> = []

      for (const [productId, itemInfo] of consolidatedQty.entries()) {
        const productRef = db.collection(getCollectionName('products')).doc(productId)
        const productDoc = await transaction.get(productRef)

        if (productDoc.exists) {
          const productData = productDoc.data() || {}
          const currentStock = typeof productData.stockCount === 'number' ? productData.stockCount : 0
          const newStock = Math.max(0, currentStock - itemInfo.qty)

          productDocsToUpdate.push({
            ref: productRef,
            productId,
            name: productData.name || itemInfo.name || productId,
            sku: productData.sku || '',
            previousStock: currentStock,
            newStock,
            delta: -itemInfo.qty,
            isActive: productData.isActive !== false
          })
        } else {
          console.warn(
            `[Admin API Resolve Payment Review] Product "${productId}" from order "${cleanOrderId}" no longer exists; stock not deducted.`
          )
        }
      }

      for (const update of productDocsToUpdate) {
        transaction.update(update.ref, {
          stockCount: update.newStock,
          inStock: update.newStock > 0 && update.isActive,
          updatedAt: nowIso
        })

        const auditRef = db.collection(getCollectionName('inventory_audit_logs')).doc()
        transaction.set(auditRef, {
          id: auditRef.id,
          productId: update.productId,
          productSku: update.sku,
          productName: update.name,
          changeType: 'ORDER_FULFILLMENT_DEDUCTION',
          previousStock: update.previousStock,
          newStock: update.newStock,
          delta: update.delta,
          reasonCode: 'conciliacion_pago',
          operatorNotes: `Rebaja de stock por conciliación manual de pago Mercado Pago en revisión (orden ${cleanOrderId})`,
          changedBy: authResult.uid || 'admin',
          changedByEmail: authResult.email || null,
          actorRole: 'ADMIN',
          timestamp: nowIso,
          metadata: { orderId: cleanOrderId, resolution: 'approve' }
        })
      }

      transaction.update(orderRef, {
        status: 'PAGADO_MERCADOPAGO',
        approvedAt: nowIso,
        approvedBy: adminActor,
        updatedAt: nowIso
      })

      const historyRef = db.collection(getCollectionName('order_status_history')).doc()
      transaction.set(historyRef, {
        id: historyRef.id,
        orderId: cleanOrderId,
        previousStatus: currentStatus,
        newStatus: 'PAGADO_MERCADOPAGO',
        changedBy: authResult.uid || 'admin',
        changedByEmail: authResult.email || null,
        actorRole: 'ADMIN',
        timestamp: nowIso,
        reason:
          cleanNotes ||
          'Pago en revisión conciliado manualmente por administración y rebaja de stock en bodega Melipilla',
        metadata: {
          resolvedBy: adminActor,
          resolution: 'approve',
          itemsCount: items.length,
          paymentId: orderData.mercadopagoPaymentId || null,
          orderTotalAmount: orderData.totalAmount ?? null
        }
      })

      return { outcome: 'resolved', resolution: 'approve', status: 'PAGADO_MERCADOPAGO' } satisfies ReviewOutcome
    })

    if (result.outcome === 'conflict') {
      return res.status(409).json({
        success: false,
        error: `El pedido no está en revisión (estado actual: ${result.currentStatus}). Actualiza la lista antes de reintentar.`,
        currentStatus: result.currentStatus
      })
    }

    // Transactional emails (fail-safe, awaited so Vercel does not terminate the send)
    if (result.outcome === 'resolved' && orderDataForEmail) {
      const resolvedData = orderDataForEmail as Record<string, unknown>
      const warehouseEmail = getWarehouseEmail()

      if (result.resolution === 'approve') {
        const emailData = toOrderEmailData(cleanOrderId, { ...resolvedData, status: 'PAGADO_MERCADOPAGO' })
        const customerEmail = String((resolvedData.customer as { email?: string } | undefined)?.email || '').trim()
        if (customerEmail) {
          await sendEmail({ to: customerEmail, ...buildPaymentReviewResolvedEmail(emailData) })
        }
        if (warehouseEmail) {
          await sendEmail({ to: warehouseEmail, ...buildWarehouseAlertEmail(emailData, 'PAGADO_MERCADOPAGO') })
        }
      } else if (warehouseEmail) {
        // No customer email on cancellation: the case is already under manual
        // follow-up and the refund path is off-platform.
        const emailData = toOrderEmailData(cleanOrderId, { ...resolvedData, status: 'CANCELADO' })
        await sendEmail({ to: warehouseEmail, ...buildWarehouseAlertEmail(emailData, 'CANCELADO') })
      }
    }

    if (result.outcome === 'duplicate') {
      return res.status(200).json({
        success: true,
        orderId: cleanOrderId,
        duplicate: true,
        currentStatus: result.currentStatus
      })
    }

    return res.status(200).json({
      success: true,
      orderId: cleanOrderId,
      duplicate: false,
      resolution: result.resolution,
      status: result.status
    })
  } catch (err: unknown) {
    console.error('[Admin API Resolve Payment Review] Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error al conciliar el pago en revisión'
    })
  }
}
