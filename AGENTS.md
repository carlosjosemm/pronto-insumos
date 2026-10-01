# PRONTO INSUMOS ODONTOLÓGICOS — Master Agent Guide & Repository Guardrails

Welcome to **PRONTO Insumos Odontológicos**, a specialized e-commerce storefront designed for dental clinics, practitioners, and dental technicians in **Melipilla and the Región Metropolitana of Chile**.

This document is the root-level source of truth for any AI agent or engineer working in this repository. It defines the project's vision, core technical stack, strict architectural boundaries, and crucial guardrails to avoid over-engineering.

---

## 🎯 1. Project Mission & Context

* **Business Model:** Small, highly responsive dental supplies distributor (instruments, consumables, restorative materials, equipment).
* **Primary Geography:** **Melipilla** (warehouse & same-day local delivery) + **San Antonio** (scheduled route). There are **no** Región Metropolitana routes and **no** customer pickup — see §3.4.
* **Customer Base:** Dental clinics and independent dentists needing fast fulfillment, a legal tax document (**Boleta Electrónica** with 19% IVA; Factura Electrónica on request via WhatsApp), and flexible payment options (Mercado Pago Chile and direct bank transfer).
* **Current Operational State:** Functional prototype with complete Vitest test coverage (1292 tests across 104 suites), transitioning into a production-ready system according to [PRODUCTION_READINESS_TODO.md](./PRODUCTION_READINESS_TODO.md).

---

## 🚫 2. The Anti-Overshooting Principle (Critical Guardrails)

> [!CAUTION]
> **DO NOT OVER-ENGINEER THIS PROJECT.**  
> This is a lean, agile, and focused small storefront. Over-engineering slows down deployment, inflates maintenance costs, and introduces unnecessary failure points.

Agents modifying this codebase must adhere to these absolute guardrails:

1. **NO Heavy State Management Libraries:**
   * Do **NOT** install Redux, MobX, Zustand, or XState.
   * Standard React 18 component state (`useState`, `useReducer`, `useMemo`), simple context, and lightweight browser persistence (`localStorage`) are entirely sufficient.
2. **NO Monolithic or Heavy Backend Frameworks:**
   * Do **NOT** add Express, NestJS, Koa, or Fastify.
   * All backend logic is handled cleanly by single-purpose **Vercel Serverless Functions** in the `api/` directory.
   * **Documented exception — `api/admin/[action].ts`:** the Vercel Hobby plan refuses any deployment adding more than **12** Serverless Functions, so the 17 administrative endpoints are collapsed behind one routed entry point that dispatches on `req.query.action` via a plain lookup table. Public URLs (`/api/admin/orders`, …) are unchanged. This is **not** a framework — no Express/NestJS/Koa/Fastify, no middleware pipeline, just a dispatch table. Shared non-route code lives under `api/_lib/`; paths with a `_`-prefixed segment are excluded from Vercel's function count. Full rationale and layout: [api/AGENTS.md](./api/AGENTS.md) §1.2.
3. **NO Additional CSS Frameworks:**
   * Do **NOT** install Tailwind CSS, Bootstrap, Material UI, Chakra, or Shadcn.
   * The project has a complete, handcrafted Vanilla CSS design system with CSS custom properties in [src/index.css](./src/index.css). Keep styles centralized, fast, and dependency-free.
4. **NO Premature Architecture Patterns:**
   * Do **NOT** introduce microservices, message brokers (Kafka/RabbitMQ), GraphQL servers, or heavy ORMs (Prisma/TypeORM).
   * Google Firebase Firestore handles database needs directly through client SDK queries and serverless `firebase-admin` transactions.
5. **NO Over-Engineered CI/CD or Containers:**
   * Do **NOT** introduce Dockerfiles, Kubernetes manifests, complex multi-stage runners, or bloated pipeline scripts.
   * CI/CD for this project is deliberately lean: deployments are executed directly and securely using the **Vercel CLI**.
6. **NO Git Worktrees or Sibling Working Copies:**
   * All task work happens in the **primary working tree**, on a dedicated branch (`git checkout -b …`).
   * ❌ Do **NOT** run `git worktree add`, create sibling task directories (`../PRONTO-<task>`), or open a second workspace per task — the worktree-based protocol is retired (owner decision, 2026-09-28; see the `development-workflow` skill).
7. **Self-Contained Comments (owner decision, 2026-09-29):**
   * Every code comment and JSDoc must carry its full explanation inline — a reader with only the source file open must understand the rule without opening any other file.
   * ❌ Do **NOT** reference external documents inside comments: no `.md` file references, no task numbers (`Task 0.14`), no `§` section references, no roadmap-title mentions. Pointers are forbidden outright, not merely discouraged.
   * Enforced mechanically by the `self-contained-comments/no-external-doc-pointers` ESLint rule (inline plugin in `eslint.config.js`, applied to every linted file including `api/**` and `src/admin/**`); `pnpm lint` fails on violations. The agent-facing policy lives in `.devin/rules/self-contained-comments.md`.

---

## 🇨🇱 3. Chilean Localization & Domain Mandates

Every feature touching currency, identity, or taxation must strictly conform to Chilean standards:

1. **Currency in CLP (Integers Only):**
   * The currency is **Chilean Peso (CLP)**.
   * **CLP has zero decimal subdivisions.** Never use decimal pricing like `189.99`. Prices must be integer amounts (e.g., `$189.990 CLP` represented as `189990`).
   * Tax calculation (19% IVA) must use `Math.round()`.
   * Formatting must follow Chilean convention: `$189.990` (period as thousands separator, dollar prefix, no cents).
2. **RUT / RUN Validation (Modulo 11):**
   * All customer and clinic tax IDs must be validated using the official Chilean Modulo 11 check digit algorithm provided in [src/utils/rut.ts](./src/utils/rut.ts).
   * Store cleaned RUTs (digits + hyphen + check digit e.g., `12345678-5`) and format for display with thousand separators (`12.345.678-5`).
