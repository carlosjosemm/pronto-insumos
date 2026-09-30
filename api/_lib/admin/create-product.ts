import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'
import { validateProductSchema } from '../../../src/utils/schemaValidation.js'
import { MAX_CLP, MAX_STOCK_UNITS, isValidClpAmount, isValidStockUnits } from './adminLimits.js'
import type { Product, InventoryAuditLog } from '../../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setAdminResponseHeaders(res)

  if (isAdminPreflight(req)) {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 1. Verify staff admin authorization token
  const authResult = await verifyAdminToken(req)
  if (!authResult.authenticated) {
    return res.status(403).json({ success: false, error: authResult.error || 'Acceso no autorizado' })
  }

  try {
    const {
      name,
      category,
      price,
      stockCount = 10,
      manufacturer,
      brand,
      description = '',
      prescriptionRequired = false,
      tag = '',
      specs = [],
      packageContents = [],
      images = []
    } = req.body || {}

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'El nombre del producto es obligatorio.' })
    }

    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return res.status(400).json({ error: 'La especialidad o categoría es obligatoria.' })
    }

    // Whole-peso CLP, number-only: the shared guard rejects fractional, non-finite,
    // out-of-range and string input, instead of the silent truncation `parseInt` did
    // (`189.99` → `189`, `'12abc'` → `12`) which let a typo change the catalog price.
    if (!isValidClpAmount(price)) {
      return res.status(400).json({
        error: `El precio debe ser un número entero en CLP entre 1 y ${MAX_CLP}.`
      })
    }

    if (!isValidStockUnits(stockCount)) {
      return res.status(400).json({
        error: `El stock debe ser un número entero entre 0 y ${MAX_STOCK_UNITS} unidades.`
      })
    }

    const adminDb = getAdminFirestore()
    if (!adminDb) {
      return res.status(500).json({ error: 'Database service unavailable' })
    }

    const nowIso = new Date().toISOString()
    const cleanCategory = category.trim().toUpperCase()
    const cleanBrand = (brand || manufacturer || 'PRONTO Insumos').trim()
    
    // Generate unique canonical identifier
    const randomSuffix = Math.random().toString(36).substring(2, 7)
    const productId = `pronto-${Date.now().toString(36)}-${randomSuffix}`
    const sku = `REF-${cleanBrand.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()}-${randomSuffix.toUpperCase()}`

    const newProduct: Product = {
      id: productId,
      sku,
      name: name.trim(),
      category: cleanCategory,
      brand: cleanBrand,
      manufacturer: cleanBrand,
      price: price,
      priceNeto: Math.round(price / 1.19),
      stockCount: stockCount,
      inStock: stockCount > 0,
      isActive: true,
      prescriptionRequired: !!prescriptionRequired,
      tag: (tag || '').trim(),
      description: description.trim() || name.trim(),
      specs: Array.isArray(specs) ? specs : [],
      images: Array.isArray(images) ? images : [],
      packageContents: Array.isArray(packageContents) ? packageContents : [],
      placeholderTheme: 'gradient-teal',
      mediaBadge: cleanBrand,
      rating: 5.0,
      reviewsCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso
    }

    // 2. Validate strictly against frozen schema
    const validation = validateProductSchema(newProduct)
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Datos del insumo no conformes con el esquema congelado.',
        details: validation.errors
      })
    }

    // 3. Save product + audit atomically in a single batch
    const productsCol = getCollectionName('products')
    const productRef = adminDb.collection(productsCol).doc(productId)

    const auditLogsCol = getCollectionName('inventory_audit_logs')
    const auditRef = adminDb.collection(auditLogsCol).doc()
    const auditEntry: InventoryAuditLog = {
      id: auditRef.id,
      productId,
      productSku: sku,
      productName: newProduct.name,
      changeType: 'STOCK_ADJUSTMENT',
      previousStock: null,
      newStock: stockCount,
      delta: stockCount,
      reasonCode: 'creacion_manual',
      operatorNotes: 'Registro manual de nuevo insumo desde el panel de administración',
      changedBy: authResult.uid || 'ADMIN',
      changedByEmail: authResult.email || 'admin@prontoinsumos.cl',
      actorRole: 'ADMIN',
      timestamp: nowIso,
      metadata: {
        category: cleanCategory,
        price
      }
    }

    const batch = adminDb.batch()
    batch.set(productRef, newProduct)
    batch.set(auditRef, auditEntry)
    await batch.commit()

    return res.status(200).json({
      success: true,
      product: newProduct,
      auditId: auditRef.id
    })
  } catch (error: any) {
    console.error('Error creating product:', error)
    return res.status(500).json({
      error: 'Error interno al registrar el insumo.',
      details: error.message
    })
  }
}
