# Task 2.8: Simulated-Success Fallbacks Must Not Mask Real HTTP Errors

**Branch:** `fix/task-2.8-simulated-success-fallbacks` (cut from `main` @ `9d938ce`, which already includes the merged Task 1.4; executing in the primary worktree — no separate worktree, per explicit user instruction)
**Status:** Awaiting user approval — no source code changes until approved.
**RequestFeedback:** true
**UserFacing:** true

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **2.8. Simulated-Success Fallbacks Must Not Mask Real HTTP Errors** (P1 · High; audit finding — full contract in `src/services/AGENTS.md` §6).

Three client adapters respond to endpoint failure by returning **fabricated success**, masking real server rejections from the customer:

1. **`src/services/mercadopago.ts`** — `createMercadoPagoPreference()` treats *any* failure (including HTTP 4xx/5xx) as the "endpoint not active" dev case: `!response.ok` currently **throws into the same catch** that returns `success: true, initPoint: undefined`, and `processMercadoPagoPayment()` then fabricates a `status: 'approved'` record. The server's **400 stock rejection** (Task 0.9) and the 0.10 fail-closed `500`s therefore produce **no redirect and no error** — the customer lands on the confirmation step for an unpaid `PENDIENTE_PAGO_MERCADOPAGO` order.
2. **`src/services/transferVoucher.ts`** — `uploadTransferVoucher()` catches *any* failure (401 RUT mismatch, 404, 500) and returns `success: true` with a `simulated-voucher://` URL — silent voucher loss displayed as "Comprobante recepcionado exitosamente".
3. **`src/services/orderTracking.ts`** — `fetchOrderTracking()` fabricates a plausible order on network failure (its HTTP error path already surfaces correctly).

**UI readiness (verified):** `OrderTrackingModal` already renders `result.error` for both tracking (l.96-100) and voucher upload (l.160-162); `CheckoutModal`'s voucher upload already renders `res.error` (l.391-395). The **only** blind consumer is the Mercado Pago call site (`CheckoutModal` l.349-356), which ignores the result entirely.

**Out of scope:** `submitOrder`'s swallowed Firestore write — tracked separately as **0.11** (in progress by another agent; touches `src/services/api.ts`, no file overlap with this task).

**Required Action (from TODO):** simulate only when the endpoint is demonstrably absent (dev network error, behind the same env gate as 0.10); real HTTP error responses must surface as errors to the customer.

---

## 2. Human Action Items & Placeholders (TODO for Human)

- **No new credentials or secrets.**
- New **optional, non-secret** client env var documented in `.env.example`:
  - `VITE_ALLOW_SIMULATED_PAYMENTS=false` — client-side escape hatch mirroring Task 0.10's server flag: simulated fallbacks are automatically disabled when the build was produced with `VERCEL_ENV=production`; only the exact string `'true'` opts back in (controlled demos). Leave unset/`false` in Production.
- **Human check after merge:** confirm `VITE_ALLOW_SIMULATED_PAYMENTS` is absent (or `false`) for the Production build target. `env:sync` only writes variables present in the local env file, so nothing needs to be pushed.

---

## 3. Proposed Changes

### 3.A `[NEW] src/services/simulationPolicy.ts` — client-side gate (mirror of `api/_lib/simulationPolicy.ts`)

```ts
export function isSimulatedFallbackAllowed(env: ImportMetaEnv = import.meta.env): boolean {
  if (env.VITE_ALLOW_SIMULATED_PAYMENTS === 'true') return true
  return env.VITE_VERCEL_ENV !== 'production'
}
```

