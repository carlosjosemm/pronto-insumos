import { cleanRut } from '../utils/rut'

/**
 * Requests the transactional "order received" confirmation email via the
 * serverless /api/order-confirmation endpoint.
 *
 * Fire-and-forget by design: never throws and never blocks checkout.
 * Used for bank-transfer and WhatsApp-quote orders, which are written
 * client-side to Firestore without a serverless touchpoint.
 * (Mercado Pago confirmations are sent by the verified webhook instead.)
 */
export async function sendOrderConfirmationEmail(orderId: string, customerRut: string): Promise<boolean> {
  const cleanId = (orderId || '').trim().toUpperCase()
  const normalizedRut = cleanRut(customerRut || '')

  if (!cleanId || !normalizedRut) return false

  try {
    const response = await fetch('/api/order-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: cleanId, rut: normalizedRut })
    })

    if (!response.ok) return false

    const data = await response.json().catch(() => ({}))
    return Boolean(data?.emailSent)
  } catch (err: unknown) {
    console.warn('Order confirmation email request failed (non-blocking):', err instanceof Error ? err.message : err)
    return false
  }
}
