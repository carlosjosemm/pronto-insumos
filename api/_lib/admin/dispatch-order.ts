import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Transaction } from 'firebase-admin/firestore'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'
import {
  DISPATCH_REFERENCE_COLLECTION,
  chileanDateKey,
  counterDocumentId,
  formatDispatchReference,
  planDispatchReference,
  resolveDispatchReferencePrefix
} from '../dispatchReference.js'
import type { DispatchReferenceSource } from '../../../src/types'

/**
 * Statuses from which an order may be marked `DESPACHADO`. `DESPACHADO` is
 * included so an already-shipped order can be re-dispatched to add or correct
 * its courier guía (covered by the handler tests); a pending, cancelled, quote
 * or review-parked order must never ship.
 */
const DISPATCHABLE_STATUSES = new Set([
  'PAGADO_MERCADOPAGO',
  'TRANSFERENCIA_APROBADA',
  'PAGADO_TRANSFERENCIA',
  'EN_PREPARACION',
  'DESPACHADO'
])

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

  const { orderId, carrier, trackingCode } = req.body || {}
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "orderId" es obligatorio' })
  }
  if (!carrier || typeof carrier !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "carrier" es obligatorio' })
  }

  const db = getAdminFirestore()
  if (!db) {
    return res.status(500).json({ success: false, error: 'Base de datos no inicializada' })
  }

  const ordersCol = getCollectionName('orders')

  try {
    let orderRef = db.collection(ordersCol).doc(orderId.trim())
    let doc = await orderRef.get()
    if (!doc.exists) {
      const querySnap = await db.collection(ordersCol).where('orderId', '==', orderId.trim()).limit(1).get()
      if (querySnap.empty) {
        return res.status(404).json({ success: false, error: 'Pedido no encontrado' })
      }
      doc = querySnap.docs[0]
      orderRef = doc.ref
    }

    const nowIso = new Date().toISOString()
    const cleanCarrier = carrier.trim()
    const cleanTrackingCode =
      trackingCode === undefined || trackingCode === null ? '' : String(trackingCode).trim()
    const adminActor = authResult.email || authResult.uid || 'admin'

    // The dispatch and its reference are written in ONE transaction, so a
    // dispatch can never be recorded without its route code and the daily counter can
    // never be bumped by a dispatch that failed. All reads precede all writes.
    const dispatch = await db.runTransaction(async (transaction: Transaction) => {
      const orderDoc = await transaction.get(orderRef)
      if (!orderDoc.exists) {
        throw new Error(`Pedido "${orderId}" no encontrado en Firestore`)
      }

      const orderData = orderDoc.data() || {}
      const currentStatus = orderData.status || null
      const existingDispatch = orderData.dispatch || {}

      // Only a paid/approved order (or an already-dispatched one being
      // re-dispatched) may ship. A pending, cancelled, quote or review-parked
      // order must never be handed to a courier.
      if (!DISPATCHABLE_STATUSES.has(String(currentStatus))) {
        return { conflict: true as const, currentStatus: String(currentStatus || '') }
      }

      // A dispatch written before references existed stored its guía only in
      // `dispatch.trackingCode`; promote it
      // so a code-less re-dispatch keeps that guía instead of minting a route code that
      // would mask it (the admin panel and the customer both prefer `reference`).
      const legacyTrackingCode =
        typeof existingDispatch.trackingCode === 'string' ? existingDispatch.trackingCode : ''

      const plan = planDispatchReference({
        typedCode: cleanTrackingCode,
        existingReference: existingDispatch.reference || legacyTrackingCode,
        existingSource: existingDispatch.reference
          ? existingDispatch.referenceSource
          : legacyTrackingCode
            ? 'manual'
            : undefined
      })

      let reference: string
      let referenceSource: DispatchReferenceSource
      if (plan.kind === 'mint') {
        const dateKey = chileanDateKey(new Date(nowIso))
        const prefix = resolveDispatchReferencePrefix(orderData.customer?.city)
        const counterRef = db
          .collection(getCollectionName(DISPATCH_REFERENCE_COLLECTION))
          .doc(counterDocumentId(prefix, dateKey))
        const counterDoc = await transaction.get(counterRef)
        const lastNumber = counterDoc.exists ? Number(counterDoc.data()?.lastNumber) : 0
        const nextSequence = Number.isInteger(lastNumber) && lastNumber > 0 ? lastNumber + 1 : 1
        transaction.set(counterRef, { lastNumber: nextSequence, updatedAt: nowIso }, { merge: true })
        reference = formatDispatchReference(prefix, dateKey, nextSequence)
        referenceSource = 'generated'
      } else {
        reference = plan.reference
        referenceSource = plan.kind === 'manual' ? 'manual' : plan.source
      }

      const dispatchData: Record<string, unknown> = {
        carrier: cleanCarrier,
        reference,
        referenceSource,
        dispatchedAt: nowIso,
        dispatchedBy: adminActor
      }

      // The Admin SDK rejects `undefined` field values, and the local
      // Melipilla fleet usually ships without a tracking code — so the keys are
      // omitted entirely instead of written as `undefined`. A code-less re-dispatch
      // keeps the guía recorded by the previous dispatch (the whole `dispatch` map
      // is replaced by `update()`, exactly like the untouched top-level
      // `trackingNumber`).
      const carriedTrackingCode =
        cleanTrackingCode ||
        (typeof existingDispatch.trackingCode === 'string' ? existingDispatch.trackingCode.trim() : '')
      if (carriedTrackingCode) {
        dispatchData.trackingCode = carriedTrackingCode
      }

      const orderUpdate: Record<string, unknown> = {
        status: 'DESPACHADO',
        dispatch: dispatchData,
        courier: cleanCarrier,
        updatedAt: nowIso
      }
      if (cleanTrackingCode) {
        orderUpdate.trackingNumber = cleanTrackingCode
      }

      transaction.update(orderRef, orderUpdate)

      const historyRef = db.collection(getCollectionName('order_status_history')).doc()
      transaction.set(historyRef, {
        id: historyRef.id,
        orderId: orderId.trim(),
        previousStatus: currentStatus,
        newStatus: 'DESPACHADO',
        changedBy: authResult.uid || 'admin',
        changedByEmail: authResult.email || null,
        actorRole: 'ADMIN',
        timestamp: nowIso,
        reason: `Despachado vía ${cleanCarrier} (${
          referenceSource === 'manual' ? 'N° Seguimiento' : 'Ref. Despacho'
        }: ${reference})`,
        metadata: {
          carrier: cleanCarrier,
          trackingNumber: cleanTrackingCode || null,
          dispatchReference: reference,
          referenceSource
        }
      })

      return { conflict: false as const, reference, referenceSource, dispatchData }
    })

    if (dispatch.conflict) {
      return res.status(409).json({
        success: false,
        error: `El pedido no está listo para despacho (estado actual: ${dispatch.currentStatus || 'desconocido'}).`,
        currentStatus: dispatch.currentStatus
      })
    }

    return res.status(200).json({
      success: true,
      orderId,
      status: 'DESPACHADO',
      dispatch: dispatch.dispatchData,
      dispatchReference: dispatch.reference,
      referenceSource: dispatch.referenceSource
    })
  } catch (err: any) {
    console.error('[Admin API Dispatch Order] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al despachar el pedido' })
  }
}
