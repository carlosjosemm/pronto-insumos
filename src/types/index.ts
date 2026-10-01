export type ChileanDentalCategory =
  | 'DESECHABLES, ESTERILIZACION Y DESINFECCION'
  | 'ENDODONCIA'
  | 'HIGIENE BUCAL'
  | 'IMPRESION'
  | 'INSTRUMENTAL Y ACCESORIOS'
  | 'OPERATORIA'

export type ProductCategory = 'all' | ChileanDentalCategory | (string & {})

export interface Category {
  id: ProductCategory
  name: string
  icon: string
}

export interface Product {
  id: string
  sku?: string
  name: string
  brand?: string
  category: string
  price: number
  priceNeto?: number
  originalPrice?: number
  rating: number
  reviewsCount: number
  inStock: boolean
  stockCount: number
  isActive?: boolean
  prescriptionRequired: boolean
  ispRegistrationNumber?: string
  tag: string
  description: string
  specs: string[]
  placeholderTheme: string
  mediaBadge?: string
  unitOfSale?: string // Human-readable sales unit, e.g. 'Caja 100 un' — optional; absent on legacy docs
  images?: string[]
  packageContents?: string[]
  manufacturer?: string
  createdAt?: string
  updatedAt?: string
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
  | 'PAGO_EN_REVISION'
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

/**
 * Origin of the dispatch reference. `generated` = minted by the
 * `dispatch-order` handler for a courier-less delivery (a warehouse route code
 * such as `MEL-260929-07` — NOT a courier guía); `manual` = typed by the
 * warehouse (a real Starken/Chilexpress guía), which supersedes the generated one.
 */
export type DispatchReferenceSource = 'generated' | 'manual'

/**
 * Server-written telemetry for one customer-facing transactional email kind
 * ('confirmation' = order received, 'payment' = paid/approved notice).
 * `sentAt` is the durable sent marker; `claimedAt` is an in-flight send
 * reservation (written inside a transaction so concurrent sends serialize,
 * reclaimable once stale); `failedAt`/`failureReason` record the last send
 * failure for backoffice visibility until the next success clears them;
 * `resendCount` bounds manual resends per kind.
 */
export interface EmailDeliveryEntry {
  sentAt?: string
  claimedAt?: string
  failedAt?: string
  failureReason?: string
  resendCount?: number
}

export interface Order {
  orderId: string
  /**
   * Firestore order timestamp: written as a `serverTimestamp()` sentinel, read
   * back as a `Timestamp`, seeded as an ISO string. Deliberately left open —
   * the admin portal passes this straight to `new Date(...)`, so narrowing it
   * here breaks `src/admin/components/OrderTable.tsx`. Tighten both sides
   * together in a dedicated pass.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdAt?: any
  updatedAt?: string
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
  // Bank-transfer voucher trail: the bytes live in Firebase Storage —
  // `voucherUrl` is a download-token URL and `voucherStoragePath` the object key.
  // A `data:` URL here means a legacy document written before the Storage flow.
  voucherUrl?: string
  voucherStoragePath?: string
  voucherFileName?: string
  voucherContentType?: string
  voucherSizeBytes?: number
  voucherUploadedAt?: string
  // Promo trail — persisted so the payment webhook can recompute the verified
  // payable total from the catalog; written only at order creation.
  promoCode?: string
  discountAmount?: number
  courier?: string
  trackingNumber?: string
  mercadopagoPaymentId?: string
  paidAt?: string
  approvedAt?: string
  approvedBy?: string
  confirmationEmailSentAt?: string
  // Transactional-mail telemetry: server-written only (api/_lib/emailDelivery).
  // `confirmation` reads the legacy `confirmationEmailSentAt` marker as sent
  // when no `sentAt` exists yet; new sends keep writing both.
  emailDelivery?: {
    confirmation?: EmailDeliveryEntry
    payment?: EmailDeliveryEntry
  }
  // WhatsApp-quote resolution trail: server-written by `resolve-quote` only.
  // `quoteResolution` says how the lead left the quote state ('CONVERTIDA' = the
  // sale settled off-platform exactly as quoted; 'DECLINADA' = closed without a
  // sale), and `quoteResolvedAt`/`quoteResolvedBy` attribute the human decision.
  quoteResolvedAt?: string
  quoteResolution?: 'CONVERTIDA' | 'DECLINADA'
  quoteResolvedBy?: string
  // Partial-refund incident trail: server-written by the Mercado Pago webhook
  // only. A partial refund keeps the payment `approved` and accumulates the
  // returned money in `transaction_amount_refunded`, so the webhook stamps the
  // payment id + cumulative amount as the durable dedup marker (a replay of the
  // same refund state writes nothing; a higher amount is a new incident).
  partialRefundPaymentId?: string
  partialRefundAmount?: number
  partialRefundAt?: string
  // Warehouse-alert budget for the "voucher received" email: server-written.
  // The stamp is a RESERVATION committed inside the confirm transaction (so concurrent
  // confirms serialize on the order document) and released best-effort when the Resend
  // send fails — never written by the client.
  voucherAlertSentAt?: string
  voucherAlertCount?: number
  // Lifetime cap on minted voucher upload URLs: server-written by /api/upload-voucher
  // at sign time (reserved inside a transaction, so concurrent signs serialize).
  // Bounds orphan objects left by uploads that are never confirmed; never client-written.
  voucherSignCount?: number
  // List-projection flag: the admin order LIST omits the full `voucherUrl` (legacy
  // pre-2.9 documents can hold a ~1 MiB Base64 `data:` URL that would blow Vercel's
  // 4.5 MB response cap) and reports whether a voucher exists instead. The
  // `?orderId=` detail request still returns the real `voucherUrl`.
  hasVoucher?: boolean
  dispatch?: {
    carrier: 'starken' | 'chilexpress' | 'blue_express' | 'despacho_local_melipilla' | string
    trackingCode?: string
    // Server-written by `dispatch-order`. `reference` is the customer-facing
    // dispatch code (generated route code or the admin-typed guía), `referenceSource`
    // says which of the two it is. Never client-written.
    reference?: string
    referenceSource?: DispatchReferenceSource
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
    // Present once the order was dispatched: the real courier guía
    // (`manual`) or the internal route code (`generated`) the customer can quote.
    dispatchReference?: string
    dispatchReferenceSource?: DispatchReferenceSource
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

export type AuditActorRole = 'ADMIN' | 'CUSTOMER' | 'SYSTEM_WEBHOOK' | 'SYSTEM_SEED' | 'SYSTEM_CRON'

export interface OrderStatusHistory {
  id: string
  orderId: string
  previousStatus: OrderStatus | null
  newStatus: OrderStatus
  changedBy: string
  changedByEmail?: string | null
  actorRole: AuditActorRole
  timestamp: string
  reason: string
  metadata?: Record<string, unknown>
}

export type InventoryChangeType =
  'STOCK_ADJUSTMENT' | 'ORDER_FULFILLMENT_DEDUCTION' | 'METADATA_UPDATE' | 'VISIBILITY_TOGGLE' | 'CATALOG_SEED'

export interface InventoryAuditLog {
  id: string
  productId: string
  productSku?: string
  productName?: string
  changeType: InventoryChangeType
  previousStock?: number | null
  newStock?: number | null
  delta?: number | null
  reasonCode?: string
  operatorNotes?: string
  changedBy: string
  changedByEmail?: string | null
  actorRole: AuditActorRole
  timestamp: string
  metadata?: Record<string, unknown>
}