3. **Tax Invoicing Compliance (SII) — Boleta only, as built:**
   * The storefront issues **Boleta Electrónica only**. `CheckoutModal.tsx` carries a single `📄 Boleta Electrónica` document card; the Factura path is retained in code but gated behind `const FACTURA_ENABLED = false` (the order schema still carries `documentType` plus the optional Factura fields, so re-enabling is a one-line change).
   * **Do not advertise "Factura Electrónica Inmediata (19% IVA)"** anywhere on the storefront — that copy was swept to `Boleta Electrónica · IVA 19%`.
   * Clinics that need a Factura are routed through the WhatsApp quotation path (`¿Necesitas Factura Electrónica para tu clínica? Cotízala por WhatsApp.`), and the Footer carries `Factura para Clínicas — Cotización por WhatsApp`.
   * The order document still models both: **Boleta Electrónica** (RUT + Name) and **Factura Electrónica** (RUT Empresa, Razón Social, Giro Comercial, registered fiscal address) — see [src/types/AGENTS.md](./src/types/AGENTS.md).
4. **Delivery Logistics — Melipilla + San Antonio only, no pickup:**
   * **Zones:** `Melipilla` (urban delivery, same day for orders confirmed before 16:00) and `San Antonio` (scheduled route). Both live in [`src/config/delivery.ts`](./src/config/delivery.ts) as `DELIVERY_ZONES`; checkout exposes them as a `Comuna de Despacho` **select** (default `Melipilla`) instead of a free-text commune field.
   * **Minimum order:** `MIN_ORDER_OUTSIDE_MELIPILLA = 60000` applies to **San Antonio delivery eligibility only** — `Melipilla` has no minimum. It is the only minimum-sale amount in the system and is enforced when leaving the **Despacho** step of the 5-step checkout.
   * **Free shipping:** `FREE_SHIPPING_THRESHOLD = 150000`, applies to **both** zones.
   * ❌ **No pickup / retiro as a fulfilment option.** "Retiro Presencial", "retiro express" and similar wording are removed. `Bodega: Av. Ortúzar 750, Melipilla` remains as *corporate/warehouse* information only — it identifies the physical depot, it is not a collection point customers can select.
   * ❌ **No `RM` in delivery-coverage copy.** San Antonio is in the Valparaíso region, so any statement of *where PRONTO delivers* reads `Melipilla y San Antonio`, never `Melipilla y RM`.
   * ✅ **Audience and branding copy may name the Región Metropolitana** (owner decision, 2026-09-30): the storefront targets clinics of the Región Metropolitana, and Melipilla belongs to it — for example the transactional e-mail header `Melipilla & Región Metropolitana`. The test is the meaning: *who the store serves* may say RM; *which places receive deliveries* never does.
   * `FREE_SHIPPING_THRESHOLD` and the zone list are imported from `src/config/delivery.ts` — never re-declare them locally (duplicated copies have diverged before and contradicted the cart).

---

## 🔒 4. Payment & Security Iron Rules (P0 Priorities)

Agents must strictly respect the payment boundaries defined in [PRODUCTION_READINESS_TODO.md](./PRODUCTION_READINESS_TODO.md):

