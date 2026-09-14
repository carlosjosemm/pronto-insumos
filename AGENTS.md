# PRONTO INSUMOS ODONTOLÓGICOS — Master Agent Guide & Repository Guardrails

Welcome to **PRONTO Insumos Odontológicos**, a specialized e-commerce storefront designed for dental clinics, practitioners, and dental technicians in **Melipilla and the Región Metropolitana of Chile**.

This document is the root-level source of truth for any AI agent or engineer working in this repository. It defines the project's vision, core technical stack, strict architectural boundaries, and crucial guardrails to avoid over-engineering.

---

## 🎯 1. Project Mission & Context

* **Business Model:** Small, highly responsive dental supplies distributor (instruments, consumables, restorative materials, equipment).
* **Primary Geography:** Melipilla (warehouse & express local delivery) + Región Metropolitana (courier delivery).
* **Customer Base:** Dental clinics and independent dentists needing fast fulfillment, legal tax invoices (**Factura Electrónica** with 19% IVA), and flexible payment options (Mercado Pago Chile and direct bank transfer).
* **Current Operational State:** Functional prototype with complete Vitest test coverage (84 tests), transitioning into a production-ready system according to [PRODUCTION_READINESS_TODO.md](file:///c:/Users/ecmv2/Documents/PRONTO/PRODUCTION_READINESS_TODO.md).

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
3. **Tax Invoicing Compliance (SII):**
   * Transactions must support both:
     * **Boleta Electrónica:** For individual buyers (RUT + Name).
     * **Factura Electrónica:** For registered dental clinics claiming tax credit (RUT Empresa, Razón Social, Giro Comercial, and registered fiscal address).
4. **Delivery Logistics:**
   * Support: Local Pickup in Melipilla (Av. Ortúzar), Local Urban Delivery, and Regional Shipping (Starken/Chilexpress).

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

---

## 🗺️ 5. Repository Subdirectory Map

Each subfolder contains its own localized `AGENTS.md` specifying its scope, design contracts, and boundaries:

| Directory | Scope & Purpose | Local Guide |
| :--- | :--- | :--- |
| [`api/`](file:///c:/Users/ecmv2/Documents/PRONTO/api) | Vercel Serverless Functions (Node.js runtime, MP preferences, webhooks) | [api/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/api/AGENTS.md) |
| [`src/components/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components) | React 18 UI components (Cart, CheckoutModal, ProductCard, etc.) | [src/components/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/AGENTS.md) |
| [`src/services/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/services) | Client-side adapters (Firebase client, MP gateway client, WhatsApp) | [src/services/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/services/AGENTS.md) |
| [`src/data/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/data) | Static product catalog definitions, categories, and seed fixtures | [src/data/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/data/AGENTS.md) |
| [`src/types/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/types) | Central domain models and TypeScript contracts | [src/types/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/types/AGENTS.md) |
| [`src/utils/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/utils) | Pure helper functions (RUT validation, CLP formatting, tax math) | [src/utils/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/utils/AGENTS.md) |
| [`src/tests/`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests) | Vitest test suites maintaining 100% test reliability | [src/tests/AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/AGENTS.md) |

---

## ⚡ 6. Development & Testing Commands

```bash
# Start local Vite development server
pnpm dev

# Run all automated tests (Vitest)
pnpm test

# Run tests with live file watcher
pnpm test:watch

# Build production bundle for Vercel
pnpm build

# Preview production build locally
pnpm preview
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
pnpm test          # Ensure all 84+ tests pass
pnpm build         # Validate TypeScript compilation and production bundle build

# 2. Deploy a Staging / Preview Release (Generates a unique preview URL)
pnpm dlx vercel

# 3. Deploy directly to Production (Promotes live to production domain)
pnpm dlx vercel --prod
```

### 🛡️ Deployment Guardrails
* **Pre-Flight Testing:** Never execute `vercel --prod` without first confirming that `pnpm test` and `pnpm build` succeed without errors.
* **Environment Variable Sync:** When introducing new environment variables (client or server), add them to `.env.example` and set them in the Vercel Dashboard before running `vercel --prod`.

