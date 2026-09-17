import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from '../lib/firebaseAdmin'
import { verifyAdminToken } from '../lib/adminAuth'
import { getCollectionName } from '../lib/firestoreEnv'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método no permitido' })
  }

  const authResult = await verifyAdminToken(req)
  if (!authResult.authenticated) {
    return res.status(403).json({ success: false, error: authResult.error })
  }

  const { orderId } = req.query || {}
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "orderId" es obligatorio' })
  }

  const db = getAdminFirestore()
  if (!db) {
    return res.status(500).json({ success: false, error: 'Base de datos no inicializada' })
  }

  try {
    const snap = await db
      .collection(getCollectionName('order_status_history'))
      .where('orderId', '==', orderId.trim())
      .get()

    const history = snap.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .sort((a: any, b: any) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
        return timeA - timeB
      })

    return res.status(200).json({
      success: true,
      orderId: orderId.trim(),
      history
    })
  } catch (err: any) {
    console.error('[Admin API Order History] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al obtener historial' })
  }
}
