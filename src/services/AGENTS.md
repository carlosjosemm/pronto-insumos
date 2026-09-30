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
| [`api.ts`](./api.ts) | `fetchProducts()` catalog queries returning a source-aware `CatalogResult` (`products` filtered view + `catalog` unfiltered set + `source`), `generateOrderId()`, `submitOrder()` Firestore order registration, `validatePromo()` against static `MOCK_PROMOS` (returns the canonical entry from `resolvePromo`). | Firebase Web SDK Firestore + `../data/products` fixtures (dev/demo only since Task 2.11) |
| [`cartStorage.ts`](./cartStorage.ts) | Persistent cart in `localStorage` (`pronto_cart_v1`): schema versioning, 7-day TTL, quota defense, duplicate consolidation, live-catalog revalidation. | Browser `localStorage` |
| [`firebase.ts`](./firebase.ts) | Firebase Web SDK init (`initializeApp`, `initializeFirestore` **with `ignoreUndefinedProperties: true`**, `getAuth`) from `VITE_FIREBASE_*`. The Firestore setting is load-bearing: the SDK throws `Unsupported field value: undefined` on the optional domain fields (`razonSocial?`, `giroComercial?`, `sanitaryVerification?`) unless it is set — the Task 0.11 "ghost order" root cause, pinned by `src/tests/services/firebase.test.ts`. Also exports `seedProductsToFirestore()` — **retained but uncalled** (the public seed button was removed; catalog seeding now goes through `pnpm run schema:seed*`). | Google Firebase Client SDK |
| [`firestoreEnv.ts`](./firestoreEnv.ts) | Client-side resolver: production (`orders`, `products`) vs isolated `dev_*` collections. | `import.meta.env` detector |
| [`mercadopago.ts`](./mercadopago.ts) | `createMercadoPagoPreference()` → `POST /api/create-preference`; `processMercadoPagoPayment()` redirects to Checkout Pro `initPoint`. **No promo code is sent** — the endpoint resolves it from the order document it already registered. **Success semantics (Task 2.17):** success means exactly "a real Checkout Pro redirect was initiated" — a `200` response without a usable `initPoint` (and not marked `isSimulated`) is a **failure**, and no payment id, status or timestamp is ever fabricated client-side (the webhook is the only payment-status authority). Also exports `MERCADOPAGO_PUBLIC_KEY` (`VITE_MERCADOPAGO_PUBLIC_KEY`). | Serverless `/api/create-preference` |
| [`orderConfirmation.ts`](./orderConfirmation.ts) | Fire-and-forget proxy to `/api/order-confirmation` for transfer & WhatsApp-quote orders. Never throws; returns `boolean`. | Serverless `/api/order-confirmation` |
| [`orderSession.ts`](./orderSession.ts) | Session order marker in `sessionStorage` (`pronto_session_order_v1`, Task 2.12): `rememberSessionOrderId()` / `getSessionOrderId()` / `isSessionOrder()` / `forgetSessionOrderId()`. It answers "did *this tab* create this order?" — the only condition under which the Mercado Pago return URL may reset the persisted cart. | Browser `sessionStorage` |
| [`orderTracking.ts`](./orderTracking.ts) | `fetchOrderTracking()` → `/api/track-order` with client-side `validateRut` Modulo-11 gate first. | Serverless `/api/track-order` |
| [`simulationPolicy.ts`](./simulationPolicy.ts) | `isSimulatedFallbackAllowed()` — client-side gate (Task 2.8): simulated fallbacks only outside a production runtime (`VITE_VERCEL_ENV`) or with the strict `VITE_ALLOW_SIMULATED_PAYMENTS='true'` opt-in. Injectable env → pure and unit-testable. | `import.meta.env` detector |
| [`transferVoucher.ts`](./transferVoucher.ts) | `validateVoucherFile()` (PDF/PNG/JPG ≤ 5 MB — the client-side UX gate; the server re-validates), `resolveVoucherContentType()`, and `uploadTransferVoucher()` → **sign → direct PUT → confirm** against `/api/upload-voucher` + Cloud Storage (Task 2.9). | Serverless `/api/upload-voucher` + Firebase Storage (signed URL) |
| [`whatsapp.ts`](./whatsapp.ts) | `generateWhatsAppQuoteUrl()`: pre-formatted `wa.me` quote with itemized list, tax-inclusive total, and SIS registry line. Resolves its link through `whatsappLink()` from `../config/contact` — no env read of its own since Task 2.10. | WhatsApp Click-to-Chat |

---

## 📦 2. Catalog Data & Order Registration (`api.ts`)

### 2.1 Canonical Order ID & Document-Key Alignment

