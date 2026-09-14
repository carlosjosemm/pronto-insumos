# PRONTO Domain Models & TypeScript Contracts (`src/types/`)

This directory houses the **centralized TypeScript interfaces, types, and domain contracts** for PRONTO.

---

## 🎯 1. Directory Scope & Purpose

* **Role:** The **single source of truth** for all data structures across the application (products, cart items, order lifecycles, customer data, and tax billing entities).
* **Key File:**
  * [`index.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/types/index.ts): Master type definitions.

---

## 🚫 2. Anti-Overshooting & Typing Guardrails

1. **Pure Types Only (Zero Runtime Overhead):**
   * This directory must contain **only** TypeScript interfaces, type aliases, and string literal unions.
   * Do **NOT** add executable functions, classes, or runtime side effects.
2. **Single Source of Truth:**
   * Never define duplicate or ad-hoc interfaces inside React component files (e.g., declaring `interface LocalItem` inside a component).
   * Always export shared contracts from [src/types/index.ts](file:///c:/Users/ecmv2/Documents/PRONTO/src/types/index.ts) and import them cleanly.
3. **No Heavy Schema Validation Bloat:**
   * Avoid introducing heavy runtime validation libraries (like Zod, Yup, or Joi) unless strictly needed for external API boundary parsing. Keep domain definitions clean and idiomatic TypeScript.

---

## 🇨🇱 3. Domain Model Specifications

Any modifications to types must observe these requirements:

### 1. Order Status Union (`OrderStatus`)
Must reflect the authentic e-commerce and logistics lifecycle:
```typescript
export type OrderStatus =
  | 'PENDIENTE_PAGO_MERCADOPAGO' // Order initialized, awaiting gateway confirmation
  | 'PAGADO_MERCADOPAGO'         // Payment approved by verified webhook
  | 'PENDIENTE_TRANSFERENCIA'    // Bank transfer selected, awaiting voucher verification
  | 'PAGO_VERIFICADO_MANUAL'     // Bank transfer approved by warehouse staff
  | 'EN_PREPARACION'             // Order packing in Melipilla warehouse
  | 'DESPACHADO'                 // Dispatched with tracking code (Starken/Chilexpress/Direct)
  | 'ENTREGADO'                  // Received by dental clinic
  | 'CANCELADO'                  // Order cancelled / expired
  | 'REEMBOLSADO';               // Payment refunded
```

### 2. Chilean Tax Invoicing (`BillingInfo`)
```typescript
export interface BillingInfo {
  documentType: 'BOLETA' | 'FACTURA';
  rut: string;               // Validated Chilean RUT (Modulo 11)
  razonSocial?: string;      // Required for Factura (Clinic/Company legal name)
  giro?: string;             // Required for Factura (e.g., "Servicios Odontológicos")
  direccionTributaria?: string; // Fiscal registered address
  comuna?: string;           // Commune (e.g., "Melipilla", "Providencia")
}
```

### 3. Chilean Logistics & Delivery Options
```typescript
export type ShippingMethod =
  | 'RETIRO_MELIPILLA'    // Free pickup at Av. Ortúzar warehouse
  | 'DESPACHO_MELIPILLA'   // Express local urban delivery
  | 'DESPACHO_RM'          // Región Metropolitana courier
  | 'ENVIO_REGION';        // Starken / Chilexpress freight-collect
```

### 4. Monetary Values in Chilean Pesos (CLP)
All financial fields (`price`, `subtotal`, `tax`, `shippingCost`, `total`) represent whole Chilean Peso integers without decimals.
