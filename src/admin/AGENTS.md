# PRONTO Admin Backoffice Architecture & Operational Guide (`src/admin/`)

This document is the **authoritative architectural, design, and operational specification** for the internal administrative backoffice of **PRONTO Insumos Odontológicos** (`/admin`).

---

## 🎯 1. Mission & Operational Scope

The PRONTO Admin Portal is an internal, lightweight management console designed exclusively for the store owner, clinical inventory managers, and warehouse staff in **Melipilla, Chile**.

### Core Responsibilities

1. **Executive Overview (`#dashboard`):** Real-time monitoring of daily revenue (CLP), pending bank transfers awaiting clearance, low-stock supply alerts (<5 units), and monthly order volume.
2. **Order Management & Fulfillment (`#orders`):**
   - Search orders by canonical ID (`PRONTO-XXXXXXXX` since Task 8.8; legacy `PRONTO-NNNNNN` ids still resolve), customer/company name, or Chilean RUT.
   - Filter by status chips (`PENDIENTE_TRANSFERENCIA`, `PAGADO_MERCADOPAGO`, `DESPACHADO`, `ENTREGADO`, etc.).
   - Inspect clinical orders in a **440px** slide-over panel (`.admin-slide-panel`) displaying Chilean legal invoicing attributes (Factura Electrónica: RUT, Razón Social, Giro Comercial, Dirección Fiscal).
   - Display sanitary verification credentials (SIS / ISP health registry numbers).
   - View bank transfer payment vouchers uploaded by clinics (Task 2.9): `voucherUrl` is a Firebase Storage download-token URL opened in a new tab. Legacy pre-2.9 documents hold a Base64 `data:` URL instead — Chrome blocks top-frame navigation to those, so `OrderDetailPanel` converts them to a Blob object URL on click.
   - **Voucher-URL allowlist (Task 0.13):** the panel never links a stored string blindly — `order.voucherUrl` was client-writable before 0.12, so this is the render-side half of that fix. [`src/utils/voucherUrl.ts`](../utils/voucherUrl.ts) classifies the value: `storage` (https on the `firebasestorage.googleapis.com` host) renders a real `<a>`; `legacy-data` (declared MIME allowlisted: PDF/PNG/JPEG) renders a `<button>` that opens a Blob re-wrapped with the forced MIME type; **anything else renders plain text with no anchor and no click handler** (`javascript:`, `data:text/html`, foreign hosts, non-strings). The re-wrap is load-bearing: a `blob:` URL inherits the admin origin, so an un-typed Blob would execute HTML there.
   - Execute operational fulfillment transitions:
     - **Aprobar Transferencia:** Clears bank transfer payment and triggers atomic inventory decrement in the Melipilla warehouse.
     - **Marcar Despachado:** Records the carrier (`starken`, `chilexpress`, `blue_express`, `despacho_local_melipilla` — rendered *Despacho Local Melipilla (Flota Directa)*; see `CarrierType` in `src/admin/types.ts`) and an **optional** tracking number. Leaving the field empty is a valid, supported case (Task 0.15): the UI sends `undefined` and the handler omits the key from the Admin SDK write — the code-less dispatch used to `500`, and the local Melipilla fleet is the default carrier. **Since Task 2.13 the server mints an internal dispatch reference (`MEL-260929-07`) for that code-less case**, so the parcel always carries a quotable code; a typed Starken/Chilexpress code overrides it (`referenceSource: 'manual'`), the success banner reports whichever was recorded, and the panel's *Despacho Registrado* block renders the carrier + reference (`Ref. Despacho` labeled *código interno* when generated, `N° Guía` when typed). Full contract: [api/AGENTS.md](../../api/AGENTS.md) §8.6.
     - **Marcar Entregado:** Confirms receipt and closes the fulfillment cycle.
3. **Inventory & Warehouse Management (`#inventory`):**
   - Live view of product stock levels, categories, and Chilean Peso pricing (Neto and Total con 19% IVA).
   - **Audit-Logged Stock Adjustments:** Modal supporting reason codes (`reposicion`, `merma`, `correccion`, `venta_manual`) and operator notes.
   - **Product Metadata Editor:** Modify integer CLP pricing, descriptions, specifications, package contents, and clinical manufacturer tags.
   - **Instant Catalog Visibility Switch:** Pause sales for backordered items (`inStock: false`).
