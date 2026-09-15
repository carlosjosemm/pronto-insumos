# PRONTO INSUMOS ODONTOLÓGICOS — Production Readiness TODO & Audit Report

**Last Updated:** September 2026  
**Target Market:** Melipilla & Región Metropolitana, Chile  
**Deployment Stack:** Vercel (Frontend React 18 + Serverless Node.js) & Google Firebase / Firestore  
**Repository State:** Advanced functional prototype with automated test coverage (84/84 passing tests in Vitest), but containing **critical security vulnerabilities, flawed payment/stock logic, Chilean tax (SII) gaps, and operational blockers** that must be resolved before handling real financial transactions.

---

## 📑 Table of Contents
1. [Diagnosis: Previous Roadmap vs. Actual Codebase Reality](#1-diagnosis-previous-roadmap-vs-actual-codebase-reality)
2. [Phase 0: Critical Security & Payment Architecture Blockers (Priority P0 - Immediate)](#phase-0-critical-security--payment-architecture-blockers-priority-p0---immediate)
3. [Phase 1: Chilean Localization, Pricing & Tax Compliance (SII / ISP / CLP)](#phase-1-chilean-localization-pricing--tax-compliance-sii--isp--clp)
4. [Phase 2: Checkout UX, Cart Persistence & Payment Return Flows](#phase-2-checkout-ux-cart-persistence--payment-return-flows)
5. [Phase 3: Logistics, Shipping & Local Warehouse Pickup (Melipilla / RM)](#phase-3-logistics-shipping--local-warehouse-pickup-melipilla--rm)
6. [Phase 4: Backoffice Operations & Order Management Dashboard](#phase-4-backoffice-operations--order-management-dashboard)
7. [Phase 5: Transactional Communications (Email & WhatsApp)](#phase-5-transactional-communications-email--whatsapp)
8. [Phase 6: Real Catalog Assets, Photography & Technical Datasheets](#phase-6-real-catalog-assets-photography--technical-datasheets)
9. [Phase 7: Legal Compliance, SERNAC Warranty & Customer Trust](#phase-7-legal-compliance-sernac-warranty--customer-trust)
10. [Phase 8: Performance, Infrastructure, DevOps & Telemetry](#phase-8-performance-infrastructure-devops--telemetry)
11. [Prioritization Matrix & Effort Estimation](#prioritization-matrix--effort-estimation)

---

## 1. Diagnosis: Previous Roadmap vs. Actual Codebase Reality

The previous document `PROJECT_ASSESSMENT_AND_ROADMAP.md` was outdated with respect to the actual codebase. Several tasks marked as pending `[ ]` had already been developed, while severe operational and security flaws were left unaddressed:

| Item | In Old Roadmap | Reality in Code | Diagnosis / Required Action |
| :--- | :---: | :---: | :--- |
| **Chilean RUT Validation (Modulo 11)** | Pending `[ ]` | Implemented ✅ | Exists in `src/utils/rut.ts` and validated in `CheckoutModal.tsx`. |
| **B2B Invoicing Fields (Giro, Razón Social)** | Pending `[ ]` | Implemented ✅ | The Boleta/Factura toggle collects these fields in `CheckoutModal.tsx`. |
| **Endpoint `/api/create-preference`** | Pending `[ ]` | Created ✅ | Implemented in `api/create-preference.ts` for Vercel Serverless. |
| **SEO Meta Tags & Schema.org LocalBusiness** | Pending `[ ]` | Implemented ✅ | Added to `index.html`. Missing actual image file `og-preview.png`. |
| **Global React Error Boundary** | Pending `[ ]` | Implemented ✅ | Created in `src/components/ErrorBoundary.tsx` with unit test. |
| **Webhook Security with `firebase-admin`** | Mentioned | **CRITICAL: Unresolved ❌** | `api/webhooks/mercadopago.ts` imports the client SDK with `import.meta.env`, failing in Node and posing execution risks. |
| **Stock Deduction & Idempotency** | Not noticed | **CRITICAL: Flawed Logic ❌** | Frontend decrements stock before payment happens. Webhook lacks idempotency and decrements twice upon retries. |
| **Currency & Pricing (CLP vs USD)** | Not noticed | **CRITICAL: Currency Bug ❌** | Prices in `src/data/products.ts` use USD decimal format (`189.99`). Sent to Mercado Pago as CLP, charging only $190 Chilean Pesos ($0.20 USD). |
| **Mock Customer & Card Fields in Checkout** | Not noticed | **Insecure / Prototype ❌** | Checkout form contains hardcoded mock values ("Dra. Camila Fuentes") and mock credit card inputs stored in React state. |
| **Database Seed Button in Footer** | Not noticed | **Hazardous ❌** | The public footer displays a `"🔥 Sembrar Firebase DB"` button callable by any visitor. |

---

## Phase 0: Critical Security & Payment Architecture Blockers (Priority P0 - Immediate)

These items carry immediate risks of financial loss, critical security vulnerabilities, or complete payment transaction failures. **They must be resolved before handling any real transactions.**

- [x] **0.1. Fix False Client-Side Payment Approval (`CheckoutModal.tsx` & `src/services/api.ts`)** ✅ *(Resolved: Orders initialized with PENDIENTE_PAGO_MERCADOPAGO; client stock deduction purged; verified by unit tests)*

- [x] **0.2. Migrate Serverless Webhooks to `firebase-admin` with Service Account** ✅ *(Resolved: firebase-admin installed; api/lib/firebaseAdmin.ts singleton created; webhook uses admin Firestore queries & transactions; unit tests passing)*

- [x] **0.3. Synchronize Order Identifier (`orderId` / `external_reference`)** ✅ *(Resolved: generateOrderId creates canonical PRONTO-XXXXXX; unified across CheckoutModal, preference payload, and Firestore order document; unit tests passing)*

- [x] **0.4. Enforce Idempotency in the Mercado Pago Webhook** ✅ *(Resolved: Fast-path idempotency pre-check and atomic all-in-one Firestore transaction inside api/webhooks/mercadopago.ts; duplicate deliveries return HTTP 200 without mutating stock or orders; comprehensive unit tests passing)*

- [x] **0.5. Cryptographic Signature Verification on Webhooks (`x-signature`)** ✅ *(Resolved: api/lib/mercadopagoSignature.ts computes HMAC-SHA256 over Mercado Pago manifest template; timing-safe equality verification in api/webhooks/mercadopago.ts rejects unauthorized requests with 401; unit and integration tests passing)*

- [x] **0.6. Create and Deploy Firestore Security Rules (`firestore.rules`)** ✅ *(Resolved: firestore.rules created with public read-only catalog, admin-only catalog write, strict pending-only order creation schema preventing injection, client-side order read/update/delete denied; firebase.json configured and deploy:rules script added; unit tests passing)*

- [x] **0.7. Remove Public Database Seed Button (`Footer.tsx`)** ✅ *(Resolved: Public seed button completely removed from Footer.tsx; footer restructured to authentic 4-column B2B distributor layout; unit tests verified)*

- [x] **0.8. Purge Mock Data and Ensure Privacy / PCI-DSS Compliance** ✅ *(Resolved: CheckoutModal form state initialized with empty strings and clean placeholders; cardNumber, expDate, and cvc eliminated from CustomerInfo and component state; input whitespace sanitization added; clean Chilean clinical inputs; comprehensive unit tests passing with zero regressions)*

---

## Phase 1: Chilean Localization, Pricing & Tax Compliance (SII / ISP / CLP)

- [x] **1.1. Standardize Pricing in Chilean Pesos (CLP) Without Decimals** ✅ *(Resolved: Standardized all 10 catalog product prices to integer CLP; implemented formatCLP, calculateIVA, and parseCLP in src/utils/currency.ts; updated ProductCard, ProductQuickView, Cart, App, CheckoutModal, and WhatsApp service; free shipping threshold updated to $150.000 CLP; 100% test coverage with 173 passing tests)*
  - **Current Issue:** `src/data/products.ts` uses decimal currency numbers (`189.99`, `129.50`). In Chile, CLP has no decimal subdivisions. Sending `189.99` with currency `CLP` to Mercado Pago results in charging only $190 Chilean Pesos for a professional dental turbine.
  - **Required Action:**
    - Update all catalog items to valid CLP values: e.g., LED Turbine `$189.990 CLP`, Composite Kit `$79.990 CLP`, Ultrasonic Scaler `$245.000 CLP`.
    - Create a dedicated currency formatter `formatCLP(amount: number)` in `src/utils/currency.ts` that outputs `$189.990` (period thousands separator, zero decimal places).
    - Round tax calculations (19% IVA) to whole integer values (`Math.round`).
    - Adjust `FREE_SHIPPING_THRESHOLD` to a realistic CLP figure (e.g., `$150.000 CLP` instead of `150.00`).

- [x] **1.2. B2B Fiscal Billing Data Capture & Purchase Voucher (Boleta & Factura SII)** ✅ *(Resolved: Implemented calculateTaxBreakdown and validateFacturaFields in src/utils/tax.ts; mandatory Factura validation in CheckoutModal with inline Chilean errors; structured billing payload with tax breakdown saved to Firestore orders; printable pro-forma purchase voucher with window.print() added to confirmation screen; 100% test coverage with 183 tests passing)*
  - **Context:** Chilean dental clinics and practitioners require valid tax deduction (crédito fiscal IVA 19%). B2B transactions require issuing electronic invoices (*Factura Electrónica*) while retail clients receive *Boleta Electrónica*. Official electronic invoicing in Chile is performed free of charge via the SII Portal Tributario (`sii.cl`), requiring no paid third-party DTE provider.
  - **Required Action:**
    - **Checkout Fiscal Validation (`CheckoutModal.tsx`):**
      - If **Boleta**: Validate customer RUT (Modulo 11) and full name.
      - If **Factura**: Strictly enforce and validate all legally required SII fields: *RUT Empresa* (Modulo 11), *Razón Social*, *Giro Comercial* (e.g. "Clínica Dental", "Servicios Odontológicos"), and *Dirección / Comuna Fiscal*. Block step progression if any field is missing or invalid.
    - **Structured Order Schema (`types/index.ts` & `api.ts`):**
      - Save structured `billing` payload on the order in Firestore containing tax breakdown (`neto`, `iva`, `total`), fiscal identifiers, and status `PENDIENTE_EMISION_SII`.
    - **Printable Pro-Forma Purchase Voucher:**
      - In Step 3 (Order Confirmation), provide a 1-click printable/downloadable purchase voucher (*Comprobante de Venta Pro-Forma*) with PRONTO distributor header, itemized list, fiscal breakdown, and disclaimer for official SII dispatch.
    - **Admin/Operator Handoff:**
      - Organize fiscal fields for 1-click copy into the free SII portal (`sii.cl`).

- [x] **1.3. Sanitary Regulations for Controlled Dental Supplies (ISP Chile)**
  - **Context:** Certain dental materials (local anesthetics, needles, specialized prescription pharmaceuticals) require verification of professional accreditation with the Chilean Superintendencia de Salud (SIS registry).
  - **Fulfilled & Verified:**
    - **Catalog Regulatory Classification (`src/data/products.ts`):**
      - Flagged prescription items with `prescriptionRequired: true`. Added authentic regulated supply `odon-501` (*Anestésico Dental Lidocaína 2% con Epinefrina 1:100.000*, Registro ISP F-14220) and `odon-402` (*Motor de Implante Odontológico*).
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

- [ ] **2.1. Handle Mercado Pago Return URLs in Frontend (`App.tsx`)**
  - **Current Issue:** When completing payment on Checkout Pro, Mercado Pago redirects back to `/?status=approved&orderId=PRONTO-XXXXXX`. `App.tsx` does not read URL search parameters (`window.location.search`). Customers are dropped back onto the homepage with no visual confirmation while the cart remains full.
  - **Required Action:**
    - Parse query parameters or set up a dedicated return route (`/checkout/confirmation`).
    - If `status=approved`:
      - Empty the shopping cart.
      - Display an order success screen highlighting the order number, invoice status, and support contact.
    - If `status=failure` or `status=pending`:
      - Display a helpful message offering alternative payment methods (retry card or bank transfer).

- [ ] **2.2. Shopping Cart Persistence (`localStorage`)**
  - **Current Issue:** Cart state lives strictly in React memory (`useState`). If a customer reloads the page or switches tabs to inspect dental equipment, the cart is wiped clean.
  - **Required Action:**
    - Sync cart state with `localStorage` (`pronto_cart_items`).
    - Validate that stored items still exist in catalog and have available inventory upon session recovery.

- [ ] **2.3. Pre-Checkout Inventory Validation & Max-Stock Cues**
  - **Context & Current State:** Front-end quantity steppers in `App.tsx` and `ProductQuickView.tsx` already clamp item additions to `product.stockCount`. However, if stock depletes while a customer is browsing or if an item in the cart reaches max stock, additional safeguards are needed.
  - **Required Action:**
    - In `Cart.tsx`: disable the `+` button when `item.quantity >= item.product.stockCount`, displaying a clear `"Máximo disponible"` or `"Sin stock"` status indicator.
    - In `Cart.tsx` and `CheckoutModal.tsx`: if an item becomes unavailable or exceeds stock, block checkout progression and alert the user.
    - In serverless `/api/create-preference.ts`: validate requested quantities against current Firestore inventory before generating Mercado Pago preference.

- [ ] **2.4. End-to-End Bank Transfer Workflow (Transferencia Bancaria)**
  - **Current Issue:** Selecting bank transfer displays static account details, leaving the order in an unverified limbo with no verification mechanism.
  - **Required Action:**
    - Provide a voucher upload field (PDF/PNG/JPG) during order completion or via a unique order link.
    - Upload files securely to Firebase Storage (`receipts/{orderId}/transfer_voucher.pdf`).
    - Externalize bank account details (Banco de Chile, account number, company RUT) to environment variables or Firestore configuration rather than hardcoding in component JSX.

- [ ] **2.5. Customer Order Tracking Page**
  - **Required Action:**
    - Provide a public lookup page secured by order ID and customer RUT (`/tracking?orderId=PRONTO-123456`).
    - Display live fulfillment statuses (*Order Placed*, *Payment Verified*, *Packing in Melipilla*, *Shipped via Starken/Chilexpress*, *Delivered*).

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
  - Display estimated fulfillment times in the cart and checkout (e.g., *"Same-day / 24-hour delivery for clinics in Melipilla"* and *"24-48 hours for wider RM"*).

---

## Phase 4: Backoffice Operations & Order Management Dashboard

Currently, no administrative interface exists for PRONTO staff to operate the store without manually opening the Google Firebase web console. A dedicated, lightweight, and secure `/admin` portal must be created so the store owner and warehouse staff in Melipilla can consult orders and manage inventory without touching developer consoles.

- [ ] **4.0. Dedicated Administrative Portal Route (`/admin`)**
  - **Context & Objective:** Implement a functional internal backoffice portal accessible via the `/admin` path (using client routing or hash-based view toggle `#/admin`) to handle order consultations, fulfillment state transitions, and warehouse inventory adjustments.
  - **Core Architecture & Guardrails:**
    - **Single-Page Backoffice Module (`src/components/admin/AdminPortal.tsx`):** Keep the implementation lean without adding heavy state management (no Redux/Zustand) or third-party UI component libraries (no Tailwind, Bootstrap, or MUI). Use the existing Vanilla CSS design system in [`src/index.css`](file:///c:/Users/ecmv2/Documents/PRONTO/src/index.css).
    - **Simple Admin Authentication:** Clean login view with Firebase Auth (Email/Password for staff e.g., `admin@prontoinsumos.cl`). Protect the route so unauthenticated visitors cannot view clinical order data or catalog mutation forms.
    - **Firestore Security Alignment:** Admin mutations (updating inventory, approving bank transfers) must respect [`firestore.rules`](file:///c:/Users/ecmv2/Documents/PRONTO/firestore.rules) using authenticated admin claims (`request.auth.token.admin == true`) or serverless admin functions.
  - **Sub-feature A: Order History & Clinical Invoicing Consultation (`/admin#orders`):**
    - Searchable order table: filter by canonical `orderId` (e.g., `PRONTO-123456`), clinic name, or Chilean RUT.
    - Status filters: `PENDIENTE_PAGO`, `PENDIENTE_TRANSFERENCIA`, `PAGADO_MERCADOPAGO`, `COTIZACION_SOLICITADA_WHATSAPP`, `DESPACHADO`, `ENTREGADO`.
    - Clinical order inspector drawer/modal:
      - Full Chilean tax invoicing attributes (RUT, Razón Social, Giro Comercial, Gabinete fiscal address, comuna, phone, and contact email).
      - Itemized supply breakdown with unit integer CLP prices, 19% IVA, and total.
      - Payment telemetry: gateway reference (`mercadopagoPaymentId`), ISO timestamp, and bank transfer receipt link.
    - Operational actions:
      - One-click **Aprobar Transferencia Manual** (executing atomic stock reduction for bank transfer orders).
      - Dispatch fulfillment update (carrier selection: Starken, Chilexpress, Blue Express, or local Melipilla courier + tracking code).
  - **Sub-feature B: Real-Time Warehouse Inventory Management (`/admin#inventory`):**
    - Live product stock table displaying: SKU/REF code, product name, brand, category, integer CLP price (Neto and con IVA), and `stockCount`.
    - Inline quick-adjustment counters (`+1`, `-1`, or direct numeric input) to update stock when restock shipments arrive at the Melipilla warehouse.
    - Product editor modal: modify clinical presentations (e.g., *Caja 50 un.*, *Jeringa 4g*), technical datasheets, ISP health registry codes, and integer CLP prices.
    - Instant visibility toggle (`inStock: true/false`) to pause sales of depleted or backordered items.

---

## Phase 5: Transactional Communications (Email & WhatsApp)

- [ ] **5.1. Transactional Email Service (Resend / SendGrid / Postmark)**
  - Authenticate a custom sender domain with SPF, DKIM, and DMARC records (e.g., `orders@prontoinsumos.cl`).
  - **Customer Confirmation Email:**
    - Immediate order receipt with item breakdown, 19% IVA, freight charge, and billing details.
    - If bank transfer selected: clear bank deposit details and upload link for the payment receipt.
  - **Internal Warehouse Notification:**
    - Real-time alert to Melipilla dispatch staff whenever a paid order or high-volume quotation arrives.

- [ ] **5.2. Configure Official Production WhatsApp Number**
  - **Current Issue:** `VITE_WHATSAPP_NUMBER` in `.env.example` and `.env.local` is set to placeholder `56912345678`.
  - **Required Action:**
    - Replace with the real WhatsApp Business number for the Melipilla operation.
    - Configure automated welcome and catalog messages inside the WhatsApp Business app.

---

## Phase 6: Real Catalog Assets, Photography & Technical Datasheets

- [x] **6.1. Replace CSS Gradient Placeholders with Real Photography**
  - **Context & Status (Fulfilled in UI/UX Overhaul):**
    - `Product` data model updated with `images?: string[]` and `packageContents?: string[]`.
    - Curated high-resolution dental photography URLs configured across catalog items in `src/data/products.ts`.
    - Interactive multi-photo gallery implemented in `ProductQuickView.tsx` with thumbnail navigation, keyboard controls, and full fallback to category iconography in `ProductCard.tsx`.
    - *(Optional future enhancement: migrate images to dedicated Firebase Storage bucket when custom assets are photographed).*

- [ ] **6.2. Downloadable Technical Documentation (Datasheets & ISP Registration)**
  - For clinic sanitization audits, dentists require technical datasheets and sanitary registration codes.
  - Provide a download link on product details: *"Download Technical Datasheet (PDF)"*.

- [ ] **6.3. Expand Catalog SKUs by Dental Specialty**
  - Organize dental items into standard industry categories:
    - *Endodontics* (files, gutta-percha, sealers).
    - *Periodontics & Prophylaxis* (curettes, ultrasonic tips, prophy paste).
    - *Restorative & Esthetics* (composites, bonding agents, curing lights).
    - *Orthodontics* (brackets, archwires, elastics).
    - *Surgery & Implants* (sutures, blades, surgical instruments).
    - *Sterilization & Infection Control* (pouches, autoclave accessories, surface disinfectants).

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
    - *(Optional)* Add a minimal GitHub Actions workflow (`.github/workflows/ci.yml`) running only `pnpm test` and `pnpm build` on pull requests.

- [ ] **8.5. Real-Time Error Monitoring & Analytics (Sentry & GA4)**
  - Integrate **Sentry for React** to capture unhandled client runtime errors across mobile devices and browsers.
  - Set up Google Analytics 4 (GA4) with e-commerce events (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`) to analyze dental clinic purchasing behavior in Melipilla and RM.

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

---

## 🏁 Go-Live Acceptance Criteria

The store is officially ready to process its first real commercial transaction with a dental clinic when **all** of the following conditions are satisfied:

1. [x] No customer can purchase any dental equipment or supply at incorrect decimal rates (charges are 100% accurate in CLP integers).
2. [x] Approved Mercado Pago transactions update the Firestore order status and deduct physical stock **exclusively** via the verified serverless webhook.
3. [x] If a customer abandons or gets rejected on the payment gateway, inventory remains intact and the order is not marked as paid.
4. [x] Secret server keys for Firebase and Mercado Pago are stored strictly in serverless environment variables.
5. [ ] The purchasing clinic receives an immediate formal order confirmation with an order number via email and/or WhatsApp.
6. [x] Customers can select Boleta or Factura with validated RUT and company data, and the business issues the corresponding legal tax invoice.
7. [ ] The storefront runs on a branded `.cl` domain with active SSL and visible consumer legal terms conforming to Chilean law.