* ❌ **NEVER decrement inventory stock from the client browser.**
* ❌ **NEVER mark an order as `'PAGADO_MERCADOPAGO'` in client-side components (`CheckoutModal.tsx` or `api.ts`).**
* ✅ **The single authority for payment verification and stock deduction is the serverless webhook at `/api/webhooks/mercadopago`.**
* ✅ Orders created in checkout start in `'PENDIENTE_PAGO_MERCADOPAGO'` or `'PENDIENTE_TRANSFERENCIA'`.
* ✅ Serverless webhooks must verify HMAC-SHA256 signatures (`x-signature`) and enforce idempotency to prevent duplicate inventory decrement upon retries.
* ✅ **Simulated payment paths are environment-gated (`api/_lib/simulationPolicy.ts`, Task 0.10):** allowed only outside a production runtime (`VERCEL_ENV !== 'production'`) or with the explicit `ALLOW_SIMULATED_PAYMENTS=true` opt-in. In production, a missing/placeholder Mercado Pago token or webhook secret returns `500` + a loud log — never a fabricated approved checkout, never an unverified webhook — and a verified payment that cannot be reconciled (Firestore Admin down) is refused for retry, never silently acknowledged.
* ✅ **Checkout never initiates payment for an unpersisted order:** `submitOrder` propagates Firestore write failures (`success: false` + `console.error`, Task 0.11), so `CheckoutModal` blocks payment/confirmation and surfaces the error instead of creating a "paid ghost order". The client Firestore instance is initialized with `ignoreUndefinedProperties: true` — the Web SDK rejects `undefined` optional fields by default (`razonSocial?`, `giroComercial?`, `sanitaryVerification?`), which is what made every checkout write fail silently before Task 0.11.
* ✅ **Zero Card Data Handling (PCI-DSS):** Raw credit card fields must never be stored in component state or sent to our servers. Checkout Pro redirect/modal must handle payment collection.
* ✅ **Strict Secret Separation:** Browser code uses `VITE_` variables only. Server credentials (`MERCADOPAGO_ACCESS_TOKEN`, `FIREBASE_PRIVATE_KEY`, etc.) belong strictly in `process.env` inside the `api/` directory.
* ✅ **Server-side price & total verification (Task 0.9, extended by 0.14):** `/api/create-preference` builds every preference line from the **order document's** `items` — the request body contributes only the order id (Task 0.14g) — prices them from the current Firestore catalog, and fails closed (`503`) when Firestore Admin is unavailable with a real token. The applied promo is read from the **order document** — never from the request body — and resolved against `src/config/promos.ts`, so the charge and the webhook's expectation can never disagree on which code applied; paused products (`isActive === false`) and unregistered orders are rejected with `400`. The webhook asserts `paymentData.transaction_amount` **and** `order.totalAmount` against the amount frozen onto the order at preference time (`pricedTotal`, Task 0.20), falling back to a catalog-recomputed total (`src/utils/orderTotal.ts`) only for orders without a snapshot, and requires `currency_id === 'CLP'` before marking `PAGADO_MERCADOPAGO`; a catalog that drifted from the frozen amount is a soft alert (the quoted amount settles), while a real mismatch goes to `PAGO_EN_REVISION` with **no** stock deduction and no customer "paid" email. The Mercado Pago link expires with the snapshot (24 h).
* ✅ **Webhook reconciliation guards (Task 0.14):** the Mercado Pago verification itself fails closed — only a `404` is acked (`200`); a revoked token, MP `5xx` or a malformed id returns `502` so MP retries. One normalized signed payment id drives both the HMAC check and the MP fetch. An approved payment may only settle `PENDIENTE_PAGO_MERCADOPAGO`/`PAGO_EN_REVISION`, an order's lines are deducted **at most once** (`paidAt`/`approvedAt` are settlement markers), settled orders get a double-payment incident (history + warehouse alert, never a status flip or a second deduction), other statuses are parked in `PAGO_EN_REVISION`, and `refunded`/`charged_back` payments park the order for manual reconciliation (refunds stay off-platform). Oversell shortfalls are recorded in the history/audit metadata and the warehouse alert instead of being hidden by the `Math.max(0, …)` clamp.
* ✅ **Abandoned online orders are swept with the ledger as the gate (Task 8.13):** every checkout attempt leaves a `PENDIENTE_PAGO_MERCADOPAGO` order behind, and the `close-stale-orders` admin action (on the existing dispatcher — no new function slot) is the backstop for the ones nobody retries. It consults the Mercado Pago ledger by `external_reference` **before** writing: a settled payment is never cancelled (the order is parked in `PAGO_EN_REVISION` with a `PAGO_ACREDITADO_TARDIO` history event for manual review, exactly as the webhook parks an unjoinable payment), an unreadable ledger leaves the order untouched and records a failure, and only a verifiably payment-free candidate is cancelled. Every write re-reads the order inside a transaction and re-asserts the pending status, so a webhook approval landing mid-sweep wins; a payment that settles *after* the sweep is parked by the webhook's own guard and never reopens the order as paid. It moves no stock, implies no refund, defaults to a dry run, and stops on its own wall-clock budget (7 s) so a large backlog returns a complete report instead of being killed mid-run.
* ✅ **Promo discounts are derived from the code, never from stored state:** every surface (cart display, `submitOrder`, preference builder, webhook) resolves the percent through `resolvePromo`/`resolvePromoPercent` in `src/config/promos.ts`. A `PromoCode` object hydrated from `localStorage` is a display artifact — `cartStorage` re-resolves it on load and `App`/`Cart` re-derive at render, so a hand-edited cart can never render a discount the payment layer would refuse to charge. The promo **policy** model (expiry, usage limits, redemption audit, product eligibility) is deliberately thin today and tracked as **Task 9.1** in [PRODUCTION_READINESS_TODO.md](./PRODUCTION_READINESS_TODO.md).
* ✅ **Voucher bytes never live in Firestore (Task 2.9):** bank-transfer vouchers are uploaded **browser → Cloud Storage** over a short-lived V4 signed URL (`x-goog-content-length-range` signed in, so Storage itself rejects anything above 5 MiB), and the order document keeps only `voucherStoragePath` / `voucherUrl` (download-token URL) / `voucherFileName` / `voucherContentType` / `voucherSizeBytes`. `/api/upload-voucher` is the sole authority for the transition, which is allowed **only** from `PENDIENTE_TRANSFERENCIA` / `TRANSFERENCIA_COMPROBANTE_SUBIDO` and is re-asserted inside a transaction. The bucket is deny-all (`storage.rules`; deploy with `pnpm run deploy:storage-rules`) and reached exclusively through signed URLs and download tokens. Never reintroduce a Base64 `data:` voucher transport. **Task 2.15 bounds the leftovers:** every `sign` reserves a lifetime slot in `voucherSignCount` (transactional, cap 10, `429` + WhatsApp fallback at the cap, `500` fail-closed if the reservation cannot be written), and the `voucher-housekeeping` admin action deletes only the objects an order does not reference and that are older than a 60-minute grace window. The admin order **list** omits `voucherUrl` (a legacy Base64 voucher would exceed Vercel's 4.5 MB response cap) and reports `hasVoucher`; the `?orderId=` detail request still returns the URL.
* ✅ **Public dual-factor endpoints are throttled and no longer enumerate (Task 8.8):** `/api/track-order`, `/api/upload-voucher` and `/api/order-confirmation` return **one identical `404`** for "order not found" *and* "RUT mismatch" (`respondOrderLookupFailed` in `api/_lib/orderLookup.ts`) — the old `404`/`401` split told an attacker which order ids exist, and a company RUT is public. Attempts and failed lookups are budgeted per IP and per order id (`api/_lib/abuseThrottle.ts`: 15-minute window, 15-minute lock, `429` + `Retry-After`, Firestore counters under `abuse_counters`, raw IPs stored only as SHA-256 pseudonyms, **fail-open with a loud log** so a counter outage never takes tracking down). The canonical order id is now **`PRONTO-` + 8 Crockford base32 chars** from `crypto.getRandomValues` (40 bits; legacy `PRONTO-NNNNNN` ids still resolve), which makes the residual distributed probe infeasible. Warehouse "voucher received" alerts are budgeted per order (5-minute cooldown, 5 max, reserved inside the confirm transaction) so a re-upload loop cannot exhaust the Resend quota. The public `orders` create write path carries Firebase App Check abuse friction — see the App Check bullet below.
* ✅ **Firebase App Check guards the public `orders` create path (Task 8.16):** `src/services/firebase.ts` initializes App Check (`ReCaptchaV3Provider` from `VITE_FIREBASE_RECAPTCHA_SITE_KEY`) **after `initializeApp` and before the Firestore/Auth instances**, so every SDK request carries attestation. App Check is abuse friction only — never authentication, never price validation (the catalog recomputation in `create-preference` and the webhook amount assertion remain the authorities). Enforcement is a Firebase Console decision per environment; the debug-token flag (`self.FIREBASE_APPCHECK_DEBUG_TOKEN`) is set only outside a production runtime, a missing site key fails visibly (loud `console.error` in production) without blanking the storefront, and an `initializeAppCheck` throw (Vite HMR double registration) is caught. Console registration/enforcement steps and the debug-token flow are documented in `.env.example`; verification with enforcement enabled is an owner preview gate.
* ✅ **Firestore Security Rules Enforced (`firestore.rules`):** `products` is public read-only and admin-write only (`request.auth.token.admin == true`). `orders` can only be created with pending statuses without pre-injected payment attributes; client-side reads, updates, and deletes on `orders` are strictly denied (`allow read, update, delete: if false;`). **Task 0.12** additionally binds the document to its own identity and pins the create shape: `data.orderId == orderId` (a decoy document can no longer shadow a real order), a top-level `keys().hasOnly([...])` allowlist of exactly the keys `submitOrder()` writes — so admin-only fields (`voucherUrl`, `approvedAt`, `dispatch`, `trackingNumber`, `confirmationEmailSentAt`, …) cannot be pre-injected — nested allowlists for `customer` / `billing` / `taxBreakdown` / `sanitaryVerification` / item lines, `paymentMethod` ↔ `status` consistency, `billing.status == 'PENDIENTE_EMISION_SII'`, and per-field length caps mirrored by the checkout inputs. **Task 1.7** additionally binds the persisted fiscal breakdown to the order's own figures — `taxBreakdown.neto == math.round(total / 1.19)`, `neto + iva == total`, `taxBreakdown.total == totalAmount`, and `billing.rut == customer.rut` — so no client can store a tax decomposition or identity that contradicts what was charged. **Task 8.16** additionally closes the enumerated shape gaps: the delivery zone is pinned to `['Melipilla', 'San Antonio']` (mirroring `DELIVERY_ZONES`), the document type is **Boleta-only** in both `customer` and `billing` (the Factura path is disabled by `FACTURA_ENABLED = false` — re-enabling means flipping that flag *and* the rules pin together), `customer.rut` must match `^[0-9]{7,8}-[0-9K]$` (canonical cleaned storage, written by `submitOrder`'s normalization; Modulo 11 itself is not expressible in rules), `createdAt` must be a timestamp within `request.time ± 15m` (only `serverTimestamp()` can satisfy it — a caller-chosen literal date cannot), and **all 25 item lines** are shape-checked (index-guarded; the rules evaluation budget of 1,000 expressions per request is not approached — function calls are limited by depth, not count). Every server endpoint resolves orders through `api/_lib/orderLookup.ts` (document key first, legacy field query as the fallback). Deploy with `pnpm run deploy:rules`.