4. **Settings & Operational Config (`#settings`):** A branch/legal-identity card sourced from `BANK_DETAILS` in `src/config/bankDetails.ts` (Razón Social, RUT Empresa, `Av. Ortúzar 750, Melipilla` warehouse address, transfer account) plus a deliberately deferred **"Fase 5"** shipping-rates placeholder card — see §6.1.

---

## 🏗️ 2. Architectural Boundaries & Isolation

### 2.1 Multi-Page Entry Point (`admin.html`)
To strictly follow the **Anti-Overshooting Principle** in [AGENTS.md](../../AGENTS.md):
* The admin portal is **NOT** a bloated router bundle injected into the customer storefront.
* It is configured as a secondary Vite multi-page entry point:
  - `dist/index.html`: Public customer storefront bundle.
  - `dist/admin.html`: Internal admin console bundle.
* Customers visiting `prontoinsumos.cl` never download admin logic, forms, or admin API adapters.
* Vercel rewrites in `vercel.json` route `/admin` and `/admin/*` directly to `admin.html`.
* `admin.html` includes `<meta name="robots" content="noindex, nofollow">` to prevent indexing by search engine crawlers.

### 2.2 Hash-Based Internal Routing
* Internal navigation uses lightweight browser hash changes; the canonical written form has **no** leading slash:
  - `#dashboard` (default view)
  - `#orders`
  - `#orders/<orderId>` — deep link that opens `AdminOrders` with `initialOrderId` preselected
  - `#inventory`
  - `#settings`
* `AdminApp.tsx` parses `window.location.hash` with `replace(/^#\/?/, '')`, so `#/orders` is tolerated but not canonical, and writes `#${view}` / `#${view}/${orderId}` on navigation.
* No heavyweight routing libraries (React Router, TanStack Router) are used. The route is managed via standard React `useState` synchronized with a `hashchange` listener.

### 2.3 Styling & Design Tokens (`src/admin/admin.css`)
* Uses handcrafted Vanilla CSS prefixed with `.admin-*` to prevent global style leakage. `admin.css` carries its **own independent `:root`** — it does not share the storefront tokens from `src/index.css` (that is why deleting the storefront alias block never affected the admin portal).
* Typography: `DM Sans` (`--font-sans`) for the console, `JetBrains Mono` (`--font-mono`) for REF codes/IDs/amounts. It is **not** the storefront's Fraunces/Inter pairing — do not "align" them.
* Clinical palette (as defined in `admin.css :root`):
  - Primary Navy: `var(--navy-900)` (`#0b192c`), `var(--navy-800)` (`#142844`), `var(--navy-950)` (`#07101d`)
  - Teal Accent: `var(--teal-600)` (`#088395`), `var(--teal-700)` (`#0a6371`), `var(--teal-800)` (`#0e4c56`)
  - Alert Red: `var(--danger)` (`#dc2626`, `--danger-bg #fef2f2`) — critical stock, rejected status
  - Amber Warning: `var(--warning)` (`#d97706`, `--warning-bg #fffbeb`) — pending transfer clearance
  - Emerald Green: `var(--success)` (`#059669`, `--success-bg #ecfdf5`) — paid, delivered, approved
  - Info Blue: `var(--accent-info)` (`#2563eb`, `--accent-info-bg #eff6ff`)
* ⚠️ **Known broken token:** `OrderDetailPanel.tsx` references `var(--primary)` twice (the `History` icon colour and the audit-timeline `borderLeft`), but `--primary` is **never defined** in `admin.css` — both declarations silently drop (the icon inherits, the timeline loses its accent border). Use `var(--teal-600)` instead when touching that file.

---

## 🔒 3. Authentication & Security Engine

### 3.1 Role-Based Access Control (RBAC) via Firebase Custom Claims
Staff authentication is powered by Firebase Authentication with administrative custom claims:
```json
{
  "admin": true
}
```

1. **Staff Login (`AdminLogin.tsx`):**
   - Authenticates using staff credentials via `signInWithEmailAndPassword()`.
   - Obtains the Firebase ID token result with `getIdTokenResult(true)`.
   - Verifies `idTokenResult.claims.admin === true`. If false, the session is immediately terminated with `signOut()` and access is denied.
