# PRONTO Automated Testing Guide (`src/tests/`)

This directory contains the **automated test suite** for PRONTO, powered by **Vitest**, **jsdom**, and **React Testing Library**.

---

## 🎯 1. Directory Scope & Organization

* **Role:** Ensures regression prevention, verifies business logic calculations (cart totals, Chilean tax, RUT check digits), and validates user interaction flows.
* **Directory Structure** (80 suites, 794 tests):
  * [`setup.ts`](./setup.ts): Test harness — registers `@testing-library/jest-dom`, injects `VITE_FIREBASE_*`/`VITE_WHATSAPP_NUMBER`/`VITE_MERCADOPAGO_PUBLIC_KEY` placeholders into `import.meta.env`, strips `FIRESTORE_ENV`/`VITE_FIRESTORE_ENV` so suites stay deterministic, and installs an in-memory `localStorage` mock. There are **no** `matchMedia`/`IntersectionObserver` globals — mock them per-suite if a component needs them.
  * `components/` (16 suites): storefront unit & interaction tests — `AppCartPersistence`, `AppCatalog` (new, Task 2.11), `AppPaymentReturn`, `Cart`, `CategoryFilter` (new, Task 2.11), `CategoryShowcase`, `CheckoutModal`, `ClinicalStorefront`, `ErrorBoundary`, `LegalModal` (Task 7.1: four policy sections, config-sourced legal ID, Escape/overlay close, section nav), `Navbar`, `OrderTrackingModal`, `PaymentReturnModal` (Task 2.10: the approved-state link is asserted through a sentinel `whatsappLink` mock, so the case fails if the modal rebuilds its own `wa.me` URL), `ProductCard`, `ProductDetailModal`, `ProductList`. `CheckoutModal.test.tsx` drives the 5-step guided flow through helpers (`fillContactStep`, `fillDespatchStep`, `fillDocumentStep`, `selectZone`, `advance`, `completeDataEntry`) — reuse them instead of hand-filling fields. Task 0.11 adds the order-registration failure block: `submitOrder` → `success: false` must render the error banner, never call `processMercadoPagoPayment`, and keep the shopper on the Pago step.
  * `admin/` (12 suites): backoffice UI tests (`AdminApp`, `AdminDashboard`, `AdminLogin`, `AdminSidebar`, `AdminTopbar`, `InventoryTable`, `MetricCard`, `OrderDetailPanel`, `OrderTable`, `ProductEditModal`, `StatusBadge`, `StockAdjustModal`).
  * `api/` (12 suites): public serverless endpoints — `abuseThrottle` (new, Task 8.8 — the throttling authority: `getClientIp` precedence incl. a spoofed `x-forwarded-for`, hash pseudonymity, the attempt/failure budgets and window reset, the locked-key no-write path, the absent-key no-bucket guard, fail-open on a throwing counter transaction and on an unbuildable counter ref, `expiresAt` as a `Timestamp`, `respondThrottled`'s `429` + `Retry-After`), `create-preference`, `email` (Resend layer), `firebaseAdmin` (new, Task 0.15), `mercadopago-signature`, `mercadopago-webhook`, `order-confirmation`, `orderLookup` (Task 0.12 — the canonical document-key-first resolver: key hit, legacy field fallback + warning, decoy preference, malformed-id guard; Task 8.8 adds the `respondOrderLookupFailed` contract), `simulationPolicy`, `track-order`, `upload-voucher`, `voucher-storage` (new, Task 2.9). The three dual-factor suites share the `helpers/throttleCounters.ts` double (an in-memory `abuse_counters` store whose composite transaction routes counter refs to the store and every other ref to the suite's order transaction), so they exercise the **real** counter code instead of silently fail-opening; `track-order`/`order-confirmation`/`upload-voucher` each pin the **byte-identical `404`** for an unknown id vs a wrong RUT, the `429` lock (IP and order keys), the failure recording and the locked-key "never reads the order" guarantee. **Task 8.8** also pins the warehouse-alert budget in `upload-voucher` (cooldown suppression, cap, the in-transaction reservation skip, and the failed-send release). `create-preference` covers the Task 0.9 price rebuild: tampered `unit_price`, a forged body `promoCode` (the **order document** wins), the `orderId`-field lookup fallback, unregistered orders → 400, paused products (`isActive: false`) → 400, and Admin-down → 503. Task 0.10 adds the production fail-closed gates: `simulationPolicy` (VERCEL_ENV semantics, strict `ALLOW_SIMULATED_PAYMENTS` opt-in, injected-env purity) plus the 500 paths and escape hatch in both endpoint suites — both suites delete `VERCEL_ENV`/`ALLOW_SIMULATED_PAYMENTS` in `beforeEach` (and restore in `afterAll`) so a developer shell can never flip them. Post-review, `simulationPolicy` also covers the shared `hasRealMercadoPagoToken` definition (both endpoints import it), and the webhook suite pins the verified-payment/Admin-down `500` gate plus its escape hatch. **Task 2.9** rewrites `upload-voucher` around the two-phase `sign`/`confirm` contract: the `dataUrl` → `400` gate, the 7-status `409` lifecycle loop, the signed `x-goog-content-length-range` cap + `maxBytes` echo, the no-write sign phase, "persist without ever storing Base64" (the `JSON.stringify(updatePayload) not.toContain('data:')` guard), duplicate-confirm idempotency, the TOCTOU re-assert inside the transaction (status changed mid-upload ⇒ `409` + object deleted), delete-after-commit ordering and the write-failure `500`. `voucher-storage` covers the new `api/_lib/voucherStorage.ts` helpers: content-type normalization, path building/prefix + traversal rejection, metadata size/type boundaries, the delete-prefix guard, the download-URL shape, bucket-name resolution (incl. `.env.example` placeholders ⇒ unconfigured) and the client↔server cap contract. **Tasks 0.15/0.16** add: `firebaseAdmin` — the `settings({ ignoreUndefinedProperties: true })` contract on the Admin instance (settings called exactly once, on the returned instance; missing credentials ⇒ `null` without touching Firestore; init failure ⇒ `null` + log), with `vi.resetModules()` + dynamic import so the module singleton is exercised per case; `track-order` — the production fail-closed `500` (response asserted free of the fabricated customer/amount), the `ALLOW_SIMULATED_PAYMENTS` escape hatch and the dev/preview simulated contract, alongside Task 0.12's decoy-shadowing and legacy-field-fallback cases; `dispatch-order` — a code-less dispatch asserting the update payload carries **no** `undefined` (deep scan; `JSON.stringify` would hide it) with the `trackingNumber` / `dispatch.trackingCode` keys absent, plus blank/whitespace and numeric-coercion edges. **Task 0.14** adds the reconciliation guards: `mercadopago-webhook` pins the MP verification gate (404 → 200, 401/500 → 502, incl. production with real credentials), the single signed payment id (query-first for signature and fetch), the status guards (CANCELADO/PENDIENTE_TRANSFERENCIA → `PAGO_EN_REVISION`; PAGADO/TRANSFERENCIA_APROBADA/DESPACHADO/ENTREGADO → incident, no status flip), the at-most-once deduction guard (`paidAt`/`approvedAt`), the refund/chargeback branch (paid → review; fulfilled/review-parked → incident; a different payment id or a `cancelled` notification is ignored) and the oversell shortfall metadata (`stockShortfalls`/`stockShortfall`, absent on a clean approval) plus its warehouse-alert sentence; `create-preference` pins the order-document line source (a divergent body is ignored, body `items` may be omitted, an order without items → 400); `approve-transfer`/`resolve-payment-review` assert their shortfall metadata + alert text, and `resolve-payment-review` pins the R1 `409` on an already-settled order (cancel still allowed); `email` pins the three new warehouse events and the shortfall sentence.
  * `api/admin/` (11 suites): admin serverless handlers (which live under `api/_lib/admin/` — see [api/AGENTS.md](../../../api/AGENTS.md) §1.2) — `adminAuth`, `approve-transfer`, `create-product`, `dashboard-stats`, `dispatch-order`, `firestoreEnv`, `order-history`, `resolve-payment-review` (approve ⇒ stock deduction, cancel ⇒ no stock, 409 outside review, idempotency, emails), `update-product`, `update-stock`, plus `admin-router` covering the `api/admin/[action].ts` dispatcher (action → 404 mapping, `OPTIONS` passthrough, all 12 actions mapped). **Coverage gap (TODO 4.2):** `orders`, `products`, `mark-delivered`, `toggle-visibility` have no dedicated suite.
  * `services/` (10 suites): client adapters — `api`, `cartStorage`, `firebase`, `firestoreEnv`, `mercadopago` (Task 2.8 error contract: HTTP 4xx/5xx ⇒ `success: false` + server message; production transport failure ⇒ loud error; dev simulation pinned), `orderConfirmation`, `orderTracking`, `simulationPolicy` (client gate: `VITE_VERCEL_ENV` semantics + strict opt-in), `transferVoucher` (Task 2.9 — the 3-call sign/PUT/confirm contract, the signed `x-goog-content-length-range` upload header, real HTTP errors surfacing, and the `VITE_VERCEL_ENV`-gated simulation pair), `whatsapp` (Task 2.10 — the quote link is asserted through a sentinel `contact.ts` mock, so the case fails if the service reintroduces its own `wa.me` URL or env read). `api` covers the Task 0.11 fail-closed write path: a rules-denial `setDoc` rejection ⇒ `success: false` with the computed totals preserved and no throw. `firebase` pins the `initializeFirestore(app, { ignoreUndefinedProperties: true })` contract — the Web SDK rejects `undefined` optional fields by default, which is what silently broke every checkout write (the Task 0.11 ghost-order root cause; Firestore is otherwise mocked everywhere, so this config assertion is the only unit-level guard).
  * `utils/` (7 suites): `rut`, `tax`, `currency`, `categoryAlias`, `schemaValidation`, `orderTotal` (Task 0.9 — payable-total math incl. the raw-CartItem `$0` pitfall regression), `voucherUrl` (Task 0.13 — the voucher-URL allowlist: storage host vs. `javascript:` / `data:text/html` / foreign-host / relative / non-string values, plus MIME normalization).
  * `hooks/` (2 suites): `useFocusTrap` (focus wrap/restore), `useIncrementalReveal` (page reveal/clamp; reveal is button-only — there is no IntersectionObserver path).
  * `config/` (3 suites): `bankDetails` env-override fallbacks **plus the `Fiscal RUT single-source guard` (Task 1.4)** — a `readFileSync` content assertion that `Footer.tsx`/`CheckoutModal.tsx` never hardcode a `77…892…410` literal in any form (plain, escaped-regex, or raw body; same pattern as `storefrontCss`/`firestore-rules`); `promos` — the forged-code gate (`resolvePromo`/`resolvePromoPercent`: case/trim normalisation, non-string inputs, prototype-key rejection, unknown ⇒ full price); and `contact` (Task 2.10) — env resolution (configured value, empty ⇒ `56929831595` fallback, a formatted `+56 9 …` value normalized to digits, a digit-free value ⇒ fallback) via `vi.stubEnv` + `vi.resetModules()` + dynamic import, `whatsappLink` encoding, **and the `WhatsApp single-source guard`**: a recursive `readFileSync` scan of `src/components/`, `src/services/` and `src/admin/` that fails on any `wa.me` URL, `569…` phone literal or `VITE_WHATSAPP_NUMBER` read, plus the `index.html` JSON-LD `telephone` assertion derived from the canonical constant.
  * `data/` (1 suite): `products` schema/fixture integrity (11 items, `unitOfSale` ≤60 chars, integer CLP prices, valid categories).
  * `scripts/` (2 suites): `syncEnvToVercel` pure plan logic (dry-run/skip/overwrite, per-target `FIRESTORE_ENV`, system-key filter) and `configureStorageCors` (Task 2.9) — CORS document validation (PUT method + the two required response headers, so a hand-edited file cannot silently break uploads), order/case-insensitive comparison against the live bucket, flag parsing (dry run unless `--apply`) and the `pnpm run storage:cors` wiring.
  * `security/` (3 suites): `firestore-rules` — asserts the rules file's allow/deny structure by `readFileSync` content match (Task 0.12 adds the id binding, the create-shape allowlist and the admin-only-field negatives); `orderCreateContract` (Task 0.12) — the drift guard that drives the **real** `submitOrder()` and asserts the captured payload is a subset of the `hasOnly([...])` allowlists parsed out of `firestore.rules`, plus the checkout `maxLength` ↔ rules length-cap pairing (there is no rules emulator, so this is the only thing standing between a payload change and every checkout being denied in production); `storage-rules` (Task 2.9) — the deny-all voucher-bucket rules, the `firebase.json` registration, the split `deploy:*` scripts and the bucket CORS config (incl. the signed `x-goog-content-length-range` request header).
  * `styles/` (1 suite): `storefrontCss` — stylesheet-content assertions for invariants jsdom cannot evaluate (the ≤560px single-column catalog grid and the surviving 561–768px 2-column rule), read via `readFileSync` like `firestore-rules.test.ts`.

