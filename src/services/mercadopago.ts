import { CartItem, CustomerInfo } from '../types'
import { isSimulatedFallbackAllowed } from './simulationPolicy'

export const MERCADOPAGO_PUBLIC_KEY: string = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || ''

export interface MercadoPagoPaymentParams {
  orderId: string
  items: CartItem[]
  total: number
  customer: CustomerInfo
}

/**
 * The outcome of starting a Mercado Pago checkout. Success means exactly one
 * thing: a real Checkout Pro redirect was (or is about to be) initiated. No
 * payment id, status or timestamp is ever invented here — the payment webhook
 * is the only authority for what actually got paid.
 */
export interface MercadoPagoPaymentResult {
  success: boolean
  orderId: string
  initPoint?: string
  error?: string
}

/**
 * Call the Vercel serverless API endpoint to create a Mercado Pago Checkout Pro Preference
 */
export async function createMercadoPagoPreference(
  params: MercadoPagoPaymentParams
): Promise<{ success: boolean; initPoint?: string; error?: string }> {
  try {
    const response = await fetch('/api/create-preference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => null)
      const serverError = typeof errData?.error === 'string' ? errData.error : undefined
      return {
        success: false,
        error: serverError || `El servicio de pagos rechazó la solicitud (${response.status}).`
      }
    }

    const data = await response.json()
    const initPoint =
      typeof data?.initPoint === 'string' && data.initPoint
        ? data.initPoint
        : typeof data?.sandboxInitPoint === 'string' && data.sandboxInitPoint
          ? data.sandboxInitPoint
          : undefined

    // A 200 response without a redirect target is not a success: the shopper
    // would be left on the checkout with nothing happening while the endpoint
    // claims everything went fine. Report it as the failure it is.
    if (!initPoint && !data?.isSimulated) {
      console.error(
        'La respuesta de /api/create-preference no incluyó un enlace de pago (initPoint); tratándola como fallo.'
      )
      return {
        success: false,
        error: 'El servicio de pagos no devolvió un enlace de pago válido. Por favor reintenta o cotiza por WhatsApp.'
      }
    }

    return {
      success: true,
      initPoint
    }
  } catch (error: unknown) {
    if (!isSimulatedFallbackAllowed()) {
      console.error(
        'No fue posible contactar /api/create-preference en un runtime de producción:',
        error instanceof Error ? error.message : error
      )
      return {
        success: false,
        error: 'No fue posible contactar al servicio de pagos. Por favor reintenta o cotiza por WhatsApp.'
      }
    }
    console.warn(
      'Vercel serverless preference endpoint not active in current environment, using fallback simulation:',
      error instanceof Error ? error.message : error
    )
    return {
      success: true,
      initPoint: undefined
    }
  }
}

/**
 * Process Mercado Pago payment (invokes serverless endpoint when hosted, simulated locally)
 */
export async function processMercadoPagoPayment({
  orderId,
  items,
  total,
  customer
}: MercadoPagoPaymentParams): Promise<MercadoPagoPaymentResult> {
  // No promo code is sent: `/api/create-preference` resolves the discount from the
  // order document it already registered, so the charge can never be driven by a
  // client-supplied code that disagrees with the order.
  const prefResult = await createMercadoPagoPreference({ orderId, items, total, customer })

  if (!prefResult.success) {
    return {
      success: false,
      orderId,
      error: prefResult.error
    }
  }

  // With a real redirect target, hand the browser to Mercado Pago Checkout Pro.
  if (prefResult.initPoint && typeof window !== 'undefined') {
    window.location.href = prefResult.initPoint
  }

  // Success means "the redirect was initiated" (or, in the local simulation,
  // "the demo flow may continue") — never "the payment was approved". The
  // webhook is the only authority that marks an order paid.
  return {
    success: true,
    orderId,
    initPoint: prefResult.initPoint
  }
}