2. **Admin Provisioning Script (`scripts/setup-admin.ts`):**
   - Node.js CLI script using Firebase Admin SDK to create staff accounts and set `{ admin: true }` claims.
   - Automatically loads `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` from your local `.env.local` or `.env` file in the repository root.
   - Run directly from your local terminal:
     ```powershell
     # Opción 1: Con el comando directo de pnpm
     pnpm run setup:admin tu-email@prontoinsumos.cl TuPasswordSegura123!

     # Opción 2: Invocación directa vía npx/tsx
     npx tsx scripts/setup-admin.ts tu-email@prontoinsumos.cl TuPasswordSegura123!
     ```
   - Connects to Firebase Authentication via Google Cloud, creates the user (or retrieves existing UID), and persists the custom claim. Once completed, the user can immediately log in at `/admin`.
3. **Serverless Token Verification Middleware (`api/_lib/adminAuth.ts`):**
   - Validates `Authorization: Bearer <ID_TOKEN>`.
   - Verifies signature, expiry, and `decodedToken.admin === true`.
   - Never trusts client-provided identity without cryptographic signature verification.

---

## 💼 4. Business Domain Logic & Chilean Localization

### 4.1 Chilean Invoicing Inspection (SII Factura Electrónica)
When clinics purchase with invoice (`documentType: 'factura'`), `OrderDetailPanel.tsx` presents the exact fields required for Chilean tax issuance:
- **RUT Empresa:** Validated and formatted with Modulo 11 thousand separators (`XX.XXX.XXX-X`).
- **Razón Social:** Legal entity name registered with the SII (e.g., *Clínica Odontológica Los Andes SpA*).
- **Giro Comercial:** Authorized economic activity (e.g., *Prestación de Servicios Odontológicos*).
- **Dirección & Comuna Fiscal:** Domicilio tributario for accounting records.
- **Tax Breakdown:** Integer CLP Neto (81%), IVA (19%), and Total amounts calculated using `Math.round()`.

### 4.2 Sanitary Verification (ISP / SIS Registry)
Chilean health regulations require verification of registered dental practitioners before dispensing certain professional equipment and prescription-controlled materials:
- Displays practitioner's **SIS Registration Number** (Superintendencia de Salud).
- Direct link to inspect attached professional credential files when provided.

### 4.3 Atomic Stock Decrement on Transfer Approval
When staff click **"Aprobar Transferencia y Rebajar Stock"**:
1. The panel requires a **Referencia de conciliación bancaria** (the Banco de Chile cartola line) before the button enables; the operator must verify the deposit settled first. Never enter bank credentials — the field is a free-text reference capped at 120 chars.
2. Invokes `/api/admin/approve-transfer` with `{ orderId, reconciliationReference }`; a missing/empty reference is rejected with `400`.
3. Verifies staff admin claims.
4. Reads the order inside a Firestore transaction and enforces **source states**: only `PENDIENTE_TRANSFERENCIA` / `TRANSFERENCIA_COMPROBANTE_SUBIDO` may approve; `TRANSFERENCIA_APROBADA` is an idempotent `duplicate` (no second deduction); any other status — quote, dispatched, delivered, cancelled, MP-paid, review — or an order already carrying `approvedAt`/`paidAt` is refused with `409` and **no** stock movement.
5. Rebuilds the payable total from the **current catalog** (promo-aware, via `resolvePromoPercent(order.promoCode)` + `computeDiscountedUnitPrice`) and requires it to equal `order.totalAmount`; a mismatch, an invalid catalog price, a **missing product** or an unidentifiable line fails closed (`409`) before any write — never a partial deduction.
6. Decrements `stockCount` for each ordered item in `products`.
7. Updates order status to `'TRANSFERENCIA_APROBADA'`, recording `approvedBy` (admin email) and `approvedAt` (ISO timestamp), and writes `reconciliationReference` + `reconciledAt` into the `order_status_history` metadata.
8. Ensures Melipilla warehouse physical inventory matches database counts in real-time.

**Stock shortfall (Task 0.14e):** when the catalog cannot cover a line, the clamp (`Math.max(0, …)`) still approves the payment — the money is in — but the shortfall is recorded in the `inventory_audit_logs` metadata (`stockShortfall`), the order-history metadata (`stockShortfalls`) and the warehouse alert (`Stock insuficiente: faltan N× …`). The same recording exists in the webhook approval path and in `resolve-payment-review`'s approve.

