# PRONTO INSUMOS ODONTOLÓGICOS — Master Agent Guide & Repository Guardrails

Welcome to **PRONTO Insumos Odontológicos**, a specialized e-commerce storefront designed for dental clinics, practitioners, and dental technicians in **Melipilla and the Región Metropolitana of Chile**.

This document is the root-level source of truth for any AI agent or engineer working in this repository. It defines the project's vision, core technical stack, strict architectural boundaries, and crucial guardrails to avoid over-engineering.

---

## 🎯 1. Project Mission & Context

* **Business Model:** Small, highly responsive dental supplies distributor (instruments, consumables, restorative materials, equipment).
* **Primary Geography:** **Melipilla** (warehouse & same-day local delivery) + **San Antonio** (scheduled route). There are **no** Región Metropolitana routes and **no** customer pickup — see §3.4.
* **Customer Base:** Dental clinics and independent dentists needing fast fulfillment, a legal tax document (**Boleta Electrónica** with 19% IVA; Factura Electrónica on request via WhatsApp), and flexible payment options (Mercado Pago Chile and direct bank transfer).
* **Current Operational State:** Functional prototype with complete Vitest test coverage (429 tests across 59 suites), transitioning into a production-ready system according to [PRODUCTION_READINESS_TODO.md](file:///c:/Users/ecmv2/Documents/PRONTO/PRODUCTION_READINESS_TODO.md).

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
   * **Documented exception — `api/admin/[action].ts`:** the Vercel Hobby plan refuses any deployment adding more than **12** Serverless Functions, so the 11 administrative endpoints are collapsed behind one routed entry point that dispatches on `req.query.action` via a plain lookup table. Public URLs (`/api/admin/orders`, …) are unchanged. This is **not** a framework — no Express/NestJS/Koa/Fastify, no middleware pipeline, just a dispatch table. Shared non-route code lives under `api/_lib/`; paths with a `_`-prefixed segment are excluded from Vercel's function count. Full rationale and layout: [api/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/api/AGENTS.md) §1.2.
3. **NO Additional CSS Frameworks:**
   * Do **NOT** install Tailwind CSS, Bootstrap, Material UI, Chakra, or Shadcn.
   * The project has a complete, handcrafted Vanilla CSS design system with CSS custom properties in [src/index.css](file:///c:/Users/ecmv2/Documents/PRONTO/src/index.css). Keep styles centralized, fast, and dependency-free.
4. **NO Premature Architecture Patterns:**
   * Do **NOT** introduce microservices, message brokers (Kafka/RabbitMQ), GraphQL servers, or heavy ORMs (Prisma/TypeORM).
   * Google Firebase Firestore handles database needs directly through client SDK queries and serverless `firebase-admin` transactions.
5. **NO Over-Engineered CI/CD or Containers:**
   * Do **NOT** introduce Dockerfiles, Kubernetes manifests, complex multi-stage runners, or bloated pipeline scripts.
   * CI/CD for this project is deliberately lean: deployments are executed directly and securely using the **Vercel CLI**.

---

## 🇨🇱 3. Chilean Localization & Domain Mandates

Every feature touching currency, identity, or taxation must strictly conform to Chilean standards:

1. **Currency in CLP (Integers Only):**
   * The currency is **Chilean Peso (CLP)**.
   * **CLP has zero decimal subdivisions.** Never use decimal pricing like `189.99`. Prices must be integer amounts (e.g., `$189.990 CLP` represented as `189990`).
   * Tax calculation (19% IVA) must use `Math.round()`.
   * Formatting must follow Chilean convention: `$189.990` (period as thousands separator, dollar prefix, no cents).
2. **RUT / RUN Validation (Modulo 11):**
   * All customer and clinic tax IDs must be validated using the official Chilean Modulo 11 check digit algorithm provided in [src/utils/rut.ts](file:///c:/Users/ecmv2/Documents/PRONTO/src/utils/rut.ts).
   * Store cleaned RUTs (digits + hyphen + check digit e.g., `12345678-5`) and format for display with thousand separators (`12.345.678-5`).
3. **Tax Invoicing Compliance (SII) — Boleta only, as built:**
   * The storefront issues **Boleta Electrónica only**. `CheckoutModal.tsx` carries a single `📄 Boleta Electrónica` document card; the Factura path is retained in code but gated behind `const FACTURA_ENABLED = false` (the order schema still carries `documentType` plus the optional Factura fields, so re-enabling is a one-line change).
   * **Do not advertise "Factura Electrónica Inmediata (19% IVA)"** anywhere on the storefront — that copy was swept to `Boleta Electrónica · IVA 19%`.
   * Clinics that need a Factura are routed through the WhatsApp quotation path (`¿Necesitas Factura Electrónica para tu clínica? Cotízala por WhatsApp.`), and the Footer carries `Factura para Clínicas — Cotización por WhatsApp`.
   * The order document still models both: **Boleta Electrónica** (RUT + Name) and **Factura Electrónica** (RUT Empresa, Razón Social, Giro Comercial, registered fiscal address) — see [src/types/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/types/AGENTS.md).
4. **Delivery Logistics — Melipilla + San Antonio only, no pickup:**
   * **Zones:** `Melipilla` (urban delivery, same day for orders confirmed before 16:00) and `San Antonio` (scheduled route). Both live in [`src/config/delivery.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/config/delivery.ts) as `DELIVERY_ZONES`; checkout exposes them as a `Comuna de Despacho` **select** (default `Melipilla`) instead of a free-text commune field.
   * **Minimum order:** `MIN_ORDER_OUTSIDE_MELIPILLA = 60000` applies to **San Antonio delivery eligibility only** — `Melipilla` has no minimum. It is the only minimum-sale amount in the system and is enforced at Step 1 → Step 2.
   * **Free shipping:** `FREE_SHIPPING_THRESHOLD = 150000`, applies to **both** zones.
   * ❌ **No pickup / retiro as a fulfilment option.** "Retiro Presencial", "retiro express" and similar wording are removed. `Bodega: Av. Ortúzar 750, Melipilla` remains as *corporate/warehouse* information only — it identifies the physical depot, it is not a collection point customers can select.
   * ❌ **No `RM` delivery copy.** San Antonio is in the Valparaíso region, so coverage copy reads `Melipilla y San Antonio`, never `Melipilla y RM`.
   * `FREE_SHIPPING_THRESHOLD` and the zone list are imported from `src/config/delivery.ts` — never re-declare them locally (the Footer previously advertised `$100.000` while the cart computed `150000`).

---

## 🔒 4. Payment & Security Iron Rules (P0 Priorities)

Agents must strictly respect the payment boundaries defined in [PRODUCTION_READINESS_TODO.md](file:///c:/Users/ecmv2/Documents/PRONTO/PRODUCTION_READINESS_TODO.md):

* ❌ **NEVER decrement inventory stock from the client browser.**
* ❌ **NEVER mark an order as `'PAGADO_MERCADOPAGO'` in client-side components (`CheckoutModal.tsx` or `api.ts`).**
* ✅ **The single authority for payment verification and stock deduction is the serverless webhook at `/api/webhooks/mercadopago`.**
* ✅ Orders created in checkout start in `'PENDIENTE_PAGO_MERCADOPAGO'` or `'PENDIENTE_TRANSFERENCIA'`.
* ✅ Serverless webhooks must verify HMAC-SHA256 signatures (`x-signature`) and enforce idempotency to prevent duplicate inventory decrement upon retries.
* ✅ **Zero Card Data Handling (PCI-DSS):** Raw credit card fields must never be stored in component state or sent to our servers. Checkout Pro redirect/modal must handle payment collection.
* ✅ **Strict Secret Separation:** Browser code uses `VITE_` variables only. Server credentials (`MERCADOPAGO_ACCESS_TOKEN`, `FIREBASE_PRIVATE_KEY`, etc.) belong strictly in `process.env` inside the `api/` directory.
* ✅ **Firestore Security Rules Enforced (`firestore.rules`):** `products` is public read-only and admin-write only (`request.auth.token.admin == true`). `orders` can only be created with pending statuses without pre-injected payment attributes; client-side reads, updates, and deletes on `orders` are strictly denied (`allow read, update, delete: if false;`). Deploy with `pnpm run deploy:rules`.

---

## 🗺️ 5. Repository Subdirectory Map

Each subfolder contains its own localized `AGENTS.md` specifying its scope, design contracts, and boundaries:

| Directory | Scope & Purpose | Local Guide |
| :--- | :--- | :--- |
| [`api/`](file:///c:/Users/ecmv2/Documents/PRONTO/api) | Vercel Serverless Functions (Node.js runtime, MP preferences, webhooks, admin ops, multi-environment resolution) | [api/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/api/AGENTS.md) |
| [`src/admin/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin) | Administrative Backoffice Portal (`admin.html`, RBAC claims, orders inspection, stock adjustments) | [src/admin/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/AGENTS.md) |
| [`src/components/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components) | React 18 UI components (Cart, CheckoutModal, ProductCard, etc.) | [src/components/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/AGENTS.md) |
| [`src/services/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/services) | Client-side adapters (Firebase client, MP gateway client, WhatsApp, dynamic collection environment resolver) | [src/services/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/services/AGENTS.md) |
| [`src/data/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/data) | Static product catalog definitions, categories, and seed fixtures | [src/data/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/data/AGENTS.md) |
| [`src/types/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/types) | Central domain models, relational audit history interfaces, and TypeScript contracts | [src/types/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/types/AGENTS.md) |
| [`src/utils/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/utils) | Pure helper functions (RUT Modulo 11 validation, CLP formatting, tax math, schema validators) | [src/utils/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/utils/AGENTS.md) |
| [`src/config/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/config) | Shared commercial constants: `delivery.ts` (zones, free-shipping and minimum-order thresholds), `contact.ts` (WhatsApp number/display/link), `bankDetails.ts` | — |
| [`src/hooks/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/hooks) | Reusable React hooks with DOM side effects (`useScrollLock`, `useFocusTrap`). **Not** in `src/utils/` — that directory is contractually pure (no hooks, no DOM, no side effects) | — |
| [`src/tests/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests) | Vitest test suites maintaining 100% test reliability | [src/tests/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/AGENTS.md) |

---

## ⚡ 6. Development & Testing Commands

```bash
# Start local Vite development server (automatically connects to dev_* collections)
pnpm dev

# Run all automated tests (Vitest, 59 suites / 429 tests)
pnpm test

# Run tests with live file watcher
pnpm test:watch

# Lint the repo (ESLint flat config, zero errors expected)
pnpm lint
pnpm lint:fix

# Check or apply the declared Prettier formatting
pnpm format:check
pnpm format

# Build production bundle for Vercel (dist/index.html & dist/admin.html)
pnpm build

# Preview production build locally
pnpm preview

# Deploy Firestore Security Rules (protects both canonical and dev_* collections)
pnpm run deploy:rules

# Provision an administrator account for the backoffice portal (/admin)
pnpm run setup:admin tu-email@prontoinsumos.cl TuPasswordSegura123!
# NOTE: this script initializes its Firebase Auth client with getAuth(app). It must be
# created from the app instance returned by initializeApp/cert — the script previously
# referenced a bare `auth` identifier that was never defined and always threw ReferenceError.

# --- Isolated Development / QA Testing Database Operations ---
pnpm run schema:validate:dev     # Validate isolated dev_* collections against frozen schema
pnpm run schema:seed:dev         # Seed catalog and sample order into dev_* collections
pnpm run schema:purge:dev        # Safely wipe dev_* collections without touching production

# --- Live Production Database Operations ---
pnpm run schema:validate         # Validate live production collections (Read-Only)
pnpm run schema:seed             # Seed production catalog
```

Always verify that `pnpm test` passes completely without regressions after making changes.

---

## 🚀 7. Deployment & CI/CD Workflow (Vercel CLI)

The deployment and CI/CD strategy for this project is deliberately simple, lean, and direct. We do not use complex external CI pipelines, Docker containers, or multi-stage cloud runners. All previews and production releases are deployed directly using the **Vercel CLI**.

### 📋 Prerequisites & Linking
* The repository is linked to the Vercel project via the local `.vercel/` configuration.
* Environment variables (`VITE_*` public variables and serverless secrets like `MERCADOPAGO_ACCESS_TOKEN`) are configured in the Vercel Project Settings or managed via `vercel env`.

### 🛠️ Deployment Commands

```bash
# 1. Mandatory Pre-Flight Verification (Run locally before deploying)
pnpm test          # Ensure all 429+ tests pass
pnpm build         # Validate TypeScript compilation and production bundle build

# 2. Deploy a Staging / Preview Release (Generates a unique preview URL)
pnpm dlx vercel

# 3. Deploy directly to Production (Promotes live to production domain)
pnpm dlx vercel --prod
```

### 🛡️ Deployment Guardrails
* **Pre-Flight Testing:** Never execute `vercel --prod` without first confirming that `pnpm test` and `pnpm build` succeed without errors.
* **Environment Variable Sync:** When introducing new environment variables (client or server), add them to `.env.example` and set them in the Vercel Dashboard before running `vercel --prod`.
* **`public/og-preview.jpg` — social-share card (delivered):** `index.html` references `https://pronto-insumos.vercel.app/og-preview.jpg` from `og:image`, `twitter:image` and the JSON-LD `image`. It is a **human-produced asset** (redesign proposal Appendix B.1) shipped at **1200×630 JPEG, ~128 KB**. It was previously absent, which broke every link preview — including the WhatsApp shares that are one of PRONTO's own sales channels. **Format deviation from the proposal (as built):** Appendix B.0 specified *PNG ≤300 KB*, but PNG is lossless and a photorealistic 1200×630 banner lands at ~1 MB; the JPEG carries the identical composition at 128 KB. ❌ **Never generate a substitute image.** If this asset is ever replaced, re-verify it is exactly 1200×630 and that `index.html`'s three references match the filename before promoting. The favicon, by contrast, has a final turnkey SVG already committed at `public/favicon.svg`.
* **A green build does NOT mean the functions run.** Vercel transpiles `api/` in place and lets Node's ESM resolver run at request time, so ESM/CJS resolution faults surface as HTTP 500 `FUNCTION_INVOCATION_FAILED` *after* a successful build. Two load-bearing invariants — explicit `.js` extensions on relative imports, and the `jose` v5 `pnpm.overrides` pin — are documented in [api/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/api/AGENTS.md) §1.3. ❌ **Never remove the `jose` override or drop a `.js` import extension** without re-deploying a preview and hitting the affected endpoints.

---

## 🧹 8. Code Style, Formatting & Linting

The repository previously had no declared style. Editors with format-on-save enabled (the repo owner's IDE does) silently rewrote every touched file to Prettier's *defaults* — double quotes, semicolons, 80 columns — which contradicted the single-quote / no-semicolon style that 100% of `src/` already used. A three-line change could land as a 40-line diff.

That is now fixed by declaring the rules in-repo, so format-on-save is a near no-op.

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

Flat config: `js.configs.recommended` + `typescript-eslint` recommended + `react-hooks` (`recommended-latest`) + `react-refresh`. `pnpm lint` currently reports **zero errors and zero warnings** across 38 files.

* **Scope carve-out:** `src/admin/**` and `api/**` are in the `ignores` list. They carry their own runtime contracts and were outside the scope of the pass that introduced ESLint. Widen `ignores` in a dedicated follow-up.
* **React Compiler-era rules are enabled and respected.** `react-hooks/set-state-in-effect` and `react-hooks/immutability` are **not** downgraded to warnings. The codebase was refactored to satisfy them — see §8.4. Do not re-introduce synchronous `setState` inside an effect body to "simplify" something; `pnpm lint` will fail.
* **`no-explicit-any` is an error, with exactly one documented exception:** `Order.createdAt` in `src/types/index.ts`. See [src/types/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/types/AGENTS.md).

### 8.4 Patterns adopted to satisfy the hooks rules

| Pattern | Where | Contract |
| :--- | :--- | :--- |
| `loading` derived from a request key, not `setState` in an effect | `App.tsx` | `loading === (loadedRequestKey !== catalogRequestKey)`. A filter change flips `loading` during render; the fetch only writes `loadedRequestKey` in its `finally`. |
| URL bootstrap parsed once at module scope, consumed by lazy `useState` initializers | `App.tsx` (`parseUrlBootstrap`) | The mount effect performs **only** external side effects (`clearCartFromStorage`, `history.replaceState`). Never move the payment-return/tracking parsing back into an effect with `setState`. |
| Cart revalidation runs after the awaited fetch, reading a `cartRef` mirror | `App.tsx` | Keeps `cart` out of the effect's dependency array (which would re-fetch on every cart change) while still satisfying `exhaustive-deps`. |
| Overlay state scoped by remount instead of a reset effect | `ProductQuickView` (`key={product.id}`), `OrderTrackingModal` (mounted only while open) | Callers **must** keep the `key` / the conditional render. Removing them silently reintroduces stale gallery/quantity/form state. |
| Every state update in an auto-search effect happens after the `await` | `OrderTrackingModal` | The effect body itself must stay free of synchronous `setState`. |

### 8.5 Working rules for future agents

1. **Never reformat files you did not change.** If a diff shows formatting-only hunks in untouched regions, something is misconfigured — check `.prettierrc` is being picked up.
2. Run `pnpm lint` and `pnpm format:check` alongside `pnpm test` and `pnpm build` before committing.
3. `git blame` on the formatting sweep is noise by design — that was a deliberate one-time normalization (`style: apply the declared formatting rules repo-wide`).