---

## 🚫 2. Anti-Overshooting & Testing Guardrails

1. **Preserve Passing Tests (Zero Regression Policy):**
   * Currently, **all 794 tests across 80 test suites pass (100% passing)**.
   * ❌ **NEVER** comment out, delete, or skip (`test.skip`) failing tests to get a passing build. If a test fails after your changes, diagnose and fix the root cause.
2. **Speed & Efficiency:**
   * Automated tests must execute quickly without hanging.
   * Do not introduce arbitrary `sleep()` or `setTimeout()` delays. Use Vitest's `vi.useFakeTimers()` or React Testing Library's `waitFor()` when testing asynchronous behavior.
3. **Test User Behavior, Not Implementation:**
   * Test what the user sees and interacts with (accessible roles, buttons, labels, and visible feedback).
   * Avoid asserting on internal React component state or fragile CSS selector chains.
4. **Mocking Discipline:**
   * Unit tests must **never** touch live Firebase servers or real Mercado Pago APIs.
   * Mock network calls and external services at the boundary using `vi.fn()` or `vi.spyOn(global, 'fetch')`.
   * `setup.ts` provides non-empty `VITE_FIREBASE_*` placeholders, so `hasFirebaseConfig` is truthy in tests. Suites exercising `fetchProducts()` must mock `firebase/firestore` with an empty snapshot (`getDocs: vi.fn(async () => ({ empty: true, docs: [] }))`) to stay on the deterministic local-catalog fallback. The `VITE_WHATSAPP_NUMBER` placeholder is pinned to `56912345678` — assertions on rendered phone text depend on that literal (see §4.4).
   * Always clean up mocks in `afterEach(() => { vi.clearAllMocks(); })`.

