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

  const { productId, visible } = req.body || {}
  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "productId" es obligatorio' })
  }
  if (typeof visible !== 'boolean') {
    return res.status(400).json({ success: false, error: 'El parámetro "visible" debe ser booleano' })
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
    const nowIso = new Date().toISOString()
    const currentStock = typeof productData.stockCount === 'number' ? productData.stockCount : 0
    const isNowActive = visible

    const batch = db.batch()
    batch.update(productRef, {
      isActive: isNowActive,
      inStock: currentStock > 0 && isNowActive,
      updatedAt: nowIso
    })

    const auditRef = db.collection('inventory_audit_logs').doc()
    batch.set(auditRef, {
      id: auditRef.id,
      productId: productId.trim(),
      productSku: productData.sku || '',
      productName: productData.name || productId.trim(),
      changeType: 'VISIBILITY_TOGGLE',
      previousStock: productData.stockCount ?? null,
      newStock: productData.stockCount ?? null,
      delta: 0,
      reasonCode: visible ? 'activacion_catalogo' : 'pausa_catalogo',
      operatorNotes: `Visibilidad cambiada a ${visible ? 'VISIBLE' : 'PAUSADO'}`,
      changedBy: authResult.uid || 'admin',
      changedByEmail: authResult.email || null,
      actorRole: 'ADMIN',
      timestamp: nowIso
    })

    await batch.commit()

    return res.status(200).json({
      success: true,
      productId,
      inStock: visible
    })
  } catch (err: any) {
    console.error('[Admin API Toggle Visibility] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al cambiar la visibilidad del producto' })
  }
}
