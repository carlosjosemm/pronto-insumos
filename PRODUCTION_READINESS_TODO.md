# PRONTO INSUMOS ODONTOLÓGICOS — Production Readiness TODO & Audit Report

**Last Updated:** September 2026  
**Target Market:** Melipilla & Región Metropolitana, Chile  
**Deployment Stack:** Vercel (Frontend React 18 + Serverless Node.js) & Google Firebase / Firestore  
**Repository State:** Advanced functional storefront with automated test coverage. Phases 0–5 resolved; remaining work covers catalog assets, legal compliance, and DevOps polish before go-live.

---

## 📑 Table of Contents

- [PRONTO INSUMOS ODONTOLÓGICOS — Production Readiness TODO \& Audit Report](#pronto-insumos-odontológicos--production-readiness-todo--audit-report)
  - [📑 Table of Contents](#-table-of-contents)
  - [1. Diagnosis: Previous Roadmap vs. Actual Codebase Reality](#1-diagnosis-previous-roadmap-vs-actual-codebase-reality)
  - [Phase 0: Critical Security \& Payment Architecture Blockers (Priority P0 - Immediate)](#phase-0-critical-security--payment-architecture-blockers-priority-p0---immediate)
  - [Phase 1: Chilean Localization, Pricing \& Tax Compliance (SII / ISP / CLP)](#phase-1-chilean-localization-pricing--tax-compliance-sii--isp--clp)
  - [Phase 2: Checkout UX, Cart Persistence \& Payment Return Flows](#phase-2-checkout-ux-cart-persistence--payment-return-flows)
  - [Phase 3: Logistics, Shipping \& Local Warehouse Pickup (Melipilla / RM)](#phase-3-logistics-shipping--local-warehouse-pickup-melipilla--rm)
  - [Phase 4: Backoffice Operations \& Order Management Dashboard](#phase-4-backoffice-operations--order-management-dashboard)
  - [Phase 5: Transactional Communications (Email \& WhatsApp)](#phase-5-transactional-communications-email--whatsapp)
  - [Phase 6: Real Catalog Assets, Photography \& Technical Datasheets](#phase-6-real-catalog-assets-photography--technical-datasheets)
  - [Phase 7: Legal Compliance, SERNAC Warranty \& Customer Trust](#phase-7-legal-compliance-sernac-warranty--customer-trust)
  - [Phase 8: Performance, Infrastructure, DevOps \& Telemetry](#phase-8-performance-infrastructure-devops--telemetry)
  - [Prioritization Matrix \& Effort Estimation](#prioritization-matrix--effort-estimation)
  - [🏁 Go-Live Acceptance Criteria](#-go-live-acceptance-criteria)

---

## 1. Diagnosis: Previous Roadmap vs. Actual Codebase Reality

The previous document `PROJECT_ASSESSMENT_AND_ROADMAP.md` was outdated with respect to the actual codebase. Several tasks marked as pending `[ ]` had already been developed, while severe operational and security flaws were left unaddressed:

| Item                                          | In Old Roadmap |        Reality in Code        | Diagnosis / Required Action                                                                                                                    |
| :-------------------------------------------- | :------------: | :---------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chilean RUT Validation (Modulo 11)**        | Pending `[ ]`  |        Implemented ✅         | Exists in `src/utils/rut.ts` and validated in `CheckoutModal.tsx`.                                                                             |
| **B2B Invoicing Fields (Giro, Razón Social)** | Pending `[ ]`  |        Implemented ✅         | The Boleta/Factura toggle collects these fields in `CheckoutModal.tsx`.                                                                        |
| **Endpoint `/api/create-preference`**         | Pending `[ ]`  |          Created ✅           | Implemented in `api/create-preference.ts` for Vercel Serverless.                                                                               |
| **SEO Meta Tags & Schema.org LocalBusiness**  | Pending `[ ]`  |        Implemented ✅         | Added to `index.html`. Missing actual image file `og-preview.png`.                                                                             |
| **Global React Error Boundary**               | Pending `[ ]`  |        Implemented ✅         | Created in `src/components/ErrorBoundary.tsx` with unit test.                                                                                  |
| **Webhook Security with `firebase-admin`**    |   Mentioned    |  **CRITICAL: Unresolved ❌**  | `api/webhooks/mercadopago.ts` imports the client SDK with `import.meta.env`, failing in Node and posing execution risks.                       |
| **Stock Deduction & Idempotency**             |  Not noticed   | **CRITICAL: Flawed Logic ❌** | Frontend decrements stock before payment happens. Webhook lacks idempotency and decrements twice upon retries.                                 |
| **Currency & Pricing (CLP vs USD)**           |  Not noticed   | **CRITICAL: Currency Bug ❌** | Prices in `src/data/products.ts` use USD decimal format (`189.99`). Sent to Mercado Pago as CLP, charging only $190 Chilean Pesos ($0.20 USD). |
| **Mock Customer & Card Fields in Checkout**   |  Not noticed   |  **Insecure / Prototype ❌**  | Checkout form contains hardcoded mock values ("Dra. Camila Fuentes") and mock credit card inputs stored in React state.                        |
| **Database Seed Button in Footer**            |  Not noticed   |       **Hazardous ❌**        | The public footer displays a `"🔥 Sembrar Firebase DB"` button callable by any visitor.                                                        |

---

## Phase 0: Critical Security & Payment Architecture Blockers (Priority P0 - Immediate)

These items carry immediate risks of financial loss, critical security vulnerabilities, or complete payment transaction failures. **They must be resolved before handling any real transactions.**

- [x] **0.1. Fix False Client-Side Payment Approval (`CheckoutModal.tsx` & `src/services/api.ts`)** ✅ _(Resolved: Orders initialized with PENDIENTE_PAGO_MERCADOPAGO; client stock deduction purged; verified by unit tests)_

- [x] **0.2. Migrate Serverless Webhooks to `firebase-admin` with Service Account** ✅ _(Resolved: firebase-admin installed; api/_lib/firebaseAdmin.ts singleton created; webhook uses admin Firestore queries & transactions; unit tests passing)_

- [x] **0.3. Synchronize Order Identifier (`orderId` / `external_reference`)** ✅ _(Resolved: generateOrderId creates canonical PRONTO-XXXXXX; unified across CheckoutModal, preference payload, and Firestore order document; unit tests passing)_

- [x] **0.4. Enforce Idempotency in the Mercado Pago Webhook** ✅ _(Resolved: Fast-path idempotency pre-check and atomic all-in-one Firestore transaction inside api/webhooks/mercadopago.ts; duplicate deliveries return HTTP 200 without mutating stock or orders; comprehensive unit tests passing)_

- [x] **0.5. Cryptographic Signature Verification on Webhooks (`x-signature`)** ✅ _(Resolved: api/_lib/mercadopagoSignature.ts computes HMAC-SHA256 over Mercado Pago manifest template; timing-safe equality verification in api/webhooks/mercadopago.ts rejects unauthorized requests with 401; unit and integration tests passing)_

- [x] **0.6. Create and Deploy Firestore Security Rules (`firestore.rules`)** ✅ _(Resolved: firestore.rules created with public read-only catalog, admin-only catalog write, strict pending-only order creation schema preventing injection, client-side order read/update/delete denied; firebase.json configured and deploy:rules script added; unit tests passing)_

- [x] **0.7. Remove Public Database Seed Button (`Footer.tsx`)** ✅ _(Resolved: Public seed button completely removed from Footer.tsx; footer restructured to authentic 4-column B2B distributor layout; unit tests verified)_

- [x] **0.8. Purge Mock Data and Ensure Privacy / PCI-DSS Compliance** ✅ _(Resolved: CheckoutModal form state initialized with empty strings and clean placeholders; cardNumber, expDate, and cvc eliminated from CustomerInfo and component state; input whitespace sanitization added; clean Chilean clinical inputs; comprehensive unit tests passing with zero regressions)_

---

## Phase 1: Chilean Localization, Pricing & Tax Compliance (SII / ISP / CLP)

- [x] **1.1. Standardize Pricing in Chilean Pesos (CLP) Without Decimals** ✅ _(Resolved: Standardized all 10 catalog product prices to integer CLP; implemented formatCLP, calculateIVA, and parseCLP in src/utils/currency.ts; updated ProductCard, ProductQuickView, Cart, App, CheckoutModal, and WhatsApp service; free shipping threshold updated to $150.000 CLP; 100% test coverage with 173 passing tests)_
  - **Current Issue:** `src/data/products.ts` uses decimal currency numbers (`189.99`, `129.50`). In Chile, CLP has no decimal subdivisions. Sending `189.99` with currency `CLP` to Mercado Pago results in charging only $190 Chilean Pesos for a professional dental turbine.
  - **Required Action:**
    - Update all catalog items to valid CLP values: e.g., LED Turbine `$189.990 CLP`, Composite Kit `$79.990 CLP`, Ultrasonic Scaler `$245.000 CLP`.
    - Create a dedicated currency formatter `formatCLP(amount: number)` in `src/utils/currency.ts` that outputs `$189.990` (period thousands separator, zero decimal places).
    - Round tax calculations (19% IVA) to whole integer values (`Math.round`).
    - Adjust `FREE_SHIPPING_THRESHOLD` to a realistic CLP figure (e.g., `$150.000 CLP` instead of `150.00`).

- [x] **1.2. B2B Fiscal Billing Data Capture & Purchase Voucher (Boleta & Factura SII)** ✅ _(Resolved: Implemented calculateTaxBreakdown and validateFacturaFields in src/utils/tax.ts; mandatory Factura validation in CheckoutModal with inline Chilean errors; structured billing payload with tax breakdown saved to Firestore orders; printable pro-forma purchase voucher with window.print() added to confirmation screen; 100% test coverage with 183 tests passing)_
  - **Context:** Chilean dental clinics and practitioners require valid tax deduction (crédito fiscal IVA 19%). B2B transactions require issuing electronic invoices (_Factura Electrónica_) while retail clients receive _Boleta Electrónica_. Official electronic invoicing in Chile is performed free of charge via the SII Portal Tributario (`sii.cl`), requiring no paid third-party DTE provider.
  - **Required Action:**
    - **Checkout Fiscal Validation (`CheckoutModal.tsx`):**
      - If **Boleta**: Validate customer RUT (Modulo 11) and full name.
      - If **Factura**: Strictly enforce and validate all legally required SII fields: _RUT Empresa_ (Modulo 11), _Razón Social_, _Giro Comercial_ (e.g. "Clínica Dental", "Servicios Odontológicos"), and _Dirección / Comuna Fiscal_. Block step progression if any field is missing or invalid.
    - **Structured Order Schema (`types/index.ts` & `api.ts`):**
      - Save structured `billing` payload on the order in Firestore containing tax breakdown (`neto`, `iva`, `total`), fiscal identifiers, and status `PENDIENTE_EMISION_SII`.
    - **Printable Pro-Forma Purchase Voucher:**
      - In Step 3 (Order Confirmation), provide a 1-click printable/downloadable purchase voucher (_Comprobante de Venta Pro-Forma_) with PRONTO distributor header, itemized list, fiscal breakdown, and disclaimer for official SII dispatch.
    - **Admin/Operator Handoff:**
      - Organize fiscal fields for 1-click copy into the free SII portal (`sii.cl`).

- [x] **1.3. Sanitary Regulations for Controlled Dental Supplies (ISP Chile)**
  - **Context:** Certain dental materials (local anesthetics, needles, specialized prescription pharmaceuticals) require verification of professional accreditation with the Chilean Superintendencia de Salud (SIS registry).
  - **Fulfilled & Verified:**
    - **Catalog Regulatory Classification (`src/data/products.ts`):**
      - Flagged prescription items with `prescriptionRequired: true`. Added authentic regulated supply `odon-501` (_Anestésico Dental Lidocaína 2% con Epinefrina 1:100.000_, Registro ISP F-14220) and `odon-402` (_Motor de Implante Odontológico_).
    - **UI Regulatory Indicators (`ProductCard.tsx`, `ProductQuickView.tsx`, `Cart.tsx`):**
      - Displays `⚕️ Requiere SIS` badge on product cards.
      - Displays full ISP warning badge and regulatory advisory callout in Quick View.
      - In cart drawer, displays prominent amber regulatory banner (`Insumos Regulados ISP`) and item chip (`⚕️ Requiere SIS (ISP)`).
    - **Sanitary Validation in Checkout (`CheckoutModal.tsx` & `src/types/index.ts`):**
      - Dynamically renders a mandatory **Validación Sanitaria ISP / SIS** section when cart contains controlled items.
      - Requires dentist's official **N° de Registro SIS** (Superintendencia de Salud RNPI, minimum 4 digits) and provides credential attachment upload option (PDF/JPG/PNG).
      - Strictly blocks advancement to Step 2 if SIS number is missing or invalid, showing Chilean compliance guidance.
      - Displays sanitary verification in Step 3 confirmation and in the pro-forma purchase voucher.
    - **WhatsApp & Firestore Handoff (`src/services/api.ts` & `src/services/whatsapp.ts`):**
      - Order document stores structured `sanitaryVerification` payload (`sisRegistryNumber`, `credentialFileName`, `verified`, `regulatoryNote`).
      - Appends `*Registro Sanitario SIS:* <number>` to the generated WhatsApp quote URL for rapid manual dispatch validation.
    - **Automated Test Coverage:**
      - All 189 tests passing across 18 test suites (including `CheckoutModal.test.tsx`, `Cart.test.tsx`, `products.test.ts`, and `whatsapp.test.ts`).

---

## Phase 2: Checkout UX, Cart Persistence & Payment Return Flows

- [x] **2.1. Handle Mercado Pago Return URLs in Frontend (`App.tsx`)**
  - **Context:** When completing payment on Checkout Pro, Mercado Pago redirects back to `/?status=approved&orderId=PRONTO-XXXXXX` (or `collection_status`, `external_reference`, etc.).
  - **Fulfilled & Verified:**
    - **URL Query Parameter Parsing on Mount (`App.tsx`):**
      - Inspects `window.location.search` for gateway parameters (`status`, `collection_status`, `orderId`, `external_reference`, `payment_id`, `collection_id`).
      - Sanitizes technical query parameters from browser address bar using `window.history.replaceState` to prevent re-triggering upon manual page refresh.
    - **Cart Lifecycle:**
      - Upon `status === 'approved'`, automatically invokes `handleOrderSuccess()` to clear cart and promo state.
      - Upon `status === 'failure'` or `status === 'pending'`, preserves cart items so clinic can retry payment or choose another payment method.
    - **Payment Return Status Modal (`PaymentReturnModal.tsx`):**
      - **Approved:** Renders clinical success header, order ID badge, MP transaction ID, Factura/Boleta notice, direct WhatsApp delivery coordination button, and shop continue action.
      - **Failure:** Renders alert, reassurance that no charge was made, advice on bank transfer alternative, and retry button reopening checkout options.
      - **Pending:** Renders banking validation notice and notification advisory.
    - **Automated Test Coverage:**
      - 8 tests in `src/tests/components/PaymentReturnModal.test.tsx` testing all states, actions, and Escape key dismissal.
      - 4 integration tests in `src/tests/components/AppPaymentReturn.test.tsx` verifying mount detection, cart clearing, and URL sanitation.
      - Total repository test suite: 201 tests passing (100% test reliability).

- [x] **2.2. Shopping Cart Persistence (`localStorage`)**
  - **Context:** Cart state previously lived strictly in ephemeral React memory (`useState`). Reloading the page or switching tabs wiped clinic supply orders clean.
  - **Fulfilled & Verified:**
    - **Dedicated Storage Adapter (`src/services/cartStorage.ts`):**
      - Versioned storage contract using key `pronto_cart_v1` with schema versioning (`version: 1`).
      - Enforces 7-day maximum retention TTL (`savedAt` timestamp validation), discarding expired entries.
      - Defensive error handling safeguarding against `QuotaExceededError`, private browsing storage blocks, corrupted JSON, and SSR environments.
      - Consolidates and deduplicates product line items upon load.
    - **Catalog Stock & Spec Revalidation:**
      - `revalidateCartAgainstCatalog()` runs upon initial unfiltered catalog fetch.
      - Discontinued or out-of-stock items are automatically removed.
      - Quantities exceeding live physical inventory are clamped down to `stockCount`.
      - Product prices, names, and specs are refreshed against current live catalog data.
      - Displays clinical toast alert informing the user if supplies were adjusted.
    - **State Lifecycle & Order Integration (`src/App.tsx`):**
      - Lazy initializers hydrate `cart` and `appliedPromo` instantly on mount without flash or layout shifts.
      - `useEffect` automatically synchronizes cart changes and promo codes to `localStorage`.
      - `clearCartFromStorage()` purges storage record upon successful order confirmation or approved payment return.
    - **Automated Test Coverage:**
      - 17 comprehensive unit tests in `src/tests/services/cartStorage.test.ts`.
      - 3 integration tests in `src/tests/components/AppCartPersistence.test.tsx`.
      - Total repository test suite: 233 tests passing (100% test reliability).

- [x] **2.3. Pre-Checkout Inventory Validation & Max-Stock Cues**
  - **Context & Current State:** Front-end quantity steppers in `App.tsx` and `ProductQuickView.tsx` already clamp item additions to `product.stockCount`. However, if stock depletes while a customer is browsing or if an item in the cart reaches max stock, additional safeguards are needed.
  - **Required Action:**
    - In `Cart.tsx`: disable the `+` button when `item.quantity >= item.product.stockCount`, displaying a clear `"Máximo disponible"` or `"Sin stock"` status indicator.
    - In `Cart.tsx` and `CheckoutModal.tsx`: if an item becomes unavailable or exceeds stock, block checkout progression and alert the user.
    - In serverless `/api/create-preference.ts`: validate requested quantities against current Firestore inventory before generating Mercado Pago preference.
  - **Verification & As-Built Implementation:**
    - `src/components/Cart.tsx`: Added dynamic stock cues (`"Sin stock disponible"`, `"Máximo disponible (X unid.)"`, `"Excede stock (X unid. disp.)"`), capped `+` stepper button with informative tooltip, rendered sticky stock warning alert banner, and disabled the checkout CTA with label `"Insumos sin Stock Suficiente"`.
    - `src/components/CheckoutModal.tsx`: Enforced pre-flight inventory guards in both `handleNextStep()` (blocking Step 1 -> Step 2 transition) and `handleCompleteOrder()`, alerting the customer with localized Chilean dental depot notifications. Rendered alert in Step 1.
    - `api/create-preference.ts`: Integrated Firestore Admin inventory validation loop querying `products` collection before generating Mercado Pago preference payload or sandbox simulation, rejecting with HTTP 400 Bad Request if requested quantities exceed stock.
    - Unit tests: Added new test suites in `src/tests/components/Cart.test.tsx`, `src/tests/components/CheckoutModal.test.tsx`, and `src/tests/api/create-preference.test.ts`.
    - All 22 test files and all 242 tests passing with 100% reliability. Production build compiled cleanly.

- [x] **2.4. End-to-End Bank Transfer Workflow (Transferencia Bancaria)**
  - **Context:** Selecting bank transfer previously displayed static account details, leaving orders in pending limbo with no digital verification or voucher collection mechanism.
  - **Fulfilled & Verified:**
    - **Externalized Bank Configuration (`src/config/bankDetails.ts`):**
      - Centralized Chilean banking credentials for Banco de Chile (Cuenta Corriente, account number, company RUT `77.892.410-2`, corporate email `pagos@prontoinsumos.cl`).
      - Supported runtime overrides via `VITE_BANK_*` environment variables with strict fallback defaults.
      - Integrated into checkout Step 2 payment selector and Step 3 confirmation instructions.
    - **Transfer Voucher Validation & Upload Service (`src/services/transferVoucher.ts`):**
      - Client-side validation enforcing file type restrictions (PDF, PNG, JPEG) and maximum size threshold (5MB).
      - Converts binary files to Base64 data URLs for transport and storage.
      - Sends vouchers to `/api/upload-voucher` with customer RUT verification and automatic fallback for offline/development environments.
    - **Serverless Voucher Intake Endpoint (`/api/upload-voucher.ts`):**
      - Validates payload structure, checks file size limits and MIME types, and compares normalized Chilean Modulo 11 RUTs.
      - Updates order document in Firestore Admin transitioning status to `'TRANSFERENCIA_COMPROBANTE_SUBIDO'` with receipt URL, timestamp, and audit trail.
    - **Step 3 Checkout & Tracking Upload UI:**
      - Embedded instant voucher upload widget directly in Step 3 of checkout when selecting bank transfer.
      - Direct upload capability also available from within the customer order tracking view.
    - **Automated Test Coverage:**
      - Unit tests in `src/tests/config/bankDetails.test.ts` (2 tests).
      - Service tests in `src/tests/services/transferVoucher.test.ts` (6 tests).
      - Serverless API tests in `src/tests/api/upload-voucher.test.ts` (7 tests).

- [x] **2.5. Customer Order Tracking Page**
  - **Context:** Customers lacked a self-service fulfillment tracker and could not check delivery or payment progress without contacting support.
  - **Fulfilled & Verified:**
    - **Public Secured Order Lookup API (`/api/track-order.ts`):**
      - Authenticates lookups using canonical Order ID (`PRONTO-XXXXXX`) and Chilean Modulo 11 customer RUT.
      - Queries Firestore using `firebase-admin` (safely bypassing client-side read restrictions on `/orders`).
      - Returns sanitized tracking payload (`OrderTrackingInfo`) mapping database states to a 5-stage fulfillment timeline (_Registrado_, _Comprobante/Pago_, _Preparación en Melipilla_, _En Ruta_, _Entregado_).
      - Filters out private credentials, database internals, and card details.
    - **Client-Side Tracking Adapter (`src/services/orderTracking.ts`):**
      - Fetches `/api/track-order` with defensive error handling and local mock fallback for development/test environments.
    - **Customer Order Tracking Modal (`OrderTrackingModal.tsx`):**
      - Accessible via "Seguimiento" button in `Navbar.tsx`, link in `Footer.tsx`, and automatic deep linking via URL query parameters (`?track=PRONTO-123456` or `?orderId=PRONTO-123456&tracking=true`).
      - Visual step progress indicator with clinical icons, timestamps, and status badges.
      - Displays order items, delivery destination, and direct voucher upload if payment is pending.
      - One-click WhatsApp clinical support button with pre-formatted inquiry text including the Order ID.
    - **Automated Test Coverage:**
      - Serverless API tests in `src/tests/api/track-order.test.ts` (6 tests).
      - Client service tests in `src/tests/services/orderTracking.test.ts` (4 tests).
      - UI component tests in `src/tests/components/OrderTrackingModal.test.tsx` (5 tests).
      - Total repository test suite: 28 test files, 272 tests passing (100% test reliability).

---

## Phase 3: Logistics, Shipping & Local Warehouse Pickup (Melipilla / RM)

- [ ] **3.1. Delivery Zone Selector & Dynamic Shipping Rates**
  - **Context & Current State:** The free shipping progress tracker is standardized to `$150.000 CLP` in `Cart.tsx`, `Navbar.tsx`, and `Hero.tsx`. However, checkout currently lacks a dedicated Chilean delivery zone selector to calculate freight charges for orders below the threshold or for regional couriers.
  - **Required Action:**
    - Add a delivery method selector at Step 1 of checkout:
      1. **Retiro en Local (Bodega Melipilla - Av. Ortúzar):** Gratis ($0 CLP).
      2. **Despacho Urbano Melipilla:** Tarifa plana ($3.500 CLP o gratis sobre $80.000 CLP).
      3. **Comunas Periféricas & Rurales Melipilla:** Bollenar, San Manuel, Culiprán, Pabellón, Chocalán ($5.000 CLP).
      4. **Región Metropolitana:** Talagante, Peñaflor, Buin, Santiago Centro, Providencia, Las Condes, etc. ($4.990 CLP o gratis sobre $150.000 CLP).
      5. **Envíos a Regiones:** Envío por pagar a sucursal o domicilio vía Starken / Chilexpress / Blue Express ($0 CLP en carrito, cobro en destino).
    - Automatically add freight charges to the subtotal and include in tax/billing breakdown before creating payment preferences.

- [ ] **3.2. Estimated Delivery Time Windows**
  - Display estimated fulfillment times in the cart and checkout (e.g., _"Same-day / 24-hour delivery for clinics in Melipilla"_ and _"24-48 hours for wider RM"_).

---

## Phase 4: Backoffice Operations & Order Management Dashboard

Currently, no administrative interface exists for PRONTO staff to operate the store without manually opening the Google Firebase web console. A dedicated, lightweight, and secure `/admin` portal must be created so the store owner and warehouse staff in Melipilla can consult orders and manage inventory without touching developer consoles.

- [x] **4.0. Dedicated Administrative Portal Route (`/admin`)**
  - **Context & Objective:** Implement a functional internal backoffice portal accessible via the `/admin` path (using client routing or hash-based view toggle `#/admin`) to handle order consultations, fulfillment state transitions, and warehouse inventory adjustments.
  - **Core Architecture & Guardrails:**
    - **Separate Vite Multi-Page App (`admin.html` + `src/admin/`):** Complete isolation between storefront and backoffice. Zero bundle overhead on customer storefront (`dist/index.html` ~111 kB JS, `dist/admin.html` ~63 kB JS).
    - **Admin Authentication Engine:** Firebase Auth Email/Password + `{ admin: true }` custom claims gate in `AdminLogin.tsx` and `AdminApp.tsx`. CLI provisioning script in `scripts/setup-admin.ts`. Serverless middleware verification in `api/_lib/adminAuth.ts`.
    - **Firestore Security Alignment:** Admin mutations routed through dedicated `/api/admin/*` serverless endpoints with Bearer token authentication. Atomic stock decrement inside Firestore transactions upon transfer approval.
  - **Sub-feature A: Order History & Clinical Invoicing Consultation (`/admin#orders`):**
    - Searchable order table: filter by canonical `orderId` (e.g., `PRONTO-123456`), clinic name, or Chilean RUT.
    - Status filters: `PENDIENTE_PAGO`, `PENDIENTE_TRANSFERENCIA`, `PAGADO_MERCADOPAGO`, `COTIZACION_SOLICITADA_WHATSAPP`, `DESPACHADO`, `ENTREGADO`.
    - Clinical order inspector drawer/modal (`OrderDetailPanel.tsx`):
      - Full Chilean tax invoicing attributes (RUT, Razón Social, Giro Comercial, Gabinete fiscal address, comuna, phone, and contact email).
      - Sanitary verification inspector: SIS registry number and credential attachments.
      - Itemized supply breakdown with unit integer CLP prices, 19% IVA, and total.
      - Payment telemetry: gateway reference (`mercadopagoPaymentId`), ISO timestamp, and bank transfer receipt link.
    - Operational actions:
      - One-click **Aprobar Transferencia Manual** (`/api/admin/approve-transfer`, executing atomic stock reduction for bank transfer orders).
      - Dispatch fulfillment update (`/api/admin/dispatch-order`, carrier selection: Starken, Chilexpress, Blue Express, or local Melipilla courier + tracking code).
      - Mark delivered confirmation (`/api/admin/mark-delivered`).
  - **Sub-feature B: Real-Time Warehouse Inventory Management (`/admin#inventory`):**
    - Live product stock table displaying: SKU/REF code, product name, brand, category, integer CLP price (Neto and con IVA), and `stockCount`.
    - Stock adjustment modal (`StockAdjustModal.tsx`) with audit reason codes (`reposicion`, `merma`, `correccion`, `venta_manual`) and operator notes (`/api/admin/update-stock`).
    - Product editor modal (`ProductEditModal.tsx`): modify clinical presentations, technical specs, manufacturer tags, package contents, and integer CLP prices (`/api/admin/update-product`).
    - Instant visibility toggle (`/api/admin/toggle-visibility`, `inStock: true/false`) to pause sales of depleted or backordered items.
  - **Sub-feature C: Executive KPI Dashboard (`/admin#dashboard`):**
    - 4 KPI metric cards: Ventas Hoy (CLP), Pedidos Pendientes, Stock Bajo (<5 unidades), Pedidos del Mes.
    - Split overview: Recent orders table (65% width) and critical low-stock supply alerts (35% width).
    - Analytics integration placeholders: Google Tag Manager (GTM) and Google Analytics 4 (GA4).
  - **Automated Test Coverage:** 16 dedicated admin test suites (both UI and serverless endpoints) ensuring 100% test pass rate across 296 tests.

- [x] **4.1. Firestore Schema Freezing, Lifecycle Audit Trails & Migration Tooling**
  - **Context & Objective:** Prevent data corruption, ensure Chilean legal/tax compliance (SII Factura Electrónica and ISP regulations), and establish complete auditability and traceability for all order and inventory state transitions in Google Firebase Firestore.
  - **Relational Simulation Pattern:**
    - Established append-only audit collections linked to primary entities via indexed foreign keys (`orderId`, `productId`).
    - Multi-document transactions (`adminDb.runTransaction`) and atomic batches (`adminDb.batch`) ensure that no order status or inventory stock can be modified without writing an audit record in the exact same transaction.
  - **Schema Freezing:**
    - `products`: Complete frozen schema with integer CLP pricing, SKU references, clinical specifications, packaging inventories, and ISP sanitary registration codes.
    - `orders`: Complete frozen schema with customer tax details (RUT Modulo 11, Razón Social, Giro Comercial, Dirección Fiscal), sanitary verification, item price snapshots, and fulfillment telemetry.
    - `order_status_history`: Tracks `previousStatus`, `newStatus`, `changedBy`, `changedByEmail`, `actorRole`, `timestamp`, `reason`, and metadata (tracking numbers, payment IDs).
    - `inventory_audit_logs`: Tracks `changeType` (`STOCK_ADJUSTMENT`, `ORDER_FULFILLMENT_DEDUCTION`, `METADATA_UPDATE`, `VISIBILITY_TOGGLE`, `CATALOG_SEED`), `previousStock`, `newStock`, `delta`, `reasonCode`, operator notes, and timestamps.
  - **Serverless Atomic Audit Integration:**
    - Updated `approve-transfer`, `dispatch-order`, `mark-delivered`, `update-stock`, `update-product`, `toggle-visibility`, `upload-voucher`, and `webhooks/mercadopago` to record audit logs inside their atomic transactions.
    - Created new `/api/admin/order-history` endpoint.
  - **CLI Migration & Audit Tooling:**
    - Created `scripts/manage-firestore-schema.ts` with `--validate` (read-only audit report), `--seed` (canonical catalog & sample order seeding), and `--purge-and-seed --force` (database clean reinitialization).
    - Added npm scripts: `schema:validate`, `schema:seed`, and `schema:purge-and-seed`.
  - **Admin UI & Security:**
    - Embedded an interactive "Historial de Estados y Auditoría" timeline in `OrderDetailPanel.tsx`.
    - Updated `firestore.rules` making audit collections read-only for admins and strictly write-blocked for all client SDKs.
    - Added comprehensive Vitest tests bringing total test coverage to **305 passing tests across 46 test files**.

---

## Phase 5: Transactional Communications (Email & WhatsApp)

- [x] **5.1. Transactional Email Service (Resend)** ✅ _(Resolved: Resend free tier (3,000 emails/mo) integrated via plain `fetch` — zero new dependencies; verified sender domain `prontoinsumos.com` with live DKIM/SPF/DMARC records at GoDaddy DNS; fail-safe shared sender + four localized templates; four trigger points wired; idempotent order-confirmation endpoint; comprehensive unit tests passing)_
  - **Fulfilled & Verified:**
    - **Sender Domain Authentication:**
      - `prontoinsumos.com` verified in Resend dashboard; DKIM (`resend._domainkey` TXT), SPF (`send`/`rsend` CNAMEs + `feedback.forge.rmta.net` MX), and DMARC (`v=DMARC1; p=quarantine`) records live at GoDaddy DNS.
      - `EMAIL_FROM` configurable (verified-domain local part is arbitrary); `RESEND_API_KEY` and `WAREHOUSE_NOTIFICATION_EMAIL` stored strictly in serverless `process.env` (`.env.local` + Vercel env vars).
    - **Fail-Safe Email Layer (`api/_lib/email.ts`):**
      - Single `fetch` POST to `api.resend.com/emails` (no SDK dependency); returns `{ sent, reason }` and never throws — email outages cannot break payment reconciliation, voucher intake, or admin approvals.
      - Missing `RESEND_API_KEY` short-circuits with a warning log (unit tests, offline dev).
      - 8-second `AbortSignal.timeout` guards webhook latency against a hung provider.
    - **Localized Templates (`api/_lib/emailTemplates.ts`):**
      - `{ subject, html, text }` outputs; every user-supplied value HTML-escaped (`escapeHtml`); integer CLP formatting and 19% IVA/neto breakdown; bank details sourced from `VITE_BANK_*` overrides.
      - Four templates: `buildOrderConfirmationEmail` (incl. Banco de Chile deposit details + voucher upload link for transfers), `buildPaymentConfirmedEmail`, `buildTransferApprovedEmail`, `buildWarehouseAlertEmail`.
    - **Trigger Points:**
      - Order registered (transfer / WhatsApp quote): new `/api/order-confirmation` endpoint — dual-factor Order ID + RUT auth, idempotent via `confirmationEmailSentAt` order flag stamped only after a successful send.
      - `PAGADO_MERCADOPAGO` (webhook): customer payment confirmation + warehouse dispatch alert, gated on a `stockDeducted` transaction flag so retries/concurrency aborts never re-notify.
      - `TRANSFERENCIA_COMPROBANTE_SUBIDO` (`/api/upload-voucher`): warehouse alert to verify against Banco de Chile.
      - `TRANSFERENCIA_APROBADA` (`/api/admin/approve-transfer`): customer approval notice + warehouse alert, gated on non-duplicate transaction result.
      - CheckoutModal fires `sendOrderConfirmationEmail()` fire-and-forget for `transferencia`/`whatsapp` methods only — Mercado Pago orders are covered by the verified webhook.
    - **Automated Test Coverage:**
      - New suites: `src/tests/api/email.test.ts`, `src/tests/api/order-confirmation.test.ts`, `src/tests/services/orderConfirmation.test.ts`.
      - Extended suites: `mercadopago-webhook.test.ts`, `upload-voucher.test.ts`, `admin/approve-transfer.test.ts`, `CheckoutModal.test.tsx`, `whatsapp.test.ts`.
      - Total repository test suite: 381 tests passing (100% test reliability); production build and `tsc` typecheck clean.

- [x] **5.2. Configure Official Production WhatsApp Number** ✅ _(Resolved: real business number `56929831595` set as `VITE_WHATSAPP_NUMBER` and as the in-code fallback in `src/services/whatsapp.ts`; WhatsApp Business app greeting/away/quick-reply configuration remains a manual operational task outside the codebase)_
  - `VITE_WHATSAPP_NUMBER` updated in `.env.local`, `.env.example`, and Vercel environment variables.
  - Fallback default in `src/services/whatsapp.ts` replaced from placeholder `56912345678` to `56929831595`; `whatsapp.test.ts` updated accordingly.
  - Automated WhatsApp Cloud API messaging deliberately deferred — `wa.me` click-to-chat links cover the current flow without Meta template approval overhead.

---

## Phase 6: Real Catalog Assets, Photography & Technical Datasheets

- [x] **6.1. Replace CSS Gradient Placeholders with Real Photography**
  - **Context & Status (Fulfilled in UI/UX Overhaul):**
    - `Product` data model updated with `images?: string[]` and `packageContents?: string[]`.
    - Curated high-resolution dental photography URLs configured across catalog items in `src/data/products.ts`.
    - Interactive multi-photo gallery implemented in `ProductQuickView.tsx` with thumbnail navigation, keyboard controls, and full fallback to category iconography in `ProductCard.tsx`.
    - _(Optional future enhancement: migrate images to dedicated Firebase Storage bucket when custom assets are photographed)._

- [ ] **6.2. Downloadable Technical Documentation (Datasheets & ISP Registration)**
  - For clinic sanitization audits, dentists require technical datasheets and sanitary registration codes.
  - Provide a download link on product details: _"Download Technical Datasheet (PDF)"_.

- [ ] **6.3. Expand Catalog SKUs by Dental Specialty**
  - Organize dental items into standard industry categories:
    - _Endodontics_ (files, gutta-percha, sealers).
    - _Periodontics & Prophylaxis_ (curettes, ultrasonic tips, prophy paste).
    - _Restorative & Esthetics_ (composites, bonding agents, curing lights).
    - _Orthodontics_ (brackets, archwires, elastics).
    - _Surgery & Implants_ (sutures, blades, surgical instruments).
    - _Sterilization & Infection Control_ (pouches, autoclave accessories, surface disinfectants).

---

## Phase 7: Legal Compliance, SERNAC Warranty & Customer Trust

- [ ] **7.1. Mandatory Legal Pages (Chilean Consumer Law N° 19.496)**
  - **Current Issue:** In `Footer.tsx`, all policy links point to `href="#"`.
  - **Required Action:** Publish dedicated policy pages complying with Chilean consumer standards:
    1. **Terms and Conditions of Sale.**
    2. **6-Month Legal Warranty & Return Policy (SERNAC):** Specify technical equipment warranty terms and hygiene requirements for sealed consumable goods.
    3. **Privacy and Data Protection Policy:** Complying with Chilean Law N° 19.628.
    4. **Company Legal Identification:** Legal business name, company RUT, physical address in Melipilla, and customer support channels.

- [ ] **7.2. Custom `.cl` Domain and SSL Certificates**
  - Register the official domain via NIC Chile (e.g., `prontoinsumos.cl` or `prontodental.cl`).
  - Configure DNS records on Vercel with automatic TLS/SSL renewal.
  - Replace all occurrences of `pronto-insumos.vercel.app` with the production domain.

- [ ] **7.3. Upload Brand Assets, Favicon, and OpenGraph Image**
  - **Current Issue:** `index.html` references `og-preview.png` for link previews in WhatsApp and social media, but no `public/` folder or image asset exists in the repository.
  - **Required Action:**
    - Create the `public/` directory.
    - Place `favicon.ico`, `apple-touch-icon.png`, and `og-preview.png` (1200x630 px featuring company logo and Melipilla delivery badge).

---

## Phase 8: Performance, Infrastructure, DevOps & Telemetry

- [ ] **8.1. Production Bundle Optimization (Code Splitting)**
  - **Current Issue:** `vite build` warns that the main bundle chunk `dist/assets/index-*.js` is **781 kB** (213 kB gzip), exceeding Rollup's 500 kB recommendation.
  - **Required Action:**
    - Split Firebase and Lucide icons into manual vendor chunks in `vite.config.ts`.
    - Code-split heavy modals (`CheckoutModal`, `ProductQuickView`) using `React.lazy()` and `Suspense`.

- [ ] **8.2. TypeScript Configuration for Serverless Functions (`api/`)**
  - **Current Issue:** `tsconfig.json` only includes `"src/**/*"`. The serverless functions in `api/` are skipped during `pnpm tsc` checks.
  - **Required Action:**
    - Configure `tsconfig.server.json` or update `"include"` to cover `"api/**/*"` in a Node.js compilation context.

- [x] **8.3. Automated Integration Tests for Serverless Endpoints**
  - **Context & Status (Fulfilled & Verified):**
    - Implemented comprehensive Vitest integration test suites for serverless functions in `src/tests/api/`:
      - `create-preference.test.ts` (6 tests): validates preference creation, payload structure, integer CLP currency, and error handling.
      - `mercadopago-signature.test.ts` (13 tests): verifies HMAC-SHA256 signature verification, timing tolerance, and malformed header rejections.
      - `mercadopago-webhook.test.ts` (15 tests): verifies idempotency, duplicate prevention, concurrent transactions, and Firestore order status transitions.
    - Total: 34 tests maintaining 100% test reliability.

- [ ] **8.4. Continuous Integration (CI/CD) & Pre-Flight Quality Guardrails**
  - **Note on Guardrails:** In strict adherence to `AGENTS.md` (Anti-Overshooting Principle #5 and Section 7), PRONTO uses lean Vercel CLI deployments without bloated multi-stage runners or heavy container pipelines.
  - **Required Action:**
    - Enforce local mandatory pre-flight checks (`pnpm test && pnpm exec tsc --noEmit && pnpm build`) before releases.
    - _(Optional)_ Add a minimal GitHub Actions workflow (`.github/workflows/ci.yml`) running only `pnpm test` and `pnpm build` on pull requests.

- [ ] **8.5. Real-Time Error Monitoring & Analytics (Sentry & GA4)**
  - Integrate **Sentry for React** to capture unhandled client runtime errors across mobile devices and browsers.
  - Set up Google Analytics 4 (GA4) with e-commerce events (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`) to analyze dental clinic purchasing behavior in Melipilla and RM.

- [x] **8.6. Consolidate `api/` Endpoints Below the Vercel Hobby Function Cap** ✅ _(Resolved: the 11 `api/admin/*` handlers moved to `api/_lib/admin/*` and are now dispatched by the single routed entry point `api/admin/[action].ts`; every shared module moved `api/lib/` → `api/_lib/`. `api/` counts **6** functions against the Hobby cap of 12 — 6 slots of headroom. Public URLs and `src/admin/services/adminApi.ts` are unchanged. The single-purpose-function guardrail exception is recorded in root `AGENTS.md` §2.2 and `api/AGENTS.md` §1.2, and covered by the new `src/tests/api/admin/admin-router.test.ts` suite. **Lifting the cap exposed two further, pre-existing runtime blockers that had never been reachable because no deploy had succeeded since 2026-09-17 — both are fixed and verified live (see the two Runtime Blocker bullets below).**)_
  - **Current Issue:** Every deployment — preview *and* production — is rejected at the output stage, after the build has already succeeded:

    ```
    Error: No more than 12 Serverless Functions can be added to a Deployment
    on the Hobby plan. Create a team (Pro plan) to deploy more.
    ```

    This entry originally counted **15** serverless functions — `api/admin/*` (11), `create-preference`, `track-order`, `upload-voucher`, `webhooks/mercadopago`. The real count was **22**: Vercel counts _every_ file under `api/` whose path has no `_`-prefixed segment, so the 6 shared modules under `api/lib/*` counted too. Against a **Hobby-plan ceiling of 12**, the build completes (`Build Completed in /vercel/output`) while the _deployment_ is refused. **After this task: 6 functions.**
  - **How it broke:** the admin portal endpoints landed on 2026-09-17 (`f23a868`, `c836962`, `5782be6`), taking `api/` from 4 → 15 files. The last successful deployment predates that (`vercel project ls` reports the project as last updated ~9 days prior), so **no deployment has succeeded since 2026-09-17**. This is entirely independent of the pnpm/lockfile regression fixed in PR #10 — that fix was necessary but not sufficient.
  - **Required Action (pick one; do not mix):**
    1. **Consolidate into fewer functions — no cost, preferred.** Collapse the 11 `api/admin/*` endpoints behind a single routed entry point (e.g. `api/admin/[action].ts` or `api/admin/[...route].ts`) that dispatches on the path. That alone takes 15 → 5 and restores headroom. A plain `switch` on the route is sufficient.
    2. **Upgrade the Vercel project to Pro.** Removes the cap, costs money, requires no repo change.
  - **Acceptance Criteria:**
    - [x] `pnpm dlx vercel@latest deploy` produces a Preview URL that reaches `● Ready`. _(Done — verified against a live preview: `✓ Ready in 30s`. `api/admin/{orders,dashboard-stats,products}` all returned `403 {"success":false,"error":"Encabezado de autorización ausente o malformado"}`, `api/admin/nonexistent` returned `404 {"success":false,"error":"Endpoint de administración no encontrado"}` from the dispatcher, `api/admin/approve-transfer` returned `405`, and the runtime logs recorded **zero** errors across all five requests.)_
    - [ ] `pnpm dlx vercel@latest deploy --prod` succeeds once the `og-preview.png` gate (§7.3 and root `AGENTS.md` §7) is also satisfied. _(Human step.)_
    - [x] Every suite under `src/tests/api/**` still passes **unchanged** — the admin client adapter `src/admin/services/adminApi.ts` must keep calling the same public URLs, or be updated in the same change. _(Done: assertions untouched; only handler import paths were rewritten. `adminApi.ts` needed zero changes.)_
    - [x] Security behaviour is unchanged: every admin route still requires `Authorization: Bearer <ID_TOKEN>` plus `decodedToken.admin === true` via `api/_lib/adminAuth.ts`, and `firestore.rules` is untouched. _(Done: handler bodies moved verbatim — verified by diff that only import lines changed.)_
  - **⚠️ Guardrail tension — resolved:** root `AGENTS.md` §2.2 mandates *"single-purpose Vercel Serverless Functions"* and forbids monolithic backend frameworks. The routed `api/admin/[action].ts` entry point is now a **documented exception** to that rule — the decision is recorded in root `AGENTS.md` §2.2 and `api/AGENTS.md` §1.2. No Express, NestJS, Koa or Fastify was introduced: the dispatcher is a plain `Record<string, handler>` lookup table.
  - **Also stale, now fixed:** `api/AGENTS.md` claimed *"All 11 serverless functions in `api/`"* — the real count was 22, and it is load-bearing because of the cap. Corrected to 6 in the new §1.2 function-layout table, with the `_lib` exclusion convention documented. Its admin endpoint table already covered `create-product`, `update-product` and `toggle-visibility` (that part of the claim was itself stale) and now links to the modules under `api/_lib/admin/`.
  - **🔴 Runtime Blocker A — extensionless ESM imports (pre-existing, fixed):** Vercel does not bundle `api/`; it transpiles each file in place and ships the tree, so Node's ESM resolver runs at request time. With `"type": "module"` in `package.json`, every extensionless relative import (`'./_lib/firebaseAdmin'`) threw `ERR_MODULE_NOT_FOUND` — **every** `api/` function 500'd with `FUNCTION_INVOCATION_FAILED`, including the untouched public endpoints. Proven pre-existing by building `main` (`e4206bc`) in a throwaway worktree and inspecting its emitted `create-preference.js` (identical extensionless specifiers). Fixed by appending `.js` to relative **value** imports across `api/` plus `src/utils/schemaValidation.ts`'s `./rut.js`. Type-only imports that target a directory (`'../../../src/types'`) stay extensionless — they are erased at transpile time. Convention recorded in `api/AGENTS.md` §1.3.
  - **🔴 Runtime Blocker B — `jwks-rsa` CJS requiring ESM-only `jose` (pre-existing, fixed):** `firebase-admin` → `jwks-rsa@4` is CommonJS and calls `require('jose')` at module load, while `jose@6` is ESM-only — so *merely importing `firebase-admin/auth`* crashed with `ERR_REQUIRE_ESM`, taking down every admin route (the core of this task). Known upstream: [auth0/node-jwks-rsa#507](https://github.com/auth0/node-jwks-rsa/issues/507) / [firebase/firebase-admin-node#3181](https://github.com/firebase/firebase-admin-node/issues/3181); the fix ([PR #508](https://github.com/auth0/node-jwks-rsa/pull/508)) is merged but **unreleased** (`jwks-rsa` latest is still `4.1.0`). Worked around with `pnpm.overrides` pinning `jose` to `^5.10.0` — the last dual CJS/ESM major, and `jwks-rsa` only uses `jose.importJWK`/`exportSPKI`, which are API-identical across jose 4/5/6. **Trade-off accepted:** jose v5 is EOL per its own `SECURITY.md`; the CVE that motivated the v6 bump (CVE-2025-45767) is *disputed by the maintainer* and specific to v6.0.10. **Removal condition:** drop the override once `jwks-rsa` > `4.1.0` ships, then re-verify `firebase-admin/auth` on a preview deploy. Documented in `api/AGENTS.md` §1.3 and root `AGENTS.md` §7.
  - **Note for future local deploys:** running `vercel build` creates a gitignored `.vercel/output` tree that `pnpm lint` previously swept up (2800 errors from build artifacts). `.vercel/**` was added to `eslint.config.js` `ignores`, alongside the existing `dist/**` / `coverage/**` / `public/**` entries.

---

## Prioritization Matrix & Effort Estimation

| Module / Task | Priority | Impact | Estimated Effort | Production Blocker |
| :--- | :---: | :---: | :---: | :---: |
| **0.1. Fix client-side false payment approval & premature stock deduction** | **P0** | Critical | 2 - 3 hours | **YES** |
| **0.2. Migrate webhook to `firebase-admin` with secure credentials** | **P0** | Critical | 2 - 3 hours | **YES** |
| **0.3. Synchronize `orderId` across client, backend, and Mercado Pago** | **P0** | Critical | 1 hour | **YES** |
| **0.4. Idempotency & signature validation in Mercado Pago Webhook** | **P0** | Critical | 2 hours | **YES** |
| **0.5. Deploy strict Firestore security rules (`firestore.rules`)** | **P0** | Critical | 2 hours | **YES** |
| **0.6. Remove seed DB button in Footer and clean mock checkout fields** | **P0** | High | 1 hour | **YES** |
| **1.1. Standardize prices and currency to Chilean Pesos (CLP)** | **P0** | Critical | 2 hours | **YES** |
| **2.1. Handle Mercado Pago return state (`status=approved`) in UI** | **P1** | High | 2 hours | **YES** |
| **2.2. Shopping cart persistence via `localStorage`** | **P1** | Medium | 1 hour | No (Recommended) |
| **2.4. Bank transfer voucher upload workflow** | **P1** | High | 3 hours | **YES** |
| **3.1. Delivery zone rate selector (Melipilla vs. RM vs. Regions)** | **P1** | High | 3 hours | **YES** |
| **5.1. Transactional emails via Resend or Nodemailer** | **P1** | High | 4 hours | **YES** |
| **7.1. Publish legal pages (Warranty, SERNAC terms, Privacy)** | **P1** | Legal | 3 hours | **YES** |
| **7.2. Configure custom `.cl` domain and SSL on Vercel** | **P1** | Trust | 1 hour | **YES** |
| **4.2. Backoffice order management dashboard for warehouse staff** | **P2** | Operational | 1 - 2 days | No (Can manage via Firebase temporarily) |
| **1.2. Automated electronic invoicing with SII (OpenFactura/LibreDTE)** | **P2** | Tax / B2B | 2 - 3 days | No (Can invoice manually at start) |
| **6.1. High-resolution dental product photography & datasheets** | **P2** | Commercial | Variable | No (Initial catalog can launch lean) |
| **8.1 - 8.5. Bundle optimization, Sentry, CI/CD, and GA4 tracking** | **P3** | DevOps | 1 day | No (Immediate post-launch) |
| **8.6. Consolidate `api/` endpoints below the Vercel Hobby function cap** | **P0** | Critical | 3 - 4 hours | **YES** |

---

## 🏁 Go-Live Acceptance Criteria

The store is officially ready to process its first real commercial transaction with a dental clinic when **all** of the following conditions are satisfied:

1. [x] No customer can purchase any dental equipment or supply at incorrect decimal rates (charges are 100% accurate in CLP integers).
2. [x] Approved Mercado Pago transactions update the Firestore order status and deduct physical stock **exclusively** via the verified serverless webhook.
3. [x] If a customer abandons or gets rejected on the payment gateway, inventory remains intact and the order is not marked as paid.
4. [x] Secret server keys for Firebase and Mercado Pago are stored strictly in serverless environment variables.
5. [x] The purchasing clinic receives an immediate formal order confirmation with an order number via email and/or WhatsApp.
6. [x] Customers can select Boleta or Factura with validated RUT and company data, and the business issues the corresponding legal tax invoice.
7. [ ] The storefront runs on a branded `.cl` domain with active SSL and visible consumer legal terms conforming to Chilean law.
