import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'
import { MAX_STOCK_UNITS, isValidStockUnits } from './adminLimits.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setAdminResponseHeaders(res)

  if (isAdminPreflight(req)) {
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
  // `newStock` is a count of whole units: a NaN, Infinity, fractional, negative
  // or absurd value is rejected outright rather than silently rounded.
  if (!isValidStockUnits(newStock)) {
    return res.status(400).json({
      success: false,
      error: `El parámetro "newStock" debe ser un número entero entre 0 y ${MAX_STOCK_UNITS} unidades`
    })
  }

  const db = getAdminFirestore()
  if (!db) {
    return res.status(500).json({ success: false, error: 'Base de datos no inicializada' })
  }

  try {
    const productRef = db.collection(getCollectionName('products')).doc(productId.trim())
    const nowIso = new Date().toISOString()
    const adminActor = authResult.email || authResult.uid || 'admin'

    // The read-modify-write runs in ONE transaction: reading the stock outside a
    // transaction and then writing a batch would let a concurrent webhook stock
    // deduction be silently overwritten by this adjustment.
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(productRef)
      if (!doc.exists) {
        return { notFound: true as const }
      }

      const productData = doc.data() || {}
      const previousStock = typeof productData.stockCount === 'number' ? productData.stockCount : 0
      const delta = newStock - previousStock
      const isProductActive = productData.isActive !== false
      const computedInStock = newStock > 0 && isProductActive

      transaction.update(productRef, {
        stockCount: newStock,
        inStock: computedInStock,
        lastStockAdjustment: {
          previousStock,
          newStock,
          reason: reason || 'correccion',
          notes: notes || '',
          adjustedAt: nowIso,
          adjustedBy: adminActor
        },
        updatedAt: nowIso
      })

      const auditRef = db.collection(getCollectionName('inventory_audit_logs')).doc()
      transaction.set(auditRef, {
        id: auditRef.id,
        productId,
        productSku: productData.sku || '',
        productName: productData.name || productId,
        changeType: 'STOCK_ADJUSTMENT',
        previousStock,
        newStock,
        delta,
        reasonCode: reason || 'correccion',
        operatorNotes: notes || '',
        changedBy: authResult.uid || 'admin',
        changedByEmail: authResult.email || null,
        actorRole: 'ADMIN',
        timestamp: nowIso
      })

      return { notFound: false as const, computedInStock }
    })

    if (result.notFound) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' })
    }

    return res.status(200).json({
      success: true,
      productId,
      stockCount: newStock,
      inStock: result.computedInStock
    })
  } catch (err: unknown) {
    console.error('[Admin API Update Stock] Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error al actualizar el stock'
    })
  }
}