```bash
# Deploy the deny-all Cloud Storage rules for the voucher bucket (requires the Blaze plan)
pnpm run deploy:storage-rules

# Apply the bucket CORS config the browser-direct voucher upload needs (dry run by default;
# --apply writes it). Uses the Admin SDK credentials from .env.local — no Cloud SDK required.
pnpm run storage:cors -- --apply
```

---

## 🗺️ 5. Repository Subdirectory Map

Each subfolder contains its own localized `AGENTS.md` specifying its scope, design contracts, and boundaries:

| Directory | Scope & Purpose | Local Guide |
| :--- | :--- | :--- |
| [`api/`](./api) | Vercel Serverless Functions (Node.js runtime, MP preferences, webhooks, admin ops, multi-environment resolution) | [api/AGENTS.md](./api/AGENTS.md) |
| [`src/admin/`](./src/admin) | Administrative Backoffice Portal (`admin.html`, RBAC claims, orders inspection, stock adjustments) | [src/admin/AGENTS.md](./src/admin/AGENTS.md) |
| [`src/components/`](./src/components) | React 18 UI components (Cart, CheckoutModal, ProductCard, etc.) | [src/components/AGENTS.md](./src/components/AGENTS.md) |
| [`src/services/`](./src/services) | Client-side adapters (Firebase client, MP gateway client, WhatsApp, dynamic collection environment resolver) | [src/services/AGENTS.md](./src/services/AGENTS.md) |
| [`src/data/`](./src/data) | Static product catalog definitions, categories, and seed fixtures | [src/data/AGENTS.md](./src/data/AGENTS.md) |
| [`src/types/`](./src/types) | Central domain models, relational audit history interfaces, and TypeScript contracts | [src/types/AGENTS.md](./src/types/AGENTS.md) |
| [`src/utils/`](./src/utils) | Pure helper functions (RUT Modulo 11 validation, CLP formatting, tax math, schema validators) | [src/utils/AGENTS.md](./src/utils/AGENTS.md) |
| [`src/config/`](./src/config) | Shared commercial constants: `delivery.ts` (zones, free-shipping and minimum-order thresholds), `contact.ts` (WhatsApp number/display/link), `bankDetails.ts` | [src/config/AGENTS.md](./src/config/AGENTS.md) |
| [`src/hooks/`](./src/hooks) | Reusable React hooks with DOM side effects (`useScrollLock`, `useFocusTrap`, `useIncrementalReveal`). **Not** in `src/utils/` — that directory is contractually pure (no hooks, no DOM, no side effects) | [src/hooks/AGENTS.md](./src/hooks/AGENTS.md) |
| [`src/tests/`](./src/tests) | Vitest test suites maintaining 100% test reliability | [src/tests/AGENTS.md](./src/tests/AGENTS.md) |
| [`scripts/`](./scripts) | Operator CLI tooling (Firestore schema manager, CSV catalog importer, admin provisioning, env sync, test comms) — see §6 and §7.1 | — |

