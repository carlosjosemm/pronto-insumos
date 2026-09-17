# PRONTO Client Services & Integration Guide (`src/services/`)

This directory contains the **client-side integration adapters** for PRONTO. It abstracts external APIs, database queries, payment gateway preferences, and messaging services away from the UI components.

---

## 🎯 1. Directory Scope & Service Adapters

* **Role:** Data fetching, client-side database reads/writes, external payment preference calls, and communication helpers.
* **Key Files:**
  * [`api.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/services/api.ts): Storefront data operations (`fetchProducts`, `fetchProductById`, `submitOrder`).
  * [`cartStorage.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/services/cartStorage.ts): Browser `localStorage` shopping cart persistence adapter (`saveCartToStorage`, `loadCartFromStorage`, `clearCartFromStorage`, `revalidateCartAgainstCatalog`) supporting schema versioning (`pronto_cart_v1`), 7-day TTL retention, quota error defense, and catalog stock revalidation.
  * [`firebase.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/services/firebase.ts): Initializes the Google Firebase Web Client SDK (`initializeApp`, `getFirestore`, `getAuth`) using Vite public variables.
  * [`mercadopago.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/services/mercadopago.ts): Client payment adapter invoking the `/api/create-preference` serverless endpoint to retrieve Mercado Pago Checkout Pro URLs.
  * [`whatsapp.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/services/whatsapp.ts): URL builder for WhatsApp Business order inquiries and instant support (`https://wa.me/...`).

---

## 🚫 2. Anti-Overshooting & Networking Guardrails

1. **NO Heavy Data Libraries:**
   * Do **NOT** install Axios, React Query / TanStack Query, SWR, Apollo Client, or GraphQL.
   * Standard browser `fetch()` combined with async/await and typed TypeScript models is completely sufficient.
2. **Keep Business Logic Out of Components:**
   * UI components should never call `fetch()` or query Firestore collections directly. All network and database operations must be wrapped in clean, reusable functions in this directory.
3. **No Redundant Mock Servers:**
   * Do not introduce MSW (Mock Service Worker) or complex mock servers. Local fallback behavior is handled cleanly inside the service functions using fixtures from [src/data/products.ts](file:///c:/Users/ecmv2/Documents/PRONTO/src/data/products.ts).

---

## 🔒 3. Security, Payment & Runtime Rules

1. **Client Environment Variables Only (`import.meta.env`):**
   * This code executes in the browser. Only public environment variables prefixed with `VITE_` can be accessed (e.g., `import.meta.env.VITE_FIREBASE_API_KEY`, `import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY`).
   * ❌ **NEVER** reference private tokens or service account credentials here.
2. **Inventory Stock Safety:**
   * ❌ **FORBIDDEN:** Client service functions must **never** execute inventory deductions (`deductOrderStock`) or assign `'PAGADO_MERCADOPAGO'` to new orders.
   * When `submitOrder()` creates an order document in Firestore, it must set the status to `'PENDIENTE_PAGO_MERCADOPAGO'` or `'PENDIENTE_TRANSFERENCIA'`.
   * *As built in Task 0.1:* `deductOrderStock()` has been completely removed from client-side `api.ts`. All orders initialized via Mercado Pago are strictly stored with status `'PENDIENTE_PAGO_MERCADOPAGO'`. Physical stock deduction is deferred entirely to the serverless webhook.
3. **Graceful Fallbacks for Development & Tests:**
   * If Firebase credentials are not provided or the network is unreachable in test environments, service functions must fall back gracefully to local mock data rather than crashing the application.
   * Always log informative console warnings when operating in fallback mode.
4. **Canonical Order ID Generation:**
   * Ensure `submitOrder()` and `processMercadoPagoPayment()` share the exact same `orderId` (e.g., `PRONTO-XXXXXX`) so Mercado Pago's `external_reference` matches the Firestore order document ID.
   * *As built in Task 0.3:* [`generateOrderId()`](file:///c:/Users/ecmv2/Documents/PRONTO/src/services/api.ts) creates canonical order identifiers (`PRONTO-XXXXXX`). [`CheckoutModal.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/CheckoutModal.tsx) generates this canonical ID upfront and passes it directly to `processMercadoPagoPayment`, `submitOrder`, and WhatsApp quotes.