---

## ⚡ 3. Running & Extending Tests

```bash
# Run all tests once
pnpm test

# Run tests in watch mode during active feature development
pnpm test:watch

# Generate code coverage report
pnpm test:coverage
```

### Writing New Tests Checklist

* [ ] Place test file mirroring the source file path (e.g., `src/utils/currency.ts` -> `src/tests/utils/currency.test.ts`).
* [ ] Test standard happy path.
* [ ] Test edge cases (invalid inputs, network error responses, empty arrays).
* [ ] Run `pnpm test` to verify zero regression across all test suites.
* [ ] Run `pnpm lint` — test files are **inside** the lint scope (see §4).

---

## 🧷 4. Typing Conventions Under `no-explicit-any`

`no-explicit-any` is an **error** across `src/tests/**`, so the suites do not use `any` for mock plumbing. The patterns below are load-bearing — prefer them over re-widening a type.

### 4.1 Mock return values

Cast through `unknown` using `ReturnType`/`Awaited` rather than `as any`, so a signature change upstream surfaces as a type error instead of silently passing:

```ts
// Firestore Admin doubles
vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
  mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
)

// Firebase Auth doubles
vi.mocked(firebaseAuthAdmin.getAuth).mockReturnValue({
  verifyIdToken: mockVerify
} as unknown as ReturnType<typeof firebaseAuthAdmin.getAuth>)
```

