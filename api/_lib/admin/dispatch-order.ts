import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'

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

    const currentStatus = doc.data()?.status || null
    const nowIso = new Date().toISOString()
    const cleanCarrier = carrier.trim()
    const cleanTrackingCode =
      trackingCode === undefined || trackingCode === null ? '' : String(trackingCode).trim()

    const dispatchData: Record<string, unknown> = {
      carrier: cleanCarrier,
      dispatchedAt: nowIso,
      dispatchedBy: authResult.email || authResult.uid || 'admin'
    }

    // Task 0.15: the Admin SDK rejects `undefined` field values, and the local Melipilla
    // fleet usually ships without a tracking code — so the keys are omitted entirely
    // instead of written as `undefined` (which 500'd every code-less dispatch).
    const orderUpdate: Record<string, unknown> = {
      status: 'DESPACHADO',
      dispatch: dispatchData,
      courier: cleanCarrier,
      updatedAt: nowIso
    }
    if (cleanTrackingCode) {
      dispatchData.trackingCode = cleanTrackingCode
      orderUpdate.trackingNumber = cleanTrackingCode
    }

    const batch = db.batch()
    batch.update(orderRef, orderUpdate)

    const historyRef = db.collection(getCollectionName('order_status_history')).doc()
    batch.set(historyRef, {
      id: historyRef.id,
      orderId: orderId.trim(),
      previousStatus: currentStatus,
      newStatus: 'DESPACHADO',
      changedBy: authResult.uid || 'admin',
      changedByEmail: authResult.email || null,
      actorRole: 'ADMIN',
      timestamp: nowIso,
      reason: `Despachado vía ${cleanCarrier}${cleanTrackingCode ? ` (N° Seguimiento: ${cleanTrackingCode})` : ''}`,
      metadata: {
        carrier: cleanCarrier,
        trackingNumber: cleanTrackingCode || null
      }
    })

    await batch.commit()

    return res.status(200).json({
      success: true,
      orderId,
      status: 'DESPACHADO',
      dispatch: dispatchData
    })
  } catch (err: any) {
    console.error('[Admin API Dispatch Order] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al despachar el pedido' })
  }
}
