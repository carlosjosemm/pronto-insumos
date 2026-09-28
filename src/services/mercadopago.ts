import { CartItem, CustomerInfo } from '../types'
import { isSimulatedFallbackAllowed } from './simulationPolicy'

export const MERCADOPAGO_PUBLIC_KEY: string = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || ''

export interface MercadoPagoPaymentParams {
  orderId: string
  items: CartItem[]
  total: number
  customer: CustomerInfo
}

export interface MercadoPagoPaymentResult {
  success: boolean
  paymentId?: string
  status?: string
  statusDetail?: string
  orderId: string
  totalPaid?: number
  paidAt?: string
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
    return {
      success: true,
      initPoint: data.initPoint || data.sandboxInitPoint
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

  // If running on live Vercel deployment with valid initPoint, open Mercado Pago Checkout Pro
  if (prefResult.initPoint && typeof window !== 'undefined') {
    window.location.href = prefResult.initPoint
  }

  return {
    success: true,
    paymentId: 'MP-' + Math.floor(10000000 + Math.random() * 90000000),
    status: 'approved',
    statusDetail: 'accredited',
    orderId,
    totalPaid: total,
    paidAt: new Date().toISOString(),
    initPoint: prefResult.initPoint
  }
}