---

## ⚡ 6. Development & Testing Commands

> [!NOTE]
> **Node ≥ 22.12 is required for `pnpm test`.** The jsdom chain (`html-encoding-sniffer` →
> `@exodus/bytes`) `require()`s an ESM-only package, which only works on Node versions with
> `require(esm)` support. On Node 20 every suite fails to collect with `ERR_REQUIRE_ESM`
> before a single test runs. Production/serverless code is unaffected.

```bash
# Start local Vite development server (automatically connects to dev_* collections)
pnpm dev

# Run all automated tests (Vitest, 104 suites / 1292 tests)
pnpm test

# Run tests with live file watcher (or a V8 coverage report)
pnpm test:watch
pnpm test:coverage

# --- The pre-release gate: run this before ANY deploy or pull request ---
pnpm run verify        # pnpm test && pnpm exec tsc --noEmit && pnpm run typecheck:server && pnpm build
pnpm run verify:full   # the above + pnpm lint + pnpm format:check (the PR gate)

# Type-check the serverless api/ tree (Node context, tsconfig.server.json)
pnpm run typecheck:server

# Lint the repo (ESLint flat config, zero errors expected)
pnpm lint
pnpm lint:fix

# Check or apply the declared Prettier formatting
pnpm format:check
pnpm format

# Lint the markdown docs (no dependency installed — the repo-root .markdownlint.json
# is read by editors' markdownlint; this ad-hoc run keeps it honest in CI-less checkouts)
pnpm dlx markdownlint-cli@0.43.0 "**/*.md" --ignore node_modules --ignore dist

# Build production bundle for Vercel (dist/index.html & dist/admin.html)
pnpm build

# Preview production build locally
pnpm preview

# Deploy Firestore Security Rules (protects both canonical and dev_* collections)
# One-time per machine: `pnpm dlx firebase-tools login` — the script invokes the CLI via pnpm dlx
pnpm run deploy:rules

# Deploy Firestore composite indexes (firestore.indexes.json). Required by the admin
# order list's status-filtered query: `orders(status ASC, createdAt DESC)`. Firestore
# builds a new index asynchronously, so the first filtered request may wait for `Ready`.
pnpm run deploy:indexes

# Provision an administrator account for the backoffice portal (/admin)
# (the Auth client must come from getAuth(app) — never a bare `auth` identifier)
pnpm run setup:admin tu-email@prontoinsumos.cl TuPasswordSegura123!

# --- Isolated Development / QA Testing Database Operations ---
pnpm run schema:validate:dev     # Validate isolated dev_* collections against frozen schema
pnpm run schema:seed:dev         # Seed catalog and sample order into dev_* collections
pnpm run schema:purge:dev        # Wipe + reseed dev_* collections (--force is baked in; safe — dev only)
pnpm run catalog:import:dev      # Import the price-list CSV into dev_products (script defaults to dev)

# --- Live Production Database Operations ---
pnpm run schema:validate         # Validate live production collections (Read-Only)
pnpm run schema:seed             # Seed production catalog — requires -- --confirm-production-seed
pnpm run schema:purge-and-seed   # Requires --force AND --confirm-production-wipe appended to run
pnpm run catalog:import          # Import CSV into production products — requires -- --confirm-production-import
# Both write scripts are non-destructive (metadata-only updates, stable name-bound
# ids, no sample order in prod) and support --dry-run for a read-only plan preview:
#   pnpm run schema:seed -- --dry-run     pnpm run catalog:import -- --dry-run

# --- Operator scripts without pnpm aliases (run via tsx) ---
pnpm dlx tsx scripts/fix-catalog-data-quality.ts                    # dev by default; prod needs --env=prod --confirm-production-fix
pnpm dlx tsx scripts/send-test-comms.ts [--only=email|whatsapp]     # Resend/WhatsApp smoke test against TEST_EMAIL

# Read-only smoke test of a deployed preview — the request-time half of the
# release gate (API ESM, admin auth, public-endpoint validation, both shells).
# It refuses the production host, needs no credential and mutates nothing.
pnpm run smoke:preview -- --base=https://pronto-insumos-<hash>.vercel.app
```

Always verify that `pnpm test` passes completely without regressions after making changes.

**Markdown conventions (`.markdownlint.json`).** Every other markdownlint rule stays at its default and the whole doc set passes clean — including `MD009` trailing spaces, `MD040` fenced-code languages, `MD025` single-H1 and `MD026` heading punctuation. Five rules are relaxed because they encode a style this repo deliberately does not follow: `MD013` (no 80-column wrapping in long-form technical docs), `MD022`/`MD031`/`MD032` (tight blocks — a heading, paragraph or fence is followed immediately by its content, ~100 occurrences repo-wide) and `MD004` (bullet markers legitimately mix `*`, `-` and `+` across lists). Do not "fix" those patterns; do keep the rest of the set clean.

---

## 🚀 7. Deployment & CI/CD Workflow (Vercel CLI)

The deployment and CI/CD strategy for this project is deliberately simple, lean, and direct. We do not use complex external CI pipelines, Docker containers, or multi-stage cloud runners. All previews and production releases are deployed directly using the **Vercel CLI** — the one GitHub Actions workflow is a pull-request *verification* gate that never deploys (see below).

### 📋 Prerequisites & Linking

* The repository is linked to the Vercel project via the local `.vercel/` configuration.
* Environment variables (`VITE_*` public variables and serverless secrets like `MERCADOPAGO_ACCESS_TOKEN`) live in the Vercel Project Settings. Push them up from a local env file with [`scripts/sync-env-to-vercel.ts`](./scripts/sync-env-to-vercel.ts) — see §7.1.

### 🛠️ Deployment Commands