### 4.3b Payment Review Reconciliation (`PAGO_EN_REVISION`)

The Mercado Pago webhook never marks an order paid when the paid amount disagrees with the catalog-recomputed total — it parks the order in `PAGO_EN_REVISION` (no stock deducted, no customer "paid" email, warehouse alerted) and a human must reconcile it. The backoffice closes that loop:

- **Filter chip:** `OrderTable.tsx` surfaces a `Pago en Revisión` chip second in `STATUS_FILTER_CHIPS` — the flagged queue is the one that blocks fulfillment, so it must not be buried in "Todos".
- **Incident-specific reason:** the panel derives the actual reason from the latest `PAGO_EN_REVISION` entry in `order_status_history` (`metadata.event` → `PAGO_DUPLICADO` / `PAGO_ESTADO_INVALIDO` / `PAGO_REEMBOLSADO` / amount mismatch) and renders it with the stored `reason`, instead of a fixed "amount mismatch" message — a duplicate payment, an invalid source state and a refund/chargeback all land in `PAGO_EN_REVISION`.
- **Action block:** `OrderDetailPanel.tsx` renders a `--danger-bg` panel (only for `PAGO_EN_REVISION`) with a **Nota de conciliación** plus two resolutions calling `/api/admin/resolve-payment-review`:
  - **Confirmar Pago y Rebajar Stock** (`resolution: 'approve'`) — **requires a non-empty note** (the button stays disabled until one is entered; the server returns `400` otherwise), verifies the money in the Mercado Pago/bank ledger, then sets `PAGADO_MERCADOPAGO` and decrements stock in one transaction (same trust level as transfer approval; recorded as `actorRole: 'ADMIN'` in `order_status_history` and `reasonCode: 'conciliacion_pago'` in `inventory_audit_logs`). Sends the customer "pago verificado" email + warehouse alert.
  - **Cancelar Pedido** (`resolution: 'cancel'`) — sets `CANCELADO` with **no** stock movement. Refunds are not modelled (`src/types/AGENTS.md` §2.1), so the refund and customer contact stay manual; the warehouse gets the alert only.
- **Guardrails:** only an order currently in `PAGO_EN_REVISION` can be resolved (`409` otherwise, so the action cannot race the webhook or a second administrator), re-resolving the target status returns `duplicate: true` without a second stock deduction, and a paid order can never be cancelled through this action. **At-most-once deduction (Task 0.14 R1):** approving an order that already carries a settlement marker (`paidAt`/`approvedAt` — e.g. the refunded payment the webhook parked in review) is refused with `409` and a specific message; cancelling stays available, which is the correct resolution for a refund.
- `dashboard-stats` counts `PAGO_EN_REVISION` inside **pending** work, so unresolved money never disappears from the KPIs.

### 4.3c WhatsApp Quote Resolution (`COTIZACION_SOLICITADA_WHATSAPP`)

Checkout's WhatsApp method creates a **lead, not a paid sale** — the order stays in `COTIZACION_SOLICITADA_WHATSAPP` while the negotiation happens on WhatsApp, and no other handler can move it (`approve-transfer`, `dispatch-order` and `create-preference` all refuse quote statuses; the webhook parks any payment arriving for one in review). `OrderDetailPanel.tsx` closes that loop with an info-blue action block (only for the quote status) calling `/api/admin/resolve-quote`:

- **Confirmar Venta y Rebajar Stock** (`resolution: 'convert'`) — for the sale that settled off-platform **exactly as quoted** (the customer accepted the itemized quote and paid, e.g. by Banco de Chile transfer). **Requires a non-empty Referencia de conciliación** (the button stays disabled until one is entered; the server returns `400` otherwise) — the cartola line or payment receipt, never bank credentials. The server then re-derives the payable total from the **current catalog** (promo-aware) and requires it to equal `order.totalAmount` (`409` on divergence: the catalog moved after the quote, so the operator declines and registers the negotiated sale as a new order instead), fails closed on a missing product / invalid price, deducts stock **at most once**, and stamps the order `PAGADO_TRANSFERENCIA` + `approvedAt`/`approvedBy` + `quoteResolvedAt`/`quoteResolution: 'CONVERTIDA'`. The quote document itself becomes the sale record, so the original quote id is preserved and the customer keeps tracking under it ("Pago Acreditado" → dispatch as normal).
- **Declinar Cotización (sin rebajar stock)** (`resolution: 'decline'`) — for a refused quote, a customer who never replied (timeout) or a sale closed on other terms (the optional **Nota de cierre** records why, and can name a replacement order id). Sets `CANCELADO` with **no** stock movement and no customer email (the conversation already happened on WhatsApp); the warehouse gets the alert only.
- **Guardrails:** only a pending quote can be resolved (`409` otherwise), re-resolving the target status returns `duplicate: true` with no second deduction (the success banner says so instead of claiming stock moved again), and cross-resolution is refused (`409` — a converted sale cannot be declined, a declined quote cannot be converted). The action never fabricates a Mercado Pago payment id.