`generateOrderId()` produces the canonical order code — **`PRONTO-` + 8 Crockford base32 characters** (Task 8.8; 40 bits ≈ 1.1 × 10¹² ids):

```typescript
const ORDER_ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32: no I, L, O, U
const ORDER_ID_LENGTH = 8

export function generateOrderId(): string {
  const bytes = new Uint8Array(ORDER_ID_LENGTH)
  crypto.getRandomValues(bytes)          // CSPRNG; 256 % 32 === 0 → zero modulo bias
  return 'PRONTO-' + Array.from(bytes, (byte) => ORDER_ID_ALPHABET[byte % ORDER_ID_ALPHABET.length]).join('')
}
```

- **Why it changed (Task 8.8):** the previous `PRONTO-` + six `Math.random()` digits covered only 900 000 values, and the public tracking endpoint answered `404` for an unknown id but `401` for a wrong RUT — an enumeration oracle that made the id space walkable against a publicly known clinic RUT (and a collision surfaced as a generic rules-denied checkout error as volume grew). `src/tests/services/api.test.ts` pins the alphabet, the 200-draw uniqueness and a **source guard** that fails if the generator ever returns to `Math.random`.
- **Legacy ids keep resolving:** nothing parses the format server-side — `resolveOrderByCanonicalId` is an exact document-key/field match, so pre-8.8 `PRONTO-NNNNNN` orders (and the ids in older fixtures) still track, upload vouchers and confirm.
- **Direct Document Key Storage:** `submitOrder()` writes with
  `setDoc(doc(db, getCollectionName('orders'), orderId), payload)`, so the Firestore **Document ID equals the canonical Order ID** (e.g. `PRONTO-7K3M9Q2Z`) — O(1) lookups for admin/serverless endpoints, with the `where('orderId','==')` fallback documented in `api/AGENTS.md` §8.1.
- **Shared Reference:** the same `orderId` is reused as the Firestore doc key, Mercado Pago `external_reference`, voucher filenames, and WhatsApp message text.

### 2.2 Resilient Catalog Fetching (`fetchProducts()`) — Task 2.11

`fetchProducts()` returns a `CatalogResult`, not a bare array, so no caller can mistake fabricated data for live data:

```ts
interface CatalogResult {
  products: Product[]            // filtered + sorted view the grid renders
  catalog: Product[]             // UNFILTERED source set — the category pills count from this
  source: 'firestore' | 'fixtures' | 'unavailable'
  error?: string                 // present only when source === 'unavailable'
}
```

`source` is `'firestore'` (the live catalog, the **only** source a persisted cart may be revalidated against), `'fixtures'` (the local `PRODUCTS` prototype catalog — development/demo only, never served in production, never authoritative for the cart) or `'unavailable'` (nothing could be loaded and fabricating a catalog is not allowed; `error` carries the customer-safe message).

| Situation | Production (`!isSimulatedFallbackAllowed()`) | Dev / preview (or `VITE_ALLOW_SIMULATED_PAYMENTS=true`) |
| :--- | :--- | :--- |
| Firestore returns ≥1 active product | `firestore` | `firestore` |
| `getDocs` rejects / returns empty / exceeds `CATALOG_FETCH_TIMEOUT_MS` | `unavailable` + `console.error` | `fixtures` + `console.warn` |
| Missing `VITE_FIREBASE_*` config | `unavailable` + `console.error` (see the caveat below) | `fixtures` |

1. **Bounded wait:** the `getDocs` race carries a **10 s** bound (`CATALOG_FETCH_TIMEOUT_MS`, relaxed from 2.5 s — a first load on slow Chilean mobile data routinely exceeded the old bound, which is what served fixtures to real shoppers). The timer is cleared once the read settles, and the Firestore SDK's own retry behaviour still applies underneath.
2. **Defensive document reads:** `category`/`search` comparisons read text fields with `?? ''` guards, so one legacy document missing `name`/`description`/`tag` cannot reject the whole catalog read.
3. After client-side filtering, in-stock products are always partitioned ahead of out-of-stock (stable) so depleted supplies sink to the bottom without disturbing the requested ordering.
4. ⚠️ **Caveat on the missing-config branch:** in the browser it is only reachable when the Firebase project id is absent while the API key is present — `src/services/firebase.ts` calls `getAuth(app)` unguarded at module scope and throws `auth/invalid-api-key` at import time otherwise (known gap, §4.6 / TODO 8.11). The branch is kept as defense-in-depth and is covered at the unit-test boundary.

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
- **Task 0.11 — root cause: the write never persisted.** Every checkout payload carries `undefined` optional fields (`customer.razonSocial`/`giroComercial`/`sanitaryVerification`, `billing.razonSocial`/`giroComercial` — boleta is the only reachable document type, `FACTURA_ENABLED = false`), and the Firestore Web SDK **rejects `undefined` by default** (`Unsupported field value: undefined`). The write therefore always threw; before this task the throw was swallowed, which is why the webhook kept logging `Order … not found`. `src/services/firebase.ts` now initializes Firestore with `ignoreUndefinedProperties: true` (pinned by `src/tests/services/firebase.test.ts`), so the optional keys are skipped at the persistence boundary and the order is actually written.
- **Task 0.11 — the Firestore write fails closed:** a rejected `setDoc` (rules denial, permission error) logs a `console.error` and returns `{ success: false, orderId, timestamp, total, itemsCount }` — never a fabricated success. `CheckoutModal`'s pre-existing `!result.success` guard therefore blocks payment initiation (no Mercado Pago preference, no confirmation email, no confirmation step), shows `No fue posible registrar el pedido en el sistema…`, and leaves the shopper on the Pago step to retry. Nuance: the Firestore Web SDK resolves locally-queued writes while offline (they sync on reconnect) — this contract covers **rejected** writes, the ghost-order vector. The raw cause is logged, not returned; the UI owns the customer-facing copy.

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