```bash
# 1. Mandatory Pre-Flight Verification — ONE command, run locally before deploying
pnpm run verify    # pnpm test && pnpm exec tsc --noEmit && pnpm run typecheck:server && pnpm build

# 2. Sync environment variables to Vercel (DRY RUN by default — see §7.1)
pnpm run env:sync -- --target preview            # prints the plan, writes nothing
pnpm run env:sync -- --target preview --apply    # writes only NEW vars

# 3. Deploy a Staging / Preview Release (Generates a unique preview URL)
pnpm dlx vercel

# 4. Smoke the preview at request time (read-only; refuses the production host)
pnpm run smoke:preview -- --base=https://pronto-insumos-<hash>.vercel.app

# 5. Deploy directly to Production (Promotes live to production domain)
pnpm dlx vercel --prod
```

### ✅ Pull Request Verification (`.github/workflows/ci.yml`)

One job, no matrix, no cache warmers, and **no deployment**: on every pull request (and on a push to `main`) GitHub Actions runs `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm run typecheck:server` (the Node-context check of the `api/` tree via `tsconfig.server.json`) and `pnpm build` on Node 22 with pnpm read from `package.json`'s `packageManager`. That is `pnpm run verify` plus lint — the CI job exists so a pull request carries automated evidence, not so the pipeline can deploy. **Lint belongs in CI because it enforces the self-contained-comment policy** (guardrail 7), not merely style; `format:check` stays local (`pnpm run verify:full`) because a PR should not fail on whitespace, and guardrail 5 rules out a heavier pipeline. ❌ **Do not add deploy steps, matrices, containers or staging runners here** — Vercel CLI remains the only release path.

### 🧪 Runtime / Operator Acceptance Gate (preview, before promoting)

A green Vite build proves nothing about the deployed app: the build succeeds with *zero* environment variables set (the storefront then renders its unavailable-catalog error card — a broken Firebase config degrades per-request since the resilient-init change; only the admin console surfaces the auth configuration error), and `api/` is transpiled in place so an ESM resolution fault surfaces as HTTP 500 `FUNCTION_INVOCATION_FAILED` only at request time. Promote to production only after **both** halves below pass on the preview deployment.

1. **Automated, credential-free half** — `pnpm run smoke:preview -- --base=https://<preview-host>`. Nine read-only probes: both HTML shells are served, the Mercado Pago webhook module loads under the deployed runtime, the routed admin endpoint answers its preflight and refuses an unauthenticated read with `403`, and the four public endpoints reject a malformed body before touching Firestore or Storage. Any `500` is reported as a runtime/ESM or provider-configuration failure. The tool refuses the production host (and its subdomains) outright and never sends an `Authorization` header.
   * **What it cannot prove — do not read a green run as more than it is:** the shell probes are HTTP `200` checks, so they cannot execute the client bundle and see client-side runtime failures (a degraded catalog render, a broken admin login); the `403` on the admin read is answered identically by a healthy deployment and by one with no Admin SDK credentials; and the `OPTIONS` answer is produced before any CORS header is set. The rendered storefront and the real admin read are covered only by step 2.
   * **Deployment Protection:** a preview behind Vercel's Deployment Protection answers every probe with a login redirect or a `401`, so all nine fail. Disable protection for the deployment under test (or probe through its sharing link).
2. **Manual, credential-bearing half** — with **Mercado Pago TEST credentials and non-customer test data only**, and **never against production**: load the storefront in a browser and confirm it renders (the only step that executes the client bundle — a bad `VITE_FIREBASE_API_KEY` no longer blanks the page, but this walk is what catches any client-side runtime failure the HTTP probes cannot), complete a test checkout and a test payment end to end, upload a bank-transfer voucher for a test order, log into `/admin` and read the order, then approve the test transfer (or adjust stock) and confirm the inventory audit entry. Use the owner's own test account and a synthetic customer (never a real clinic's data), and delete or cancel the test order afterwards.

### 🧱 Edge Security Headers (`vercel.json`)

`vercel.json` carries a `headers` block next to its `rewrites` — no serverless function is involved, so the Vercel Hobby function count is untouched. Two rules:

- **Every non-`api/` path** (`"/((?!api/).*)"`, the same shape the storefront rewrite uses, so API JSON responses stay header-free): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` that denies every feature the app never uses (`camera`, `microphone`, `geolocation`, `payment`, `usb`, `serial`, `bluetooth`, `magnetometer`, `gyroscope`, `accelerometer`, `midi`, `display-capture`, `idle-detection` — verified against the source: no geolocation or media API is called anywhere), and the full `Content-Security-Policy-Report-Only`.
- **Three admin URLs** — `/admin`, `/admin.html` and `/admin/:path*` — each get `X-Frame-Options: DENY` plus an **enforced** `Content-Security-Policy: frame-ancestors 'none'`. ⚠️ **All three are required, and `/admin.html` is the one that is easy to miss:** the two rewrite sources cover the friendly URLs, but `dist/admin.html` is also a real static file that Vercel serves *ahead* of the catch-all rewrite, so `/admin.html` reaches the same logged-in backoffice without ever matching a rewrite source. Leave it out and the anti-framing headers are bypassable by one URL. That is the clickjacking fix — the backoffice renders *Aprobar Transferencia*, *Marcar Despachado* and the destructive inventory controls, so it must never be framed. The enforced policy deliberately contains **only** `frame-ancestors`: a report-only policy is not enforced, and enforcing an unverified `default-src` on the live backoffice would break it.

**The report-only policy, origin by origin** (each entry is a real consumer, not a guess):

| Directive | Sources | Consumer |
| :--- | :--- | :--- |
| `default-src` | `'self'` | the baseline for everything not listed below |
| `script-src` | `'self'` | the bundled entry chunks. **No `'unsafe-inline'`, no `'unsafe-eval'`** — the only inline `<script>` in either HTML entry is the `application/ld+json` data block, which is never executed as script and so is not subject to `script-src`. |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | the Google Fonts stylesheet **and** the ~575 React inline `style={{ … }}` attributes. A bare `'self'` would drop every one of them, which is why `'unsafe-inline'` is here for styles only. |
| `font-src` | `'self' https://fonts.gstatic.com` | the font binaries that stylesheet loads |
| `img-src` | `'self' data: blob: https://firebasestorage.googleapis.com` | product images, inline data URLs, and the Blob URL the backoffice opens for a legacy Base64 voucher |
| `connect-src` | `'self' data: https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://storage.googleapis.com https://firebaselogging-pa.googleapis.com` | `/api/*`; the Firestore Web SDK channel; Firebase Auth (admin login + `getIdToken`); the **signed V4 PUT** that uploads a transfer voucher browser → Storage; the SDK's own telemetry transport; and `data:`, because the backoffice `fetch`es a legacy Base64 voucher URL before re-wrapping it as a Blob — without `data:` here, *Ver comprobante* breaks on pre-2.9 orders the moment the policy is enforced |
| `base-uri` / `object-src` | `'self'` / `'none'` | injection hardening |
| `form-action` | `'self' https://www.mercadopago.cl` | Checkout Pro (see the caveat below) |

