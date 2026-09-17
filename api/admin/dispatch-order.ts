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

  try {
    const orderRef = db.collection('orders').doc(orderId.trim())
    const doc = await orderRef.get()
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' })
    }

    const nowIso = new Date().toISOString()
    const dispatchData = {
      carrier: carrier.trim(),
      trackingCode: trackingCode ? String(trackingCode).trim() : undefined,
      dispatchedAt: nowIso,
      dispatchedBy: authResult.uid || 'admin'
    }

    await orderRef.update({
      status: 'DESPACHADO',
      dispatch: dispatchData,
      courier: carrier.trim(),
      trackingNumber: trackingCode ? String(trackingCode).trim() : undefined,
      updatedAt: nowIso
    })

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