For `onAuthStateChanged`, the parameter is the SDK's `NextOrObserver<User>` union — type it as such and guard before invoking, since it may be an observer object rather than a function:

```ts
vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((_auth, callback: NextOrObserver<User>) => {
  if (typeof callback === 'function') callback(null)
  return () => {}
})
```

### 4.2 Captured responses and payloads

`mockRes.json` captures into `Record<string, unknown>`, and the mock is typed to match:

```ts
let jsonOutput: Record<string, unknown> = {}

json: vi.fn((data: unknown) => {
  jsonOutput = data as Record<string, unknown>
  return mockRes as VercelResponse
})
```

**Nested reads need a local cast**, because every value in a `Record<string, unknown>` is `unknown`:

```ts
const product = jsonOutput.product as Record<string, unknown>
expect(product.priceNeto).toBe(7555)
```

**Callbacks that mutate a captured variable must use an object holder.** TypeScript's control-flow analysis does not track assignments made inside a closure, so a plain `let captured: Record<string, unknown> | null = null` narrows to `null` (and then to `never`) at the assertion site:

```ts
const capturedProductUpdate: { current: Record<string, unknown> | null } = { current: null }
// …inside the mock: capturedProductUpdate.current = data
expect(capturedProductUpdate.current?.stockCount).toBe(5)
```

