# PRONTO Domain Models & TypeScript Contracts (`src/types/`)

This document is the **authoritative reference for data structures, domain contracts, and type invariants** across PRONTO Insumos Odontológicos. It defines the central schema shared by React UI components, client integration adapters, serverless functions, and automated test suites.

---

## 🎯 1. Directory Scope & Design Rules

* **Role:** The **single source of truth** for all business models in the application.
* **Pure Typing (Zero Runtime Overhead):** Contains strictly TypeScript interfaces, type aliases, and string literal unions. No executable JavaScript code, classes, or runtime side effects.
* **Single Location:** Components must never define ad-hoc interfaces (e.g. `interface OrderItem` inside a component file); all domain interfaces must be declared in [`src/types/index.ts`](./index.ts).
* **File map:** `index.ts` is the only module. It exports the category unions (`ChileanDentalCategory`, `ProductCategory`, `Category`), `Product`, `CartItem`, the fiscal trio (`DocumentType`, `TaxBreakdown`, `BillingInfo`), `SanitaryVerification`, `CustomerInfo`, `PaymentMethod` (`'transferencia' | 'whatsapp' | 'mercadopago'`), `OrderStatus`, `DispatchReferenceSource` (`'generated' | 'manual'` — the origin of the Task 2.13 dispatch reference), `Order`, `PromoCode` (a resolved catalog entry — `{ code, discountPercent, label }`; promo **policy** fields such as expiry, usage limits and product eligibility are unmodelled and tracked as Task 9.1), `Toast`, `SubmitOrderResult`, `OrderTrackingInfo`, `UploadVoucherResult`, and the audit trail contracts (`AuditActorRole`, `OrderStatusHistory`, `InventoryChangeType`, `InventoryAuditLog`).

---

## 🏛️ 2. Core Domain Contracts & Chilean Healthcare Models

### 2.1 Order Lifecycle Union (`OrderStatus`)

Reflects the authentic operational lifecycle of a Chilean dental supplies distributor:

```typescript
export type OrderStatus =
  | 'PENDIENTE_PAGO_MERCADOPAGO'       // Order placed via online gateway, awaiting Mercado Pago webhook
  | 'PAGADO_MERCADOPAGO'               // Payment approved cryptographically by serverless webhook
  | 'PENDIENTE_TRANSFERENCIA'          // Bank transfer selected, awaiting customer voucher upload
  | 'TRANSFERENCIA_COMPROBANTE_SUBIDO' // Customer uploaded bank voucher (PDF/PNG/JPG), awaiting warehouse review
  | 'TRANSFERENCIA_APROBADA'           // Bank transfer reconciled & approved by admin (stock deducted in the same transaction)
  | 'PAGADO_TRANSFERENCIA'             // Terminal paid state for the manual transfer flow
  | 'EN_PREPARACION'                   // Order packing in Melipilla warehouse, Factura/Boleta DTE being generated
  | 'DESPACHADO'                       // Handed to courier (Local Melipilla route or Starken/Chilexpress)
  | 'ENTREGADO'                        // Signed and received at dental clinic reception desk
  | 'CANCELADO'                        // Order cancelled due to stock exhaustion, customer request, or non-payment
  | 'COTIZACION_SOLICITADA_WHATSAPP'   // WhatsApp quotation order — no payment capture, handled manually
  | 'PENDIENTE_PAGO';                  // Generic pending-payment fallback in submitOrder()'s statusMap
```

