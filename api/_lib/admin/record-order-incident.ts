import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Transaction } from 'firebase-admin/firestore'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'
import { ORDER_INCIDENT_KINDS, type OrderIncidentKind } from '../../../src/utils/orderIncidents.js'

const MAX_NOTE_LENGTH = 500

/**
 * Records a manual order incident — a cancellation note, a refund, a return or a
 * chargeback — as an append-only entry in `order_status_history`.
 *
 * The event carries the SAME status on both sides (`previousStatus ===
 * newStatus`), which is the shape the Mercado Pago webhook already uses for its
 * own incidents (`PAGO_DUPLICADO`, `PAGO_REEMBOLSO_PARCIAL`): it records that
 * something happened to the order without pretending the fulfillment state
 * changed. That matters here because a refund or a chargeback lands *after* the
 * order was paid, dispatched or delivered, and inventing a `CANCELADO` for a
 * delivered order would erase the real fulfillment history.
 *
 * Nothing else moves: no status update, no stock movement, no email. Contacting the
 * customer and the warehouse stays a manual step outside the system; this action
 * exists so that step leaves evidence on the order.
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

  const { orderId, kind, note } = req.body || {}

  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "orderId" es obligatorio' })
  }

  if (typeof kind !== 'string' || !ORDER_INCIDENT_KINDS.includes(kind as OrderIncidentKind)) {
    return res.status(400).json({
      success: false,
      error: `El parámetro "kind" debe ser uno de: ${ORDER_INCIDENT_KINDS.join(', ')}`
    })
  }

  // The note is the evidence (the gateway/bank ledger line, the customer contact),
  // and the server cannot read the ledger itself — so it is required.
  if (typeof note !== 'string' || note.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error:
        'El parámetro "note" es obligatorio: registra la evidencia (cartola, comprobante o contacto con el cliente; nunca credenciales bancarias).'
    })
  }

  const cleanOrderId = orderId.trim()
  const cleanKind = kind as OrderIncidentKind
  const cleanNote = note.trim().slice(0, MAX_NOTE_LENGTH)

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

    let recordedStatus = ''

    // The status pair is read inside the transaction: recording it from an earlier
    // read could label the incident with a status the order no longer has.
    await db.runTransaction(async (transaction: Transaction) => {
      const orderDoc = await transaction.get(orderRef)
      if (!orderDoc.exists) {
        throw new Error(`Pedido "${cleanOrderId}" no encontrado en Firestore`)
      }

      const currentStatus = String((orderDoc.data() || {}).status || '')
      recordedStatus = currentStatus

      const nowIso = new Date().toISOString()
      const historyRef = db.collection(getCollectionName('order_status_history')).doc()
      transaction.set(historyRef, {
        id: historyRef.id,
        orderId: cleanOrderId,
        previousStatus: currentStatus,
        newStatus: currentStatus,
        changedBy: authResult.uid || 'admin',
        changedByEmail: authResult.email || null,
        actorRole: 'ADMIN',
        timestamp: nowIso,
        reason: cleanNote,
        metadata: {
          event: 'INCIDENTE_MANUAL',
          incidentKind: cleanKind,
          recordedBy: authResult.email || authResult.uid || 'admin'
        }
      })
    })

    return res.status(200).json({
      success: true,
      orderId: cleanOrderId,
      incidentKind: cleanKind,
      status: recordedStatus
    })
  } catch (err: unknown) {
    console.error('[Admin API Record Order Incident] Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error al registrar la incidencia'
    })
  }
}
