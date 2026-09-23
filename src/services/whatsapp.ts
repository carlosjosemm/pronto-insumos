import { CartItem, CustomerInfo } from '../types'
import { formatCLP } from '../utils/currency'

export interface WhatsAppQuoteParams {
  orderId: string
  customer: CustomerInfo
  items: CartItem[]
  total: number
}

/**
 * WhatsApp Quote Generator for PRONTO INSUMOS ODONTOLÓGICOS (Melipilla & RM)
 */
export function generateWhatsAppQuoteUrl({ orderId, customer, items, total }: WhatsAppQuoteParams): string {
  const phone = import.meta.env?.VITE_WHATSAPP_NUMBER || '56929831595'

  const itemsText = items
    .map((i) => `• *${i.quantity}x* ${i.product.name} - ${formatCLP(i.product.price * i.quantity)}`)
    .join('\n')

  const sisText = customer.sanitaryVerification?.sisRegistryNumber
    ? `\n*Registro Sanitario SIS:* ${customer.sanitaryVerification.sisRegistryNumber}`
    : ''

  const message = `🏥 *SOLICITUD DE COTIZACIÓN - PRONTO INSUMOS ODONTOLÓGICOS*

*N° Pedido:* ${orderId}
*Cliente/Clínica:* ${customer.fullName}
*Email:* ${customer.email}
*Dirección Despacho:* ${customer.address}, ${customer.city}${sisText}

📋 *DETALLE DE INSUMOS:*
${itemsText}

💰 *TOTAL ESTIMADO (incluye IVA):* ${formatCLP(total)}

----------------------------------------------
*Nota:* Por favor confirmar disponibilidad inmediata y condiciones de despacho para Melipilla.`

  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/${phone}?text=${encodedMessage}`
}
