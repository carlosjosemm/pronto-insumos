import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'
import { MAX_CLP, isValidClpAmount } from './adminLimits.js'

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

  const { productId, name, price, description, category, prescriptionRequired, tag } = req.body || {}
  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "productId" es obligatorio' })
  }

  // A price, when supplied, must be a whole-peso integer in range. Silently
  // rounding a fractional or out-of-range value would let a typo change the
  // charged catalog price.
  if (price !== undefined) {
    if (!isValidClpAmount(price)) {
      return res.status(400).json({
        success: false,
        error: `El precio debe ser un número entero en CLP entre 1 y ${MAX_CLP}.`
      })
    }
  }

  const db = getAdminFirestore()
  if (!db) {
    return res.status(500).json({ success: false, error: 'Base de datos no inicializada' })
  }

  try {
    const productRef = db.collection(getCollectionName('products')).doc(productId.trim())
    const doc = await productRef.get()
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' })
    }

    const productData = doc.data() || {}
    const nowIso = new Date().toISOString()
    const updates: Record<string, unknown> = {
      updatedAt: nowIso
    }

    if (name && typeof name === 'string') updates.name = name.trim()
    if (price !== undefined) {
      updates.price = price
      updates.priceNeto = Math.round(price / 1.19)
    }
    if (description !== undefined) updates.description = String(description).trim()
    // Categories are frozen uppercase keys shared with the storefront aliases,
    // so a typed lowercase value must be normalized here.
    if (category && typeof category === 'string') updates.category = category.trim().toUpperCase()
    if (typeof prescriptionRequired === 'boolean') updates.prescriptionRequired = prescriptionRequired
    if (tag !== undefined) updates.tag = String(tag).trim()

    const previousPrice = typeof productData.price === 'number' ? productData.price : null
    const priceChanged = price !== undefined && previousPrice !== price
    const modifiedFields = Object.keys(updates).filter(k => k !== 'updatedAt')

    const batch = db.batch()
    batch.update(productRef, updates)

    const auditRef = db.collection(getCollectionName('inventory_audit_logs')).doc()
    batch.set(auditRef, {
      id: auditRef.id,
      productId: productId.trim(),
      productSku: productData.sku || '',
      productName: updates.name || productData.name || productId.trim(),
      changeType: 'METADATA_UPDATE',
      previousStock: productData.stockCount ?? null,
      newStock: productData.stockCount ?? null,
      delta: 0,
      reasonCode: 'correccion',
      operatorNotes: `Actualización de metadatos: ${modifiedFields.join(', ')}${
        priceChanged ? `; precio ${previousPrice ?? '—'} → ${price}` : ''
      }`,
      changedBy: authResult.uid || 'admin',
      changedByEmail: authResult.email || null,
      actorRole: 'ADMIN',
      timestamp: nowIso,
      metadata: {
        modifiedFields,
        // The old/new price travel with the audit entry so a price change is
        // auditable after the fact.
        ...(priceChanged ? { previousPrice, newPrice: price } : {})
      }
    })

    await batch.commit()

    return res.status(200).json({
      success: true,
      productId,
      updates
    })
  } catch (err: unknown) {
    console.error('[Admin API Update Product] Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error al actualizar el producto'
    })
  }
}