* The union has **13 members** (as of Task 0.9, which added `PAGO_EN_REVISION` — the webhook's manual-review state for amount mismatches; see `api/AGENTS.md` §2.2). There is no `PAGO_VERIFICADO_MANUAL` and no `REEMBOLSADO` — manual reconciliation is `TRANSFERENCIA_APROBADA`, and refunds are not modeled (handle them as `CANCELADO` + a manual note).
* `VALID_ORDER_STATUSES` in [src/utils/schemaValidation.ts](../utils/schemaValidation.ts) mirrors this union and must be updated in the same change if a status is ever added.

### 2.2 Customer & Tax Identity (`CustomerInfo` & `BillingInfo`)

Captures contact, physical shipping destination, and Chilean SII electronic invoicing attributes:

```typescript
export interface CustomerInfo {
  fullName: string;              // Name of the clinician or clinic legal representative
  email: string;                 // Contact email and SII DTE reception mailbox
  phone: string;                 // Mobile / WhatsApp for delivery coordination
  rut: string;                   // Validated Chilean Modulo 11 tax ID (Personal RUN or Corporate RUT)
  documentType: DocumentType;    // 'boleta' | 'factura' — fiscal document choice
  razonSocial?: string;          // Required for Factura: Legal entity name in SII registry
  giroComercial?: string;        // Required for Factura: Economic activity description (e.g., "Servicios Odontológicos")
  address: string;               // Physical delivery street and number / Fiscal address
  city: string;                  // Commune (e.g., "Melipilla", "San Antonio")
  zip: string;                   // Postal code / Region identifier
  transferReceipt?: string;      // Bank voucher reference captured in the transfer flow
  sanitaryVerification?: SanitaryVerification; // ISP / SIS registration for controlled items
}
```

#### Why "email" is crucial for Chilean SII Compliance

In Chilean corporate tax accounting, every electronic invoice (**Factura Electrónica DTE**) must be submitted to the recipient company's official electronic tax exchange mailbox (**Casilla Electrónica DTE**).
Clinics provide this email in `CustomerInfo.email` so the resulting XML and PDF invoices reach their accounting department without delaying their monthly **Formulario 29 (F29)** tax filing.

### 2.3 Sanitary Regulation Model (`SanitaryVerification`)

Enforces compliance with **Código Sanitario DFL 725** and **Decreto Supremo 466** for prescription dental supplies and local anesthetics:

```typescript
export interface SanitaryVerification {
  sisRegistryNumber: string;    // Chilean SIS registration (Superintendencia de Salud RNPI)
  credentialFileName?: string;  // Attached credential or prescription filename
  verified: boolean;            // Flag indicating verification
  regulatoryNote: string;       // Legal compliance citation (Art. 101 DFL 725 / DTO 466)
}
```

### 2.4 Customer Order Tracking Model (`OrderTrackingInfo`)

Sanitized public tracking representation returned by `/api/track-order`. The 5-stage `fulfillment.currentStep` maps database statuses onto the customer-facing timeline (_Registrado → Comprobante/Pago → Preparación → En Ruta → Entregado_):

```typescript
export interface OrderTrackingInfo {
  orderId: string;
  createdAt: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  items: { productId: string; name: string; quantity: number; price: number }[];
  customer: {
    fullName: string; email: string; rut: string;
    address: string; city: string;
    documentType: DocumentType; razonSocial?: string;
  };
  billing?: { documentType: DocumentType; status: string; taxBreakdown?: TaxBreakdown };
  // `url` is omitted for legacy Base64 (`data:`) documents — the tracking endpoint never
  // echoes voucher bytes or a link Chrome refuses to open (Task 2.9).
  voucher?: { uploaded: boolean; url?: string; fileName?: string; uploadedAt?: string };
  fulfillment: {
    currentStep: 1 | 2 | 3 | 4 | 5;
    statusTitle: string;
    statusDescription: string;
    courier?: string;
    trackingNumber?: string;
    // Task 2.13 — present once the order was dispatched: the internal route code
    // (`generated`, e.g. `MEL-260929-07`) or the typed courier guía (`manual`).
    dispatchReference?: string;
    dispatchReferenceSource?: DispatchReferenceSource;
  };
}
```

### 2.4b Fiscal Billing Contract (`BillingInfo` & `TaxBreakdown`)

Persisted on `Order.billing` when the fiscal document is chosen; `status` starts `'PENDIENTE_EMISION_SII'` and moves to `'EMITIDO'` when the document is issued via the SII portal. **Server-derived fields (Task 1.7):** `rut`, `taxBreakdown` and `status` are always re-derived at write time by `submitOrder` (and the same bindings are enforced in `firestore.rules`), so the stored map is a display/issuance artifact that provably matches the order's verified `totalAmount` — never a trusted fiscal source on its own. Rendered surfaces (transactional emails, `track-order`) re-derive the breakdown from `totalAmount` rather than reading this map.

```typescript
export interface BillingInfo {
  documentType: DocumentType
  rut: string
  razonSocial?: string
  giroComercial?: string
  direccionFiscal: string
  comunaFiscal: string
  taxBreakdown: TaxBreakdown             // { neto, iva, total } — integer CLP, see §3
  status: 'PENDIENTE_EMISION_SII' | 'EMITIDO'
}
```

### 2.4c Order Document Contract (`Order`)

The canonical Firestore `orders` document. Everything optional below is written only when the corresponding lifecycle event happens:

```typescript
export interface Order {
  orderId: string                      // 'PRONTO-XXXXXXXX' (8 Crockford base32 chars, Task 8.8) — also the Firestore document key; legacy 'PRONTO-NNNNNN' ids still resolve
  createdAt?: any                      // see §2.7 — the single permitted `any`
  updatedAt?: string
  paymentMethod: PaymentMethod
  status: OrderStatus
  totalAmount: number                  // integer CLP, IVA incluido
  customer: CustomerInfo
  billing?: BillingInfo
  sanitaryVerification?: SanitaryVerification
  items: { productId: string; name: string; quantity: number; price: number }[]
  // Bank-transfer voucher trail (Task 2.9): the bytes live in Firebase Storage, never in
  // this document. `voucherUrl` is a Firebase download-token URL, `voucherStoragePath` the
  // object key (vouchers/{orders|dev_orders}/{orderId}/…), and `voucherSizeBytes` the real
  // object size read back from Storage. A `data:` value in `voucherUrl` means a legacy
  // pre-2.9 document (the backoffice opens those through a Blob URL).
  voucherUrl?: string; voucherStoragePath?: string; voucherFileName?: string
  voucherContentType?: string; voucherSizeBytes?: number; voucherUploadedAt?: string
  // Task 0.9 promo trail — written only at order creation so the payment webhook
  // can recompute the verified payable total from the catalog. `promoCode` is the
  // single input `create-preference` charges from (never the request body), and
  // `discountAmount` is informational (nothing reads it yet — see Task 9.1).
  promoCode?: string; discountAmount?: number
  // Fulfillment telemetry
  courier?: string; trackingNumber?: string
  mercadopagoPaymentId?: string; paidAt?: string
  approvedAt?: string; approvedBy?: string
  confirmationEmailSentAt?: string     // idempotency flag for /api/order-confirmation
  // WhatsApp-quote resolution trail — server-written by `resolve-quote` only.
  // `quoteResolution` says how the lead left the quote state: 'CONVERTIDA' (the
  // sale settled off-platform exactly as quoted; the document keeps its original
  // quote id and becomes the sale record, stamped `PAGADO_TRANSFERENCIA`) or
  // 'DECLINADA' (closed `CANCELADO` with no stock movement).
  quoteResolvedAt?: string; quoteResolution?: 'CONVERTIDA' | 'DECLINADA'; quoteResolvedBy?: string
  // Partial-refund incident trail — server-written by the Mercado Pago webhook
  // only. A partial refund keeps the payment `approved` and accumulates the
  // returned money in `transaction_amount_refunded`, so the webhook stamps the
  // payment id + cumulative amount as the durable dedup marker (a replay of the
  // same refund state writes nothing; a higher amount is a new incident).
  partialRefundPaymentId?: string; partialRefundAmount?: number; partialRefundAt?: string
  // Warehouse "voucher received" alert budget (Task 8.8) — server-written by
  // /api/upload-voucher inside the confirm transaction (a reservation released
  // best-effort when the Resend send fails). Never written by the client.
  voucherAlertSentAt?: string; voucherAlertCount?: number
  // Lifetime cap on minted voucher upload URLs (Task 2.15) — server-written by
  // /api/upload-voucher at sign time (reserved inside a transaction, so concurrent
  // signs serialize). Bounds the orphan objects left by uploads that are never
  // confirmed; never written by the client.
  voucherSignCount?: number
  // List-projection flag (Task 2.15): the admin order LIST omits the full `voucherUrl`
  // (a legacy pre-2.9 document can hold a ~1 MiB Base64 `data:` URL that would blow
  // Vercel's 4.5 MB response cap) and reports whether a voucher exists instead. The
  // `?orderId=` detail request still returns the real `voucherUrl`.
  hasVoucher?: boolean
  dispatch?: {
    carrier: string
    trackingCode?: string
    // Task 2.13 — server-written by `dispatch-order` (never the client). `reference` is
    // the customer-facing dispatch code — the minted internal route code or the typed
    // courier guía — and `referenceSource` ('generated' | 'manual') says which it is.
    reference?: string
    referenceSource?: DispatchReferenceSource
    dispatchedAt: string; dispatchedBy: string
  }
  deliveredAt?: string
}
```

### 2.5 Catalog Product Contract (`Product`)

```typescript
export interface Product {
  id: string;                    // Canonical identifier (e.g. 'odon-101')
  sku?: string;                  // Clinical SKU code (e.g. 'REF: OD-101')
  name: string;                  // Clinical product title
  brand?: string;                // Manufacturer or dental brand (e.g. '3M ESPE', 'Dentsply Sirona')
  category: string;              // Dental specialty category
  price: number;                 // Integer Chilean Pesos (IVA incluido)
  priceNeto?: number;            // Integer Chilean Pesos (Neto sin IVA, Math.round(price / 1.19))
  originalPrice?: number;        // Strikethrough price for promotions
  rating: number;                // Customer evaluation (0–5; 0 = no reviews yet — see §3.4)
  reviewsCount: number;          // Total clinician reviews
  inStock: boolean;              // Public stock flag: (stockCount > 0 && isActive !== false)
  stockCount: number;            // Physical warehouse count in Melipilla
  isActive?: boolean;            // Decoupled visibility switch (default: true). False pauses product from sales.
  prescriptionRequired: boolean; // Triggers '⚕️ Requiere SIS' badge & SIS check in checkout
  ispRegistrationNumber?: string;// Chilean ISP health registry code for controlled pharmaceuticals/devices
  tag: string;                   // Visual badge (e.g., 'MÁS VENDIDO', 'OFERTA CLÍNICA')
  description: string;           // Detailed technical overview
  specs: string[];               // Technical specifications checklist
  placeholderTheme: string;      // Fallback CSS theme class
  mediaBadge?: string;           // Optional secondary visual badge (absent on imported/legacy catalog docs; UI must guard)
  unitOfSale?: string;           // Human-readable sales unit, e.g. 'Caja 100 un' — optional; absent on legacy docs
  images?: string[];             // URLs of product photos in Firebase Storage / CDN
  packageContents?: string[];    // Itemized checklist of box contents for clinic
  manufacturer?: string;         // Clinical manufacturer
  createdAt?: string;            // ISO timestamp
  updatedAt?: string;            // ISO timestamp
}
```

### 2.6 Relational Audit Trail Contracts

#### Order Status Transition History (`OrderStatusHistory`)

```typescript
export type AuditActorRole = 'ADMIN' | 'CUSTOMER' | 'SYSTEM_WEBHOOK' | 'SYSTEM_SEED' | 'SYSTEM_CRON';

export interface OrderStatusHistory {
  id: string;                    // Document ID in order_status_history
  orderId: string;               // Foreign key pointing to orders collection
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  changedBy: string;             // User UID or system identifier
  changedByEmail?: string | null;// Staff email or 'mercadopago-webhook'
  actorRole: AuditActorRole;     // Security attribution role
  timestamp: string;             // ISO 8601 timestamp
  reason: string;                // Operational justification
  metadata?: Record<string, unknown>;// Carrier, tracking number, payment ID, etc.
}
```

#### Inventory & Warehouse Audit Log (`InventoryAuditLog`)

```typescript
export type InventoryChangeType =
  | 'STOCK_ADJUSTMENT'
  | 'ORDER_FULFILLMENT_DEDUCTION'
  | 'METADATA_UPDATE'
  | 'VISIBILITY_TOGGLE'
  | 'CATALOG_SEED';

export interface InventoryAuditLog {
  id: string;                    // Document ID in inventory_audit_logs
  productId: string;             // Foreign key pointing to products collection
  productSku?: string;
  productName?: string;
  changeType: InventoryChangeType;
  previousStock?: number | null;
  newStock?: number | null;
  delta?: number | null;
  reasonCode?: string;           // 'reposicion', 'merma', 'correccion', 'venta_manual', etc.
  operatorNotes?: string;
  changedBy: string;
  changedByEmail?: string | null;
  actorRole: AuditActorRole;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
```

---

### 2.7 Deliberate Type Escapes & Widened Records (as built)

Two type-surface decisions were made while bringing the repo under ESLint's `no-explicit-any` error rule. Both are intentional — read this before "tidying" them.

#### `Order.createdAt` stays `any` — with an inline suppression

```ts
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
}
```

* **Attempted and reverted:** typing this as `Timestamp | FieldValue | string` (via a type-only `firebase/firestore` import) is the _correct_ model, but it breaks compilation in `src/admin/components/OrderTable.tsx`, which does `new Date(order.createdAt)` at three call sites. `new Date()` only accepts `string | number | Date`, so **no** precise union works without also changing the admin portal.
* **Do not narrow `createdAt` unilaterally.** Narrowing it and the admin read path must happen in the same change, as its own reviewed task. This is the single permitted `any` in the codebase.
* `serverTimestamp()` is still the correct write value — do not switch order creation to a client `new Date()` just to make the type nicer; that would trade a server-authoritative timestamp for the clinic's device clock.
* `OrderStatusHistory.timestamp` and `InventoryAuditLog.timestamp` are `string` (ISO 8601) — unlike `Order.createdAt`, they are always written by server code as `new Date().toISOString()`.

#### Audit `metadata` is `Record<string, unknown>`, not `Record<string, any>`

`OrderStatusHistory.metadata` and `InventoryAuditLog.metadata` were widened from `any` to `unknown` values. Rationale: these records carry operator- and system-supplied context (carrier, tracking number, payment ID, reason codes) whose _shape is not part of the domain contract_. `unknown` forces any consumer to narrow before use, while `any` silently propagated untyped access through the audit timeline UI.

* **Consumer rule:** cast at the point of use (e.g. `const meta = entry.metadata as { carrier?: string }`) rather than loosening the interface.
* **Producer rule:** the serverless webhooks and admin endpoints that write these records are unchanged — only the _read_ typing tightened.

---

## 💰 3. Chilean Monetary Conventions & Invariants

1. **CLP Integer Pricing (NO CENTS):**
   * The currency is **Chilean Peso (CLP)**.
   * Fractional values (`189.99`) are strictly forbidden. All monetary fields (`price`, `subtotal`, `tax`, `shippingCost`, `total`) must be integers.
2. **IVA Included in Display Prices:**
   * Per Chilean consumer law (**SERNAC**), public consumer-facing prices always include 19% IVA (`IVA incluido`).
   * When invoicing, the net amount is extracted using `Math.round(total / 1.19)` and IVA is `Math.round(total - net)`.
3. **Synchronized Net Pricing (`priceNeto`):**
   * In catalog updates, `priceNeto` is always stored as `Math.round(price / 1.19)` to maintain alignment between inventory valuation and Chilean SII tax books.
4. **Fixture data may sit outside the `1–5` rating band intentionally:**
   * `rating` is typed `number` with a comment "1 to 5", but all in-repo fixtures carry `rating: 0` (no fabricated social proof — see [src/data/AGENTS.md](../data/AGENTS.md) §3.5). `0` is a valid sentinel meaning "no reviews yet"; the UI renders stars only when `reviewsCount > 0`.
