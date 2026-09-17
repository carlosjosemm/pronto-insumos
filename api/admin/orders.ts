import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from '../lib/firebaseAdmin'
import { verifyAdminToken } from '../lib/adminAuth'

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

  const db = getAdminFirestore()
  if (!db) {
    return res.status(500).json({ success: false, error: 'Base de datos no inicializada' })
  }

  const { orderId, status, search, limit } = req.query

  try {
    // If orderId requested specifically
    if (orderId && typeof orderId === 'string') {
      const doc = await db.collection('orders').doc(orderId.trim()).get()
      if (!doc.exists) {
        // Try searching by orderId field
        const snap = await db.collection('orders').where('orderId', '==', orderId.trim()).limit(1).get()
        if (snap.empty) {
          return res.status(404).json({ success: false, error: 'Pedido no encontrado' })
        }
        const data = snap.docs[0].data()
        return res.status(200).json({ success: true, order: { ...data, orderId: snap.docs[0].id } })
      }
      return res.status(200).json({ success: true, order: { ...doc.data(), orderId: doc.id } })
    }

    const snap = await db.collection('orders').get()
    let orders: any[] = []

    snap.forEach(doc => {
      const data = doc.data()
      const createdAt = data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : String(data.createdAt)) : ''
      orders.push({
        ...data,
        orderId: data.orderId || doc.id,
        createdAt
      })
    })

    // Sort by createdAt desc
    orders.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime()
      const dateB = new Date(b.createdAt || 0).getTime()
      return dateB - dateA
    })

    // Filter by status if provided
    if (status && typeof status === 'string' && status !== 'all') {
      if (status === 'TRANSFERENCIA_APROBADA') {
        orders = orders.filter(o => o.status === 'TRANSFERENCIA_APROBADA' || o.status === 'PAGADO_TRANSFERENCIA')
      } else {
        orders = orders.filter(o => o.status === status)
      }
    }

    // Filter by search if provided
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.toLowerCase().trim()
      orders = orders.filter(o => {
        const idMatch = (o.orderId || '').toLowerCase().includes(q)
        const nameMatch = (o.customer?.fullName || '').toLowerCase().includes(q)
        const razonMatch = (o.customer?.razonSocial || '').toLowerCase().includes(q)
        const rutMatch = (o.customer?.rut || '').toLowerCase().includes(q)
        return idMatch || nameMatch || razonMatch || rutMatch
      })
    }

    const maxCount = limit ? parseInt(limit as string, 10) : 50
    const limitedOrders = orders.slice(0, maxCount)

    return res.status(200).json({
      success: true,
      orders: limitedOrders,
      total: orders.length
    })
  } catch (err: any) {
    console.error('[Admin API Orders] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al obtener pedidos' })
  }
}
