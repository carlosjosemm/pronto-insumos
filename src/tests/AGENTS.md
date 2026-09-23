# PRONTO Automated Testing Guide (`src/tests/`)

This directory contains the **automated test suite** for PRONTO, powered by **Vitest**, **jsdom**, and **React Testing Library**.

---

## 🎯 1. Directory Scope & Organization

* **Role:** Ensures regression prevention, verifies business logic calculations (cart totals, Chilean tax, RUT check digits), and validates user interaction flows.
* **Directory Structure:**
  * [`setup.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/setup.ts): Test harness configuration, `@testing-library/jest-dom` extensions, and global browser mocks (`matchMedia`, `IntersectionObserver`).
  * `components/`: Unit and interaction tests for customer storefront components ([`Navbar.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/components/Navbar.test.tsx), [`ProductCard.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/components/ProductCard.test.tsx), [`Cart.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/components/Cart.test.tsx), [`CheckoutModal.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/components/CheckoutModal.test.tsx), [`CategoryShowcase.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/components/CategoryShowcase.test.tsx), [`PromoStrip.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/components/PromoStrip.test.tsx), etc.).
  * `admin/`: Test suites for backoffice management UI components ([`AdminApp.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/admin/AdminApp.test.tsx), [`OrderDetailPanel.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/admin/OrderDetailPanel.test.tsx), [`InventoryTable.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/admin/InventoryTable.test.tsx), [`StockAdjustModal.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/admin/StockAdjustModal.test.tsx), etc.).
  * `api/admin/`: Integration and unit tests for administrative serverless endpoints ([`approve-transfer.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/api/admin/approve-transfer.test.ts), [`dashboard-stats.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/api/admin/dashboard-stats.test.ts), [`update-stock.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/api/admin/update-stock.test.ts), [`firestoreEnv.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/api/admin/firestoreEnv.test.ts), etc.).
  * `services/`: Adapter logic, network mocks, and environment resolver verification ([`api.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/services/api.test.ts), [`firestoreEnv.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/services/firestoreEnv.test.ts), [`mercadopago.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/services/mercadopago.test.ts)).
  * `utils/`: Algorithmic tests for domain calculations ([`rut.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/utils/rut.test.ts), [`tax.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/utils/tax.test.ts), [`currency.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/utils/currency.test.ts), [`categoryAlias.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/utils/categoryAlias.test.ts)).
  * `data/`: Schema integrity validation ([`products.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/data/products.test.ts)).
  * `security/`: Firestore security rules assertions ([`firestore-rules.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/security/firestore-rules.test.ts)).

---

## 🚫 2. Anti-Overshooting & Testing Guardrails

1. **Preserve Passing Tests (Zero Regression Policy):**
   * Currently, **all 343 tests across 54 test suites pass (100% passing)**.
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
   * `setup.ts` provides non-empty `VITE_FIREBASE_*` placeholders, so `hasFirebaseConfig` is truthy in tests. Suites exercising `fetchProducts()` must mock `firebase/firestore` with an empty snapshot (`getDocs: vi.fn(async () => ({ empty: true, docs: [] }))`) to stay on the deterministic local-catalog fallback.
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

### Writing New Tests Checklist:
- [ ] Place test file mirroring the source file path (e.g., `src/utils/currency.ts` -> `src/tests/utils/currency.test.ts`).
- [ ] Test standard happy path.
- [ ] Test edge cases (invalid inputs, network error responses, empty arrays).
- [ ] Run `pnpm test` to verify zero regression across all test suites.
- [ ] Run `pnpm lint` — test files are **inside** the lint scope (see §5).

---

## 🧷 5. Typing Conventions Under `no-explicit-any`

`no-explicit-any` is an **error** across `src/tests/**`, so the suites no longer use `any` for mock plumbing. The patterns adopted are load-bearing — prefer them over re-widening a type.

### 5.1 Mock return values

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

### 5.2 Captured responses and payloads

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

### 5.3 Deliberately invalid input

When a test intentionally passes a wrong type to prove runtime resilience, use `@ts-expect-error` (not `@ts-ignore`) with a reason, so the suppression fails loudly if the call ever becomes valid:

```ts
// @ts-expect-error deliberate invalid input to assert runtime resilience
expect(formatCLP(null)).toBe('$0')
```

### 5.4 `setup.ts` — one load-bearing line, do not "clean it up"

```ts
if (typeof import.meta.env === 'undefined') {
  // @ts-expect-error import.meta.env is typed as always-present, but some runners leave it undefined
  import.meta.env = {}
}
```

This assignment is what makes the `Object.assign(import.meta.env, { VITE_FIREBASE_*: … })` block below it effective for suites that load the Firebase client. Rewriting it as a cast expression (e.g. `(import.meta as …).env = {}`) **silently breaks** `src/tests/admin/{AdminDashboard,OrderDetailPanel,ProductEditModal,StockAdjustModal}.test.tsx`, which then fail at import time with `FirebaseError: auth/invalid-api-key`. Keep the direct assignment form.

Also note `const mutableEnv = import.meta.env as unknown as Record<string, unknown>` exists purely so `delete mutableEnv.FIRESTORE_ENV` type-checks — `ImportMetaEnv`'s keys are read-only, and `delete` on a read-only property is a type error.

### 5.5 Removed / changed assertions

* `src/tests/components/ProductDetailModal.test.tsx` — dropped an unused `rerender` destructuring.
* `src/tests/components/CategoryShowcase.test.tsx` and `src/tests/utils/categoryAlias.test.ts` — dropped unused imports. `CATEGORY_BANNERS` now lives in `src/components/categoryBanners.ts`; import it from there if a future test needs it.
