# PRONTO Admin Backoffice Architecture & Operational Guide (`src/admin/`)

This document is the **authoritative architectural, design, and operational specification** for the internal administrative backoffice of **PRONTO Insumos Odontológicos** (`/admin`).

---

## 🎯 1. Mission & Operational Scope

The PRONTO Admin Portal is an internal, lightweight management console designed exclusively for the store owner, clinical inventory managers, and warehouse staff in **Melipilla, Chile**.

### Core Responsibilities:
1. **Executive Overview (`#dashboard`):** Real-time monitoring of daily revenue (CLP), pending bank transfers awaiting clearance, low-stock supply alerts (<5 units), and monthly order volume.
2. **Order Management & Fulfillment (`#orders`):**
   - Search orders by canonical ID (`PRONTO-XXXXXX`), customer/company name, or Chilean RUT.
   - Filter by status chips (`PENDIENTE_TRANSFERENCIA`, `PAGADO_MERCADOPAGO`, `DESPACHADO`, `ENTREGADO`, etc.).
   - Inspect clinical orders in a 420px slide-over panel displaying Chilean legal invoicing attributes (Factura Electrónica: RUT, Razón Social, Giro Comercial, Dirección Fiscal).
   - Display sanitary verification credentials (SIS / ISP health registry numbers).
   - View bank transfer payment vouchers uploaded by clinics.
   - Execute operational fulfillment transitions:
     * **Aprobar Transferencia:** Clears bank transfer payment and triggers atomic inventory decrement in the Melipilla warehouse.
     * **Marcar Despachado:** Records Chilean courier (Starken, Chilexpress, Blue Express, Melipilla Express) and tracking number.
     * **Marcar Entregado:** Confirms receipt and closes the fulfillment cycle.
3. **Inventory & Warehouse Management (`#inventory`):**
   - Live view of product stock levels, categories, and Chilean Peso pricing (Neto and Total con 19% IVA).
   - **Audit-Logged Stock Adjustments:** Modal supporting reason codes (`reposicion`, `merma`, `correccion`, `venta_manual`) and operator notes.
   - **Product Metadata Editor:** Modify integer CLP pricing, descriptions, specifications, package contents, and clinical manufacturer tags.
   - **Instant Catalog Visibility Switch:** Pause sales for backordered items (`inStock: false`).
4. **Settings & Operational Config (`#settings`):** Centralized display of warehouse location (Av. Ortúzar 1234, Melipilla), delivery cut-off times, and connected Firebase/Mercado Pago environment status.

---

## 🏗️ 2. Architectural Boundaries & Isolation

### 2.1 Multi-Page Entry Point (`admin.html`)
To strictly follow the **Anti-Overshooting Principle** in [AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/AGENTS.md):
* The admin portal is **NOT** a bloated router bundle injected into the customer storefront.
* It is configured as a secondary Vite multi-page entry point:
  - `dist/index.html`: Public customer storefront bundle (~111 kB JS, ~34 kB CSS).
  - `dist/admin.html`: Internal admin console bundle (~63 kB JS, ~13 kB CSS).
* Customers visiting `prontoinsumos.cl` never download admin logic, forms, or admin API adapters.
* Vercel rewrites in `vercel.json` route `/admin` and `/admin/*` directly to `admin.html`.
* `admin.html` includes `<meta name="robots" content="noindex, nofollow">` to prevent indexing by search engine crawlers.

### 2.2 Hash-Based Internal Routing
* Internal navigation uses lightweight browser hash changes:
  - `#/dashboard` (Default view)
  - `#/orders`
  - `#/inventory`
  - `#/settings`
* No heavyweight routing libraries (React Router, TanStack Router) are used. The route is managed via standard React `useState` synchronized with `window.location.hash`.

### 2.3 Styling & Design Tokens (`src/admin/admin.css`)
* Uses handcrafted Vanilla CSS prefixed with `.admin-*` to prevent global style leakage.
* Shares the brand typography (Outfit / Inter) and clinical palette:
  - Primary Navy: `var(--navy-900)` (`#0f172a`), `var(--navy-800)` (`#1e293b`)
  - Clinical Cyan Accent: `var(--primary)` (`#00a896`)
  - Chilean Alert Red: `#ef4444` (Critical stock, rejected status)
  - Amber Warning: `#f59e0b` (Pending transfer clearance)
  - Emerald Green: `#10b981` (Paid, delivered, approved)

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
3. **Serverless Token Verification Middleware (`api/lib/adminAuth.ts`):**
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
1. Invokes `/api/admin/approve-transfer`.
2. Verifies staff admin claims.
3. Reads the order inside a Firestore transaction.
4. Decrements `stockCount` for each ordered item in `products`.
5. Updates order status to `'TRANSFERENCIA_APROBADA'`, recording `approvedBy` (admin email) and `approvedAt` (ISO timestamp).
6. Ensures Melipilla warehouse physical inventory matches database counts in real-time.

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

