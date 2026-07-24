import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../../src/services/firebase'
import { collection, query, where, getDocs, updateDoc, doc, runTransaction } from 'firebase/firestore'

// Placeholder fallback for Mercado Pago Access Token
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || 'YOUR_MERCADOPAGO_ACCESS_TOKEN'

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
        // Find order in Firestore
        const ordersRef = collection(db, 'orders')
        const q = query(ordersRef, where('orderId', '==', orderId))
        const orderSnapshot = await getDocs(q)

        if (!orderSnapshot.empty) {
          const orderDoc = orderSnapshot.docs[0]
          const orderData = orderDoc.data()

          // Update order status to PAGADO_MERCADOPAGO
          await updateDoc(doc(db, 'orders', orderDoc.id), {
            status: 'PAGADO_MERCADOPAGO',
            mercadopagoPaymentId: paymentId,
            paidAt: new Date().toISOString()
          })

          // Execute atomic stock deduction in Firestore products collection
          if (Array.isArray(orderData.items)) {
            await runTransaction(db, async (transaction: any) => {
              for (const item of orderData.items) {
                if (item.productId) {
                  const productRef = doc(db, 'products', item.productId)
                  const productSnap = await transaction.get(productRef)

                  if (productSnap.exists()) {
                    const currentStock = productSnap.data().stockCount || 0
                    const newStock = Math.max(0, currentStock - item.quantity)
                    transaction.update(productRef, {
                      stockCount: newStock,
                      inStock: newStock > 0
                    })
                  }
                }
              }
            })
          }
        }
      }
    }

    return res.status(200).json({ received: true, verifiedStatus: paymentData.status })
  } catch (error: any) {
    console.error('Error processing Mercado Pago Webhook:', error)
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
}
