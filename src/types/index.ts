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

export interface SanitaryVerification {
  sisRegistryNumber: string
  credentialFileName?: string
  verified: boolean
  regulatoryNote: string
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
  sanitaryVerification?: SanitaryVerification
}

export type PaymentMethod = 'transferencia' | 'whatsapp' | 'mercadopago'

export type OrderStatus =
  | 'PENDIENTE_PAGO_MERCADOPAGO'
  | 'PAGADO_MERCADOPAGO'
  | 'PENDIENTE_TRANSFERENCIA'
  | 'TRANSFERENCIA_COMPROBANTE_SUBIDO'
  | 'TRANSFERENCIA_APROBADA'
  | 'PAGADO_TRANSFERENCIA'
  | 'EN_PREPARACION'
  | 'DESPACHADO'
  | 'ENTREGADO'
  | 'CANCELADO'
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
  sanitaryVerification?: SanitaryVerification
  items: {
    productId: string
    name: string
    quantity: number
    price: number
  }[]
  voucherUrl?: string
  voucherFileName?: string
  voucherUploadedAt?: string
  courier?: string
  trackingNumber?: string
  mercadopagoPaymentId?: string
  paidAt?: string
  approvedAt?: string
  approvedBy?: string
  dispatch?: {
    carrier: 'starken' | 'chilexpress' | 'blue_express' | 'despacho_local_melipilla' | string
    trackingCode?: string
    dispatchedAt: string
    dispatchedBy: string
  }
  deliveredAt?: string
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

export interface OrderTrackingInfo {
  orderId: string
  createdAt: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  totalAmount: number
  items: {
    productId: string
    name: string
    quantity: number
    price: number
  }[]
  customer: {
    fullName: string
    email: string
    rut: string
    address: string
    city: string
    documentType: DocumentType
    razonSocial?: string
  }
  billing?: {
    documentType: DocumentType
    status: string
    taxBreakdown?: TaxBreakdown
  }
  voucher?: {
    uploaded: boolean
    url?: string
    fileName?: string
    uploadedAt?: string
  }
  fulfillment: {
    currentStep: 1 | 2 | 3 | 4 | 5
    statusTitle: string
    statusDescription: string
    courier?: string
    trackingNumber?: string
  }
}

export interface UploadVoucherResult {
  success: boolean
  orderId: string
  voucherUrl?: string
  status: OrderStatus
  message?: string
  error?: string
}
