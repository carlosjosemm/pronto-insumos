import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from '../lib/firebaseAdmin'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || 'YOUR_MERCADOPAGO_ACCESS_TOKEN'

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
          .collection('orders')
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

            const productUpdates: Array<{ ref: any; newStock: number; inStock: boolean }> = []

            for (const item of items) {
              if (item.productId) {
                const productRef = adminDb.collection('products').doc(item.productId)
                const productSnap = await transaction.get(productRef)

                if (productSnap.exists) {
                  const currentStock = Number(productSnap.data()?.stockCount) || 0
                  const quantity = Math.max(1, Number(item.quantity) || 1)
                  const newStock = Math.max(0, currentStock - quantity)
                  productUpdates.push({
                    ref: productRef,
                    newStock,
                    inStock: newStock > 0
                  })
                }
              }
            }

            // 2. Perform all writes: update order document
            transaction.update(orderDoc.ref, {
              status: 'PAGADO_MERCADOPAGO',
              mercadopagoPaymentId: String(paymentId),
              paidAt: new Date().toISOString()
            })

            // Perform all writes: update product stock documents
            for (const prodUpdate of productUpdates) {
              transaction.update(prodUpdate.ref, {
                stockCount: prodUpdate.newStock,
                inStock: prodUpdate.inStock
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
