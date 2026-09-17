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

  try {
    const ordersSnap = await db.collection('orders').get()
    const productsSnap = await db.collection('products').get()

    const todayStr = new Date().toISOString().slice(0, 10)
    const currentMonthStr = new Date().toISOString().slice(0, 7)

    let salesToday = 0
    let pendingOrders = 0
    let ordersThisMonth = 0

    ordersSnap.forEach(doc => {
      const data = doc.data()
      const status = data.status || ''
      const total = typeof data.totalAmount === 'number' ? data.totalAmount : 0
      const createdAt = data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : String(data.createdAt)) : ''
      const paidAt = data.paidAt || (status === 'PAGADO_MERCADOPAGO' || status === 'TRANSFERENCIA_APROBADA' ? createdAt : '')

      // Count orders this month
      if (createdAt.startsWith(currentMonthStr)) {
        ordersThisMonth++
      }

      // Check sales today
      if ((status === 'PAGADO_MERCADOPAGO' || status === 'TRANSFERENCIA_APROBADA' || status === 'PAGADO_TRANSFERENCIA') && paidAt.startsWith(todayStr)) {
        salesToday += total
      }

      // Check pending
      if (status.startsWith('PENDIENTE_') || status === 'TRANSFERENCIA_COMPROBANTE_SUBIDO') {
        pendingOrders++
      }
    })

    let lowStockProducts = 0
    productsSnap.forEach(doc => {
      const data = doc.data()
      const stock = typeof data.stockCount === 'number' ? data.stockCount : 0
      const inStock = data.inStock !== false
      if (inStock && stock <= 5) {
        lowStockProducts++
      }
    })

    return res.status(200).json({
      success: true,
      stats: {
        salesToday,
        pendingOrders,
        lowStockProducts,
        ordersThisMonth
      }
    })
  } catch (err: any) {
    console.error('[Admin API Dashboard Stats] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al calcular estadísticas' })
  }
}
