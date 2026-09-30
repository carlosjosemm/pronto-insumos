import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setAdminResponseHeaders(res, 'GET, OPTIONS')

  if (isAdminPreflight(req)) {
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