**Partial refunds (raised by the Mercado Pago webhook):** when part of a collected charge is returned, the webhook stamps the `partialRefundPaymentId`/`partialRefundAmount`/`partialRefundAt` marker fields on the order document and writes one `PAGO_REEMBOLSO_PARCIAL` event into the audit timeline (the stored Spanish `reason` renders beneath it) — the panel needs no new block because the order status never flips; the warehouse alert drives the manual reconciliation (ledger check, restock/contact decision per the manual SOP).

### 4.4 Decoupled Catalog Visibility (`isActive`) vs Physical Stock (`stockCount`)
In `InventoryTable.tsx` and `AdminInventory.tsx`, warehouse stock and catalog visibility are clearly decoupled:
- **`stockCount` (Physical Warehouse Count):** The real unit count in the Melipilla storage facility. If `stockCount === 0`, the product is flagged as **Agotado**.
- **`isActive` (Storefront Visibility):** Allows staff to temporarily hide or pause a product from the public customer storefront without erasing or zeroing the inventory count. When paused, the product displays a **Pausado** badge and its public `inStock` flag is set to `false`.
- **Toggle Visibility Action:** Staff can click "Pausar" / "Activar" in `InventoryTable.tsx` to call `/api/admin/toggle-visibility`, immediately updating the storefront catalog while preserving the warehouse inventory record.

### 4.5 Executive Metrics & Chilean Timezone Localization
In `AdminDashboard.tsx` and `/api/admin/dashboard-stats`, sales figures and order counts are localized strictly to the Chilean time zone (`America/Santiago`).
- Today's sales KPI reflects orders placed between 00:00 and 23:59 Chilean local time.
- Integer CLP formatting (`$189.990`) is enforced with zero decimals.
- Pending bank transfer card highlights transactions needing Banco de Chile reconciliation.

### 4.6 Lifecycle Traceability & Audit Trail Timeline
In `OrderDetailPanel.tsx`, staff can review the **Historial de Estados y Auditoría** timeline for any order.
- Fetches chronological transitions from `api/admin/order-history?orderId=...` (supporting direct ID and fallback query).
- Displays who executed the state change (staff email, customer, or Mercado Pago webhook), the exact timestamp, the reason, and delivery/payment telemetry.

### 4.7 Dual-Mode Product Modal & Dynamic Category Management
In `AdminInventory.tsx` and `ProductEditModal.tsx`:
- **Dual-Mode Operation:** The modal serves both as an editor for existing inventory items and as a creator for new clinical supplies (`+ Nuevo Insumo`).
- **Dynamic Category Selector:** Staff can choose from any existing category present in the active inventory OR select `+ Crear Nueva Categoría...` to register a brand-new specialty (e.g. `ORTODONCIA`, `PERIODONCIA`). The system automatically converts the input to uppercase and persists it to the catalog.
- **Immediate Audit Logging:** Creating a new product generates an initial audit event in `inventory_audit_logs` with `changeType: 'STOCK_ADJUSTMENT'` and `reasonCode: 'creacion_manual'`.

---

## 🛠️ 5. Database Schema, Migration & Multi-Environment CLI Tooling

PRONTO provides administrative CLI utilities ([`scripts/manage-firestore-schema.ts`](../../scripts/manage-firestore-schema.ts) and [`scripts/import-catalog-csv.ts`](../../scripts/import-catalog-csv.ts)) to enforce data quality and manage database lifecycles across production and isolated development environments:

### 5.1 Environment Isolation Commands

To prevent developmental work or testing from touching live clinic orders and warehouse inventory, all operations support an isolated `dev_*` mode:

