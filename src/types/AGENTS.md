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
  metadata?: Record<string, any>;// Carrier, tracking number, payment ID, etc.
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
  metadata?: Record<string, any>;
}
```

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
