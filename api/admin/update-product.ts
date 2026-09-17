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

  const { productId, name, price, description, category, prescriptionRequired, tag } = req.body || {}
  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "productId" es obligatorio' })
  }

  const db = getAdminFirestore()
  if (!db) {
    return res.status(500).json({ success: false, error: 'Base de datos no inicializada' })
  }

  try {
    const productRef = db.collection('products').doc(productId.trim())
    const doc = await productRef.get()
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' })
    }

    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString()
    }

    if (name && typeof name === 'string') updates.name = name.trim()
    if (typeof price === 'number' && price > 0) updates.price = Math.round(price)
    if (description !== undefined) updates.description = String(description).trim()
    if (category && typeof category === 'string') updates.category = category.trim()
    if (typeof prescriptionRequired === 'boolean') updates.prescriptionRequired = prescriptionRequired
    if (tag !== undefined) updates.tag = String(tag).trim()

    await productRef.update(updates)

    return res.status(200).json({
      success: true,
      productId,
      updates
    })
  } catch (err: any) {
    console.error('[Admin API Update Product] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al actualizar el producto' })
  }
}
