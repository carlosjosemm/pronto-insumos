# Task 2.17: Mercado Pago Preference Lifecycle and Success Semantics

**Branch:** `feat/task-2.17-preference-lifecycle-success` (primary working tree — no worktree; cut from `main` @ `42989df`)
**RequestFeedback:** true · **UserFacing:** true
**Status:** **Implemented — 891/891 tests (83 suites)** after the pre-PR rebase onto PR #34 after review round 1; `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit` and the strict ad-hoc `api/**` tsc all clean. Owner approved the plan 2026-09-29 ("proceed"). Adversarial review round 1 returned F1–F6 (verdict *approve with findings*); dispositions: F1 private-IP prefix bypass — fixed with anchored dotted-quad validation (+ test), F2 LAN hosts forced to https — fixed (+ test), F3 `SITE_URL` repointing preview at production — fixed by honoring `SITE_URL` only in a production runtime (+ leak test, matching the task's own "SITE_URL in production, safe preview origin" wording), F4 this status block — refreshed, F5 as-built docs — synced in this change, F6 example value — kept with the F3 mitigation. Changes remain uncommitted pending the owner's "wrap up and proceed".

---

## 1. Context & Problem Statement

Roadmap item [PRODUCTION_READINESS_TODO.md](./PRODUCTION_READINESS_TODO.md) §Phase 2, Task 2.17 _(P1)_:

> **Evidence:** `api/create-preference.ts:41-49,74-104,127-235` reads any order and accepts caller payer plus `Host`, without ensuring MP method/pending state, stored-total agreement, delivery zone/minimum or repeat budget. `src/services/mercadopago.ts:49-53,98-113` treats missing `initPoint` as success and manufactures an approved result.
> **Risk:** invalid/settled/transfer/quote orders, forged success, unsafe origins and unlimited preference retries.
> **Fix:** allow MP-only pending orders; reject settled, cancelled, transfer and quote orders; recompute and compare total to stored total; derive payer from stored order; use canonical configured return/webhook origin (`SITE_URL` in production, safe preview origin); bound repeated preference creation with existing throttle/compact per-order control. Preserve suspended 3.1 (no freight change). Enforce the existing San Antonio `$60.000` minimum against the same original product subtotal used by checkout (`src/components/CheckoutModal.tsx:230-238`), before promo discount—not against discounted payable total. Production success requires a valid MP redirect; never fabricate paid client state.
> **Accept:** tests cover total mismatch, invalid method/status, repeat attempts, invalid MP success response and bad host. No freight behavior change.

**The five gaps, as built today:**

1. **Any order can get a preference.** `create-preference` looks the order up but never checks `paymentMethod`/`status`: a settled (`PAGADO_MERCADOPAGO`), transfer, quote, cancelled or in-review order can be charged again.
2. **No stored-total agreement.** The endpoint rebuilds prices from the catalog but never compares the recomputed payable total with the order's stored `totalAmount` — a stale order (price changed after registration) charges a different amount than the document the webhook asserts against.
3. **Caller-controlled payer + Host.** The preference payer comes from the request body, and `back_urls`/`notification_url` are built from the raw `Host` header — a forged Host poisons the return URLs and the webhook destination.
4. **Unlimited retries.** Nothing bounds repeated preference creation per order/IP.
5. **Fabricated client success.** `processMercadoPagoPayment` returns `paymentId: 'MP-…'`, `status: 'approved'`, `statusDetail: 'accredited'`, `totalPaid`, `paidAt` even when no redirect exists (missing `initPoint` is treated as success) — fabricated paid client state.

## 2. Human Action Items & Placeholders (TODO for Human)

* **`SITE_URL`** — added to `.env.example` (e.g. `https://prontoinsumos.com`): the canonical production origin for `back_urls`/`notification_url`. It is already read by `api/_lib/emailTemplates.ts` but was never listed. **Required in a production runtime** (fail-closed `500` without it); outside production it is deliberately ignored so a leaked value can never repoint preview/dev returns at production. **Owner action (via the existing Vercel CLI sync, no dashboard work):** add `SITE_URL=https://prontoinsumos.com` to `.env.local`, then `pnpm run env:sync -- --target production` (dry run) and `-- --target production --apply`. Sync to **production only** — preview deployments keep deriving their own `*.vercel.app` origin from the safe-Host fallback.
* No other credentials or placeholders.

