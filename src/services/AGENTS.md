# PRONTO Client Services & Integration Guide (`src/services/`)

As-built technical reference for the client-side integration layer of PRONTO Insumos Odontológicos: Firestore queries, payment preference proxying, browser persistence, and WhatsApp communications. UI components never call `fetch()` or query Firestore directly — they invoke the typed adapters in this directory.

---

## 🎯 1. Directory Scope & Service Architecture

- **Role:** Data and integration adapter layer between UI components and external boundaries.
- **Philosophy:** No client state/query libraries (no Axios, TanStack Query, Apollo). Pure TypeScript + native `fetch()` with defensive `catch (err: unknown)` degradation (§5).
- **Runtime:** Browser (Vite). Only `import.meta.env.VITE_*` variables — never server secrets.

### 1.1 Service Adapters & File Map

| Service Module | Purpose & Domain Responsibility | Boundary |
| :--- | :--- | :--- |
| [`api.ts`](./api.ts) | `fetchProducts()` catalog queries with offline fallback, `generateOrderId()`, `submitOrder()` Firestore order registration, `validatePromo()` against static `MOCK_PROMOS` (returns the canonical entry from `resolvePromo`). | Firebase Web SDK Firestore + `../data/products` fixtures |
| [`cartStorage.ts`](./cartStorage.ts) | Persistent cart in `localStorage` (`pronto_cart_v1`): schema versioning, 7-day TTL, quota defense, duplicate consolidation, live-catalog revalidation. | Browser `localStorage` |
| [`firebase.ts`](./firebase.ts) | Firebase Web SDK init (`initializeApp`, `getFirestore`, `getAuth`) from `VITE_FIREBASE_*`. Also exports `seedProductsToFirestore()` — **retained but uncalled** (the public seed button was removed; catalog seeding now goes through `pnpm run schema:seed*`). | Google Firebase Client SDK |
| [`firestoreEnv.ts`](./firestoreEnv.ts) | Client-side resolver: production (`orders`, `products`) vs isolated `dev_*` collections. | `import.meta.env` detector |
| [`mercadopago.ts`](./mercadopago.ts) | `createMercadoPagoPreference()` → `POST /api/create-preference`; `processMercadoPagoPayment()` redirects to Checkout Pro `initPoint`. **No promo code is sent** — the endpoint resolves it from the order document it already registered. Also exports `MERCADOPAGO_PUBLIC_KEY` (`VITE_MERCADOPAGO_PUBLIC_KEY`). | Serverless `/api/create-preference` |
| [`orderConfirmation.ts`](./orderConfirmation.ts) | Fire-and-forget proxy to `/api/order-confirmation` for transfer & WhatsApp-quote orders. Never throws; returns `boolean`. | Serverless `/api/order-confirmation` |
| [`orderTracking.ts`](./orderTracking.ts) | `fetchOrderTracking()` → `/api/track-order` with client-side `validateRut` Modulo-11 gate first. | Serverless `/api/track-order` |
| [`transferVoucher.ts`](./transferVoucher.ts) | `validateVoucherFile()` (PDF/PNG/JPG ≤ 5 MB — the **only** place these are enforced), `fileToDataUrl()`, `uploadTransferVoucher()` → `/api/upload-voucher`. | Serverless `/api/upload-voucher` |
| [`whatsapp.ts`](./whatsapp.ts) | `generateWhatsAppQuoteUrl()`: pre-formatted `wa.me` quote with itemized list, tax-inclusive total, and SIS registry line. Reads `import.meta.env?.VITE_WHATSAPP_NUMBER` with its own `56929831595` fallback. | WhatsApp Click-to-Chat |

---

## 📦 2. Catalog Data & Order Registration (`api.ts`)

### 2.1 Canonical Order ID & Document-Key Alignment

`generateOrderId()` produces the canonical order code — **`PRONTO-` + six digits** (as built):

```typescript
export function generateOrderId(): string {
  return 'PRONTO-' + Math.floor(100000 + Math.random() * 900000)
}
```

- **Direct Document Key Storage:** `submitOrder()` writes with
  `setDoc(doc(db, getCollectionName('orders'), orderId), payload)`, so the Firestore **Document ID equals the canonical Order ID** (e.g. `PRONTO-483921`) — O(1) lookups for admin/serverless endpoints, with the `where('orderId','==')` fallback documented in `api/AGENTS.md` §8.1.
- **Shared Reference:** the same `orderId` is reused as the Firestore doc key, Mercado Pago `external_reference`, voucher filenames, and WhatsApp message text.

### 2.2 Resilient Catalog Fetching (`fetchProducts()`)

