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
  id: string;                    // Canonical SKU identifier (e.g. 'odon-101' -> display 'REF: OD-101')
  name: string;                  // Clinical product title
  category: string;              // Dental specialty category
  price: number;                 // Integer Chilean Pesos (IVA incluido)
  originalPrice?: number;        // Strikethrough price for promotions
  rating: number;                // Customer evaluation (1 to 5)
  reviewsCount: number;          // Total clinician reviews
  inStock: boolean;              // Public stock flag
  stockCount: number;            // Confidential warehouse count (never exposed to public client DOM)
  prescriptionRequired: boolean; // Triggers 'Uso Profesional' badge & SIS check in checkout
  tag: string;                   // Visual badge (e.g., 'MÁS VENDIDO', 'OFERTA CLÍNICA')
  description: string;           // Detailed technical overview
  specs: string[];               // Technical specifications checklist
  placeholderTheme: string;      // Fallback CSS theme class
  mediaBadge: string;            // Secondary visual badge
  images?: string[];             // URLs of product photos in Firebase Storage / CDN
  packageContents?: string[];    // Itemized checklist of box contents for clinic
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
