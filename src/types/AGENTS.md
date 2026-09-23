# PRONTO Domain Models & TypeScript Contracts (`src/types/`)

This document is the **authoritative reference for data structures, domain contracts, and type invariants** across PRONTO Insumos Odontológicos. It defines the central schema shared by React UI components, client integration adapters, serverless functions, and automated test suites.

---

## 🎯 1. Directory Scope & Design Rules

* **Role:** The **single source of truth** for all business models in the application.
* **Pure Typing (Zero Runtime Overhead):** Contains strictly TypeScript interfaces, type aliases, and string literal unions. No executable JavaScript code, classes, or runtime side effects.
* **Single Location:** Components must never define ad-hoc interfaces (e.g. `interface OrderItem` inside a component file); all domain interfaces must be declared in [`src/types/index.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/types/index.ts).

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
  | 'PAGO_VERIFICADO_MANUAL'           // Bank transfer reconciled against Banco de Chile by Melipilla staff
  | 'PAGADO_TRANSFERENCIA'             // Bank transfer approved and reconciled
  | 'EN_PREPARACION'                   // Order packing in Melipilla warehouse, Factura/Boleta DTE being generated
  | 'DESPACHADO'                       // Handed to courier (Local Melipilla route or Starken/Chilexpress)
  | 'ENTREGADO'                        // Signed and received at dental clinic reception desk
  | 'CANCELADO'                        // Order cancelled due to stock exhaustion, customer request, or non-payment
  | 'REEMBOLSADO';                     // Payment refunded via gateway or manual bank reversal
```

### 2.2 Customer & Tax Identity (`CustomerInfo` & `BillingInfo`)
Captures contact, physical shipping destination, and Chilean SII electronic invoicing attributes:

```typescript
export interface CustomerInfo {
  fullName: string;              // Name of the clinician or clinic legal representative
  email: string;                 // Contact email and SII DTE reception mailbox
  phone: string;                 // Mobile / WhatsApp for delivery coordination
  rut: string;                   // Validated Chilean Modulo 11 tax ID (Personal RUN or Corporate RUT)
  documentType: 'boleta' | 'factura'; // Fiscal document choice
  razonSocial?: string;          // Required for Factura: Legal entity name in SII registry
  giroComercial?: string;        // Required for Factura: Economic activity description (e.g., "Servicios Odontológicos")
  address: string;               // Physical delivery street and number / Fiscal address
  city: string;                  // Commune (e.g., "Melipilla", "Talagante", "Providencia")
  zip: string;                   // Postal code / Region identifier
  deliveryInstructions?: string; // Operatory hours, office/floor number, clinic reception instructions
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
Sanitized public tracking representation returned by `/api/track-order`:

```typescript
export interface OrderTrackingInfo {
  orderId: string;
  status: OrderStatus;
  statusLabel: string;
  customerName: string;
  itemsCount: number;
  total: number;
  shippingAddress: string;
  shippingCity: string;
  deliveryMethod?: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: string;
  createdAt: string;
  updatedAt: string;
  timeline: {
    step: number;
    title: string;
    description: string;
    completed: boolean;
    current: boolean;
    timestamp?: string;
  }[];
  voucherUrl?: string;
  voucherUploadedAt?: string;
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
  rating: number;                // Customer evaluation (1 to 5)
  reviewsCount: number;          // Total clinician reviews
  inStock: boolean;              // Public stock flag: (stockCount > 0 && isActive !== false)
  stockCount: number;            // Physical warehouse count in Melipilla
  isActive?: boolean;            // Decoupled visibility switch (default: true). False pauses product from sales.
  prescriptionRequired: boolean; // Triggers 'Uso Profesional' badge & SIS check in checkout
  ispRegistrationNumber?: string;// Chilean ISP health registry code for controlled pharmaceuticals/devices
  tag: string;                   // Visual badge (e.g., 'MÁS VENDIDO', 'OFERTA CLÍNICA')
  description: string;           // Detailed technical overview
  specs: string[];               // Technical specifications checklist
  placeholderTheme: string;      // Fallback CSS theme class
  mediaBadge?: string;           // Optional secondary visual badge (absent on imported/legacy catalog docs; UI must guard)
  images?: string[];             // URLs of product photos in Firebase Storage / CDN
  packageContents?: string[];    // Itemized checklist of box contents for clinic
  manufacturer?: string;         // Clinical manufacturer
  createdAt?: string;            // ISO timestamp
  updatedAt?: string;            // ISO timestamp
}
```

### 2.6 Relational Audit Trail Contracts

#### Order Status Transition History (`OrderStatusHistory`):
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

#### Inventory & Warehouse Audit Log (`InventoryAuditLog`):
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

* **Attempted and reverted:** typing this as `Timestamp | FieldValue | string` (via a type-only `firebase/firestore` import) is the *correct* model, but it breaks compilation in `src/admin/components/OrderTable.tsx`, which does `new Date(order.createdAt)` at three call sites. `new Date()` only accepts `string | number | Date`, so **no** precise union works without also changing the admin portal.
* **Do not narrow `createdAt` unilaterally.** Narrowing it and the admin read path must happen in the same change, as its own reviewed task. This is the single permitted `any` in the codebase.
* `serverTimestamp()` is still the correct write value — do not switch order creation to a client `new Date()` just to make the type nicer; that would trade a server-authoritative timestamp for the clinic's device clock.

#### Audit `metadata` is `Record<string, unknown>`, not `Record<string, any>`

`OrderStatusHistory.metadata` and `InventoryAuditLog.metadata` were widened from `any` to `unknown` values. Rationale: these records carry operator- and system-supplied context (carrier, tracking number, payment ID, reason codes) whose *shape is not part of the domain contract*. `unknown` forces any consumer to narrow before use, while `any` silently propagated untyped access through the audit timeline UI.

* **Consumer rule:** cast at the point of use (e.g. `const meta = entry.metadata as { carrier?: string }`) rather than loosening the interface.
* **Producer rule:** the serverless webhooks and admin endpoints that write these records are unchanged — only the *read* typing tightened.

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
