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

  const { productId, newStock, reason, notes } = req.body || {}
  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "productId" es obligatorio' })
  }
  if (typeof newStock !== 'number' || newStock < 0) {
    return res.status(400).json({ success: false, error: 'El parámetro "newStock" debe ser un número entero mayor o igual a 0' })
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

    const productData = doc.data() || {}
    const previousStock = typeof productData.stockCount === 'number' ? productData.stockCount : 0
    const nowIso = new Date().toISOString()
    const validStock = Math.round(newStock)
    const delta = validStock - previousStock
    const adminActor = authResult.email || authResult.uid || 'admin'

    const batch = db.batch()
    batch.update(productRef, {
      stockCount: validStock,
      inStock: validStock > 0,
      lastStockAdjustment: {
        previousStock,
        newStock: validStock,
        reason: reason || 'correccion',
        notes: notes || '',
        adjustedAt: nowIso,
        adjustedBy: adminActor
      },
      updatedAt: nowIso
    })

    const auditRef = db.collection('inventory_audit_logs').doc()
    batch.set(auditRef, {
      id: auditRef.id,
      productId: productId.trim(),
      productSku: productData.sku || '',
      productName: productData.name || productId.trim(),
      changeType: 'STOCK_ADJUSTMENT',
      previousStock,
      newStock: validStock,
      delta,
      reasonCode: reason || 'correccion',
      operatorNotes: notes || '',
      changedBy: authResult.uid || 'admin',
      changedByEmail: authResult.email || null,
      actorRole: 'ADMIN',
      timestamp: nowIso
    })

    await batch.commit()

    return res.status(200).json({
      success: true,
      productId,
      stockCount: validStock,
      inStock: validStock > 0
    })
  } catch (err: any) {
    console.error('[Admin API Update Stock] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al actualizar el stock' })
  }
}