1. Requires `VITE_FIREBASE_PROJECT_ID` + `VITE_FIREBASE_API_KEY`; without them it returns the local `PRODUCTS` fixture immediately.
2. Races the Firestore `getDocs` against a **2.5 s timeout** — a hung SDK read falls back to `PRODUCTS` with a `console.warn`.
3. Firestore results are filtered to `isActive !== false`; an **empty snapshot** also falls back to the local fixture.
4. After client-side `category`/`search`/`inStockOnly`/`sortBy` filtering, in-stock products are always partitioned ahead of out-of-stock (stable) so depleted supplies sink to the bottom without disturbing the requested ordering.

### 2.3 Dynamic Collection Namespacing (`firestoreEnv.ts`)

`getCollectionName('products')` resolves the environment-scoped collection. Resolution order (as built):

1. Explicit `VITE_FIRESTORE_ENV` (`development`/`dev`, `production`/`prod`, `test`).
2. `import.meta.env.MODE === 'test'` → `test` (canonical names for Vitest determinism).
3. `import.meta.env.DEV` → `development` (`dev_*`).
4. `import.meta.env.VITE_VERCEL_ENV === 'preview'` → `development`. This define is injected by `vite.config.ts` from `process.env.VERCEL_ENV`; in practice `env:sync` already sets `VITE_FIRESTORE_ENV=development` on Preview targets, making this a second safety net.
5. Default → `production` (canonical names).

⚠️ `VITE_VERCEL_ENV` is not listed in `.env.example` (it is a build-time `define`, not a real env read).

### 2.4 Order Registration (`submitOrder()`)

- Maps `paymentMethod` → `PENDIENTE_PAGO_MERCADOPAGO` / `PENDIENTE_TRANSFERENCIA` / `COTIZACION_SOLICITADA_WHATSAPP` — the only statuses `firestore.rules` `isValidOrderCreate()` accepts.
- Builds the `billing` block (defaults `calculateTaxBreakdown(totalAmount)` + `PENDIENTE_EMISION_SII`) and snapshots `items` as `{ productId, name, quantity, price }`.
- **Task 0.9 — server-verifiable amount trail:** `totalAmount` is **recomputed** from the item lines with `computeCartTotal` (`src/utils/orderTotal.ts`) — the same helper `create-preference` charges and the webhook asserts — not the client-supplied `total`. When a `promoCode` is provided, the percent is resolved from `src/config/promos.ts` (never trusted from the client) and the order persists `promoCode` (trimmed, upper-cased) + `discountAmount` (list subtotal − total); no promo fields are written when no valid code is given. **This persisted `promoCode` is the single input `create-preference` charges from**, so the order document — not the request body — decides the discount.
- ⚠️ **The Firestore write is swallowed:** `setDoc` failures (rules denial, offline) are caught, logged, and the function still returns `success: true`. `CheckoutModal` therefore proceeds to payment/confirmation even when the order was never persisted. See §6.

---

## 💾 3. Cart Persistence & Revalidation (`cartStorage.ts`)

- **Storage Key & Schema:** `pronto_cart_v1`, wrapper:

  ```typescript
  interface StoredCartData {
    version: number          // === CART_STORAGE_VERSION (1)
    savedAt: number          // epoch ms (Date.now())
    items: CartItem[]
    appliedPromo: PromoCode | null   // required key, null when none
  }
  ```

- **7-Day TTL:** `Date.now() - savedAt > CART_MAX_TTL_MS` → entry purged.
- **Defensive guards:** `window`/storage absence, `QuotaExceededError`, corrupt JSON → purge + `null`.
- **The promo is re-resolved on load (never trusted from storage):** `appliedPromo` is rebuilt with `resolvePromo(data.appliedPromo?.code)`, so a hand-edited `discountPercent`/`label` is discarded and a code that is no longer in `MOCK_PROMOS` is dropped entirely. The persisted percent/label are display snapshots — they must never reach a total (see [src/config/AGENTS.md](../config/AGENTS.md)).
- **Load-time consolidation:** duplicate `product.id` lines are merged by summing quantities; invalid items filtered.
- **`revalidateCartAgainstCatalog()`** on catalog arrival: removes discontinued/`!inStock`/zero-stock items, clamps quantity to live `stockCount` (default ceiling 99 when `stockCount` is absent), swaps in the live product object (price/spec sync), and returns `{ items, removedCount, adjustedCount, hasChanges }` for the UI toast.

---

## 🔒 4. Security & Inventory Protection Rules

