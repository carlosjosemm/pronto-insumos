import { CartItem, CustomerInfo } from '../types'

export const MERCADOPAGO_PUBLIC_KEY: string = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || ''

export interface MercadoPagoPaymentParams {
  orderId: string
  items: CartItem[]
  total: number
  customer: CustomerInfo
}

export interface MercadoPagoPaymentResult {
  success: boolean
  paymentId: string
  status: string
  statusDetail: string
  orderId: string
  totalPaid: number
  paidAt: string
}

export async function processMercadoPagoPayment({ orderId, total }: MercadoPagoPaymentParams): Promise<MercadoPagoPaymentResult> {
  // Simulated instant payment approval for Mercado Pago Chile
  await new Promise(resolve => setTimeout(resolve, 900))

  return {
    success: true,
    paymentId: 'MP-' + Math.floor(10000000 + Math.random() * 90000000),
    status: 'approved',
    statusDetail: 'accredited',
    orderId,
    totalPaid: total,
    paidAt: new Date().toISOString()
  }
}