### 4.3 Deliberately invalid input

When a test intentionally passes a wrong type to prove runtime resilience, use `@ts-expect-error` (not `@ts-ignore`) with a reason, so the suppression fails loudly if the call ever becomes valid:

```ts
// @ts-expect-error deliberate invalid input to assert runtime resilience
expect(formatCLP(null)).toBe('$0')
```

### 4.4 `setup.ts` — load-bearing details, do not "clean them up"

```ts
if (typeof import.meta.env === 'undefined') {
  // @ts-expect-error import.meta.env is typed as always-present, but some runners leave it undefined
  import.meta.env = {}
}
```

This assignment is what makes the `Object.assign(import.meta.env, { VITE_FIREBASE_*: … })` block below it effective for suites that load the Firebase client. Rewriting it as a cast expression (e.g. `(import.meta as …).env = {}`) **silently breaks** `src/tests/admin/{AdminDashboard,OrderDetailPanel,ProductEditModal,StockAdjustModal}.test.tsx`, which then fail at import time with `FirebaseError: auth/invalid-api-key`. Keep the direct assignment form.

Also note `const mutableEnv = import.meta.env as unknown as Record<string, unknown>` exists purely so `delete mutableEnv.FIRESTORE_ENV` type-checks — `ImportMetaEnv`'s keys are read-only, and `delete` on a read-only property is a type error.

And `VITE_WHATSAPP_NUMBER` is re-pinned to `56912345678` **after** the `...import.meta.env` spread — otherwise a developer's real `.env.local` would leak into tests and break every assertion on rendered phone text.

A related trap (Task 2.10): `vi.stubEnv` only affects modules that read `import.meta.env` **at call time**. A value captured in a module-level `const` (`src/config/contact.ts`) is frozen at first import, so suites that must vary it have to `vi.resetModules()` and dynamically `import()` the module **after** stubbing (the `contact.test.ts` / `api/firebaseAdmin.test.ts` pattern) — a plain `stubEnv` against a module-scope const silently asserts the placeholder instead.

### 4.5 Related constants moved out of components

`CATEGORY_BANNERS` lives in `src/components/categoryBanners.ts` (not `CategoryShowcase.tsx`) so the component file exports components only — import it from there if a test needs it.
