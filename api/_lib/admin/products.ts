import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'

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

  const { category } = req.query

  try {
    const snap = await db.collection(getCollectionName('products')).get()
    const products: any[] = []

    snap.forEach(doc => {
      const data = doc.data()
      products.push({
        ...data,
        id: doc.id
      })
    })

    let filtered = products
    if (category && typeof category === 'string' && category !== 'all') {
      filtered = filtered.filter(p => p.category === category)
    }

    return res.status(200).json({
      success: true,
      products: filtered,
      total: filtered.length
    })
  } catch (err: any) {
    console.error('[Admin API Products] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al obtener catálogo' })
  }
}