PRONTO provides administrative CLI utilities ([`scripts/manage-firestore-schema.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/scripts/manage-firestore-schema.ts) and [`scripts/import-catalog-csv.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/scripts/import-catalog-csv.ts)) to enforce data quality and manage database lifecycles across production and isolated development environments:

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

# 4. Purge all development documents safely without touching production
pnpm run schema:purge:dev

# --- PRODUCTION ENVIRONMENT (Strict Safeguards) ---
# 1. Inspect live production documents against the frozen schema (Read-Only)
pnpm run schema:validate

# 2. Ingest real clinical dental price list from CSV into production collections (Requires confirmation)
pnpm run catalog:import --confirm-production-import

# 3. Seed canonical products into production collections
pnpm run schema:seed

# 4. Purge legacy production collections (Requires explicit --force flag)
pnpm run schema:purge-and-seed --force
```

### 5.2 Batch Operation Chunking Guardrail
Firestore enforces a strict hard limit of 500 operations per `batch.commit()`. The CLI migration and CSV import tools automatically divide bulk operations into safe chunks of 450 documents, preventing `INVALID_ARGUMENT: maximum 500 writes allowed per batch` failures during catalog resets.

### 5.3 UI Environment Indicator Badge
The admin topbar ([`src/admin/components/AdminTopbar.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/AdminTopbar.tsx)) renders an environment badge:
- In development / preview mode: Displays an amber `🧪 DEV (dev_*)` pill badge so staff immediately know they are operating against test data.
- In production: Displays a clean emerald `🟢 PROD` badge.

---

## 📂 6. Directory Map

| File | Purpose |
| :--- | :--- |
| [`src/admin/main.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/main.tsx) | Entry point mounting `AdminApp` to `admin.html`. |
| [`src/admin/AdminApp.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/AdminApp.tsx) | Auth gate, active tab hash listener, and view router. |
| [`src/admin/admin.css`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/admin.css) | Scoped admin layout and component stylesheets. |
| [`src/admin/types.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/types.ts) | Admin dashboard metrics, inventory audit, and filter models. |
| [`src/admin/services/adminApi.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/services/adminApi.ts) | Authenticated client adapter injecting Firebase Bearer tokens with offline fallbacks. |
| [`src/admin/components/AdminLayout.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/AdminLayout.tsx) | Fixed sidebar + topbar + main scroll content shell. |
| [`src/admin/components/AdminSidebar.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/AdminSidebar.tsx) | 240px navy navigation sidebar with route indicators. |
| [`src/admin/components/AdminTopbar.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/AdminTopbar.tsx) | Utility header with breadcrumb, staff email, environment badge (`DEV`/`PROD`), and sign-out button. |
| [`src/admin/components/AdminDashboard.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/AdminDashboard.tsx) | 4 KPI cards, split orders table (65%), and low-stock alerts (35%). |
| [`src/admin/components/AdminOrders.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/AdminOrders.tsx) | Order management view with search, filter chips, and table. |
| [`src/admin/components/OrderTable.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/OrderTable.tsx) | Sortable, paginated order list with quick inspect actions. |
| [`src/admin/components/OrderDetailPanel.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/OrderDetailPanel.tsx) | 420px slide-over inspector for invoicing, receipts, fulfillment actions, and audit timeline. |
| [`src/admin/components/AdminInventory.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/AdminInventory.tsx) | Product inventory view with stock counters, dynamic categories, and "+ Nuevo Insumo" trigger. |
| [`src/admin/components/InventoryTable.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/InventoryTable.tsx) | Real-time product table with decoupled `isActive` and `inStock` states. |
| [`src/admin/components/StockAdjustModal.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/StockAdjustModal.tsx) | 420px modal for stock adjustments with audit reason codes. |
| [`src/admin/components/ProductEditModal.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/ProductEditModal.tsx) | 560px dual-mode modal for creating new supplies and editing clinical product metadata, integer CLP prices, dynamic categories, and synchronized `priceNeto`. |
| [`src/admin/components/AdminSettings.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/AdminSettings.tsx) | Warehouse location, fulfillment cut-offs, and service integrations. |
| [`src/admin/components/MetricCard.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/MetricCard.tsx) | Reusable KPI metric card with trend indicators. |
| [`src/admin/components/StatusBadge.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/admin/components/StatusBadge.tsx) | Standardized badge with Chilean order status coloring. |
