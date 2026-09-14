# PRONTO Automated Testing Guide (`src/tests/`)

This directory contains the **automated test suite** for PRONTO, powered by **Vitest**, **jsdom**, and **React Testing Library**.

---

## 🎯 1. Directory Scope & Organization

* **Role:** Ensures regression prevention, verifies business logic calculations (cart totals, Chilean tax, RUT check digits), and validates user interaction flows.
* **Directory Structure:**
  * [`setup.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/setup.ts): Test harness configuration, `@testing-library/jest-dom` extensions, and global browser mocks (`matchMedia`, `IntersectionObserver`).
  * `components/`: Unit and interaction tests for UI components ([`Navbar.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/components/Navbar.test.tsx), [`ProductCard.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/components/ProductCard.test.tsx), [`Cart.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/components/Cart.test.tsx), etc.).
  * `services/`: Adapter logic and mock network verification ([`api.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/services/api.test.ts), [`mercadopago.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/services/mercadopago.test.ts), [`whatsapp.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/services/whatsapp.test.ts)).
  * `utils/`: Algorithmic tests for domain calculations ([`rut.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/utils/rut.test.ts)).
  * `data/`: Schema integrity validation ([`products.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/data/products.test.ts)).

---

## 🚫 2. Anti-Overshooting & Testing Guardrails

1. **Preserve Passing Tests (Zero Regression Policy):**
   * Currently, **all 84 tests pass**.
   * ❌ **NEVER** comment out, delete, or skip (`test.skip`) failing tests to get a passing build. If a test fails after your changes, diagnose and fix the root cause.
2. **Speed & Efficiency:**
   * The test suite must complete in **under 5 seconds** (`pnpm test`).
   * Do not introduce arbitrary `sleep()` or `setTimeout()` delays. Use Vitest's `vi.useFakeTimers()` or React Testing Library's `waitFor()` when testing asynchronous behavior.
3. **Test User Behavior, Not Implementation:**
   * Test what the user sees and interacts with (accessible roles, buttons, labels, and visible feedback).
   * Avoid asserting on internal React component state or fragile CSS selector chains.
4. **Mocking Discipline:**
   * Unit tests must **never** touch live Firebase servers or real Mercado Pago APIs.
   * Mock network calls and external services at the boundary using `vi.fn()` or `vi.spyOn(global, 'fetch')`.
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