1. **Browser Isolation (Vite public variables only):** only `import.meta.env.VITE_*` is referenced. ❌ Never server secrets (`MERCADOPAGO_ACCESS_TOKEN`, `FIREBASE_PRIVATE_KEY`).
2. **Zero Client-Side Stock Decrement:** `submitOrder()` never touches inventory; orders start `PENDIENTE_*`. Decrement authority = the verified webhook + admin transactions.
3. **Zero Card Handling (PCI-DSS):** `processMercadoPagoPayment()` never accepts card data — it requests a preference URL and redirects to hosted Checkout Pro.
4. **Commercial contact data lives in [`../config/contact.ts`](../config/contact.ts):**
   - `WHATSAPP_NUMBER` (digits only, from `VITE_WHATSAPP_NUMBER`), `WHATSAPP_DISPLAY` (`+56 9 XXXX XXXX`), `whatsappLink(text?)` are the single source of truth — no component may hardcode a `wa.me` URL.
   - **`whatsapp.ts` is a deliberate exception** and keeps its own `import.meta.env?.VITE_WHATSAPP_NUMBER || '56929831595'` read (the `?.` keeps it importable under plain Node/tsx for ops scripts). The fallback literal and env lookup now live in two places and can drift — both currently read `56929831595`; when consolidated, `contact.ts` becomes the only reader.
   - **Known outstanding exception:** `PaymentReturnModal.tsx` still builds its `wa.me` URL from a literal with a stale `56912345678` fallback (see `src/components/AGENTS.md` §4.1.2).
5. **`firebase.ts` calls `getAuth(app)` unguarded at module scope — known, deliberately unfixed:**
   - A missing/invalid `VITE_FIREBASE_API_KEY` throws `auth/invalid-api-key` at import time, aborting the whole import graph → blank page instead of the offline catalog fallback.
   - Not worked around because a proper fix makes `auth` nullable and breaks `src/admin/services/adminApi.ts`, `AdminApp.tsx`, `AdminLogin.tsx`. **Do not narrow `auth` unilaterally** — it is its own reviewed task.
   - Practical consequence: the repo requires populated `VITE_FIREBASE_*` vars for the storefront to render at all.

---

## 🧯 5. Error-Handling Conventions (`catch` clauses)

- **`catch` parameters are `unknown`, never `any`** (`no-explicit-any` is an error). Each site narrows before reading a message:

  ```ts
  } catch (err: unknown) {
    console.warn('Endpoint /api/track-order no disponible, usando fallback:', err instanceof Error ? err.message : err)
  }
  ```

- **Applies to:** `api.ts` (`fetchProducts`, `submitOrder`), `firebase.ts` (`seedProductsToFirestore`), `mercadopago.ts`, `orderTracking.ts`, `orderConfirmation.ts`, `transferVoucher.ts` (`cartStorage` uses untyped catches, which are implicitly `unknown` under strict TS).
- **Do not "simplify" back to `any`.** Passing the raw error object to `console.warn` (as `firebase.ts` does) is the approved alternative when the original value matters.

---

## ⚠️ 6. Simulated Fallbacks — Known Degradation Contracts

Several adapters respond to endpoint failure by returning **fabricated success payloads** instead of errors. This kept demos/tests alive but means real failures are masked — treat these as deliberate-but-risky as-built behaviour:

| Adapter | Behaviour on failure | Consequence |
| :--- | :--- | :--- |
| `submitOrder()` (api.ts) | `setDoc` throw → warn → `success: true` | Checkout proceeds and payment can be initiated for an order that **was never persisted** (webhook then can't find it). |
| `createMercadoPagoPreference()` / `processMercadoPagoPayment()` (mercadopago.ts) | **Any** fetch failure incl. HTTP 4xx/5xx → `success: true, initPoint: undefined`; the payment call then returns a fabricated `status: 'approved'` record (ignored by `CheckoutModal`, which only awaits it) | A server-side stock rejection (400) produces **no redirect and no error** — the customer lands on the confirmation step with a `PENDIENTE_PAGO_MERCADOPAGO` order that can never be paid. |
| `fetchOrderTracking()` (orderTracking.ts) | Network/throwable failure → fabricated `PENDIENTE_TRANSFERENCIA` order for the queried ID | A transient outage renders fake tracking data. Non-OK HTTP responses *do* surface the real error message. |
| `uploadTransferVoucher()` (transferVoucher.ts) | **Any** failure incl. 401 RUT mismatch, 404, 500 → `success: true` with a `simulated-voucher://` URL | Customer sees "Comprobante recepcionado exitosamente" while **nothing was stored** — silent voucher loss. |
| `sendOrderConfirmationEmail()` (orderConfirmation.ts) | Failure → `false` | Correctly silent by design (fire-and-forget). |

When these are revisited, the direction is: simulated fallback **only** when the endpoint is demonstrably absent (network error in dev), never on real HTTP error responses — and `submitOrder` must propagate persistence failure so checkout can block payment initiation.