**Two handoffs CSP cannot govern — stated rather than faked.** The Checkout Pro handoff is a top-level `window.location` redirect to the preference's `init_point`, and every `wa.me` link is an `<a href>`. Both are *navigations*; the only directive that could constrain those (`navigate-to`) is unimplemented in every browser, so `wa.me` appears in no directive and Mercado Pago is listed under `form-action` only to pre-authorize a future form-based handoff. Do not "fix" this by adding them to `connect-src`/`img-src` — that would be noise, not protection.

**Staged rollout — the policy is NOT enforced yet.** The task sequence is report-only → verify on a preview → enforce, and the agent must not deploy. To promote: on a preview, open the storefront and `/admin` with the console visible and confirm **zero** violations while walking the catalog load, font render, admin login, a voucher upload, a product image and the Checkout Pro redirect; then rename the global rule's header key from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. Re-verify on a preview first — a violation that only appears after enforcement is a broken page for real customers. ⚠️ Before enforcing, add any new origin the catalog or checkout starts using (a product-image CDN, a new provider) to the matching directive; a missing origin is a silently broken feature, not a security win. `src/tests/security/vercelHeaders.test.ts` fails if the full policy is ever moved to an enforcing header while the report-only one disappears — the rollout is a deliberate, reviewed change.

### 🛡️ Deployment Guardrails

* **Pre-Flight Testing:** Never execute `vercel --prod` without first confirming that `pnpm run verify` succeeds (and, before a pull request, `pnpm run verify:full`). A green `vercel --prod` on its own proves nothing — see the runtime/operator gate above.
* **Environment Variable Sync:** when introducing new variables, add them to `.env.example` and push them up with `pnpm run env:sync` (§7.1) before deploying. ❌ **Never paste `.env.local` wholesale** — it carries `FIRESTORE_ENV=development`, and copying that into Production would silently point the live storefront at the `dev_*` collections.
* **A green `vercel --prod` proves nothing about the app.** The build succeeds with *zero* environment variables set; the storefront then renders its unavailable-catalog error card instead of the live catalog (a broken Firebase config degrades per-request — the module-scope `getAuth()` that used to throw `auth/invalid-api-key` and blank the whole import graph was moved behind the admin-only accessor in `src/admin/services/adminFirebase.ts`), while the build log stays clean. Verify with `pnpm dlx vercel@latest env ls` **and** by loading the deployed URL — never by the build log alone.
* **`public/og-preview.jpg` — social-share card (delivered):** `index.html` references `https://pronto-insumos.vercel.app/og-preview.jpg` from `og:image`, `twitter:image` and the JSON-LD `image`. It is a **human-produced asset** (redesign proposal Appendix B.1) shipped at **1200×630 JPEG, ~128 KB**. **Format deviation from the proposal (as built):** Appendix B.0 specified *PNG ≤300 KB*, but PNG is lossless and a photorealistic 1200×630 banner lands at ~1 MB; the JPEG carries the identical composition at 128 KB. ❌ **Never generate a substitute image.** If this asset is ever replaced, re-verify it is exactly 1200×630 and that `index.html`'s three references match the filename before promoting — a missing file silently breaks every link preview, including the WhatsApp shares that are one of PRONTO's own sales channels. The favicon, by contrast, has a final turnkey SVG already committed at `public/favicon.svg`.
* **A green build does NOT mean the functions run.** Vercel transpiles `api/` in place and lets Node's ESM resolver run at request time, so ESM/CJS resolution faults surface as HTTP 500 `FUNCTION_INVOCATION_FAILED` *after* a successful build. Two load-bearing invariants — explicit `.js` extensions on relative imports, and the `jose` v5 `pnpm.overrides` pin — are documented in [api/AGENTS.md](./api/AGENTS.md) §1.3. ❌ **Never remove the `jose` override or drop a `.js` import extension** without re-deploying a preview and hitting the affected endpoints.

### 🔐 7.1 Environment Variable Sync (`pnpm run env:sync`)

[`scripts/sync-env-to-vercel.ts`](./scripts/sync-env-to-vercel.ts) is the single supported way to push local variables to Vercel. It exists because the project once silently lost **all** of its environment variables: every production build shipped an empty Firebase config, the storefront rendered blank, and nothing in the build output indicated a problem.

```bash
pnpm run env:sync -- --target preview                            # dry run: prints the plan, writes nothing
pnpm run env:sync -- --target preview --apply                    # writes only variables that don't exist yet
pnpm run env:sync -- --target production --apply --overwrite     # replace existing values
```

**Safety model — four deliberate properties. Do not "simplify" them away:**

1. **Dry run by default.** Nothing is written without `--apply`.
2. **`--target` is required** (`production` | `preview` | `development`). There is no default, so production can never be hit by forgetting a flag.
3. **Existing remote variables are skipped** unless `--overwrite` is passed — a routine sync cannot clobber a value that is already live.
4. **The local env file is backed up** to `<file>.backup.<timestamp>` before the first write, and the script **aborts** if that path is not gitignored, so it can never leave an un-ignored file full of secrets behind.

