import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Transaction } from 'firebase-admin/firestore'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'

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

  const { orderId } = req.body || {}
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "orderId" es obligatorio' })
  }

  const db = getAdminFirestore()
  if (!db) {
    return res.status(500).json({ success: false, error: 'Base de datos no inicializada' })
  }

  const ordersCol = getCollectionName('orders')
  const cleanOrderId = orderId.trim()

  try {
    let orderRef = db.collection(ordersCol).doc(cleanOrderId)
    const initialCheck = await orderRef.get()
    if (!initialCheck.exists) {
      const querySnap = await db.collection(ordersCol).where('orderId', '==', cleanOrderId).limit(1).get()
      if (querySnap.empty) {
        return res.status(404).json({ success: false, error: 'Pedido no encontrado' })
      }
      orderRef = querySnap.docs[0].ref
    }

    const nowIso = new Date().toISOString()

    // The status decision and the write run in ONE transaction so two concurrent
    // confirmations cannot both observe DESPACHADO and append duplicate history
    // events for a single delivery.
    const result = await db.runTransaction(async (transaction: Transaction) => {
      const orderDoc = await transaction.get(orderRef)
      if (!orderDoc.exists) {
        throw new Error(`Pedido "${cleanOrderId}" no encontrado en Firestore`)
      }

      const currentStatus = String((orderDoc.data() || {}).status || '')

      // Receipt may only close a dispatched order; anything else (pending, paid
      // but not shipped, cancelled, quote) must not jump straight to ENTREGADO.
      if (currentStatus === 'ENTREGADO') {
        return { outcome: 'duplicate' as const, currentStatus }
      }
      if (currentStatus !== 'DESPACHADO') {
        return { outcome: 'conflict' as const, currentStatus }
      }

      transaction.update(orderRef, {
        status: 'ENTREGADO',
        deliveredAt: nowIso,
        updatedAt: nowIso
      })

      const historyRef = db.collection(getCollectionName('order_status_history')).doc()
      transaction.set(historyRef, {
        id: historyRef.id,
        orderId: cleanOrderId,
        previousStatus: currentStatus,
        newStatus: 'ENTREGADO',
        changedBy: authResult.uid || 'admin',
        changedByEmail: authResult.email || null,
        actorRole: 'ADMIN',
        timestamp: nowIso,
        reason: 'Confirmación final de entrega y recepción conforme',
        metadata: {
          confirmedBy: authResult.email || authResult.uid || 'admin'
        }
      })

      return { outcome: 'ok' as const }
    })

    if (result.outcome === 'conflict') {
      return res.status(409).json({
        success: false,
        error: `Solo un pedido despachado puede marcarse como entregado (estado actual: ${
          result.currentStatus || 'desconocido'
        }).`,
        currentStatus: result.currentStatus
      })
    }

    if (result.outcome === 'duplicate') {
      return res.status(200).json({
        success: true,
        orderId: cleanOrderId,
        status: 'ENTREGADO',
        duplicate: true
      })
    }

    return res.status(200).json({
      success: true,
      orderId: cleanOrderId,
      status: 'ENTREGADO',
      deliveredAt: nowIso
    })
  } catch (err: unknown) {
    console.error('[Admin API Mark Delivered] Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error al marcar como entregado'
    })
  }
}
