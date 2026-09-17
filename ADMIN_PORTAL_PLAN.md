# PRONTO Insumos Odontológicos — Admin Portal & Backoffice Dashboard Plan

**Phase:** 4 (Backoffice Operations & Order Management Dashboard)  
**Priority:** P2 (Operational, can launch storefront without but critical for daily operations)  
**Author:** Planning Agent  
**Date:** September 2026  
**References:** [PRODUCTION_READINESS_TODO.md](file:///c:/Users/ecmv2/Documents/PRONTO/PRODUCTION_READINESS_TODO.md) §Phase 4, [AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/AGENTS.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Visual Design & UI/UX Specification](#2-visual-design--uiux-specification)
3. [Routing & Application Architecture](#3-routing--application-architecture)
4. [Authentication & Admin User Setup](#4-authentication--admin-user-setup)
5. [Admin Dashboard (Home View)](#5-admin-dashboard-home-view)
6. [Orders Management View](#6-orders-management-view)
7. [Inventory Management View](#7-inventory-management-view)
8. [Serverless API Surface (`api/admin/`)](#8-serverless-api-surface-apiadmin)
9. [Firestore Rules Update](#9-firestore-rules-update)
10. [Type System & Data Contracts](#10-type-system--data-contracts)
11. [File Structure & Module Map](#11-file-structure--module-map)
12. [CSS Strategy & Design Tokens](#12-css-strategy--design-tokens)
13. [Testing Strategy](#13-testing-strategy)
14. [Environment Variables](#14-environment-variables)
15. [Guardrails & Constraints](#15-guardrails--constraints)
16. [Decisions Left to Implementing Agent](#16-decisions-left-to-implementing-agent)

---

## 1. Executive Summary

The PRONTO admin portal is a **lightweight, internal-only backoffice** that allows the store owner and Melipilla warehouse staff to:

1. **Monitor business KPIs** — daily sales, pending orders, low-stock alerts, monthly order volume.
2. **Manage orders** — view, search, filter, inspect order details, approve bank transfers, mark orders as dispatched with carrier info.
3. **Manage inventory** — adjust stock counts, toggle product visibility, edit product metadata and CLP pricing.

The admin portal is a **completely separate React application entry point** that shares the same Vite project, design tokens, and Firestore backend, but has its own layout, routing, CSS, and component tree. It is **never visible to storefront customers**.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Entry point | Separate `admin.html` (Vite multi-page) | Zero storefront bundle impact |
| Internal routing | Hash-based (`#dashboard`, `#orders`, `#inventory`) | No routing library dependency |
| Authentication | Firebase Auth Email/Password + admin custom claims | Simplest setup, one-time CLI script |
| Data mutations | Serverless API at `api/admin/` with token verification | Security: never expose admin writes to browser-side Firestore |
| CSS | Separate `admin.css` with shared design tokens | Isolation from storefront CSS |
| State management | `useState` / `useReducer` only | Per AGENTS.md guardrails |

---

## 2. Visual Design & UI/UX Specification

### 2.1 Layout Architecture

The admin portal uses a **fixed sidebar + scrollable main content** layout, distinctly different from the storefront's single-column e-commerce layout.

```
┌──────────────────────────────────────────────────────┐
│  ┌─────────┐  ┌──────────────────────────────────┐   │
│  │ SIDEBAR │  │  TOPBAR (page title + user menu) │   │
│  │         │  ├──────────────────────────────────┤   │
│  │ Logo    │  │                                  │   │
│  │ Nav     │  │  MAIN CONTENT AREA               │   │
│  │ Items   │  │  (scrollable)                    │   │
│  │         │  │                                  │   │
│  │         │  │                                  │   │
│  └─────────┘  └──────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

- **Sidebar:** Fixed left, width `240px`, full viewport height. Background `var(--navy-900)` (`#0b192c`).
- **Topbar:** Sticky top within the content area. Contains page title (h1), a notification indicator (future), and admin user display (email + sign-out button).
- **Main content:** Scrolls independently. Background `var(--surface-bg)` (`#f8fafb`). Max-width is unconstrained (the content fills available space within the sidebar offset). Padding `1.5rem 2rem`.

### 2.2 Design Tokens (Shared with Storefront)

The admin portal reuses the **exact same design tokens** defined in [src/index.css :root](file:///c:/Users/ecmv2/Documents/PRONTO/src/index.css#L3-L83):

| Token | Value | Usage in Admin |
|---|---|---|
| `--navy-900` | `#0b192c` | Sidebar background |
| `--navy-950` | `#07101d` | Sidebar logo region |
| `--teal-600` | `#088395` | Active nav item, primary buttons |
| `--teal-700` | `#0a6371` | Button hover states |
| `--surface-bg` | `#f8fafb` | Main content background |
| `--surface-card` | `#ffffff` | Metric cards, table containers |
| `--text-primary` | `#0f172a` | Headings, table text |
| `--text-secondary` | `#475569` | Labels, descriptions |
| `--text-muted` | `#64748b` | Timestamps, hints |
| `--success` | `#059669` | PAGADO badge, stock OK |
| `--warning` | `#d97706` | PENDIENTE badge, low stock |
| `--danger` | `#dc2626` | Critical stock, errors |
| `--accent-info` | `#3b82f6` | DESPACHADO badge, links |
| `--font-sans` | `'DM Sans', ...` | All text |
| `--font-mono` | `'JetBrains Mono', ...` | Order IDs, SKUs, CLP prices |
| `--radius-sm` | `6px` | Buttons, inputs, badges |
| `--radius-md` | `8px` | Cards, containers |
| `--shadow-sm` | (see CSS) | Table containers, cards |
| `--shadow-md` | (see CSS) | Modals, drawers |

### 2.3 Sidebar Navigation

The sidebar contains exactly 4 navigation items for Phase 4:

| Icon (Lucide) | Label | Hash Route | Notes |
|---|---|---|---|
| `LayoutDashboard` | Dashboard | `#dashboard` | Default/home view |
| `ClipboardList` | Pedidos | `#orders` | Order management |
| `Package` | Inventario | `#inventory` | Stock & catalog management |
| `Settings` | Configuración | `#settings` | Future — store settings, delivery zones, bank details. Show as disabled/grayed in Phase 4. |

Active nav item styling:
- Background: `var(--teal-600)` at `0.15` opacity
- Left border: `3px solid var(--teal-600)`
- Text color: `var(--teal-600)`

Inactive items: `color: var(--slate-400)` → hover: `var(--slate-200)`

### 2.4 Responsive Behavior

The admin portal is **desktop-first** and targets 1024px+ widths. Warehouse staff in Melipilla primarily use desktop or large-tablet devices. For tablets (768px–1024px):
- Sidebar collapses to icon-only mode (56px width) with tooltip nav labels.
- Content area expands to fill.

For mobile (<768px):
- Sidebar becomes a hamburger-toggled overlay drawer.
- Tables become horizontally scrollable.

### 2.5 Status Badge Color System

Order status badges use consistent color coding across all views:

| Status | Background | Text | Border |
|---|---|---|---|
| `PENDIENTE_PAGO_MERCADOPAGO` | `#fffbeb` | `#b45309` | `#fde68a` |
| `PENDIENTE_TRANSFERENCIA` | `#fff7ed` | `#c2410c` | `#fed7aa` |
| `PAGADO_MERCADOPAGO` | `#ecfdf5` | `#059669` | `#a7f3d0` |
| `TRANSFERENCIA_APROBADA` | `#ecfdf5` | `#059669` | `#a7f3d0` |
| `COTIZACION_SOLICITADA_WHATSAPP` | `#f0f9ff` | `#0284c7` | `#bae6fd` |
| `DESPACHADO` | `#eff6ff` | `#2563eb` | `#bfdbfe` |
| `ENTREGADO` | `#f0fdfa` | `#0d9488` | `#99f6e4` |

Stock level indicators:

| Level | Condition | Color |
|---|---|---|
| OK | `stockCount > 10` | `var(--success)` |
| Low | `stockCount > 0 && stockCount <= 10` | `var(--warning)` |
| Critical | `stockCount <= 3` | `var(--danger)` |
| Out of Stock | `stockCount === 0` or `inStock === false` | `var(--danger)` + strikethrough |

---

## 3. Routing & Application Architecture

### 3.1 Decision: Separate Vite Entry Point (Multi-Page Application)

The admin portal is implemented as a **second Vite entry point** — a separate HTML page (`admin.html`) and React root (`src/admin/main.tsx`). This approach:

- ✅ **Keeps the storefront bundle untouched** — zero impact on customer page load performance.
- ✅ **Enables code-splitting by page** — admin code is never loaded by storefront visitors.
- ✅ **Avoids installing a client-side router** (React Router, Wouter) — no new dependencies.
- ✅ **Works with Vercel's existing rewrite rules** — the `/admin` path resolves to `admin.html`.

### 3.2 Vite Multi-Page Configuration

Update [vite.config.ts](file:///c:/Users/ecmv2/Documents/PRONTO/vite.config.ts):

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html')
      }
    }
  }
})
```

### 3.3 Admin HTML Entry (`admin.html`)

Create `admin.html` at the project root (sibling to `index.html`):

```html
<!DOCTYPE html>
<html lang="es-CL">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>PRONTO Admin — Panel de Administración</title>
  <link rel="icon" type="image/svg+xml" href="/vite.svg" />
</head>
<body>
  <div id="admin-root"></div>
  <script type="module" src="/src/admin/main.tsx"></script>
</body>
</html>
```

> **Important:** The `<meta name="robots" content="noindex, nofollow" />` prevents search engines from indexing the admin portal.

### 3.4 Vercel Rewrites

Update [vercel.json](file:///c:/Users/ecmv2/Documents/PRONTO/vercel.json) to serve `admin.html` for `/admin` paths:

```json
{
  "rewrites": [
    { "source": "/admin/:path*", "destination": "/admin.html" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

> **Note:** The admin rewrite rule **must come before** the storefront catch-all to take precedence.

### 3.5 Internal View Routing (Hash-Based)

Within the admin SPA, navigation between Dashboard, Orders, and Inventory uses **hash-based routing** (`window.location.hash`):

- `/admin` → `#dashboard` (default)
- `/admin#orders` → Orders view
- `/admin#inventory` → Inventory view
- `/admin#settings` → Settings placeholder

This avoids adding any routing library. The `AdminApp` component reads `window.location.hash` on mount and listens to `hashchange` events.

```typescript
// Simplified routing logic in AdminApp.tsx
const [activeView, setActiveView] = useState<AdminView>('dashboard')

useEffect(() => {
  const handleHashChange = () => {
    const hash = window.location.hash.replace('#', '') || 'dashboard'
    setActiveView(hash as AdminView)
  }
  handleHashChange()
  window.addEventListener('hashchange', handleHashChange)
  return () => window.removeEventListener('hashchange', handleHashChange)
}, [])
```

---

## 4. Authentication & Admin User Setup

### 4.1 Firebase Auth Email/Password

The admin portal uses **Firebase Authentication (Email/Password provider)** with **custom claims** to identify admin users.

The login flow:
1. Admin visits `/admin` → sees the login form (email + password).
2. On submit, call `signInWithEmailAndPassword(auth, email, password)` from the Firebase client SDK.
3. After successful sign-in, retrieve the user's ID token and verify it contains the `admin: true` custom claim.
4. If the claim is present, render the admin portal. If not, show an "access denied" message and sign out.

### 4.2 One-Time Admin Setup Script

Create a CLI script `scripts/setup-admin.ts` that the developer runs **once** to create the admin user and set custom claims. This is the **simplest, zero-infrastructure approach** — no serverless endpoint needed.

```typescript
// scripts/setup-admin.ts
// Run with: npx tsx scripts/setup-admin.ts
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
})

const auth = getAuth(app)

async function setupAdmin() {
  const email = 'admin@prontoinsumos.cl' // <-- Replace with real admin email
  const password = process.env.ADMIN_INITIAL_PASSWORD || 'changeme123!'
  
  try {
    // Create the user (or get existing)
    let user
    try {
      user = await auth.getUserByEmail(email)
      console.log(`User ${email} already exists (uid: ${user.uid})`)
    } catch {
      user = await auth.createUser({ email, password, displayName: 'PRONTO Admin' })
      console.log(`Created admin user ${email} (uid: ${user.uid})`)
    }

    // Set admin custom claim
    await auth.setCustomUserClaims(user.uid, { admin: true })
    console.log(`✅ Admin claim set for ${email}. User can now access /admin.`)
  } catch (err) {
    console.error('Failed to setup admin:', err)
    process.exit(1)
  }
}

setupAdmin()
```

To add more admins later, modify the script email and re-run.

### 4.3 Client-Side Auth Flow

The `AdminApp` component:
1. Initializes Firebase Auth (`getAuth()` from the same `firebase` client SDK already installed).
2. Subscribes to `onAuthStateChanged`.
3. On auth state:
   - **Not signed in** → render `<AdminLogin />`
   - **Signed in** → call `user.getIdTokenResult()`, check `claims.admin === true`:
     - ✅ Admin → render `<AdminLayout />`
     - ❌ Not admin → render access denied message, call `signOut()`

---

## 5. Admin Dashboard (Home View)

### 5.1 KPI Metric Cards (Top Row)

Four cards in a responsive CSS Grid (`grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))`):

| Card | Data Source | Display | Color Accent |
|---|---|---|---|
| **Ventas Hoy** | Sum `totalAmount` of orders with `paidAt` = today | CLP formatted: `$1.289.990` | `var(--teal-600)` |
| **Pedidos Pendientes** | Count of orders where `status` starts with `PENDIENTE_` | Integer count + amber icon | `var(--warning)` |
| **Stock Bajo** | Count of products where `stockCount <= 5 && inStock === true` | Integer count + red alert icon | `var(--danger)` |
| **Pedidos Mes** | Count of orders created in current calendar month | Integer count | `var(--text-primary)` |

Each card:
- White background (`var(--surface-card)`)
- `var(--shadow-sm)` shadow
- `var(--radius-md)` border radius
- Icon in top-right corner (Lucide: `DollarSign`, `Clock`, `AlertTriangle`, `TrendingUp`)
- Label text: `var(--text-secondary)`, 0.85rem
- Value text: `var(--font-mono)`, 1.75rem, `var(--text-primary)` weight 700

### 5.2 Recent Orders Table (Bottom Left, ~65% Width)

- Title: "Últimos Pedidos" with a "Ver todos →" link to `#orders`
- Shows the **10 most recent orders** sorted by `createdAt` descending.
- Columns: Order ID (monospace), Status (badge), Cliente, Monto (CLP), Fecha (relative: "hace 2h", "ayer")
- Each row is clickable → navigates to `#orders` with the order selected.
- Data fetched via the admin API (see §8).

### 5.3 Critical Stock Alerts (Bottom Right, ~35% Width)

- Title: "Stock Crítico"
- Lists products with `stockCount <= 5` sorted ascending.
- Each item shows: product name (truncated), current stock count (red or amber badge), and a quick "Reponer" link to `#inventory`.
- If no products are low: show a green success card "Todo el inventario con stock adecuado ✓".

### 5.4 Future Analytics Placeholders

Two additional card slots in a second row beneath the 4 active KPI cards:

| Placeholder | Label | State |
|---|---|---|
| **Visitas Web (GTM)** | "Próximamente — Google Tag Manager" | Grayed out, `opacity: 0.4`, dashed border |
| **Conversión (GA4)** | "Próximamente — Google Analytics 4" | Grayed out, `opacity: 0.4`, dashed border |

These placeholders signal future capability without taking primary visual space. They should be clearly marked as "coming soon" and not clickable.

---

## 6. Orders Management View

### 6.1 Search & Filters

**Search bar:** Full-width text input with placeholder "Buscar por ID, clínica, o RUT..." Filters orders across `orderId`, `customer.fullName`, `customer.razonSocial`, and `customer.rut`.

**Status filter chips:** Horizontally scrollable row of filter buttons:

```
[ Todos ] [ Pendiente Pago ] [ Pagado MP ] [ Pend. Transferencia ] [ Cotización WA ] [ Despachado ] [ Entregado ]
```

- Active chip: filled background with status color
- Inactive: outline/ghost style
- Clicking a chip filters the order list by that status
- "Todos" shows all orders (default)

### 6.2 Order Table

Sortable, paginated table with columns:

| Column | Source Field | Formatting | Sortable |
|---|---|---|---|
| ID | `orderId` | Monospace font, e.g. `PRONTO-234567` | ✅ |
| Fecha | `createdAt` | Chilean date: `16 sept 2026, 14:30` | ✅ |
| Cliente / Clínica | `customer.fullName` or `customer.razonSocial` | Truncate at 30 chars | ✅ |
| RUT | `customer.rut` | Formatted: `76.543.210-K` | ❌ |
| Método | `paymentMethod` | Icon: 💳 MP / 🏦 Transferencia / 💬 WhatsApp | ❌ |
| Monto | `totalAmount` | `formatCLP()` | ✅ |
| Estado | `status` | Colored badge (§2.5 color system) | ✅ |
| Acciones | — | Eye icon (inspect) | ❌ |

**Pagination:** 20 orders per page. Simple prev/next pagination. Firestore `orderBy('createdAt', 'desc')` with cursor-based pagination using `startAfter`.

### 6.3 Order Detail Inspector (Slide-Over Panel)

When clicking the eye icon or an order row, a **right-side slide-over panel** (width: `420px`) opens with full order details:

**Header Section:**
- Order ID in large monospace font
- Status badge (updatable)
- Created at timestamp

**Customer Information:**
- Full name
- Email
- Phone
- RUT (formatted with `formatRut()`)
- Document type: Boleta / Factura

**Factura Details (if applicable):**
- Razón Social
- Giro Comercial
- Dirección Fiscal + Comuna

**Sanitary Verification (if applicable):**
- SIS Registry Number
- Credential file name
- Verification status

**Itemized Products:**
- Table: Product name, Qty, Unit Price (CLP), Line Total
- Subtotal row
- IVA 19% row (from `billing.taxBreakdown`)
- **Total row** (bold, large)

**Payment Information:**
- Payment method label
- Mercado Pago Payment ID (if MP, monospace)
- `paidAt` timestamp (if paid)
- Bank transfer receipt link (if transfer — future: Firebase Storage URL)

**Action Buttons (conditional):**

| Order Status | Available Actions |
|---|---|
| `PENDIENTE_TRANSFERENCIA` | **"✅ Aprobar Transferencia"** → calls `POST /api/admin/approve-transfer` |
| `PAGADO_MERCADOPAGO` or `TRANSFERENCIA_APROBADA` | **"📦 Marcar Despachado"** → shows carrier selector (Starken, Chilexpress, Blue Express, Despacho Local Melipilla) + tracking code input → calls `POST /api/admin/dispatch-order` |
| `DESPACHADO` | **"✔ Marcar Entregado"** → calls `POST /api/admin/mark-delivered` |
| `COTIZACION_SOLICITADA_WHATSAPP` | **"📋 Convertir a Pedido"** (future Phase 5 — show as disabled) |

---

## 7. Inventory Management View

### 7.1 Product Inventory Table

**Filter bar:** Text search "Buscar por nombre o SKU..." + Category dropdown filter (from `CATEGORIES`).

**Table columns:**

| Column | Source Field | Formatting |
|---|---|---|
| SKU / REF | `id` | Monospace (e.g. `odon-101`) |
| Producto | `name` | Truncate at 40 chars |
| Categoría | `category` | Category badge (from `CATEGORIES`) |
| Precio Neto | Derived: `Math.round(price / 1.19)` | `formatCLP()` |
| Precio c/IVA | `price` | `formatCLP()`, bold |
| Stock | `stockCount` | Color-coded number (§2.5) |
| Visible | `inStock` | Toggle switch |
| Acciones | — | Edit (pencil icon), Adjust Stock (±) |

### 7.2 Stock Adjustment Modal

Triggered by the ± icon on a product row. Centered modal (`max-width: 420px`):

- **Product name** (display only)
- **Current stock** (display only, badge colored by level)
- **Adjustment controls:** `[−1]` button, numeric input (direct entry), `[+1]` button
- **New stock preview:** Shows resulting stock count in real-time
- **Adjustment reason** (dropdown): `Reposición` (restock), `Merma` (loss/waste), `Corrección` (error fix), `Venta manual` (non-system sale)
- **[Guardar]** button (primary, teal) — calls `POST /api/admin/update-stock`
- **[Cancelar]** button (ghost)

### 7.3 Product Editor Modal

Triggered by the pencil icon. Larger modal (`max-width: 560px`):

Editable fields:
- `name` — Product name (text input)
- `price` — Price with IVA in CLP (numeric input, integer only)
- `description` — Product description (textarea)
- `category` — Category selector (dropdown from `CATEGORIES`)
- `manufacturer` — Brand (text input)
- `prescriptionRequired` — Checkbox (ISP/SIS regulated)
- `tag` — Commercial tag (text input, e.g. "Más Vendido", "Nuevo")

Non-editable display:
- `id` — SKU (read-only, monospace)
- `stockCount` — Adjusted via the stock modal, not here
- `images` — Managed separately (future)

**Save** → calls `POST /api/admin/update-product`

### 7.4 Visibility Toggle

The `inStock` toggle in the table row calls `POST /api/admin/toggle-visibility` to instantly hide/show a product from the storefront catalog. This is useful for temporarily pausing sales of depleted or backordered items without changing stock counts.

---

## 8. Serverless API Surface (`api/admin/`)

All admin mutations go through **Vercel Serverless Functions** in `api/admin/`. These functions:
1. Verify the Firebase Auth ID token from the `Authorization: Bearer <token>` header.
2. Check that the token contains `admin: true` custom claim.
3. Use `firebase-admin` (the existing [api/lib/firebaseAdmin.ts](file:///c:/Users/ecmv2/Documents/PRONTO/api/lib/firebaseAdmin.ts) singleton) to perform Firestore mutations.

### 8.1 Auth Middleware

Create `api/lib/adminAuth.ts` — a reusable helper:

```typescript
// api/lib/adminAuth.ts
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp } from './firebaseAdmin'
import type { VercelRequest } from '@vercel/node'

export interface AdminAuthResult {
  authenticated: boolean
  uid?: string
  email?: string
  error?: string
}

export async function verifyAdminToken(req: VercelRequest): Promise<AdminAuthResult> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Missing or malformed Authorization header' }
  }

  const idToken = authHeader.split('Bearer ')[1]
  const app = getAdminApp()
  if (!app) {
    return { authenticated: false, error: 'Firebase Admin not initialized' }
  }

  try {
    const decoded = await getAuth(app).verifyIdToken(idToken)
    if (decoded.admin !== true) {
      return { authenticated: false, error: 'User does not have admin privileges' }
    }
    return { authenticated: true, uid: decoded.uid, email: decoded.email }
  } catch (err: any) {
    return { authenticated: false, error: `Token verification failed: ${err.message}` }
  }
}
```

### 8.2 API Endpoints

| Endpoint | Method | Purpose | Request Body | Firestore Action |
|---|---|---|---|---|
| `/api/admin/orders` | GET | List orders (paginated, filterable) | Query: `?status=X&limit=20&cursor=Y&search=Z` | `orders` collection query |
| `/api/admin/orders/[orderId]` | GET | Get single order detail | — | `orders` collection `where('orderId', '==', X)` |
| `/api/admin/approve-transfer` | POST | Approve bank transfer, deduct stock | `{ orderId: string }` | Atomic transaction: update order status → `TRANSFERENCIA_APROBADA`, deduct stock (same logic as MP webhook) |
| `/api/admin/dispatch-order` | POST | Mark order as dispatched | `{ orderId: string, carrier: string, trackingCode?: string }` | Update order: `status → DESPACHADO`, add `dispatch` object |
| `/api/admin/mark-delivered` | POST | Mark order as delivered | `{ orderId: string }` | Update order: `status → ENTREGADO`, add `deliveredAt` |
| `/api/admin/products` | GET | List all products | Query: `?category=X` | `products` collection query |
| `/api/admin/update-stock` | POST | Adjust product stock | `{ productId: string, newStock: number, reason: string }` | Update `products/{id}`: `stockCount`, `inStock` |
| `/api/admin/update-product` | POST | Edit product metadata | `{ productId: string, updates: {...} }` | Update `products/{id}`: specified fields only |
| `/api/admin/toggle-visibility` | POST | Toggle product visibility | `{ productId: string, visible: boolean }` | Update `products/{id}`: `inStock` |
| `/api/admin/dashboard-stats` | GET | Aggregated dashboard KPIs | — | Multiple queries: today's sales, pending count, low stock count, monthly totals |

### 8.3 Transfer Approval — Stock Deduction Logic

The `approve-transfer` endpoint performs **the same atomic Firestore transaction** as the Mercado Pago webhook ([api/webhooks/mercadopago.ts](file:///c:/Users/ecmv2/Documents/PRONTO/api/webhooks/mercadopago.ts#L113-L169)):

1. **All reads first:** Read the order document + all referenced product documents.
2. **Idempotency check:** If order is already `TRANSFERENCIA_APROBADA` or `PAGADO_MERCADOPAGO`, return success without re-decrementing.
3. **All writes:** Update order status to `TRANSFERENCIA_APROBADA`, add `approvedAt` and `approvedBy` (admin UID). Decrement each product's `stockCount` atomically.

> **Refactoring opportunity:** Extract the shared "approve order + deduct stock" transaction logic into a shared helper in `api/lib/orderApproval.ts` that both the MP webhook and the admin approval endpoint call. This eliminates code duplication and ensures identical stock deduction logic.

---

## 9. Firestore Rules Update

The current [firestore.rules](file:///c:/Users/ecmv2/Documents/PRONTO/firestore.rules) deny all client-side reads on orders (`allow read, update, delete: if false`). This is intentional — the admin portal does **not** query Firestore directly from the browser. All reads go through the serverless API which uses `firebase-admin` (bypasses security rules).

**No Firestore rules changes are needed for the admin portal.**

The admin's browser sends requests to `/api/admin/*` endpoints → these endpoints use `firebase-admin` → `firebase-admin` bypasses security rules entirely.

This is the correct architecture because:
- ❌ Opening Firestore rules for authenticated admin reads would also expose the query patterns to any user who discovers the Firebase config (which is public in `VITE_*` vars).
- ✅ Keeping all admin data access behind authenticated serverless functions provides proper access control.

---

## 10. Type System & Data Contracts

### 10.1 Extended Order Status Type

The current `OrderStatus` type in [src/types/index.ts](file:///c:/Users/ecmv2/Documents/PRONTO/src/types/index.ts#L78-L84) needs to be extended:

```typescript
export type OrderStatus =
  | 'PENDIENTE_PAGO_MERCADOPAGO'
  | 'PAGADO_MERCADOPAGO'
  | 'PENDIENTE_TRANSFERENCIA'
  | 'TRANSFERENCIA_APROBADA'      // NEW: Admin approved bank transfer
  | 'COTIZACION_SOLICITADA_WHATSAPP'
  | 'DESPACHADO'                   // NEW: Order shipped
  | 'ENTREGADO'                    // NEW: Order delivered
  | 'PENDIENTE_PAGO'
```

### 10.2 Extended Order Interface

```typescript
export interface Order {
  orderId: string
  createdAt?: any
  paymentMethod: PaymentMethod
  status: OrderStatus
  totalAmount: number
  customer: CustomerInfo
  billing?: BillingInfo
  sanitaryVerification?: SanitaryVerification
  items: {
    productId: string
    name: string
    quantity: number
    price: number
  }[]
  // Payment telemetry (set by webhook or admin approval)
  mercadopagoPaymentId?: string
  paidAt?: string
  // Admin operations (set by admin API)
  approvedAt?: string
  approvedBy?: string
  dispatch?: {
    carrier: 'starken' | 'chilexpress' | 'blue_express' | 'despacho_local_melipilla'
    trackingCode?: string
    dispatchedAt: string
    dispatchedBy: string
  }
  deliveredAt?: string
}
```

### 10.3 Admin-Specific Types (New File: `src/admin/types.ts`)

```typescript
export type AdminView = 'dashboard' | 'orders' | 'inventory' | 'settings'

export interface DashboardStats {
  salesToday: number          // Total CLP from paid orders today
  pendingOrders: number       // Count of orders with PENDIENTE_* status
  lowStockProducts: number    // Count of products with stockCount <= 5
  ordersThisMonth: number     // Total orders this calendar month
}

export interface StockAdjustment {
  productId: string
  newStock: number
  reason: 'reposicion' | 'merma' | 'correccion' | 'venta_manual'
}

export type CarrierType = 'starken' | 'chilexpress' | 'blue_express' | 'despacho_local_melipilla'

export const CARRIER_LABELS: Record<CarrierType, string> = {
  starken: 'Starken',
  chilexpress: 'Chilexpress',
  blue_express: 'Blue Express',
  despacho_local_melipilla: 'Despacho Local Melipilla'
}
```

---

## 11. File Structure & Module Map

```
PRONTO/
├── admin.html                          ← [NEW] Admin HTML entry point
├── vercel.json                         ← [MODIFY] Add admin rewrite rule
├── vite.config.ts                      ← [MODIFY] Add multi-page entry
├── scripts/
│   └── setup-admin.ts                  ← [NEW] One-time admin user creation
├── api/
│   ├── admin/                          ← [NEW] Admin serverless functions
│   │   ├── orders.ts                   ← GET /api/admin/orders
│   │   ├── approve-transfer.ts         ← POST /api/admin/approve-transfer
│   │   ├── dispatch-order.ts           ← POST /api/admin/dispatch-order
│   │   ├── mark-delivered.ts           ← POST /api/admin/mark-delivered
│   │   ├── products.ts                 ← GET /api/admin/products
│   │   ├── update-stock.ts             ← POST /api/admin/update-stock
│   │   ├── update-product.ts           ← POST /api/admin/update-product
│   │   ├── toggle-visibility.ts        ← POST /api/admin/toggle-visibility
│   │   └── dashboard-stats.ts          ← GET /api/admin/dashboard-stats
│   ├── lib/
│   │   ├── firebaseAdmin.ts            ← [EXISTING] Reused by admin endpoints
│   │   ├── adminAuth.ts                ← [NEW] Admin token verification helper
│   │   └── orderApproval.ts            ← [NEW] Shared approve+deduct-stock logic
│   └── ...existing serverless functions
├── src/
│   ├── admin/                          ← [NEW] Admin SPA module
│   │   ├── main.tsx                    ← Admin React entry point
│   │   ├── admin.css                   ← Admin-specific layout styles
│   │   ├── AdminApp.tsx                ← Auth gate + hash router
│   │   ├── types.ts                    ← Admin-specific TypeScript types
│   │   ├── services/
│   │   │   └── adminApi.ts             ← Client-side fetch wrappers for /api/admin/*
│   │   └── components/
│   │       ├── AdminLogin.tsx           ← Login form
│   │       ├── AdminLayout.tsx          ← Sidebar + topbar + content shell
│   │       ├── AdminSidebar.tsx         ← Navigation sidebar
│   │       ├── AdminTopbar.tsx          ← Page title + user menu
│   │       ├── AdminDashboard.tsx       ← Dashboard KPI view
│   │       ├── MetricCard.tsx           ← Reusable KPI card component
│   │       ├── AdminOrders.tsx          ← Order management view
│   │       ├── OrderTable.tsx           ← Sortable order data table
│   │       ├── OrderDetailPanel.tsx     ← Slide-over order inspector
│   │       ├── StatusBadge.tsx          ← Reusable status badge component
│   │       ├── AdminInventory.tsx       ← Inventory management view
│   │       ├── InventoryTable.tsx       ← Product stock data table
│   │       ├── StockAdjustModal.tsx     ← Stock adjustment modal
│   │       └── ProductEditModal.tsx     ← Product editor modal
│   ├── types/index.ts                  ← [MODIFY] Extend OrderStatus + Order
│   ├── utils/                          ← [EXISTING] Reused (formatCLP, validateRut, etc.)
│   └── ...existing storefront code
```

### 11.1 Key Design Principle: Admin Module Isolation

The `src/admin/` directory is a **self-contained module**:
- It imports from `src/types/`, `src/utils/`, and `src/services/firebase.ts` (for Firebase Auth initialization).
- It does **NOT** import any storefront components from `src/components/`.
- The storefront code does **NOT** import anything from `src/admin/`.
- This ensures the storefront bundle is completely unaffected.

---

## 12. CSS Strategy & Design Tokens

### 12.1 Approach: Separate `admin.css` with Shared Tokens

Create `src/admin/admin.css` that:
1. Imports the Google Fonts link (same DM Sans + JetBrains Mono).
2. Copies the `:root` design token block from `src/index.css` (or imports it via a shared `tokens.css` if the implementing agent prefers to DRY it up).
3. Contains all admin-specific layout, sidebar, table, modal, and component styles.

### 12.2 Token Sharing Options

> **Decision for implementing agent:** Two valid approaches exist:
> 
> **Option A (Simpler):** Copy the `:root` tokens block into `admin.css`. ~80 lines of duplication, but zero risk of storefront regressions.
> 
> **Option B (DRYer):** Extract tokens into `src/tokens.css`, then have both `src/index.css` and `src/admin/admin.css` `@import './tokens.css'`. Cleaner but requires touching `index.css`.
> 
> Either is acceptable. Option A is recommended for Phase 4 since it avoids touching the storefront CSS.

### 12.3 Admin-Specific CSS Classes (Naming Convention)

All admin CSS classes use the `admin-` prefix to avoid any possibility of collision:

```css
.admin-shell { ... }
.admin-sidebar { ... }
.admin-sidebar-nav-item { ... }
.admin-sidebar-nav-item--active { ... }
.admin-topbar { ... }
.admin-content { ... }
.admin-metric-card { ... }
.admin-data-table { ... }
.admin-data-table th { ... }
.admin-status-badge { ... }
.admin-status-badge--pagado { ... }
.admin-slide-panel { ... }
.admin-modal-overlay { ... }
.admin-modal { ... }
.admin-login { ... }
.admin-login-form { ... }
```

---

## 13. Testing Strategy

### 13.1 Unit Tests (Vitest)

Tests go in `src/tests/admin/`:

| Test File | What It Covers |
|---|---|
| `AdminApp.test.tsx` | Auth gate: renders login when unauthenticated, renders portal when admin |
| `AdminLogin.test.tsx` | Form validation, submit behavior, error display |
| `AdminDashboard.test.tsx` | KPI cards render with correct data, placeholder cards visible |
| `AdminOrders.test.tsx` | Order table rendering, status filter chips, search functionality |
| `OrderDetailPanel.test.tsx` | Order detail display, action buttons conditional rendering |
| `AdminInventory.test.tsx` | Inventory table rendering, stock level color coding |
| `StockAdjustModal.test.tsx` | Stock adjustment controls, validation, submit |
| `StatusBadge.test.tsx` | Correct colors for each status |

### 13.2 API Endpoint Tests

Tests in `src/tests/api/admin/`:

| Test File | What It Covers |
|---|---|
| `adminAuth.test.ts` | Token verification, missing header, invalid token, non-admin user |
| `approve-transfer.test.ts` | Successful approval, idempotency, stock deduction, order not found |
| `dispatch-order.test.ts` | Status transition, carrier validation, tracking code |
| `update-stock.test.ts` | Stock adjustment, negative stock prevention, reason logging |

### 13.3 Test Count Estimate

- ~20-25 component tests
- ~15-20 API endpoint tests
- **Target: 35-45 new tests**, maintaining 100% test reliability alongside existing 201+ tests

---

## 14. Environment Variables

### 14.1 No New Server-Side Variables

The admin serverless functions reuse the **exact same** Firebase Admin credentials already configured:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

### 14.2 No New Client-Side Variables

The admin portal reuses the existing `VITE_FIREBASE_*` client config for Firebase Auth initialization.

### 14.3 Script-Only Variable

For the one-time setup script only (not deployed):
- `ADMIN_INITIAL_PASSWORD` — initial password for the admin account (used only during `setup-admin.ts` execution)

---

## 15. Guardrails & Constraints

Per [AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/AGENTS.md) §2:

| Guardrail | Compliance |
|---|---|
| ❌ No Redux/Zustand/MobX | ✅ Admin state managed with `useState`, `useReducer`, `useEffect` |
| ❌ No Express/NestJS/Koa | ✅ Admin APIs are individual Vercel Serverless Functions in `api/admin/` |
| ❌ No Tailwind/Bootstrap/MUI/Chakra | ✅ Admin CSS is handcrafted Vanilla CSS with shared design tokens |
| ❌ No Docker/K8s/complex CI | ✅ Deploys with standard `pnpm dlx vercel` |
| ❌ No GraphQL/heavy ORMs | ✅ Direct Firestore queries via `firebase-admin` |
| ✅ CLP integers only | ✅ All pricing uses `formatCLP()` and integer math |
| ✅ Firestore security rules | ✅ All admin mutations go through serverless API → `firebase-admin` (bypasses rules) |

**Additional admin-specific guardrails:**
- ❌ **Never expose admin data through client-side Firestore queries.** Always go through `/api/admin/*`.
- ❌ **Never install a client-side routing library** (React Router, Wouter). Use hash-based routing.
- ❌ **Never add admin components to the storefront bundle.** The `src/admin/` module must be entirely isolated.
- ✅ **Always verify admin token** on every serverless endpoint. Use the `verifyAdminToken()` middleware.

---

## 16. Decisions Left to Implementing Agent

These are intentionally under-specified to allow the implementing agent flexibility on minor implementation details:

1. **Exact component decomposition** within `AdminOrders.tsx` / `AdminInventory.tsx` — the agent may split into more sub-components if complexity warrants it.
2. **Table sorting implementation** — inline sort state with `useMemo` or external sort utility. Agent's choice.
3. **Loading/skeleton states** — use shimmer skeletons, spinner, or loading text. Agent's discretion.
4. **Error toast/notification pattern** — can reuse the storefront's toast pattern or create an admin-specific one.
5. **CSS animation details** — sidebar hover transitions, modal enter/exit animations, table row hover effects.
6. **Date formatting** — exact relative-time formatting library or manual implementation (e.g. "hace 2 horas" vs. "16/09/2026 14:30"). Use `Intl.RelativeTimeFormat` for locale-aware formatting.
7. **Pagination cursor management** — exact Firestore cursor handling pattern for the orders list.
8. **Option A vs B for CSS tokens** — see §12.2.
9. **Admin Settings view content** — this is explicitly a placeholder for Phase 4. The implementing agent can decide whether to show basic store info or just a "Coming soon" message.
10. **Mobile sidebar animation** — transform-based slide or opacity-based. Agent's choice.

---

## Appendix: Effort Estimation

| Component | Estimated Effort |
|---|---|
| Admin entry point setup (HTML, Vite config, Vercel rewrites) | 1-2 hours |
| Authentication (login, auth gate, setup script) | 2-3 hours |
| Admin layout shell (sidebar, topbar, routing) | 2-3 hours |
| Admin CSS (`admin.css`) | 3-4 hours |
| Dashboard view + KPI cards | 3-4 hours |
| Orders management view (table, filters, detail panel) | 4-6 hours |
| Inventory management view (table, stock modal, product editor) | 4-5 hours |
| Serverless API endpoints (9 endpoints + auth middleware) | 4-6 hours |
| Type system updates | 1 hour |
| Unit tests (35-45 tests) | 3-4 hours |
| **Total estimated effort** | **~2-3 working days** |
