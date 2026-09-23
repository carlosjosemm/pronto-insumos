import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'
import { validateProductSchema } from '../../../src/utils/schemaValidation.js'
import type { Product, InventoryAuditLog } from '../../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
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

    const parsedPrice = parseInt(String(price), 10)
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ error: 'El precio debe ser un número entero mayor a 0 en CLP.' })
    }

    const parsedStock = parseInt(String(stockCount), 10)
    if (isNaN(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ error: 'El stock debe ser un número entero mayor o igual a 0.' })
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
      price: parsedPrice,
      priceNeto: Math.round(parsedPrice / 1.19),
      stockCount: parsedStock,
      inStock: parsedStock > 0,
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
      newStock: parsedStock,
      delta: parsedStock,
      reasonCode: 'creacion_manual',
      operatorNotes: 'Registro manual de nuevo insumo desde el panel de administración',
      changedBy: authResult.uid || 'ADMIN',
      changedByEmail: authResult.email || 'admin@prontoinsumos.cl',
      actorRole: 'ADMIN',
      timestamp: nowIso,
      metadata: {
        category: cleanCategory,
        price: parsedPrice
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
