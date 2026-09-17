import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from '../lib/firebaseAdmin'
import { verifyAdminToken } from '../lib/adminAuth'

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

  const { orderId } = req.body || {}
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "orderId" es obligatorio' })
  }

  const db = getAdminFirestore()
  if (!db) {
    return res.status(500).json({ success: false, error: 'Base de datos no inicializada' })
  }

  try {
    const orderRef = db.collection('orders').doc(orderId.trim())
    const doc = await orderRef.get()
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' })
    }

    const currentStatus = doc.data()?.status || null
    const nowIso = new Date().toISOString()
    const historyRef = db.collection('order_status_history').doc()

    const batch = db.batch()
    batch.update(orderRef, {
      status: 'ENTREGADO',
      deliveredAt: nowIso,
      updatedAt: nowIso
    })

    batch.set(historyRef, {
      id: historyRef.id,
      orderId: orderId.trim(),
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

    await batch.commit()

    return res.status(200).json({
      success: true,
      orderId,
      status: 'ENTREGADO',
      deliveredAt: nowIso
    })
  } catch (err: any) {
    console.error('[Admin API Mark Delivered] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al marcar como entregado' })
  }
}