### 3.1 Session Order Marker (`orderSession.ts`) — Task 2.12

`sessionStorage` key `pronto_session_order_v1`. The marker is the **only** thing that authorizes the payment-return flow to reset the persisted cart:

| Function | Contract |
| :--- | :--- |
| `rememberSessionOrderId(orderId)` | Normalizes (`trim().toUpperCase()`) and stores the canonical id. Called by `CheckoutModal` **immediately after a successful `submitOrder()`** — before `processMercadoPagoPayment()` requests the Checkout Pro redirect, so the marker is already written when the browser leaves the tab. Empty/non-string ids and an unavailable store are silent no-ops. |
| `getSessionOrderId()` | The marker or `null`; `null` on any storage error (warns). |
| `isSessionOrder(orderId)` | `true` only for a normalized match. Fails safe: absent store, empty id, non-string or non-match ⇒ `false`, so a forged `?status=approved&orderId=…` can never reset a cart. |
| `forgetSessionOrderId()` | Drops the marker once its return has been consumed (`App`'s mount effect, next to `clearCartFromStorage()`), so replaying the URL from history/bookmarks cannot wipe a cart the shopper refilled after paying. Idempotent. |

- **Why `sessionStorage` and not `localStorage`:** the marker is per-tab and dies with the tab, and the Checkout Pro return is a same-tab `window.location.href` hop — so the marker survives the round trip while a crafted link opened elsewhere can never match it.
- **Recorded residual (accepted):** if the payment is completed in a *different* context (a second tab, an MP app hand-off), the marker lives in the tab that created the order, so a return landing in another tab no longer purges the persisted cart (pre-2.12 every `status=approved` URL did). The cart is normally already purged at order creation, so this only affects a cart repopulated afterwards in another tab; the deliberate trade-off is that the URL alone must never destroy a cart.
- **No PII:** the marker stores an order id only — never the customer's RUT or any identity field.

---

## 🔒 4. Security & Inventory Protection Rules

1. **Browser Isolation (Vite public variables only):** only `import.meta.env.VITE_*` is referenced. ❌ Never server secrets (`MERCADOPAGO_ACCESS_TOKEN`, `FIREBASE_PRIVATE_KEY`).
2. **Zero Client-Side Stock Decrement:** `submitOrder()` never touches inventory; orders start `PENDIENTE_*`. Decrement authority = the verified webhook + admin transactions.
3. **Zero Card Handling (PCI-DSS):** `processMercadoPagoPayment()` never accepts card data — it requests a preference URL and redirects to hosted Checkout Pro.
4. **Commercial contact data lives in [`../config/contact.ts`](../config/contact.ts):**
   - `WHATSAPP_NUMBER` (digits only, from `VITE_WHATSAPP_NUMBER`), `WHATSAPP_DISPLAY` (`+56 9 XXXX XXXX`), `whatsappLink(text?)` are the single source of truth — no component may hardcode a `wa.me` URL.
   - **`contact.ts` is the only env reader (Task 2.10, 2026-09-29):** `whatsapp.ts` used to keep its own `import.meta.env?.VITE_WHATSAPP_NUMBER || '56929831595'` read ("deliberate exception") and `PaymentReturnModal.tsx` its own literal + stale fallback — both now call `whatsappLink(…)`, so the env lookup and the fallback literal exist exactly once. `contact.ts` keeps the `?.` optional chain, which is what makes the consolidated graph importable under plain Node/tsx for ops scripts (`scripts/send-test-comms.ts` dynamic-imports `whatsapp.ts`; verified 2026-09-29 with `pnpm dlx tsx`). The single-source guard in `src/tests/config/contact.test.ts` fails the suite if `src/components/`, `src/services/` or `src/admin/` reintroduces a `wa.me` URL, a `569…` literal or a `VITE_WHATSAPP_NUMBER` read.
5. **Voucher bytes never transit the app as Base64 (Task 2.9):** `uploadTransferVoucher()` asks `/api/upload-voucher` for a short-lived signed PUT URL, uploads the raw `File` (with the signed `x-goog-content-length-range` cap header) straight to the private bucket, then confirms by object path. `fileToDataUrl()` was deleted with the old Base64 transport — do not reintroduce it, and never send voucher bytes to our own serverless functions.
6. **`firebase.ts` calls `getAuth(app)` unguarded at module scope — known, deliberately unfixed:**
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

## ⚠️ 6. Simulated Fallbacks — As-Built Failure Contracts (Task 2.8)

Adapters simulate **only** when the endpoint is demonstrably absent — a transport-level failure (fetch throw, unreadable response body) outside a production runtime, gated by `isSimulatedFallbackAllowed()` in [`simulationPolicy.ts`](./simulationPolicy.ts), the client mirror of `api/_lib/simulationPolicy.ts` (`VITE_VERCEL_ENV !== 'production'`, or the strict `VITE_ALLOW_SIMULATED_PAYMENTS='true'` opt-in). **Real HTTP error responses always surface as errors** — never a fabricated success. Production transport failures log via `console.error`; dev simulations keep the historical `console.warn`.

| Adapter | Transport failure (non-production) | Real HTTP 4xx/5xx |
| :--- | :--- | :--- |
| `fetchProducts()` (api.ts) | **RESOLVED (Task 2.11):** the fixture fallback is `source: 'fixtures'` and is unreachable in production (`unavailable` + retryable UI); the cart is never revalidated from it | n/a (SDK read) — a rejection/empty snapshot/timeout in production resolves to `source: 'unavailable'` with a customer-safe message |
| `submitOrder()` (api.ts) | ~~`setDoc` throw → warn → `success: true`~~ **RESOLVED (Task 0.11):** throw → `console.error` → `success: false` | Checkout blocks payment initiation and surfaces the registration error — no ghost orders. |
| `createMercadoPagoPreference()` / `processMercadoPagoPayment()` (mercadopago.ts) | Dev simulation preserved: `success: true, initPoint: undefined` — and **nothing else** (Task 2.17 removed the fabricated `approved` record entirely; a `200` without an `initPoint` is a failure, never a silent success) | `success: false` + the server's `error` message (e.g. the 400 stock rejection, the 409 lifecycle/total refusals, or the missing-`initPoint` failure); `CheckoutModal` blocks on the Pago step via `submitError` |
| `uploadTransferVoucher()` (transferVoucher.ts) | Simulated `simulated-voucher://` success **only** when the endpoint is demonstrably absent (non-JSON or network failure) **and** `isSimulatedFallbackAllowed()`; the message states the voucher was not stored. Task 2.9 rewrote the transport: sign → direct PUT (signed `x-goog-content-length-range`) → confirm | `success: false` + the server's message (`400/404/409/413/429/500/503` — e.g. a `409` lifecycle refusal, or the **uniform `404`** for an unknown order *and* a RUT mismatch since Task 8.8, plus `429` when the per-IP/per-order budget is locked); both call sites (`CheckoutModal`, `OrderTrackingModal`) render `res.error` |
| `fetchOrderTracking()` (orderTracking.ts) | Fabricated fallback order (dev/demo only) | Unchanged — already surfaced the real error message |
| `sendOrderConfirmationEmail()` (orderConfirmation.ts) | Failure → `false` | Correctly silent by design (fire-and-forget). |

Known limitation (recorded, deliberate): a 200 response without `initPoint` would still land the customer on confirmation — unreachable per the Task 0.9/0.10 server contract (200 ⇒ `initPoint`; failures are 4xx/5xx), so no client-side guard was added (anti-overshooting). Revisit if the endpoint contract changes.

When these are revisited, the direction is: simulated fallback **only** when the endpoint is demonstrably absent, never on real HTTP error responses, and always behind `isSimulatedFallbackAllowed()`. All rows are closed: `submitOrder` propagates persistence failure (Task 0.11), `mercadopago`/`orderTracking` surface real errors (Task 2.8) and `uploadTransferVoucher` was rewritten around the signed-upload flow (Task 2.9, superseding its Task 2.8 row).
