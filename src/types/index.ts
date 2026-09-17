export type ProductCategory = 'Diagnostics' | 'Instruments' | 'Materials' | 'Sterilization' | 'all'

export interface Category {
  id: ProductCategory
  name: string
  icon: string
}

export interface Product {
  id: string
  name: string
  category: string
  price: number
  originalPrice?: number
  rating: number
  reviewsCount: number
  inStock: boolean
  stockCount: number
  prescriptionRequired: boolean
  tag: string
  description: string
  specs: string[]
  placeholderTheme: string
  mediaBadge: string
  images?: string[]
  packageContents?: string[]
  manufacturer?: string
}

export interface CartItem {
  product: Product
  quantity: number
}

export type DocumentType = 'boleta' | 'factura'

export interface TaxBreakdown {
  neto: number
  iva: number
  total: number
}

export interface BillingInfo {
  documentType: DocumentType
  rut: string
  razonSocial?: string
  giroComercial?: string
  direccionFiscal: string
  comunaFiscal: string
  taxBreakdown: TaxBreakdown
  status: 'PENDIENTE_EMISION_SII' | 'EMITIDO'
}

export interface CustomerInfo {
  fullName: string
  email: string
  phone: string
  rut: string
  documentType: DocumentType
  razonSocial?: string
  giroComercial?: string
  address: string
  city: string
  zip: string
  transferReceipt?: string
}

export type PaymentMethod = 'transferencia' | 'whatsapp' | 'mercadopago'

export type OrderStatus =
  | 'PENDIENTE_PAGO_MERCADOPAGO'
  | 'PAGADO_MERCADOPAGO'
  | 'PENDIENTE_TRANSFERENCIA'
  | 'COTIZACION_SOLICITADA_WHATSAPP'
  | 'PENDIENTE_PAGO'

export interface Order {
  orderId: string
  createdAt?: any
  paymentMethod: PaymentMethod
  status: OrderStatus
  totalAmount: number
  customer: CustomerInfo
  billing?: BillingInfo
  items: {
    productId: string
    name: string
    quantity: number
    price: number
  }[]
}

export interface PromoCode {
  code: string
  discountPercent: number
  label: string
}

export interface Toast {
  id: number
  message: string
}

export interface SubmitOrderResult {
  success: boolean
  orderId: string
  timestamp: string
  total: number
  itemsCount: number
}