Additional guarantees:

* **Values travel over stdin** — never printed, logged, or placed on a command line.
* `VERCEL_*` / `TURBO_*` / `NX_*` system variables are filtered out and never synced.
* `FIRESTORE_ENV` and `VITE_FIRESTORE_ENV` are set **per target** (`production` → `production`, otherwise `development`), so collection isolation cannot be broken by copying the local value up.
* `FIREBASE_PRIVATE_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` and `RESEND_API_KEY` are stored as Vercel **Secrets**; everything else as Config.
* After writing, the script **re-reads remote state and verifies every key landed**. That check exists because `vercel env add … preview` prompts for a Git branch on the TTY and exits `0` having written *nothing* when stdin is piped — a silent no-op indistinguishable from success. (The script passes `--git-branch ''` to mean "all Preview branches".)

> [!CAUTION]
> **`vercel env pull` overwrites `.env.local` in place — it does not merge.** Running it replaces your local development values with the pulled environment's (flipping `FIRESTORE_ENV` to `production` points local development at live collections) and injects ~20 `VERCEL_*` / `TURBO_*` system variables. **Always pass an explicit output path** (`vercel env pull /tmp/env-check.txt`), or don't run it at all — `env:sync` covers the push direction and the dashboard covers inspection.

---

## 🧹 8. Code Style, Formatting & Linting

The style rules are declared **in-repo** so format-on-save is a near no-op. Without `.prettierrc`, editors fall back to Prettier *defaults* (double quotes, semicolons, 80 columns) and silently rewrite every touched file against the single-quote / no-semicolon style `src/` uses — a three-line change lands as a 40-line diff.

### 8.1 The declared style (`.prettierrc`)

```json
{ "printWidth": 120, "tabWidth": 2, "semi": false, "singleQuote": true,
  "jsxSingleQuote": false, "trailingComma": "none", "arrowParens": "always",
  "bracketSpacing": true, "endOfLine": "lf" }
```

These values were chosen to **match the style the codebase already used**, not to impose a new one. `.editorconfig` gives non-Prettier editors the same baseline. `pnpm format:check` is the source of truth; it must pass.

### 8.2 Deliberate exclusions (`.prettierignore`)

| Excluded | Why |
| :--- | :--- |
| `*.md` | The AGENTS.md policy files, `PRODUCTION_READINESS_TODO.md` and the redesign proposal of record are read **verbatim** by agents. Prettier's Markdown printer reflows tables, rewrites `*` bullets to `-` and `*emphasis*` to `_emphasis_` — a content-level rewrite of documents whose formatting is intentional. |
| `src/admin/**`, `api/**`, `admin.html` | **Temporary carve-out.** Excluded so the storefront UI overhaul did not touch trees outside its scope. Remove these lines and run `pnpm format` once that work has landed. |
| `pnpm-lock.yaml`, `dist`, `coverage`, `public` | Generated / vendored. |

### 8.3 ESLint (`eslint.config.js`)

Flat config: `js.configs.recommended` + `typescript-eslint` recommended + `react-hooks` (`recommended-latest`) + `react-refresh`. `pnpm lint` must report **zero errors and zero warnings**.

* **Scope carve-out:** `src/admin/**` and `api/**` are in the `ignores` list (along with `dist/`, `coverage/`, `public/`, `node_modules/`, `.vercel/`). They carry their own runtime contracts and were outside the scope of the pass that introduced ESLint. Widen `ignores` in a dedicated follow-up. Everything else — **including `src/tests/**` and `scripts/`** — is linted.
* **React Compiler-era rules are enabled and respected.** `react-hooks/set-state-in-effect` and `react-hooks/immutability` are **not** downgraded to warnings. The codebase was refactored to satisfy them — see §8.4. Do not re-introduce synchronous `setState` inside an effect body to "simplify" something; `pnpm lint` will fail.
* **`no-explicit-any` is an error, with exactly one documented exception:** `Order.createdAt` in `src/types/index.ts`. See [src/types/AGENTS.md](./src/types/AGENTS.md) §2.7.

### 8.4 Patterns adopted to satisfy the hooks rules

| Pattern | Where | Contract |
| :--- | :--- | :--- |
| `loading` derived from a request key, not `setState` in an effect | `App.tsx` | `loading === (loadedRequestKey !== catalogRequestKey)`. A filter change flips `loading` during render; the fetch only writes `loadedRequestKey` in its `finally`. |
| URL bootstrap parsed once per mount (`useMemo`), consumed by lazy `useState` initializers | `App.tsx` (`parseUrlBootstrap`) | The mount effect performs **only** external side effects (`clearCartFromStorage` + `forgetSessionOrderId` for a session-matched approved return, `history.replaceState`). Never move the payment-return/tracking parsing back into an effect with `setState`. |
| Cart revalidation runs after the awaited fetch, reading a `cartRef` mirror | `App.tsx` | Keeps `cart` out of the effect's dependency array (which would re-fetch on every cart change) while still satisfying `exhaustive-deps`. |
| Overlay state scoped by remount instead of a reset effect | `ProductQuickView` (`key={product.id}`), `OrderTrackingModal` (mounted only while open) | Callers **must** keep the `key` / the conditional render. Removing them silently reintroduces stale gallery/quantity/form state. |
| Every state update in an auto-search effect happens after the `await` | `OrderTrackingModal` | The effect body itself must stay free of synchronous `setState`. |

### 8.5 Working rules for future agents

1. **Never reformat files you did not change.** If a diff shows formatting-only hunks in untouched regions, something is misconfigured — check `.prettierrc` is being picked up.
2. Run `pnpm lint` and `pnpm format:check` alongside `pnpm test` and `pnpm build` before committing.
3. `git blame` on the formatting sweep is noise by design — that was a deliberate one-time normalization (`style: apply the declared formatting rules repo-wide`).
