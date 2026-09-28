# PRONTO INSUMOS ODONTOLÓGICOS — Production Readiness TODO & Audit Report

**Last Updated:** September 2026  
**Target Market:** Melipilla & San Antonio, Chile  
**Deployment Stack:** Vercel (Frontend React 18 + Serverless Node.js) & Google Firebase / Firestore  
**Repository State:** Advanced functional storefront with automated test coverage (67 suites / 559 tests). Phases 0–2, 4 and 5 are resolved; a post-implementation audit added new P0 payment-integrity blockers (0.9–0.11) — **all three are resolved** (including 0.9's adversarial-review remediation) — and the distributor-RUT legal fix (1.4) is resolved. A second audit pass on the promo path opened **Phase 9 (commercial promotions & discount governance)**; remaining work covers the remaining simulated-success fallbacks (2.8), the promo data model (9.1), per-zone shipping rates, legal compliance, catalog assets, and DevOps polish before go-live.

---

## 📑 Table of Contents

- [PRONTO INSUMOS ODONTOLÓGICOS — Production Readiness TODO \& Audit Report](#pronto-insumos-odontológicos--production-readiness-todo--audit-report)
  - [📑 Table of Contents](#-table-of-contents)
  - [1. Diagnosis: Previous Roadmap vs. Actual Codebase Reality](#1-diagnosis-previous-roadmap-vs-actual-codebase-reality)
  - [Phase 0: Critical Security \& Payment Architecture Blockers (Priority P0 - Immediate)](#phase-0-critical-security--payment-architecture-blockers-priority-p0---immediate)
  - [Phase 1: Chilean Localization, Pricing \& Tax Compliance (SII / ISP / CLP)](#phase-1-chilean-localization-pricing--tax-compliance-sii--isp--clp)
  - [Phase 2: Checkout UX, Cart Persistence \& Payment Return Flows](#phase-2-checkout-ux-cart-persistence--payment-return-flows)
  - [Phase 3: Logistics, Shipping \& Delivery Zones (Melipilla / San Antonio)](#phase-3-logistics-shipping--delivery-zones-melipilla--san-antonio)
  - [Phase 4: Backoffice Operations \& Order Management Dashboard](#phase-4-backoffice-operations--order-management-dashboard)
  - [Phase 5: Transactional Communications (Email \& WhatsApp)](#phase-5-transactional-communications-email--whatsapp)
  - [Phase 6: Real Catalog Assets, Photography \& Technical Datasheets](#phase-6-real-catalog-assets-photography--technical-datasheets)
  - [Phase 7: Legal Compliance, SERNAC Warranty \& Customer Trust](#phase-7-legal-compliance-sernac-warranty--customer-trust)
  - [Phase 8: Performance, Infrastructure, DevOps \& Telemetry](#phase-8-performance-infrastructure-devops--telemetry)
  - [Phase 9: Commercial Promotions \& Discount Governance](#phase-9-commercial-promotions--discount-governance)
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
  - ⚠️ **Audit note (resolved by 0.10):** verification was **fail-open** when `MERCADOPAGO_WEBHOOK_SECRET` is unset — a deploy that loses the secret silently accepts unsigned requests (mitigated only by the MP API re-check). Task 0.10 now refuses such deliveries with `500` + a loud log in a production runtime; the helper itself still reports `reason: 'secret_not_configured'` and the endpoint owns the trust decision.

- [x] **0.6. Create and Deploy Firestore Security Rules (`firestore.rules`)** ✅ _(Resolved: firestore.rules created with public read-only catalog, admin-only catalog write, strict pending-only order creation schema preventing injection, client-side order read/update/delete denied; firebase.json configured and deploy:rules script added; unit tests passing)_
  - ⚠️ **Audit note (resolved by 0.9):** `isValidOrderCreate` still validates **shape only** — it cannot join the catalog. The client-supplied-total vector is now remediated server-side (0.9: catalog-rebuilt preferences + webhook amount assertion), and the rules add per-line shape guards (integer `totalAmount`, `productId`/`quantity`/`price` on the first 10 lines, ≤25 lines).

- [x] **0.7. Remove Public Database Seed Button (`Footer.tsx`)** ✅ _(Resolved: Public seed button completely removed from Footer.tsx; footer restructured to authentic 4-column B2B distributor layout; unit tests verified)_

- [x] **0.8. Purge Mock Data and Ensure Privacy / PCI-DSS Compliance** ✅ _(Resolved: CheckoutModal form state initialized with empty strings and clean placeholders; cardNumber, expDate, and cvc eliminated from CustomerInfo and component state; input whitespace sanitization added; clean Chilean clinical inputs; comprehensive unit tests passing with zero regressions)_

- [x] **0.9. Server-Side Price & Total Verification for Mercado Pago Orders** ✅ _(Resolved: catalog-rebuilt preferences + webhook amount assertion; unit tests passing)_
  - `api/create-preference.ts` builds `unit_price` straight from the client payload, and `api/webhooks/mercadopago.ts` never compares `paymentData.transaction_amount` against `order.totalAmount`. Combined with `firestore.rules` validating order-create **shape only** (status/customer/items presence, not prices — see 0.6 note) and `submitOrder` writing arbitrary `items`/`totalAmount`, an attacker can create a cheap preference that marks an expensive order `PAGADO_MERCADOPAGO` and decrements real stock.
  - Additionally, `create-preference` items lacking `productId`/`id` skip the stock-validation loop entirely — a hole in Task 2.3's server-side guard.
  - **Required Action:**
    - In `create-preference`, rebuild `items`/`unit_price` from the Firestore `products` catalog — never trust client prices; reject unknown product IDs (also closes the stock-check bypass).
    - In the webhook transaction, assert `paymentData.transaction_amount === order.totalAmount` (integer CLP) before marking paid; mismatches go to a review state instead of decrementing stock.
    - Extend `firestore.rules` `isValidOrderCreate` where feasible so client totals can't diverge silently.
  - **Verification:** unit tests for tampered `unit_price`, mismatched `transaction_amount`, unknown `productId`, and the happy path.
  - **Fulfilled & Verified (as built):**
    - **Shared amount authority (`src/utils/orderTotal.ts` + `src/config/promos.ts`):** one pure integer-CLP module defines the payable total (`computeOrderTotal` / `computeCartTotal` / `toOrderLines` / `normalizeQuantity` / `computeDiscountedUnitPrice`) and the promo table (`MOCK_PROMOS` moved from `src/data/products.ts`, which now re-exports it). Cart display, `submitOrder`, the preference builder and the webhook all derive the SAME amount through it. ⚠️ Pricing-semantics alignment (user decision, this task): catalog prices are **IVA-inclusive** (SERNAC) — the old `(subtotal − promo) × 1.19` double-IVA math was removed from `App.tsx`/`Cart.tsx`; the cart now renders the discounted IVA-inclusive total with an `IVA (19%) incluido en los precios` note.
    - `api/create-preference.ts`: rebuilds every preference line from the Firestore `products` catalog — client payload contributes only `productId`s + quantities; unknown products, missing `productId` (closing the Task 2.3 bypass), non-integer/invalid catalog prices and insufficient stock all reject with `400`; promo resolved server-side from `PROMO_CODES` (forged codes ⇒ full price); **fail-closed** `503` when Firestore Admin is unavailable with a real token (token-less simulated fallback preserved for local dev).
    - `api/webhooks/mercadopago.ts`: inside the atomic transaction the webhook recomputes the expected total from the current catalog + the order's stored `promoCode` and requires **both** `transaction_amount` and `order.totalAmount` to equal it (integer CLP) before marking paid. Mismatches (underpayment, tampered total, unresolvable `productId`s) transition to the new `PAGO_EN_REVISION` status with an `order_status_history` record (expected vs received amounts in metadata) and a warehouse alert — **no stock deduction, no customer "paid" email**; the review write stamps `mercadopagoPaymentId` so redeliveries hit the duplicate fast path, and a later correctly-amounted payment approves normally.
    - `firestore.rules`: `isValidOrderCreate` now requires integer `totalAmount`, caps `items` at 25 lines, and shape-checks the first 10 lines (`productId` string, integer `quantity ≥ 1`, numeric `price ≥ 0`) via `isValidOrderItem` — rules still cannot join the catalog (documented in the rules file); the authoritative price check remains server-side.
    - `submitOrder` persists `promoCode`/`discountAmount` and recomputes `totalAmount` from the item lines; `App`/`Cart`/`CheckoutModal` pass `appliedPromo` through so display = Firestore order = MP charge = webhook expectation.
    - Unit tests: new `src/tests/utils/orderTotal.test.ts` (14 tests incl. the raw-CartItem `$0` pitfall regression); `create-preference.test.ts` (21 tests: tampered `unit_price`, forged promo, missing `productId` → 400, Admin-down → 503, stock suite); `mercadopago-webhook.test.ts` (24 tests — underpayment → `PAGO_EN_REVISION` with zero stock deduction, divergent `totalAmount` → review, unresolvable lines → review, promo-approved happy path, review-redelivery idempotency); `api.test.ts` promo persistence; `firestore-rules.test.ts` new assertions.
    - **Adversarial-review remediation (same task, post-review):** the promo percent is now derived from its **code** on every surface (`resolvePromo` in `src/config/promos.ts`; `cartStorage` re-resolves on load, `App`/`Cart` derive at render) so a hand-edited `pronto_cart_v1` can no longer display a discount the server refuses to charge; `create-preference` reads `promoCode` from the **order document** (never the request body, which drops the dead client param) so the charge and the webhook expectation cannot disagree; paused products (`isActive === false`) are rejected; and `PAGO_EN_REVISION` is now actionable — the new admin action `resolve-payment-review` (`approve` ⇒ `PAGADO_MERCADOPAGO` + stock deduction in one transaction / `cancel` ⇒ `CANCELADO` with no stock movement), a `Pago en Revisión` filter chip, an action block in `OrderDetailPanel`, and `PAGO_EN_REVISION` counted as pending in the dashboard stats. Promo-model gaps that remain are tracked as **9.1**.
    - All 534 tests across 65 suites passing with 100% reliability. Production build compiled cleanly.

- [x] **0.10. Fail-Closed Payment Paths in Production** ✅ _(Resolved: simulated checkout + fail-open signature gate are environment-gated; unit tests passing)_
  - Two payment paths degrade silently instead of failing closed:
    1. `api/create-preference.ts` returns a **simulated `initPoint`** (`/?status=approved`) when `MERCADOPAGO_ACCESS_TOKEN` is missing/placeholder — in production this fabricates an approved-payment return with no money collected.
    2. `api/_lib/mercadopagoSignature.ts` returns `valid: true` when `MERCADOPAGO_WEBHOOK_SECRET` is unset — the Task 0.5 signature gate silently opens (mitigated only by the MP API re-check, which itself needs the access token).
  - **Required Action:** gate every simulated path on environment (`VERCEL_ENV !== 'production'` or an explicit `ALLOW_SIMULATED_PAYMENTS` flag) so a production missing-secret state returns 500 + a loud log, never a fabricated success. Keep simulation available for local dev and tests.
  - **Fulfilled & Verified (as built):**
    - **Single policy authority ([`api/_lib/simulationPolicy.ts`](./api/_lib/simulationPolicy.ts)):** `isSimulatedPaymentAllowed(env = process.env)` returns `true` only outside a production runtime (`VERCEL_ENV !== 'production'`) or with the explicit `ALLOW_SIMULATED_PAYMENTS=true` opt-in (strict string compare; the injectable `env` keeps it pure and unit-testable). Deliberately **not** keyed on `getFirestoreEnv()` — a `FIRESTORE_ENV` override must never reopen the simulation door. Lives under `_lib/` → consumes no Vercel Hobby function slot.
    - `api/create-preference.ts`: one early checkpoint after the method guard returns `500` + `console.error` when the token is missing/placeholder in production, making **both** pre-existing simulated branches unreachable in production **by construction** (no Firestore work happens first). The token is now trimmed, so a whitespace-padded placeholder counts as missing.
    - `api/webhooks/mercadopago.ts`: after the 401 branch, a production runtime refuses (a) `secret_not_configured` deliveries (missing/placeholder `MERCADOPAGO_WEBHOOK_SECRET`) and (b) missing/placeholder `MERCADOPAGO_ACCESS_TOKEN` — both `500` + `console.error`, **before** the MP API call. 5xx is deliberate: Mercado Pago retries, so real deliveries are processed once credentials are restored. `verifyMercadoPagoSignature()` stays a pure crypto helper (it reports `reason`; the endpoint owns the trust decision).
    - `.env.example`: `ALLOW_SIMULATED_PAYMENTS=false` with an operator warning — leave unset/`false` in Vercel Production (no sync required).
    - **External-review follow-ups (same task):** (F1) the token-placeholder check is now the shared `hasRealMercadoPagoToken(env)` in `simulationPolicy.ts` — both endpoints import it so the definition cannot drift; (F2) the webhook's `!adminDb` branch now fails closed in production too — a _verified_ approved payment that cannot be reconciled returns `500` + a loud log (Mercado Pago retries) instead of a silent `200` ack. The sibling order-not-found path stays permissive (retries cannot help a document that never existed) and is recorded as known gap #6 → Task **0.11**.
    - **Explicit scope notes:** the browser still masks HTTP failures (`src/services/mercadopago.ts` swallows the new 500 into `success: true`) — that is Task **2.8** by design; and the webhook's `!mpResponse.ok` ack path (real token, transient MP failure) remains unchanged, recorded as known gap #5 in `api/AGENTS.md` §8.5. Detection of a prolonged production misconfiguration still relies on `console.error` visibility until the Task 8.5 monitoring layer lands (external-review observation F3).
    - Unit tests: new `src/tests/api/simulationPolicy.test.ts` (10 — policy gate + shared token definition); `create-preference.test.ts` +4 (prod 500 without/with Admin, escape hatch, non-`"true"` opt-in); `mercadopago-webhook.test.ts` +7 (secret gate, token gate, escape hatch, no over-fire with real credentials, non-production regression guard, verified-payment/Admin-down 500, Admin-down escape hatch). **All 555 tests across 66 suites passing**; `pnpm build`, `pnpm lint`, `pnpm format:check` clean.

- [x] **0.11. `submitOrder` Must Propagate Firestore Write Failure** ✅ _(Resolved: rejected writes return `success: false`; checkout blocks payment/confirmation and surfaces the error; unit tests passing)_
  - `src/services/api.ts` catches `setDoc` failure (rules denial, offline) and still returns `success: true`; `CheckoutModal` then initiates payment for an order that was never persisted — the webhook logs "Order not found", no stock is deducted, and the customer paid for an order that doesn't exist.
  - **Required Action:** let the write failure reach the caller (or return `success: false`) so checkout blocks payment initiation and surfaces an error. Unit test: rules denial → no preference created, error shown to the customer.
  - **Fulfilled & Verified (as built):**
    - `submitOrder` now fails closed: the `setDoc` catch logs a `console.error` and returns `{ success: false, orderId, timestamp, total, itemsCount }` — the computed values are accurate, only persistence failed. Deliberately **no new result fields**: the raw cause stays in the log and the UI owns the customer-facing copy (minimal-contract decision).
    - **Root cause found by the fresh-context review (blocker):** every checkout payload carries `undefined` optional fields (`customer.razonSocial`/`giroComercial`/`sanitaryVerification`, `billing.razonSocial`/`giroComercial`) and the Firestore Web SDK **rejects `undefined` by default** (`Unsupported field value: undefined`) — so the order write had **never** succeeded; the swallow is what hid it. Fixed in `src/services/firebase.ts` with `initializeFirestore(app, { ignoreUndefinedProperties: true })` (SDK-sanctioned, one line, also protects `seedProductsToFirestore`), pinned by the new `src/tests/services/firebase.test.ts`. Verified by direct SDK reproduction before/after the fix (serialization throw → network write attempt).
    - **No UI change was needed:** `CheckoutModal.handleCompleteOrder()`'s `!result.success` guard already existed and was dead code — it now blocks payment initiation, the confirmation email and the confirmation step, shows `No fue posible registrar el pedido en el sistema…`, and leaves the shopper on the Pago step (`setIsSubmitting(false)`) to retry.
    - Small consolidation in the same pass: the duplicate `SubmitOrderResult` declaration in `src/services/api.ts` was removed — the canonical contract is imported from `src/types/index.ts` (per `src/types/AGENTS.md`'s single-location rule), so the two copies cannot diverge.
    - **Documented nuance:** the Firestore Web SDK resolves locally-queued writes while offline (they sync on reconnect); this task covers _rejected_ writes (rules denial, permission errors) — the ghost-order vector.
    - Unit tests: the `api.test.ts` rejection test was rewritten as a rules-denial → `success: false` assertion (write attempted once with the canonical doc id, computed totals preserved, no throw); `CheckoutModal.test.tsx` +1 (`processMercadoPagoPayment` NOT called, error banner rendered, confirmation header absent, submit control re-enabled for retry) and the existing failure test extended with the visible-error assertion; **new `src/tests/services/firebase.test.ts`** pins the `ignoreUndefinedProperties: true` initialization. **All 559 tests across 67 suites passing** (post-rebase: Task 1.4 merged concurrently added 2 tests); `pnpm build`, `pnpm lint`, `pnpm format:check` clean.

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

- [x] **1.4. Hardcoded Distributor RUT Fails Modulo-11** _(Audit finding, 2026-09)_
  - **Context:** `Footer.tsx` (`RUT Empresa:`) and `CheckoutModal.tsx` (pro-forma `RUT Distribuidor:`) hardcoded `77.892.410-K` — an invalid Modulo-11 check digit (correct: `77.892.410-2`, the value centralized in `BANK_DETAILS.rut`), so any legal/bank document carrying it was invalid.
  - **Fulfilled & Verified:**
    - Both surfaces now render `BANK_DETAILS.rut` like the rest of the transfer copy — no fiscal literals remain in components (`Footer.tsx` gained the `bankDetails` import; `CheckoutModal.tsx` already had it).
    - Wrong-literal test assertions updated in the same change: `CheckoutModal.test.tsx` (comprobante letterhead) and `ClinicalStorefront.test.tsx` (footer tax ID) — the latter stored the RUT as an escaped regex (`77\.892\.410-K`), a form plain-text sweeps miss.
    - New source-content guard in `src/tests/config/bankDetails.test.ts` (`Fiscal RUT single-source guard`): either component reintroducing a `77…892…410` literal — plain, escaped-regex, or raw-body form — fails `pnpm test`.
    - All 557 tests across 66 suites passing; production build, ESLint and Prettier clean.

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
    - `api/create-preference.ts`: Integrated Firestore Admin inventory validation loop querying `products` collection before generating Mercado Pago preference payload or sandbox simulation, rejecting with HTTP 400 Bad Request if requested quantities exceed stock. ✅ _The legacy bypass (items lacking `productId`/`id` skipping the check) is closed by **0.9**'s server-side rebuild — such lines now reject with 400._
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
      - Validates payload structure, checks file size limits and MIME types, and compares normalized Chilean Modulo 11 RUTs. ⚠️ _Correction (audit): it does **not** validate size or MIME server-side — those checks live only in `src/services/transferVoucher.ts`. It also stores the raw base64 in the order doc (Firestore ~1 MiB limit) and has no status guard — rework tracked in **2.9**._
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

- [x] **2.6. Checkout Modal UX Overhaul (Modern, Multi-Step Form Redesign)** ✅ _(Resolved: `CheckoutModal.tsx` rebuilt as a 5-step guided flow — Contacto → Despacho → Documento → Pago → Confirmación — with a numbered stepper (`aria-current="step"`, check icons on done steps, hidden on confirmation), per-step `key={step}` panels with fade/slide entrance (`prefers-reduced-motion`-guarded) and scroll-to-top on step change, `Volver` back-navigation on steps 2–4, shorter labels with progressive disclosure (SIS block only on Despacho, RUT on Documento), and a compact Neto/IVA/Total order summary on the Pago step. All validation/compliance behavior preserved: RUT Modulo 11, Boleta-only card (`FACTURA_ENABLED = false` untouched), SIS validation, San Antonio minimum, stock guards (Despacho gate + pre-submit re-check), payment iron rules, and the order payload/API contracts unchanged. Two deliberate deviations recorded: the San Antonio minimum now fires at the Despacho→Documento boundary (the TODO's "Step 1 → Step 2" under the old numbering), and SIS is validated before RUT (both still block). New `.checkout-*` class layer in `src/index.css` (canonical tokens only, zero hex literals, ≤560px single-column fields), replacing inline styles for all new markup; the stale `Despacho & Facturación` label was retired (§2.5 supersession recorded in `src/components/AGENTS.md`). All 26 pre-existing `CheckoutModal.test.tsx` assertions preserved and re-targeted, plus 5 new stepper/panel tests; `pnpm test` (473/473), `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit` all green.)_
  - **Context & Current State:** The checkout modal (`CheckoutModal.tsx`) presents the customer/invoice data capture as one long, text-heavy form. The store owner's assessment: the UI is clumsy and verbose — too much text on screen at once — and does not feel modern. It should be slick, stunning, and better designed UX-wise.
  - **Required Action:**
    - Redesign the checkout flow into a modern, guided experience — e.g., splitting the single huge form into several small, focused steps (the executor decides the exact step breakdown, e.g. contact/delivery → fiscal document data → review & confirm), with a clear progress indicator.
    - Reduce visible text: shorter labels, progressive disclosure (only show optional/conditional fields — Factura fiscal fields, ISP/SIS sanitary validation — when actually relevant), and concise Chilean-Spanish microcopy.
    - Modern visual polish consistent with the existing handcrafted Vanilla CSS design system (`src/index.css`) — no new CSS or component frameworks (Anti-Overshooting Principle §2.3).
  - **Hard Constraints (non-negotiable):**
    - Preserve all existing validation and compliance behavior: RUT Modulo 11, Boleta-only document card (`FACTURA_ENABLED = false` gating stays), SIS registry validation for controlled items, San Antonio minimum-order check at Step 1 → Step 2, stock-availability guards.
    - Preserve the payment iron rules (§4): orders still start `PENDIENTE_*`, no client-side payment approval, no card data handling.
    - Keep the order payload schema and all serverless/API contracts unchanged — this is a presentation-layer refactor only.
    - Existing `CheckoutModal.test.tsx` behavior coverage must keep passing (adapted to the new step structure as needed).

- [x] **2.7. Fix Storefront Search Input (Enter Does Nothing, No Visible Button)** ✅ _(Resolved: both `Navbar.tsx` search bars are now `<form role="search">` elements — Enter or the new visible submit button (`aria-label="Buscar"`) blurs the input, dismisses the mobile keyboard, and calls the new `onSearchSubmit` prop, which `App.tsx` wires to the existing `scrollToCatalog()` helper so submit scrolls to `#catalog-section`; there is no results page — filtering stays live via `search` → `catalogRequestKey` with no double-fetch. A clear ✕ button (`aria-label="Limpiar búsqueda"`, rendered only when the query is non-empty) refocuses the input via per-form refs. Inputs carry `enterKeyHint="search"`. New `.nav-search-actions` / `.nav-search-clear` / `.nav-search-submit` CSS with canonical tokens and `:focus-visible` rings; input `padding-right` widened for the action cluster. 7 new tests in `Navbar.test.tsx`; `pnpm test` (473/473), build, lint, format:check, tsc all green.)_
  - **Context & Current State:** The upper search inputs (`src/components/Navbar.tsx` — desktop `.nav-search` and mobile `.nav-search-mobile`) are bare controlled `<input type="text">` elements: no `<form>` wrapper, no `onKeyDown`/submit handling, and no visible search button. Catalog filtering only happens live while typing, so pressing Enter visibly does nothing and the affordance looks broken to users.
  - **Required Action:**
    - Wrap each search input in a `<form>` (or add explicit submit handling) so pressing Enter performs a well-defined action: commit the search, blur the input, and scroll focus to the catalog results.
    - Add a visible search submit button (icon button is fine) inside the search bar for both desktop and mobile variants, styled per the existing Vanilla CSS design system (`src/index.css`) — no new dependencies.
    - Provide a clear way to clear the search (e.g., an ✕ affordance when the field is non-empty) and ensure the empty-search state restores the full catalog.
    - Keep the existing live-filter behavior working; the submit path must not double-fetch or conflict with the `catalogRequestKey`-derived loading model in `App.tsx`.
  - **Automated Test Coverage:** Extend `src/tests/components/Navbar.test.tsx` (or add a focused suite) covering Enter-to-submit, button click, and clear affordance.

- [ ] **2.8. Simulated-Success Fallbacks Must Not Mask Real HTTP Errors** _(Audit finding — full contract in `src/services/AGENTS.md` §6)_
  - Several adapters return fabricated success on **any** endpoint failure:
    - `createMercadoPagoPreference` / `processMercadoPagoPayment` (`src/services/mercadopago.ts`): HTTP 4xx/5xx (including the 400 stock rejection) → `success: true, initPoint: undefined` → the customer lands on the confirmation step for an unpaid `PENDIENTE_PAGO_MERCADOPAGO` order.
    - `uploadTransferVoucher` (`src/services/transferVoucher.ts`): any failure (401 RUT mismatch, 404, 500) → `success: true` with a `simulated-voucher://` URL — silent voucher loss displayed as "Comprobante recepcionado exitosamente".
    - `fetchOrderTracking` (`src/services/orderTracking.ts`): network failure → fabricated plausible order instead of an error state.
    - `submitOrder`'s swallowed Firestore write is the worst instance — tracked separately as **0.11**.
  - **Required Action:** simulate only when the endpoint is demonstrably absent (dev network error, behind the same env gate as 0.10); real HTTP error responses must surface as errors to the customer.

- [ ] **2.9. Bank-Transfer Voucher Storage & Validation Rework** _(Audit finding — Firestore doc-size limit)_
  - `/api/upload-voucher` writes the entire base64 `dataUrl` into the order document — real vouchers above ~750 KB exceed Firestore's ~1 MiB document limit and `batch.commit()` returns 500 (which the client then reports as success — see 2.8).
  - The endpoint also performs no server-side MIME/size validation (client-only in `transferVoucher.ts`) and has no lifecycle guard: anyone with orderId + RUT can overwrite a voucher and regress `PAGADO_MERCADOPAGO`/`DESPACHADO`/`ENTREGADO` back to `TRANSFERENCIA_COMPROBANTE_SUBIDO`.
  - **Required Action:** move voucher bytes to Firebase Storage (or compress/enforce a server-side byte cap), enforce MIME/size at the endpoint, and allow the transition only from `PENDIENTE_TRANSFERENCIA`.

- [ ] **2.10. Replace the Last Literal `wa.me` URL (`PaymentReturnModal`)**
  - `PaymentReturnModal.tsx` builds its WhatsApp link inline (`import.meta.env.VITE_WHATSAPP_NUMBER || '56912345678'`) — the fallback digits are stale vs the canonical `56929831595` (see `src/components/AGENTS.md` §4.1.2). Route through `whatsappLink()` from `src/config/contact.ts` like every other surface; do not invent a number.

---

## Phase 3: Logistics, Shipping & Delivery Zones (Melipilla / San Antonio)

- [ ] **3.1. Dynamic Shipping Rates by Delivery Zone**
  - **Context & Current State (spec rewritten — original was stale):** The zone-selector half is **already built**: `CheckoutModal` exposes a `Comuna de Despacho` select fed by `DELIVERY_ZONES` in `src/config/delivery.ts` — `Melipilla` (default, same-day for orders confirmed before 16:00) and `San Antonio` (scheduled route, `MIN_ORDER_OUTSIDE_MELIPILLA = 60000` enforced when leaving the Despacho step). `FREE_SHIPPING_THRESHOLD = 150000` applies to both zones. The original spec was deleted: it proposed a **Retiro en Local** pickup option (pickup is not a fulfilment mode — root `AGENTS.md` §3.4), **Región Metropolitana** communes (not served — San Antonio is in the Valparaíso region), and **Envíos a Regiones por pagar** (out of scope).
  - **Required Action:**
    - Define per-zone freight for orders **below** the free-shipping threshold (e.g., Melipilla urban flat rate vs. San Antonio scheduled-route rate) as constants in `src/config/delivery.ts` — never redeclared locally.
    - Add freight to the subtotal and include it in the tax/billing breakdown **server-side** before creating the Mercado Pago preference (coordinates with Task 0.9's server-side pricing rebuild).
    - Surface the freight line in Cart/Checkout UI and in the pro-forma voucher.

- [ ] **3.2. Estimated Delivery Time Windows**
  - Display estimated fulfillment times in the cart and checkout (e.g., _"Despacho mismo día en Melipilla para pedidos confirmados antes de las 16:00"_ and _"Ruta programada a San Antonio"_ — copy must reflect `DELIVERY_ZONES`, never "RM").

- [ ] **3.3. Stale Localization Copy Sweep (API & Services)**
  - **Audit finding (2026-09):** several strings still reference the removed logistics model:
    - `api/_lib/emailTemplates.ts` — "Melipilla & Región Metropolitana" coverage copy.
    - `api/track-order.ts` — "o retirado en Av. Ortúzar 750" (pickup is not offered) and regional-courier fallback copy.
    - `src/services/whatsapp.ts` — "(Melipilla & RM)" comment and hardcoded "despacho para Melipilla" note even for San Antonio buyers.
    - Storefront stale strings (Cart `Transacción Segura · Factura Electrónica B2B` strip; CheckoutModal `…emisión de Factura` transfer-card copy; pro-forma `Melipilla, Región Metropolitana` letterhead) are catalogued in `src/components/AGENTS.md` §2.5 — ⚠️ those require an Appendix C-sanctioned replacement string before editing; the API/service strings can be fixed directly.

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

- [ ] **4.2. Admin Backoffice Readiness Sweep (Post-8.6 Consolidation Gaps)**
  - **Context & Current State:** Full audit of the admin portal after the Task 8.6 `/api` consolidation found the routing layer healthy — all 11 `/api/admin/<action>` client calls in `src/admin/services/adminApi.ts` map 1:1 to the `api/admin/[action].ts` dispatch table, no stale `api/lib` imports remain, `vercel.json` rewrites exclude `api/`, and all 22 admin test files (57 tests) pass. Follow-up gaps remain (items 5–8 added by the 2026-09 audit):
    1. **Handler test-coverage gap:** 4 of the 12 admin handlers — `orders`, `products`, `mark-delivered`, `toggle-visibility` — have **no dedicated integration test suites** under `src/tests/api/admin/` (only the router dispatch is covered by `admin-router.test.ts`, which mocks the handlers). Every other handler has its own suite.
    2. **Cursor pagination advertised but unimplemented:** `fetchAdminOrders({ cursor })` sends a `cursor` query param, but `api/_lib/admin/orders.ts` neither reads it nor applies Firestore `startAfter` — it fetches and slices against a default `limit` of 50. No UI caller passes `cursor` today, so it is harmless now, but as live order volume grows past 50 pending orders, staff would silently stop seeing older ones. Either implement real cursor pagination or remove the dead client param and document the 50-order window.
    3. **Undocumented placeholder cards:** `AdminDashboard.tsx` renders two "Fase 5" analytics placeholder cards (Google Tag Manager / GA4 telemetry) and `AdminSettings.tsx` renders a "Fase 5" dynamic shipping-rates placeholder — none are recorded in `src/admin/AGENTS.md`, and the "Fase 5" labels don't match the roadmap numbering (the underlying work is TODO **3.1** and **8.5**). Document them as deliberate placeholders and align the labels with the actual TODO numbers.
    4. ~~**Doc drift in `src/admin/AGENTS.md`:**~~ ✅ **Resolved by the doc audit** — §1 now says Av. Ortúzar 750, the `#settings` claim was corrected, and the placeholder cards are documented in `src/admin/AGENTS.md` §6.1.
    5. **`StockAdjustModal` conditional-hooks crash (P1):** `if (!product) return null` precedes four `useState` calls, but `AdminInventory.tsx` mounts the modal unconditionally — the first time a product is selected, React throws _"Rendered more hooks than during the previous render"_ and crashes `#inventory`. Mount it conditionally like `ProductEditModal`, or hoist the hooks above the early return.
    6. **`var(--primary)` unresolved:** `OrderDetailPanel.tsx` references it twice but `admin.css` never defines it — the `color`/`borderLeft` declarations silently drop. Use `--teal-600` (admin palette).
    7. **`ProductEditModal` prop→state sync `useEffect`:** form fields are populated from `product` inside an effect — the exact pattern `react-hooks/set-state-in-effect` forbids on the storefront. Works today only via parent remount; refactor to lazy initializers in the same pass as item 5.
    8. **Stale copy:** `AdminOrders.tsx` header reads `…depósitos dentales en Melipilla y RM` — there are no RM delivery zones (root `AGENTS.md` §3.4).
  - **Required Action:**
    - Add dedicated Vitest integration suites for the 4 uncovered handlers (happy path, auth rejection, method gate, `OPTIONS` preflight, malformed payload — mirroring `approve-transfer.test.ts`).
    - Resolve the cursor-pagination mismatch (implement or remove), with a test proving the chosen behavior.
    - Fix items 5–8 (the hooks bug and the undefined token are functional defects, not cosmetics).
  - **Verification:** `pnpm test`, `pnpm build`, `pnpm lint` green; admin suite count updated in `src/tests/AGENTS.md`.

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

- [x] **7.3. Upload Brand Assets, Favicon, and OpenGraph Image** ✅ _(OG share image and favicon delivered — the `vercel --prod` gate is cleared. B.3/B.4 figures remain optional and are tracked below.)_
  - **Resolution:** `public/og-preview.jpg` now exists — **1200×630 JPEG, ~128 KB** — and `index.html`'s three references (`og:image`, `twitter:image`, JSON-LD `image`) point at it. Previously the file had never existed, so every link preview — including PRONTO's own WhatsApp shares — rendered broken.
  - **⚠️ Format deviation from the proposal (as built):** Appendix B.0 specified _PNG ≤300 KB_. PNG is lossless, so a photorealistic 1200×630 banner lands at ~1 MB — measured on the existing hero photo, the same 1200×630 crop is **219 KB as JPEG vs 1.0 MB as PNG**. The delivered asset is therefore **JPEG**, and the `.png` references in root `AGENTS.md` §7, `src/components/AGENTS.md` §2.2 and `index.html` were all updated to `.jpg`.
  - **⚠️ Wording superseded by this entry:** the original text below asked for `favicon.ico`, `apple-touch-icon.png`, and an OG image "featuring company logo and Melipilla delivery badge". All three are stale — the as-built markup wires only `favicon.svg` (no `.ico`, no `apple-touch-icon`), and the approved composition carries a `Depósito dental · Melipilla y San Antonio` text line instead of any badge. [UI_UX_EVALUATION_AND_REDESIGN_PROPOSAL.md](./UI_UX_EVALUATION_AND_REDESIGN_PROPOSAL.md) **Appendix B** is the asset spec of record.
  - **Delivered:**
    - `public/` exists (holds `favicon.svg`, `og-preview.jpg` and `assets/`).
    - `public/favicon.svg` — Appendix B.2's turnkey SVG, committed and wired via `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`.
    - `public/og-preview.jpg` — Appendix B.1's composition, delivered at 1200×630 JPEG.
  - **Still outstanding (optional, human-produced — an agent must never generate a substitute):**
    - `public/assets/delivery-routes.png` — Appendix B.3, 1200×675 PNG ≤250 KB (checkout Step 1 figure). Permitted fallback if absent: omit the `<figure>` entirely.
    - `public/assets/bodega-ortuzar.jpg` — Appendix B.4, 1600×1067 JPG ≤400 KB, **real photo, never generated**. Permitted fallback if absent: omit the `<figure>` entirely.

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
  - Set up Google Analytics 4 (GA4) with e-commerce events (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`) to analyze dental clinic purchasing behavior in Melipilla and San Antonio.

- [x] **8.6. Consolidate `api/` Endpoints Below the Vercel Hobby Function Cap** ✅ _(Resolved: the 11 `api/admin/*` handlers moved to `api/_lib/admin/*` and are now dispatched by the single routed entry point `api/admin/[action].ts`; every shared module moved `api/lib/` → `api/_lib/`. `api/` counts **6** functions against the Hobby cap of 12 — 6 slots of headroom. Public URLs and `src/admin/services/adminApi.ts` are unchanged. The single-purpose-function guardrail exception is recorded in root `AGENTS.md` §2.2 and `api/AGENTS.md` §1.2, and covered by the new `src/tests/api/admin/admin-router.test.ts` suite. **Lifting the cap exposed two further, pre-existing runtime blockers that had never been reachable because no deploy had succeeded since 2026-09-17 — both are fixed and verified live (see the two Runtime Blocker bullets below).**)_
  - **Current Issue:** Every deployment — preview _and_ production — is rejected at the output stage, after the build has already succeeded:

    ```text
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
    - [ ] `pnpm dlx vercel@latest deploy --prod` succeeds once the `og-preview.jpg` gate (§7.3 and root `AGENTS.md` §7) is also satisfied. _(Human step. The asset gate is now **cleared** — `public/og-preview.jpg` is committed — so only the deploy itself remains.)_
    - [x] Every suite under `src/tests/api/**` still passes **unchanged** — the admin client adapter `src/admin/services/adminApi.ts` must keep calling the same public URLs, or be updated in the same change. _(Done: assertions untouched; only handler import paths were rewritten. `adminApi.ts` needed zero changes.)_
    - [x] Security behaviour is unchanged: every admin route still requires `Authorization: Bearer <ID_TOKEN>` plus `decodedToken.admin === true` via `api/_lib/adminAuth.ts`, and `firestore.rules` is untouched. _(Done: handler bodies moved verbatim — verified by diff that only import lines changed.)_
  - **⚠️ Guardrail tension — resolved:** root `AGENTS.md` §2.2 mandates _"single-purpose Vercel Serverless Functions"_ and forbids monolithic backend frameworks. The routed `api/admin/[action].ts` entry point is now a **documented exception** to that rule — the decision is recorded in root `AGENTS.md` §2.2 and `api/AGENTS.md` §1.2. No Express, NestJS, Koa or Fastify was introduced: the dispatcher is a plain `Record<string, handler>` lookup table.
  - **Also stale, now fixed:** `api/AGENTS.md` claimed _"All 11 serverless functions in `api/`"_ — the real count was 22, and it is load-bearing because of the cap. Corrected to 6 in the new §1.2 function-layout table, with the `_lib` exclusion convention documented. Its admin endpoint table already covered `create-product`, `update-product` and `toggle-visibility` (that part of the claim was itself stale) and now links to the modules under `api/_lib/admin/`.
  - **🔴 Runtime Blocker A — extensionless ESM imports (pre-existing, fixed):** Vercel does not bundle `api/`; it transpiles each file in place and ships the tree, so Node's ESM resolver runs at request time. With `"type": "module"` in `package.json`, every extensionless relative import (`'./_lib/firebaseAdmin'`) threw `ERR_MODULE_NOT_FOUND` — **every** `api/` function 500'd with `FUNCTION_INVOCATION_FAILED`, including the untouched public endpoints. Proven pre-existing by building `main` (`e4206bc`) in a throwaway worktree and inspecting its emitted `create-preference.js` (identical extensionless specifiers). Fixed by appending `.js` to relative **value** imports across `api/` plus `src/utils/schemaValidation.ts`'s `./rut.js`. Type-only imports that target a directory (`'../../../src/types'`) stay extensionless — they are erased at transpile time. Convention recorded in `api/AGENTS.md` §1.3.
  - **🔴 Runtime Blocker B — `jwks-rsa` CJS requiring ESM-only `jose` (pre-existing, fixed):** `firebase-admin` → `jwks-rsa@4` is CommonJS and calls `require('jose')` at module load, while `jose@6` is ESM-only — so _merely importing `firebase-admin/auth`_ crashed with `ERR_REQUIRE_ESM`, taking down every admin route (the core of this task). Known upstream: [auth0/node-jwks-rsa#507](https://github.com/auth0/node-jwks-rsa/issues/507) / [firebase/firebase-admin-node#3181](https://github.com/firebase/firebase-admin-node/issues/3181); the fix ([PR #508](https://github.com/auth0/node-jwks-rsa/pull/508)) is merged but **unreleased** (`jwks-rsa` latest is still `4.1.0`). Worked around with `pnpm.overrides` pinning `jose` to `^5.10.0` — the last dual CJS/ESM major, and `jwks-rsa` only uses `jose.importJWK`/`exportSPKI`, which are API-identical across jose 4/5/6. **Trade-off accepted:** jose v5 is EOL per its own `SECURITY.md`; the CVE that motivated the v6 bump (CVE-2025-45767) is _disputed by the maintainer_ and specific to v6.0.10. **Removal condition:** drop the override once `jwks-rsa` > `4.1.0` ships, then re-verify `firebase-admin/auth` on a preview deploy. Documented in `api/AGENTS.md` §1.3 and root `AGENTS.md` §7.
  - **Note for future local deploys:** running `vercel build` creates a gitignored `.vercel/output` tree that `pnpm lint` previously swept up (2800 errors from build artifacts). `.vercel/**` was added to `eslint.config.js` `ignores`, alongside the existing `dist/**` / `coverage/**` / `public/**` entries.

- [x] **8.7. Progressive Catalog Rendering (Lazy Product Cards / "Load More")** ✅ _(Resolved: `src/hooks/useIncrementalReveal.ts` reveals the catalog 16 cards per page via the `Cargar más insumos` button — the sole reveal control. An `IntersectionObserver` auto-reveal sentinel originally shipped with the task and was **deliberately removed at the store owner's request** (2026-09-24, `fix/task-8.7-disable-auto-reveal`): cards only advance on an explicit click. The revealed count is **derived** (`Math.min(visibleCount, max)`), so a shrinking result set clamps without an effect and `react-hooks/set-state-in-effect` stays satisfied; reset-on-filter-change is a **remount** — `App` renders `<ProductList key={catalogRequestKey}>` — matching the codebase's "scoped by remount, not by reset effects" convention. A `role="status" aria-live="polite"` `Mostrando N de M` count announces each reveal; both button and count disappear at the end of the list. Cards stay keyed by `product.id`, so the `product-card-entrance` animation runs once per card across reveals (DOM-identity asserted). `.products-grid` collapses to a single column below **560px** (561–768px keeps 2 columns), guarded by a stylesheet-content suite since jsdom cannot evaluate media queries. No new dependencies, no fetch changes, no virtualization. `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm format:check` all pass.)_
  - **Current Issue:** `ProductList.tsx` renders the entire catalog in a single pass — `products.map(...)` with no windowing or pagination — and `fetchProducts()` in `src/services/api.ts` issues an un-limited `getDocs(collection(db, getCollectionName('products')))`. The production catalog is **75 active `pronto-*` items** (`pronto-001`…`pronto-075`, ingested by `scripts/import-catalog-csv.ts`; the 11 `odon-*` fixtures are `isActive: false` and never render). So the storefront mounts all 75 product cards — each with imagery, badges, price block and a cart stepper — in one very long column. The storefront is browsed between patients on a phone, so the scroll length and first-paint cost are a genuine UX problem, not a cosmetic one.
  - **Required Action:**
    - Add **progressive disclosure on the client** — do not introduce a new data layer or change the fetch. Reveal a first page (12–16 cards), then a single accessible `<button>` at the bottom of the grid to reveal the next page, with a live count (e.g. `Mostrando 16 de 75`).
    - **Reset to page 1 whenever any catalog control changes** — category pill, search term, `inStockOnly` toggle, or sort option. Otherwise the revealed slice silently misrepresents the filtered result set.
    - _(Optional enhancement)_ An `IntersectionObserver` sentinel may auto-reveal on scroll, but the button must remain the primary **keyboard-reachable** control — never replace it with scroll-only loading.
  - **Explicitly NOT required (Anti-Overshooting Principle):** do **not** add a virtualization/windowing library (`react-window`, `@tanstack/react-virtual`) or a query library (TanStack Query, React Query). 75 nodes is comfortably inside what a plain incremental reveal handles; true windowing would fight the CSS grid, the entrance animation and the sticky chrome for no measurable gain at this catalog size. If the catalog ever grows into the thousands, revisit with measurements rather than assumptions.
  - **Constraints & placement:**
    - Any new DOM-side-effect hook belongs in `src/hooks/` (e.g. `useIncrementalReveal`). ❌ Not `src/utils/` — that directory is contractually pure (no hooks, no DOM, no side effects).
    - `ProductList.tsx` currently staggers the `product-card-entrance` animation by `(index % 4) * 60ms`. A growing list must **not** re-trigger that entrance animation on already-revealed cards — the animation should run once per card, keyed by product id.
    - Honour `prefers-reduced-motion`, and announce each reveal through an `aria-live="polite"` region so screen-reader users know more items arrived.
    - Chilean storefront copy only (`Cargar más insumos`, `Mostrando N de M`). No English UI strings.
  - **Acceptance Criteria:**
    - [x] Only the first page of cards is mounted on initial render (assert the rendered card count in `src/tests/components/ProductList.test.tsx`). _(Done: 16 `.product-card-entrance` wrappers asserted for a 40-product input.)_
    - [x] `Cargar más` reveals exactly one additional page, and the button disappears once the end of the list is reached. _(Done: 16 → 32 → 40, then button and count unmount.)_
    - [x] Changing category, search, `inStockOnly`, or sort resets the list to page 1. _(Done via `<ProductList key={catalogRequestKey}>` remount; asserted by key-change rerender test.)_
    - [x] Empty-state copy, `loading` skeletons, and the in-stock-first partition ordering are unchanged. _(Done: pre-existing D.8 assertions untouched; ordering asserted across reveals.)_
    - [x] Single-column catalog on small mobile devices: below **560px** the `.products-grid` collapses to one column (the 2-column phone layout wraps card details excessively and is hard to read); 561–768px keeps 2 columns. _(Done: `@media (max-width: 560px)` in `src/index.css`; guarded by `src/tests/styles/storefrontCss.test.ts`.)_
    - [x] No new runtime dependency is added to `package.json`. _(Done: platform `IntersectionObserver` only.)_
    - [x] `pnpm test`, `pnpm build`, `pnpm lint` and `pnpm format:check` stay green (zero regressions). _(Done: 448/448 tests across 61 suites; build clean — only the pre-existing vendor-firebase chunk-size warning remains.)_

- [ ] **8.8. Rate Limiting on Public Dual-Factor Endpoints** _(Audit finding)_
  - `track-order`, `upload-voucher`, and `order-confirmation` authenticate with orderId + RUT — but `PRONTO-NNNNNN` is a sequential, guessable numeric space with the RUT as the only second factor, and no attempt throttling exists.
  - **Required Action:** add lean attempt throttling (per-IP / per-orderId counters and a lockout window — Firestore or Vercel Edge config, no new infra services).

- [ ] **8.9. `.env.example` Completeness**
  - `api/_lib/emailTemplates.ts` reads `SITE_URL` (voucher-upload links) but it is absent from `.env.example`. Document `VITE_VERCEL_ENV` as a build-time `define` injected by `vite.config.ts` — not a dashboard variable. Verify every var referenced in `api/` and `src/` is represented.

- [ ] **8.10. Widen Lint/Format Scope to `api/` and `src/admin/`**
  - Root `AGENTS.md` §8.3 documents the carve-out: `api/**` and `src/admin/**` sit in the ESLint `ignores` list. The `StockAdjustModal` conditional-hooks bug (Task 4.2 item 5) is exactly the class of defect `react-hooks/rules-of-hooks` would have caught — widen coverage in a dedicated pass.

- [ ] **8.11. Resilient Firebase Init (No Blank Page on Missing Env)**
  - `src/services/firebase.ts` calls `getAuth(app)` unguarded at module scope: a missing/invalid `VITE_FIREBASE_API_KEY` throws `auth/invalid-api-key` at import time and renders a blank page instead of the catalog fallback (root `AGENTS.md` §7 documents the incident this caused). The fix makes `auth` nullable and touches `adminApi.ts`/`AdminApp.tsx`/`AdminLogin.tsx` — deliberately its own task (see `src/services/AGENTS.md` §4.5).

---

## Phase 9: Commercial Promotions & Discount Governance

Task 0.9 turned `src/config/promos.ts` into the **amount authority** of the storefront: `/api/create-preference` charges from that table and the webhook recomputes the expected total from it. The model behind it is still the original three-field display fixture, so no real promotion policy can be expressed — and every gap below is now a payment-path gap rather than a UI nicety.

- [ ] **9.1. Complete the Promo Code Data Model (Expiry, Exhaustion, Redemption Audit & Product Eligibility)** 🔴 _(Audit finding, 2026-09 — promo table promoted to payment authority)_
  - `PromoCode` is `{ code, discountPercent, label }` and `MOCK_PROMOS` carries exactly two entries. `resolvePromoPercent(code)` is the single gate between a client-supplied code and the charged amount, and it can only answer "does this code exist?".
  - **Gaps (as built):**
    - **No validity window:** `isActive` / `startsAt` / `expiresAt` are unmodelled — a code is valid forever. `Cart.tsx` already tells customers `Código de descuento inválido o vencido`, so the UI promises an expiry check that does not exist.
    - **No exhaustion control:** no `usageLimit`, `usageCount` or `perCustomerLimit`. `DENT20` ("Convenio Clínicas Melipilla") can be redeemed unlimited times by anyone, and because the table ships inside the browser bundle every code is publicly enumerable — a secret/clinic-only code cannot be secret today.
    - **No redemption audit:** `Order.promoCode` / `Order.discountAmount` are persisted at order creation (Task 0.9) but **read by nothing** — no admin surface, no report, no reconciliation. "Who used this code and when" is unanswerable, and `firestore.rules` does not constrain either field.
    - **No eligibility rules:** the discount is basket-wide — `computeOrderTotal(lines, discountPercent)` takes **one** percent for every line — so a code cannot include or exclude products by `productId` or REF. Note the order line persists only `{ productId, name, quantity, price }`: a REF-keyed rule must resolve REF (`Product.sku`) from the catalog at verification time, so a later SKU rename silently changes eligibility. Eligibility matters most on the products this repo already treats specially (`prescriptionRequired` / ISP-controlled items) and on high-ticket equipment where a blanket discount is a margin/liability decision.
    - **No commercial floor or shape:** no `minSubtotal`, no `discountType` (`percent` | `fixed` | `free_shipping`), and no restriction of a code to one payment channel (Mercado Pago vs. bank transfer vs. WhatsApp quotation).
  - **Required Action:**
    - Extend `PromoCode` with the policy fields above and keep `src/config/promos.ts` as the pure resolver every surface derives through (cart display, `submitOrder`, `create-preference`, webhook). The policy table itself may stay a static module (lean, matches the anti-overshooting guardrail) — **only if** codes are genuinely public; if clinic/convenio codes must stay private, move the table to a Firestore `promo_codes` collection with admin-only writes and public reads denied.
    - Resolve eligibility **per line**: change `computeOrderTotal` to accept per-line discount resolution and update all four consumers in the same change (they must never drift — that is the invariant Task 0.9 established).
    - Make exhaustion authoritative **inside the webhook transaction**: increment `promo_codes/{CODE}.usageCount` and write a `promo_redemptions` record (`code`, `orderId`, customer RUT/email, `discountAmount`, `paymentId`, `timestamp`, `actorRole: SYSTEM_WEBHOOK`) in the same atomic block that deducts stock — never as a pre-check, or two concurrent approvals will both consume the last use. Exhausted/expired codes must route to `PAGO_EN_REVISION` (with a review reason distinct from "amount mismatch"), and `CANCELADO` must release a reserved use.
    - Add the new collections to `scripts/manage-firestore-schema.ts` (today it only knows `products`, `orders`, `order_status_history`, `inventory_audit_logs`) and to `firestore.rules`.
    - Add an admin read surface for redemptions (who/when/how much) so the audit trail is usable by Melipilla staff.
  - **Verification:** unit tests for expired / inactive / exhausted codes (⇒ full price, never a discount), per-line eligibility (included, excluded, REF-keyed), concurrent redemptions consuming the final use exactly once, redemption-audit writes, and the existing forged-code assertions from Task 0.9 still green.

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
| **0.9. Server-side price & total verification (underpayment exploit)** | **P0** | Critical | 3 - 4 hours | **YES** |
| **0.10. Fail-closed payment paths in production (simulated success)** | **P0** | Critical | 2 hours | **YES** |
| **0.11. `submitOrder` propagates Firestore write failure** | **P0** | High | 1 - 2 hours | **YES** |
| **1.1. Standardize prices and currency to Chilean Pesos (CLP)** | **P0** | Critical | 2 hours | **YES** |
| **2.1. Handle Mercado Pago return state (`status=approved`) in UI** | **P1** | High | 2 hours | **YES** |
| **2.2. Shopping cart persistence via `localStorage`** | **P1** | Medium | 1 hour | No (Recommended) |
| **2.4. Bank transfer voucher upload workflow** | **P1** | High | 3 hours | **YES** |
| **1.4. Hardcoded distributor RUT `77.892.410-K` fails Modulo-11** | **P1** | Legal | 1 hour | **YES** |
| **2.8. Simulated-success fallbacks mask real HTTP errors** | **P1** | High | 2 - 3 hours | **YES** |
| **2.9. Voucher storage & server-side validation rework** | **P1** | High | 2 - 3 hours | **YES** |
| **2.10. Last literal `wa.me` in `PaymentReturnModal`** | **P3** | Low | 30 min | No |
| **3.1. Per-zone freight below free-shipping threshold (Melipilla + San Antonio)** | **P1** | High | 3 hours | **YES** |
| **3.3. Stale localization copy sweep (API & services)** | **P2** | Medium | 1 hour | **YES** |
| **5.1. Transactional emails via Resend or Nodemailer** | **P1** | High | 4 hours | **YES** |
| **7.1. Publish legal pages (Warranty, SERNAC terms, Privacy)** | **P1** | Legal | 3 hours | **YES** |
| **7.2. Configure custom `.cl` domain and SSL on Vercel** | **P1** | Trust | 1 hour | **YES** |
| **4.2. Backoffice readiness sweep (handler tests, pagination, admin UI defects)** | **P2** | Operational | 4 - 6 hours | No |
| **1.2. Automated electronic invoicing with SII (OpenFactura/LibreDTE)** | **P2** | Tax / B2B | 2 - 3 days | No (Can invoice manually at start) |
| **6.1. High-resolution dental product photography & datasheets** | **P2** | Commercial | Variable | No (Initial catalog can launch lean) |
| **8.1 - 8.5. Bundle optimization, Sentry, CI/CD, and GA4 tracking** | **P3** | DevOps | 1 day | No (Immediate post-launch) |
| **8.6. Consolidate `api/` endpoints below the Vercel Hobby function cap** | **P0** | Critical | 3 - 4 hours | **YES** |
| **8.7. Progressive catalog rendering (lazy product cards / "load more")** | **P3** | UX / Performance | 2 - 3 hours | No (Immediate post-launch) |
| **8.8. Rate limiting on public dual-factor endpoints** | **P2** | Security | 2 - 3 hours | Recommended pre-launch |
| **8.9 - 8.11. Env completeness, lint scope widening, resilient Firebase init** | **P3** | DevOps | 1 day | No (Immediate post-launch) |
| **9.1. Complete the promo code data model (expiry, exhaustion, redemption audit, eligibility)** | **P2** | Commercial / Integrity | 1 - 2 days | No (current codes are public and unlimited — becomes a blocker only if a limited or clinic-private campaign is launched) |

---

## 🏁 Go-Live Acceptance Criteria

The store is officially ready to process its first real commercial transaction with a dental clinic when **all** of the following conditions are satisfied:

1. [x] No customer can purchase any dental equipment or supply at incorrect decimal rates (charges are 100% accurate in CLP integers).
2. [x] Approved Mercado Pago transactions update the Firestore order status and deduct physical stock **exclusively** via the verified serverless webhook.
3. [x] If a customer abandons or gets rejected on the payment gateway, inventory remains intact and the order is not marked as paid.
4. [x] Secret server keys for Firebase and Mercado Pago are stored strictly in serverless environment variables.
5. [x] The purchasing clinic receives an immediate formal order confirmation with an order number via email and/or WhatsApp.
6. [x] Customers purchase with Boleta Electrónica + validated RUT (Factura Electrónica is retained in the order schema but gated — `FACTURA_ENABLED = false`; clinics needing Factura are routed to the WhatsApp quotation path).
7. [ ] Prices and payment amounts are verified server-side — a client-supplied total can never mark an order paid or decrement stock (Task 0.9).
8. [ ] The storefront runs on a branded `.cl` domain with active SSL and visible consumer legal terms conforming to Chilean law.