## 3. Proposed Changes

Lean: one endpoint hardened, one service contract fixed, one throttle scope added, no new serverless function (still 6/12 Hobby slots).

### [MODIFY] `api/create-preference.ts`

New guards, in handler order (all rejections carry customer-safe Spanish copy, mirroring the file's existing style):

1. **Lifecycle guard (after order lookup):** the order must be `paymentMethod === 'mercadopago'` **and** `status === 'PENDIENTE_PAGO_MERCADOPAGO'`. Anything else — settled (`PAGADO_MERCADOPAGO`, `TRANSFERENCIA_APROBADA`, `PAGADO_TRANSFERENCIA`, `EN_PREPARACION`, `DESPACHADO`, `ENTREGADO`), `PAGO_EN_REVISION`, transfer-pending (`PENDIENTE_TRANSFERENCIA`, `TRANSFERENCIA_COMPROBANTE_SUBIDO`), quote (`COTIZACION_SOLICITADA_WHATSAPP`), `CANCELADO`, unknown — is refused with `409` and a message that names the state without leaking internals.
2. **Stored-total agreement (after the per-line rebuild):** the raw catalog lines collected during the existing loop are priced through `computeOrderTotal(rawLines, discountPercent)` (the exact helper the webhook asserts with) and must equal the order's stored `totalAmount` exactly (integer CLP). Mismatch → `409` ("El total del pedido no coincide con el catálogo actual…"). This is the same assertion the webhook makes — a preference whose charge would diverge from the order document is never created.
3. **San Antonio minimum (server-side, before promo):** with the zone read from the order's stored `customer.city`, `isBelowMinimumOrder(zone, rawSubtotal)` (imported from `src/config/delivery.js` — never re-declared) refuses with `400` when the **original product subtotal** (Σ catalog price × qty, **before** the promo discount — the same subtotal checkout gates on) is under `$60.000` for San Antonio. Melipilla has no minimum. No freight/pricing behavior change (suspended 3.1 untouched).
4. **Payer from the stored order:** the request body contributes **only** `orderId` (the `customer` body field is dropped); the preference payer is built from `orderData.customer` (`fullName`, `email`, `rut`), so a tampered request can no longer attach a different identity to the charge.
5. **Canonical origin (`resolveCheckoutOrigin`):**
   * `SITE_URL` configured → always used (trailing slashes stripped) — canonical in every environment.
   * Production runtime without `SITE_URL` → `500` + loud log (fail-closed; the Host header is attacker-controlled).
   * Outside production → derived from the `Host` header **only if it is a safe shape**: `localhost`/`127.0.0.1`/`::1` (any port), `*.vercel.app`, or a private-range IPv4 (LAN testing). Anything else (scheme, path, `..`, spaces, public foreign host) → `400`.
   * `back_urls` and `notification_url` are built exclusively from this resolved origin.
6. **Repeat budget:** `create-preference` becomes a fourth `ThrottleScope` in `api/_lib/abuseThrottle.ts` (`ip: { maxAttempts: 30, maxFailures: 15 }`, `order: { maxAttempts: 15, maxFailures: 10 }` — a legitimate retry after a stock/total rejection stays possible, hammering does not). `consumeThrottleAttempt` runs on both keys right after `orderId` is parsed (before any Firestore read); rejections (`400`/`409`) record failures via `recordThrottleFailures`; exhaustion → the uniform `429` + `Retry-After` (`respondThrottled`). Fail-open semantics are inherited — a counter outage never takes checkout down.

### [MODIFY] `api/_lib/abuseThrottle.ts`

Add `'create-preference'` to `ThrottleScope` + `THROTTLE_POLICIES` (and update the module doc-comment's endpoint list). No logic changes — the existing window/lock/fail-open machinery is reused as-is.

### [MODIFY] `src/services/mercadopago.ts`

Success semantics — no fabricated paid state:

* `createMercadoPagoPreference`: a `200` response **without** a usable `initPoint`/`sandboxInitPoint` (and not marked `isSimulated`) is now a **failure** (`success: false` + customer-safe error), never a silent success.
* `processMercadoPagoPayment`:
  * With a real `initPoint` → redirect via `window.location.href` and return `{ success: true, orderId, initPoint }` — **no** fabricated `paymentId`/`status`/`statusDetail`/`totalPaid`/`paidAt` (those fields are removed from `MercadoPagoPaymentResult`; the only consumer, `CheckoutModal`, reads `success`/`error`).
  * Without an `initPoint` in a production runtime → `{ success: false, error }` (the shopper stays on the Pago step; the webhook remains the only payment-status authority).
  * The dev/preview simulation path (endpoint unreachable, `isSimulatedFallbackAllowed()`) keeps working for the demo flow but returns only `{ success: true, orderId }` — still no invented payment fields.

### [MODIFY] `.env.example`

Add the optional `SITE_URL` placeholder (documented, safe default commented).

### [MODIFY] `api/AGENTS.md` §2.1 / `src/services/AGENTS.md`

As-built documentation for the new guards and the success-semantics contract (see §5).

**No changes:** `CheckoutModal.tsx` (it already branches on `paymentResult.success`), `webhooks/mercadopago.ts`, freight/pricing logic, `firestore.rules`.

## 4. Robust Unit Testing Plan (MANDATORY)

All boundary-mocked (no live Firebase/MP/network); existing suites stay green (zero regressions).

### `src/tests/api/create-preference.test.ts` — new block "Preference lifecycle guards"

| # | Case | Assertion |
| :-- | :--- | :--- |
| 1 | Settled order (`PAGADO_MERCADOPAGO`), transfer order (`PENDIENTE_TRANSFERENCIA`), quote order (`COTIZACION_SOLICITADA_WHATSAPP`), cancelled, `PAGO_EN_REVISION` | Each → `409`, no MP fetch performed |
| 2 | Valid MP pending order | Still proceeds (regression pin for the guard) |
| 3 | Stored `totalAmount` ≠ catalog-recomputed total | `409`; no MP fetch |
| 4 | San Antonio order with original subtotal < `$60.000` | `400` with the minimum-order message |
| 5 | San Antonio order with subtotal exactly `$60.000` but promo-discounted payable below it | **Passes** — pins "minimum against the original subtotal, before promo" |
| 6 | Melipilla order below `$60.000` | Passes — no minimum for Melipilla |
| 7 | Tampered body `customer` (different name/email/RUT) | Preference payer built from the **order document** |
| 8 | Bad `Host` header (scheme/path/`..`/foreign public host) outside production | `400` |
| 9 | Production runtime without `SITE_URL` | `500` + loud log (fail-closed) |
| 10 | `SITE_URL` configured | `back_urls`/`notification_url`/simulated `initPoint` all use it, Host ignored |
| 11 | Repeat attempts beyond the per-order budget | `429` + `Retry-After` (reuses the real `abuseThrottle` counter machinery via the shared double pattern) |
| 12 | Throttle counter outage | Fail-open: request proceeds (loud log) |

### `src/tests/services/mercadopago.test.ts` — success-semantics rewrite

* The five tests pinning the fabricated approved result (`MP-…` id, `approved`, `accredited`, `totalPaid`, `paidAt`) are **rewritten** to the new contract: success carries only `orderId` (+ `initPoint` when present); the fabricated fields are asserted **absent**.
* New: `200` without `initPoint` (non-simulated) → `success: false`; `200` with `isSimulated: true` → dev simulation path returns success without payment fields; production without `initPoint` → `success: false`.
* Existing Task 2.8 error-contract tests unchanged and green.

Full suite (867 tests / 82 suites + new cases) must remain green.

## 5. As-Built Documentation & Roadmap Sync Plan

* **`api/AGENTS.md`** — §2.1 `create-preference` row + a lifecycle-guards paragraph (409 matrix, total agreement, San Antonio minimum, canonical origin, throttle scope).
* **`src/services/AGENTS.md`** — `mercadopago.ts` entry: the no-fabrication success contract.
* **`PRODUCTION_READINESS_TODO.md`** — mark Task 2.17 `[x]` after gates + review.
* **`.env.example`** — `SITE_URL` documented (human action item).
* **`walkthrough.md`** — updated at wrap-up.

## 6. Verification Gates

```bash
pnpm test && pnpm build && pnpm lint && pnpm format:check && pnpm exec tsc --noEmit
```

Then the adversarial read-only code review (`/code-review`), remediation, and — only on the explicit **"wrap up and proceed"** — commit, push and PR.