```powershell
# --- DEVELOPMENT / TESTING ENVIRONMENT (dev_orders, dev_products, etc.) ---
# 1. Validate isolated development collections against the frozen schema
pnpm run schema:validate:dev

# 2. Ingest real clinical dental price list from CSV into development collections (defaults to 10 units each)
pnpm run catalog:import:dev

# 3. Seed canonical catalog and sample orders into development collections
pnpm run schema:seed:dev

# 4. Purge AND reseed development collections safely without touching production
#    (maps to --purge-and-seed --force --env=dev — it re-creates the fixtures, not just wipe)
pnpm run schema:purge:dev

# --- PRODUCTION ENVIRONMENT (Strict Safeguards) ---
# 1. Inspect live production documents against the frozen schema (Read-Only)
pnpm run schema:validate

# 2. Ingest real clinical dental price list from CSV into production collections (Requires confirmation)
pnpm run catalog:import --confirm-production-import

# 3. Seed canonical products into production collections
pnpm run schema:seed

# 4. Purge legacy production collections (Requires BOTH --force and --confirm-production-wipe;
#    the script refuses with an explicit usage error if either is missing)
pnpm run schema:purge-and-seed --force --confirm-production-wipe
```

### 5.2 Batch Operation Chunking Guardrail

Firestore enforces a strict hard limit of 500 operations per `batch.commit()`. The CLI migration and CSV import tools automatically divide bulk operations into safe chunks of 450 documents, preventing `INVALID_ARGUMENT: maximum 500 writes allowed per batch` failures during catalog resets.

### 5.3 UI Environment Indicator Badge

The admin topbar ([`src/admin/components/AdminTopbar.tsx`](./components/AdminTopbar.tsx)) renders an environment badge:

- In development / preview mode: Displays an amber `🧪 DEV (dev_*)` pill badge so staff immediately know they are operating against test data.
- In production: Displays a clean emerald `🟢 PROD` badge.

---

## ⚠️ 6. Deliberate Placeholders & Known Issues

### 6.1 "Fase 5" placeholder cards — intentional, not dead code

Two surfaces render greyed `Fase 5` placeholder cards for deferred roadmap work; leave them in place (their roadmap anchors are in `PRODUCTION_READINESS_TODO.md`):

- `AdminDashboard.tsx` — `Visitas Web y Sesiones` (→ Google Tag Manager) and `Tasa de Conversión Checkout` (→ GA4 telemetría).
- `AdminSettings.tsx` — `Configuración de Tarifas de Envío y Zonas Rurales` (dynamic courier/comuna pricing).

### 6.2 Known issues (as built — fix deliberately, do not opportunistically rewrite)

- **`StockAdjustModal.tsx` — hook-order hardening (as built).** The component's prop is `Product | null`, so it must tolerate a null product without breaking React's invariant that the same hooks run in the same order on every render. It now returns `null` from a hook-free guard and renders a separate stateful `StockAdjustForm` (four unconditional `useState`, lazily seeded from the product, `key={product.id}`) only while a product exists; `AdminInventory.tsx` also mounts it conditionally (`{selectedForStock && …}`), matching `ProductEditModal`. The previous shape (`if (!product) return null` **before** the four hooks) was a `react-hooks/rules-of-hooks` violation. React 18.3.1 happened to tolerate the zero-hook→four-hook transition — it dispatches a render whose previous committed state is `null` to the mount path, so no hook-count comparison runs — which means the reported runtime crash was latent, not observed; the pattern is still undefined behavior and becomes a real crash the moment a hook is added above the guard. The keyed inner form additionally re-seeds the stock draft when a different product is opened instead of keeping the previous product's value.
- **`ProductEditModal.tsx` — prop→state sync `useEffect`.** Form fields are populated from `product` inside a `useEffect` — the exact synchronous-setState-in-effect pattern `react-hooks/set-state-in-effect` forbids on the storefront (see [src/components/AGENTS.md](../components/AGENTS.md) §2.1). It works today only because the parent remounts the modal per open; a lint sweep or refactor must replace it with the storefront's remount/lazy-initializer convention, not copy it elsewhere.
- **`var(--primary)` unresolved in `OrderDetailPanel.tsx`** — see §2.3.
- **`AdminOrders.tsx` header copy** still reads `…depósitos dentales en Melipilla y RM` — there are no RM delivery zones (root [AGENTS.md](../../AGENTS.md) §3.4). Internal-facing, but stale.

