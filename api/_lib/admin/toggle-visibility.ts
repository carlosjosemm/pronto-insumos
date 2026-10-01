import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Transaction } from 'firebase-admin/firestore'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'

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
    const productRef = db.collection(getCollectionName('products')).doc(productId.trim())
    const nowIso = new Date().toISOString()

    // Read-modify-write in ONE transaction: deriving `inStock` from a stock value
    // read outside the transaction would let a concurrent webhook deduction leave
    // `inStock` stale (visible product reported out of stock, or vice versa).
    const result = await db.runTransaction(async (transaction: Transaction) => {
      const doc = await transaction.get(productRef)
      if (!doc.exists) {
        return { notFound: true as const }
      }

      const productData = doc.data() || {}
      const currentStock = typeof productData.stockCount === 'number' ? productData.stockCount : 0
      const computedInStock = currentStock > 0 && visible

      transaction.update(productRef, {
        isActive: visible,
        inStock: computedInStock,
        updatedAt: nowIso
      })

      const auditRef = db.collection(getCollectionName('inventory_audit_logs')).doc()
      transaction.set(auditRef, {
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

      return { notFound: false as const, computedInStock }
    })

    if (result.notFound) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' })
    }

    return res.status(200).json({
      success: true,
      productId,
      isActive: visible,
      inStock: result.computedInStock
    })
  } catch (err: unknown) {
    console.error('[Admin API Toggle Visibility] Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error al cambiar la visibilidad del producto'
    })
  }
}
