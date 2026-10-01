import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'
import { sendEmail, getWarehouseEmail } from '../email.js'
import { buildWarehouseAlertEmail, toOrderEmailData } from '../emailTemplates.js'

/**
 * Source states a general cancellation may close. All four mean "nothing was
 * ever settled and nothing was shipped": an online order still awaiting the
 * Mercado Pago webhook, the generic pending fallback, a bank transfer awaiting
 * the voucher, and a transfer whose voucher was uploaded but not yet reconciled.
 */
const CANCELLABLE_STATUSES = new Set([
  'PENDIENTE_PAGO_MERCADOPAGO',
  'PENDIENTE_PAGO',
  'PENDIENTE_TRANSFERENCIA',
  'TRANSFERENCIA_COMPROBANTE_SUBIDO'
])

const MAX_REASON_LENGTH = 500

/** Transaction outcome — discriminated so the response path narrows cleanly. */
type CancelOutcome =
  | { outcome: 'duplicate'; currentStatus: string }
  | { outcome: 'conflict'; currentStatus: string; message: string }
  | { outcome: 'cancelled' }

/**
 * Cancels an order that was never settled and never shipped.
 *
 * Money that was actually collected is deliberately out of reach here: a paid,
 * approved, in-preparation, dispatched or delivered order is refused with `409`,
 * because closing it as `CANCELADO` would hide a refund the owner still has to
 * make by hand (Mercado Pago / bank transfer, off-platform). Those cases are
 * recorded through `record-order-incident` instead, which leaves the status
 * alone. `PAGO_EN_REVISION` and the WhatsApp quote keep their own audited
 * resolutions (`resolve-payment-review` / `resolve-quote`), so they are refused
 * too rather than offering a second path to the same state.
 *
 * The order schema models no refund, so this action never moves stock and never
 * touches money: it records the decision in the order history and alerts the
 * warehouse (the goods may already be picked).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setAdminResponseHeaders(res)

  if (isAdminPreflight(req)) {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' })
  }

  const authResult = await verifyAdminToken(req)
  if (!authResult.authenticated) {
    return res.status(403).json({ success: false, error: authResult.error })
  }

  const { orderId, reason } = req.body || {}
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "orderId" es obligatorio' })
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error:
        'El parámetro "reason" es obligatorio: registra por qué se cancela (nunca credenciales bancarias).'
    })
  }

  const cleanReason = reason.trim().slice(0, MAX_REASON_LENGTH)
  const cleanOrderId = orderId.trim()

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

      // Idempotency: cancelling an already-cancelled order is a no-op, never a
      // second history event or a second warehouse alert.
      if (currentStatus === 'CANCELADO') {
        return { outcome: 'duplicate', currentStatus } satisfies CancelOutcome
      }

      // The guard is re-asserted inside the transaction so a webhook approval (or
      // an admin dispatch) landing between the read and this write cannot be
      // regressed into a cancellation.
      if (!CANCELLABLE_STATUSES.has(currentStatus)) {
        return {
          outcome: 'conflict',
          currentStatus,
          message: `El pedido no puede cancelarse en su estado actual (${
            currentStatus || 'desconocido'
          }): si el pago ya fue cobrado o el pedido fue despachado, registra una incidencia (reembolso / devolución) y sigue el SOP de operaciones manuales. No se realizó ningún cambio.`
        } satisfies CancelOutcome
      }

      const nowIso = new Date().toISOString()
      const adminActor = authResult.email || authResult.uid || 'admin'

      transaction.update(orderRef, {
        status: 'CANCELADO',
        updatedAt: nowIso
      })

      const historyRef = db.collection(getCollectionName('order_status_history')).doc()
      transaction.set(historyRef, {
        id: historyRef.id,
        orderId: cleanOrderId,
        previousStatus: currentStatus,
        newStatus: 'CANCELADO',
        changedBy: authResult.uid || 'admin',
        changedByEmail: authResult.email || null,
        actorRole: 'ADMIN',
        timestamp: nowIso,
        reason: cleanReason,
        metadata: {
          cancelledBy: adminActor,
          event: 'CANCELACION_MANUAL',
          manual: true
        }
      })

      return { outcome: 'cancelled' } satisfies CancelOutcome
    })

    if (result.outcome === 'conflict') {
      return res.status(409).json({
        success: false,
        error: result.message,
        currentStatus: result.currentStatus
      })
    }

    // Warehouse alert: the order may already be picked, so the depot must learn
    // about the cancellation. `sendEmail` is fail-safe (it reports `sent: false`
    // instead of throwing), so an outage can never turn the committed
    // cancellation into an error — the history trail already records it.
    if (result.outcome === 'cancelled' && orderDataForEmail) {
      const warehouseEmail = getWarehouseEmail()
      if (warehouseEmail) {
        const emailData = toOrderEmailData(cleanOrderId, {
          ...(orderDataForEmail as Record<string, unknown>),
          status: 'CANCELACION_MANUAL'
        })
        await sendEmail({
          to: warehouseEmail,
          ...buildWarehouseAlertEmail(emailData, 'CANCELACION_MANUAL')
        })
      }
    }

    return res.status(200).json({
      success: true,
      orderId: cleanOrderId,
      status: 'CANCELADO',
      duplicate: result.outcome === 'duplicate'
    })
  } catch (err: unknown) {
    console.error('[Admin API Cancel Order] Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error al cancelar el pedido'
    })
  }
}
