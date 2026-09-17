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

  const { orderId } = req.body || {}
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ success: false, error: 'El parámetro "orderId" es obligatorio' })
  }

  const db = getAdminFirestore()
  if (!db) {
    return res.status(500).json({ success: false, error: 'Base de datos no inicializada' })
  }

  try {
    const orderRef = db.collection('orders').doc(orderId.trim())

    const result = await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef)
      if (!orderDoc.exists) {
        throw new Error(`Pedido "${orderId}" no encontrado en Firestore`)
      }

      const orderData = orderDoc.data() || {}
      const currentStatus = orderData.status

      // Idempotency: If already approved or paid, acknowledge without double decrementing
      if (
        currentStatus === 'TRANSFERENCIA_APROBADA' ||
        currentStatus === 'PAGADO_TRANSFERENCIA' ||
        currentStatus === 'PAGADO_MERCADOPAGO'
      ) {
        return { duplicate: true, currentStatus }
      }

      const items: any[] = Array.isArray(orderData.items) ? orderData.items : []

      // Read all products referenced in order items
      const productDocsToUpdate: { ref: FirebaseFirestore.DocumentReference; newStock: number }[] = []

      for (const item of items) {
        const productId = item.productId || item.id
        if (!productId) continue

        const productRef = db.collection('products').doc(productId)
        const productDoc = await transaction.get(productRef)

        if (productDoc.exists) {
          const productData = productDoc.data() || {}
          const currentStock = typeof productData.stockCount === 'number' ? productData.stockCount : 0
          const qty = typeof item.quantity === 'number' ? item.quantity : 1
          const newStock = Math.max(0, currentStock - qty)

          productDocsToUpdate.push({
            ref: productRef,
            productId,
            name: productData.name || item.name || productId,
            sku: productData.sku || '',
            previousStock: currentStock,
            newStock,
            delta: -qty
          })
        }
      }

      const nowIso = new Date().toISOString()
      const adminActor = authResult.email || authResult.uid || 'admin'

      // Execute all inventory writes and audit logs
      for (const update of productDocsToUpdate) {
        transaction.update(update.ref, {
          stockCount: update.newStock,
          inStock: update.newStock > 0,
          updatedAt: nowIso
        })

        const auditRef = db.collection('inventory_audit_logs').doc()
        transaction.set(auditRef, {
          id: auditRef.id,
          productId: update.productId,
          productSku: update.sku,
          productName: update.name,
          changeType: 'ORDER_FULFILLMENT_DEDUCTION',
          previousStock: update.previousStock,
          newStock: update.newStock,
          delta: update.delta,
          reasonCode: 'venta_manual',
          operatorNotes: `Rebaja automática por aprobación de transferencia de orden ${orderId}`,
          changedBy: authResult.uid || 'admin',
          changedByEmail: authResult.email || null,
          actorRole: 'ADMIN',
          timestamp: nowIso,
          metadata: { orderId }
        })
      }

      // Update order status
      transaction.update(orderRef, {
        status: 'TRANSFERENCIA_APROBADA',
        approvedAt: nowIso,
        approvedBy: adminActor,
        updatedAt: nowIso
      })

      // Record order status history
      const historyRef = db.collection('order_status_history').doc()
      transaction.set(historyRef, {
        id: historyRef.id,
        orderId,
        previousStatus: currentStatus,
        newStatus: 'TRANSFERENCIA_APROBADA',
        changedBy: authResult.uid || 'admin',
        changedByEmail: authResult.email || null,
        actorRole: 'ADMIN',
        timestamp: nowIso,
        reason: 'Aprobación de transferencia bancaria y rebaja de stock en bodega Melipilla',
        metadata: {
          approvedBy: adminActor,
          itemsCount: items.length
        }
      })

      return { duplicate: false, approvedAt: nowIso }
    })

    return res.status(200).json({
      success: true,
      orderId,
      ...result
    })
  } catch (err: any) {
    console.error('[Admin API Approve Transfer] Error:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error al aprobar la transferencia' })
  }
}
