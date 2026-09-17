import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from '../lib/firebaseAdmin'
import { verifyAdminToken } from '../lib/adminAuth'
import { getCollectionName } from '../lib/firestoreEnv'

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
    const dispatchData = {
      carrier: carrier.trim(),
      trackingCode: trackingCode ? String(trackingCode).trim() : undefined,
      dispatchedAt: nowIso,
      dispatchedBy: authResult.email || authResult.uid || 'admin'
    }

    const batch = db.batch()
    batch.update(orderRef, {
      status: 'DESPACHADO',
      dispatch: dispatchData,
      courier: carrier.trim(),
      trackingNumber: trackingCode ? String(trackingCode).trim() : undefined,
      updatedAt: nowIso
    })

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
      reason: `Despachado vía ${carrier.trim()}${trackingCode ? ` (N° Seguimiento: ${trackingCode})` : ''}`,
      metadata: {
        carrier: carrier.trim(),
        trackingNumber: trackingCode ? String(trackingCode).trim() : null
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