---

## 📂 7. Directory Map

| File | Purpose |
| :--- | :--- |
| [`src/admin/main.tsx`](../../src/admin/main.tsx) | Entry point mounting `AdminApp` to `admin.html`. |
| [`src/admin/AdminApp.tsx`](../../src/admin/AdminApp.tsx) | Auth gate, active tab hash listener, and view router. |
| [`src/admin/admin.css`](../../src/admin/admin.css) | Scoped admin layout and component stylesheets. |
| [`src/admin/types.ts`](../../src/admin/types.ts) | Admin dashboard metrics, inventory audit, and filter models. |
| [`src/admin/services/adminApi.ts`](../../src/admin/services/adminApi.ts) | Authenticated client adapter injecting Firebase Bearer tokens with offline fallbacks. |
| [`src/admin/components/AdminLayout.tsx`](../../src/admin/components/AdminLayout.tsx) | Fixed sidebar + topbar + main scroll content shell. |
| [`src/admin/components/AdminLogin.tsx`](../../src/admin/components/AdminLogin.tsx) | Staff sign-in form; verifies the `admin` custom claim via `getIdTokenResult(true)` and signs out non-admin sessions (§3.1). |
| [`src/admin/components/AdminSidebar.tsx`](../../src/admin/components/AdminSidebar.tsx) | 240px navy navigation sidebar with route indicators. |
| [`src/admin/components/AdminTopbar.tsx`](../../src/admin/components/AdminTopbar.tsx) | Utility header with breadcrumb, staff email, environment badge (`DEV`/`PROD`), and sign-out button. |
| [`src/admin/components/AdminDashboard.tsx`](../../src/admin/components/AdminDashboard.tsx) | 4 KPI cards, two "Fase 5" analytics placeholder cards (§6.1), split recent-orders table / low-stock alerts (`2fr 1fr` grid). |
| [`src/admin/components/AdminOrders.tsx`](../../src/admin/components/AdminOrders.tsx) | Order management view with search, filter chips, and table; accepts `initialOrderId` from the `#orders/<id>` deep link. |
| [`src/admin/components/OrderTable.tsx`](../../src/admin/components/OrderTable.tsx) | Sortable, paginated order list with quick inspect actions. |
| [`src/admin/components/OrderDetailPanel.tsx`](../../src/admin/components/OrderDetailPanel.tsx) | 440px slide-over inspector (`.admin-slide-panel`) for invoicing, receipts, fulfillment actions, and audit timeline. |
| [`src/admin/components/AdminInventory.tsx`](../../src/admin/components/AdminInventory.tsx) | Product inventory view with stock counters, dynamic categories, and "+ Nuevo Insumo" trigger. Mounts `StockAdjustModal` only while a warehouse row is selected (§6.2). |
| [`src/admin/components/InventoryTable.tsx`](../../src/admin/components/InventoryTable.tsx) | Real-time product table with decoupled `isActive` and `inStock` states. |
| [`src/admin/components/StockAdjustModal.tsx`](../../src/admin/components/StockAdjustModal.tsx) | Stock-adjustment modal (default `.admin-modal` 480px) with audit reason codes — hook-free guard plus a keyed stateful form keep the hook order invariant (§6.2). |
| [`src/admin/components/ProductEditModal.tsx`](../../src/admin/components/ProductEditModal.tsx) | 580px dual-mode modal for creating new supplies and editing clinical product metadata, integer CLP prices, dynamic categories, and synchronized `priceNeto`. |
| [`src/admin/components/AdminSettings.tsx`](../../src/admin/components/AdminSettings.tsx) | Branch/legal-identity card (`BANK_DETAILS`: Razón Social, RUT, `Av. Ortúzar 750` bodega, transfer account) + deferred "Fase 5" shipping-rates placeholder (§6.1). |
| [`src/admin/components/MetricCard.tsx`](../../src/admin/components/MetricCard.tsx) | Reusable KPI card (label, value, subtitle, icon, `accentColor` — danger values auto-color red). |
| [`src/admin/components/StatusBadge.tsx`](../../src/admin/components/StatusBadge.tsx) | Standardized badge with Chilean order status coloring. |