- Same semantics as the server gate from Task 0.10: allowed outside a production runtime, strict `'true'` opt-in (`'TRUE'`, `'1'`, `'false'` do **not** enable).
- Browser-safe: reads the build-time `VITE_VERCEL_ENV` define that `vite.config.ts` injects from `process.env.VERCEL_ENV` (documented in `src/services/AGENTS.md` §2.3) — **no `process.env` in browser code**.
- Injectable `env` parameter → pure and unit-testable without mutating globals (also sidesteps `ImportMetaEnv`'s read-only keys).
- In Vitest/local runs `VITE_VERCEL_ENV` is unset → simulation allowed → existing fallback-dependent tests keep working; production-build behavior is what changes.

### 3.B `[MODIFY] src/services/mercadopago.ts`

- **`createMercadoPagoPreference()`** — restructure the error path:
  - `!response.ok` is handled **explicitly before the catch**: parse the error body (`errData?.error` when available) and return `{ success: false, error }`. Real HTTP errors **never simulate** — this covers the 400 stock rejection, the 0.10 production `500`s, and `503` Admin-down.
  - The `catch` (network throw — endpoint demonstrably absent) keeps today's simulated shape `{ success: true, initPoint: undefined }` **only when** `isSimulatedFallbackAllowed()`; otherwise returns `{ success: false, error: 'No fue posible contactar al servicio de pagos. Por favor reintenta o cotiza por WhatsApp.' }`.
- **`processMercadoPagoPayment()`** — if `prefResult.success === false`, return `{ success: false, error, orderId }` immediately: **no fabricated approved record, no redirect attempt**. The success path (initPoint present → redirect + result record) is unchanged; the dev-simulated approved record remains the non-production simulation for the demonstrably-absent case.
- `MercadoPagoPaymentResult`: add `error?: string`; make `paymentId` / `status` / `statusDetail` / `totalPaid` / `paidAt` optional so the failure return is honest (only the success path populates them; the sole UI consumer checks `success`, and existing tests read them on success paths only).

### 3.C `[MODIFY] src/services/transferVoucher.ts`

- **`uploadTransferVoucher()`** — `!response.ok` returns `{ success: false, orderId, status: 'PENDIENTE_TRANSFERENCIA', error: <server message> }` directly instead of throwing into the simulation catch. The 401 RUT-mismatch, 404 and 500 cases surface their real server message.
- The `catch` (network throw) keeps the simulated success **only when** `isSimulatedFallbackAllowed()`; in a production runtime it returns `{ success: false, …, error: 'No fue posible subir el comprobante. Por favor reintenta o envíalo por WhatsApp.' }`.
- **No UI changes needed** — both call sites already render `res.error`.

### 3.D `[MODIFY] src/services/orderTracking.ts`

- The `catch` (network throw) keeps the simulated fallback **only when** `isSimulatedFallbackAllowed()`; in a production runtime it returns `{ success: false, error: 'No fue posible consultar el estado del pedido. Por favor reintenta en unos minutos.' }`.
- The HTTP error path is already correct — untouched.

### 3.E `[MODIFY] src/components/CheckoutModal.tsx` (minimal — ~6 lines)

- Capture the `processMercadoPagoPayment()` result; on `success: false` → `setSubmitError(result.error || 'No fue posible iniciar el pago...')`, `setIsSubmitting(false)`, and `return` — the customer **stays on the Pago step** (where `submitError` already renders, l.910-924) instead of landing on the confirmation step for an unpaid order.
- **Parallel-work note:** Task 0.11 (other agent) targets `src/services/api.ts` and the `submitOrder` failure hunk (l.335-340, which already exists); this change is the adjacent l.348-356 hunk — small, reviewable overlap only.

### 3.F `[MODIFY] .env.example`

- New block mirroring the `ALLOW_SIMULATED_PAYMENTS` one: `VITE_ALLOW_SIMULATED_PAYMENTS=false` with an operator warning (client-side, build-time inlined; leave unset/`false` in Production).

### Explicitly NOT done (scope guardrails)

- **`submitOrder`** — Task 0.11 (other agent).
- **Voucher storage/server-side validation** — Task 2.9 (this task only stops the client from *masking* the endpoint's errors; the Firestore doc-size and lifecycle-guard rework remains 2.9's scope).
- No changes to `api/` endpoints, no new dependencies, no copy rewrites beyond the new error strings.

---

## 4. Robust Unit Testing Plan (MANDATORY)

**`[NEW] src/tests/services/simulationPolicy.test.ts`** (~5 tests; pure — injectable env, no global mutation):

1. `VITE_VERCEL_ENV` unset ⇒ allowed (local dev / Vitest).
2. `'preview'` / `'development'` ⇒ allowed.
3. `'production'` ⇒ blocked.
4. production + `VITE_ALLOW_SIMULATED_PAYMENTS='true'` ⇒ allowed (escape hatch).
5. production + `'TRUE'` / `'1'` ⇒ still blocked (strict opt-in).

**`[MODIFY] src/tests/services/mercadopago.test.ts`:**

- Existing 6 success tests currently pass via the *network-throw fallback* (jsdom `fetch` to a relative URL throws). They are re-based on an explicit `fetch` mock (`ok: true` + `initPoint`) so they assert the real success contract; assertions unchanged.
- New: HTTP 400 with `{ error }` body ⇒ `success: false` + server message surfaced (stock-rejection contract); HTTP 500 ⇒ `success: false`; network throw in test env ⇒ simulated `success: true, initPoint: undefined` (dev behavior pinned); network throw with production env ⇒ `success: false`; `processMercadoPagoPayment` propagates a preference failure (`success: false`, **no** fabricated `approved` status).

**`[MODIFY] src/tests/services/transferVoucher.test.ts`:**

- New: HTTP 401 (RUT mismatch) ⇒ `success: false` + server error message; network throw in test env ⇒ simulated `success: true` with `simulated-voucher://` URL (dev behavior pinned); network throw with production env ⇒ `success: false`.

**`[MODIFY] src/tests/services/orderTracking.test.ts`:**

- New: network throw in test env ⇒ simulated fallback (dev behavior pinned); network throw with production env ⇒ `success: false` (no fabricated order).

**`[MODIFY] src/tests/components/CheckoutModal.test.tsx`:**

- New: `processMercadoPagoPayment` mocked to resolve `success: false` ⇒ `submitError` visible on the Pago step and the confirmation step is **not** reached.

**Mocking & hygiene:** boundary mocks only (`vi.spyOn(global, 'fetch')`, existing `vi.mock` service doubles); suites that set `VITE_VERCEL_ENV` / `VITE_ALLOW_SIMULATED_PAYMENTS` restore them in `afterEach` (same env-hygiene pattern the `api/` suites use for `VERCEL_ENV`). The injectable-env design means no `import.meta.env` mutation is needed in the policy tests.

**Zero-regression target:** `pnpm test` (557 → ~568 tests, 66 → 67 suites), `pnpm build`, `pnpm lint`, `pnpm format:check` — all green.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- **`src/services/AGENTS.md`:** §6 table rewritten from "known degradation contracts" to the as-built per-adapter failure contract (HTTP errors always surface; simulation only on network absence outside production, or with the explicit opt-in); §1 file map gains the `simulationPolicy.ts` row; §2.3 note cross-links the new `VITE_ALLOW_SIMULATED_PAYMENTS` var.
- **`src/tests/AGENTS.md`:** refresh counts (557 → final count) and the `services/` suite list (+ `simulationPolicy`).
- **`src/components/AGENTS.md`:** one-line addition to the checkout payment section — MP preference failures surface via `submitError` on the Pago step.
- **`PRODUCTION_READINESS_TODO.md`:** mark **2.8** `[x]` with an as-built summary; note that the client no longer masks `upload-voucher` failures (motivating 2.9's server-side rework, which stays open).

---

## 6. Verification Sequence (workflow steps 6 → 8)

1. `pnpm test` — full suite green, no regressions.
2. `pnpm build` — production bundle compiles.
3. `pnpm lint` + `pnpm format:check`.
4. Adversarial read-only self-review of the diff (defensive programming, runtime separation, observability, negative assertions), remediate findings, re-run 1–3.
