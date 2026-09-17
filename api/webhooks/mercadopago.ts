import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from '../lib/firebaseAdmin'
import { verifyMercadoPagoSignature } from '../lib/mercadopagoSignature'
import { getCollectionName } from '../lib/firestoreEnv'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || 'YOUR_MERCADOPAGO_ACCESS_TOKEN'
  const MERCADOPAGO_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET || ''

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Only accept POST or GET ping requests
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Mercado Pago Webhook Endpoint Active' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { body, query: reqQuery } = req

    // Extract Payment ID from Mercado Pago webhook notification payload
    const paymentId = body?.data?.id || body?.id || reqQuery?.['data.id'] || reqQuery?.id

    if (!paymentId) {
      return res.status(200).json({ received: true, note: 'No payment ID in webhook payload' })
    }

    // Step 0: CRYPTOGRAPHIC SIGNATURE VERIFICATION (x-signature / x-request-id)
    const headers = req.headers || {}
    const dataIdForSignature = reqQuery?.['data.id'] || reqQuery?.id || body?.data?.id || body?.id
    const signatureResult = verifyMercadoPagoSignature({
      signatureHeader: headers['x-signature'],
      requestIdHeader: headers['x-request-id'],
      dataId: dataIdForSignature,
      secret: MERCADOPAGO_WEBHOOK_SECRET
    })

    if (!signatureResult.valid) {
      console.warn(`[Mercado Pago Webhook] Unauthorized request: ${signatureResult.reason}`)
      return res.status(401).json({
        error: 'Unauthorized: Invalid or missing webhook signature',
        reason: signatureResult.reason
      })
    }

    // Step 1: DOUBLE-CHECK PAYMENT WITH MERCADO PAGO OFFICIAL API USING SECRET TOKEN
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
      }
    })

    if (!mpResponse.ok) {
      console.warn(`Mercado Pago API verification failed for payment ID ${paymentId}: ${mpResponse.statusText}`)
      return res.status(200).json({ received: true, note: 'Payment verification failed or credentials placeholder' })
    }

    const paymentData = await mpResponse.json()

    // Step 2: VERIFY PAYMENT STATUS IS APPROVED
    if (paymentData.status === 'approved') {
      const orderId = paymentData.external_reference || paymentData.description

      if (orderId) {
        const cleanOrderId = String(orderId).trim().toUpperCase()
        const adminDb = getAdminFirestore()

        if (!adminDb) {
          console.warn('Firestore Admin not initialized; skipping database updates')
          return res.status(200).json({
            received: true,
            verifiedStatus: paymentData.status,
            warning: 'Firestore Admin unavailable'
          })
        }

        // Find order in Firestore using Admin SDK
        const orderSnapshot = await adminDb
          .collection(getCollectionName('orders'))
          .where('orderId', '==', cleanOrderId)
          .limit(1)
          .get()

        if (!orderSnapshot.empty) {
          const orderDoc = orderSnapshot.docs[0]
          const orderData = orderDoc.data()

          // Fast-Path Idempotency Check:
          // If the order has already been marked as PAGADO_MERCADOPAGO or already recorded this payment ID,
          // acknowledge immediately with HTTP 200 without re-decrementing stock.
          if (
            orderData.status === 'PAGADO_MERCADOPAGO' ||
            orderData.mercadopagoPaymentId === String(paymentId)
          ) {
            console.info(
              `[Mercado Pago Webhook] Order "${cleanOrderId}" is already processed (status: ${orderData.status}, paymentId: ${orderData.mercadopagoPaymentId}). Skipping duplicate processing.`
            )
            return res.status(200).json({
              received: true,
              verifiedStatus: paymentData.status,
              duplicate: true,
              message: 'Order already processed'
            })
          }

          // Execute atomic transaction for order status update and stock deduction.
          // In Firestore transactions, all reads MUST precede all writes.
          await adminDb.runTransaction(async (transaction) => {
            const freshOrderSnap = await transaction.get(orderDoc.ref)
            const freshOrderData = freshOrderSnap.data()

            // Concurrency Guard: verify order was not updated concurrently
            if (
              freshOrderData?.status === 'PAGADO_MERCADOPAGO' ||
              freshOrderData?.mercadopagoPaymentId === String(paymentId)
            ) {
              console.info(
                `[Mercado Pago Webhook] Order "${cleanOrderId}" was marked as paid during concurrent transaction.`
              )
              return
            }

            // 1. Read all product documents first (all reads before writes)
            const items = Array.isArray(freshOrderData?.items)
              ? freshOrderData.items
              : Array.isArray(orderData.items)
                ? orderData.items
                : []

            const productUpdates: Array<{
              ref: any
              productId: string
              name: string
              sku: string
              previousStock: number
              newStock: number
              quantity: number
              inStock: boolean
            }> = []

            // Consolidate duplicate line items by productId to prevent transactional overwrite
            const consolidatedItems = new Map<string, { qty: number; name?: string }>()
            for (const item of items) {
              const pid = item.productId || item.id
              if (!pid) continue
              const existing = consolidatedItems.get(pid) || { qty: 0, name: item.name }
              existing.qty += Math.max(1, Number(item.quantity) || 1)
              if (item.name) existing.name = item.name
              consolidatedItems.set(pid, existing)
            }

            for (const [productId, info] of consolidatedItems.entries()) {
              const productRef = adminDb.collection(getCollectionName('products')).doc(productId)
              const productSnap = await transaction.get(productRef)

              if (productSnap.exists) {
                const pData = productSnap.data() || {}
                const currentStock = Number(pData.stockCount) || 0
                const newStock = Math.max(0, currentStock - info.qty)
                const isActive = pData.isActive !== false
                productUpdates.push({
                  ref: productRef,
                  productId,
                  name: pData.name || info.name || productId,
                  sku: pData.sku || '',
                  previousStock: currentStock,
                  newStock,
                  quantity: info.qty,
                  inStock: newStock > 0 && isActive
                })
              }
            }

            const nowIso = new Date().toISOString()

            // 2. Perform all writes: update order document
            transaction.update(orderDoc.ref, {
              status: 'PAGADO_MERCADOPAGO',
              mercadopagoPaymentId: String(paymentId),
              paidAt: nowIso,
              updatedAt: nowIso
            })

            // Record order status history
            const historyRef = adminDb.collection(getCollectionName('order_status_history')).doc()
            transaction.set(historyRef, {
              id: historyRef.id,
              orderId: cleanOrderId,
              previousStatus: freshOrderData?.status || orderData.status || null,
              newStatus: 'PAGADO_MERCADOPAGO',
              changedBy: 'MERCADOPAGO_WEBHOOK',
              changedByEmail: 'webhook@mercadopago.cl',
              actorRole: 'SYSTEM_WEBHOOK',
              timestamp: nowIso,
              reason: `Pago aprobado por Mercado Pago (ID: ${paymentId})`,
              metadata: {
                paymentId: String(paymentId),
                paymentStatus: paymentData.status,
                transactionAmount: paymentData.transaction_amount
              }
            })

            // Perform all writes: update product stock documents and audit logs
            for (const prodUpdate of productUpdates) {
              transaction.update(prodUpdate.ref, {
                stockCount: prodUpdate.newStock,
                inStock: prodUpdate.inStock,
                updatedAt: nowIso
              })

              const auditRef = adminDb.collection(getCollectionName('inventory_audit_logs')).doc()
              transaction.set(auditRef, {
                id: auditRef.id,
                productId: prodUpdate.productId,
                productSku: prodUpdate.sku,
                productName: prodUpdate.name,
                changeType: 'ORDER_FULFILLMENT_DEDUCTION',
                previousStock: prodUpdate.previousStock,
                newStock: prodUpdate.newStock,
                delta: -prodUpdate.quantity,
                reasonCode: 'orden_compra',
                operatorNotes: `Rebaja automática por pago Mercado Pago de orden ${cleanOrderId}`,
                changedBy: 'MERCADOPAGO_WEBHOOK',
                changedByEmail: 'webhook@mercadopago.cl',
                actorRole: 'SYSTEM_WEBHOOK',
                timestamp: nowIso,
                metadata: { orderId: cleanOrderId, paymentId: String(paymentId) }
              })
            }
          })
        } else {
          console.warn(`[Mercado Pago Webhook] Order "${cleanOrderId}" not found in Firestore for payment ${paymentId}`)
        }
      }
    }

    return res.status(200).json({ received: true, verifiedStatus: paymentData.status })
  } catch (error: any) {
    console.error('Error processing Mercado Pago Webhook:', error)
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
}
