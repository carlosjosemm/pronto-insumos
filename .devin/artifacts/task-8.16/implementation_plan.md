# Task 8.16: Firebase App Check for the Public `orders` Create Path

**Branch:** `feat/task-8.16-app-check-order-create-rules`
**Status:** wrapped up (implemented, reviewed, verified; see [walkthrough.md](./walkthrough.md))

## 1. Context & Problem Statement

- **Roadmap item:** `PRODUCTION_READINESS_TODO.md` §3, Task 8.16 (P2) — "Firebase App Check for the Public `orders` Create Path".
- **Residual risk:** public order creation (`firestore.rules` `match /orders/{orderId} allow create`) is reachable by any visitor with any Firebase Web SDK config, so the write path can be abused for billed Firestore writes and (via the order-confirmation proxy) transactional email.
- **Rule shape gaps (the enumerated evidence):** `firestore.rules` shape-checks only the **first 10 of 25** item lines, accepts an **arbitrary `customer.city`** (the delivery zone), an arbitrary `documentType` (`boleta` **or** `factura` — the Factura checkout path is disabled by `FACTURA_ENABLED = false`), an arbitrary `customer.rut` (any ≤16-char string) and an arbitrary `createdAt` (only presence is checked).
- **What App Check is and is not:** abuse friction on the client SDK (reCAPTCHA v3 attestation enforced at the Firebase Console). It is **not** authentication, and it does **not** validate catalog prices/totals (that remains `create-preference` catalog recomputation + the webhook amount assertion).

## 2. Human Action Items & Placeholders (TODO for Human)

- **Register App Check in the Firebase Console** (project → App Check → Apps → the web app): choose the **reCAPTCHA v3** provider (free tier, no billing requirement) and register the site key's domain.
- **Set the site key** as `VITE_FIREBASE_RECAPTCHA_SITE_KEY` in `.env.local` and in the Vercel environment for each target that should carry App Check. The code initializes App Check **only** when this variable is present; a missing key logs a loud `console.error` in production and a `console.warn` in dev — the storefront never blanks.
- **Local-dev debug token:** outside a production runtime the code sets `self.FIREBASE_APPCHECK_DEBUG_TOKEN` (from `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` when provided, `true` otherwise) **before** `initializeAppCheck`, so the SDK prints a registration debug token to the console; register that token in the Firebase Console (App Check → Apps → Manage debug tokens).
- **Enforcement per environment:** enforcement is a Console decision, not a code one. Monitor first, then enable enforcement for the Cloud Firestore product. **Verify preview order creation with enforcement enabled before enforcing in production** — the task's acceptance gate.
- No secret values are committed; `.env.example` gains placeholder entries only.

## 3. Proposed Changes

- **[MODIFY] `src/services/firebase.ts`**
  - Initialize App Check with `ReCaptchaV3Provider` immediately after `initializeApp` and **before** `initializeFirestore`/`getAuth` (order pinned by test).
  - Site key: `import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY`. Missing key → warn/error log, no throw, Firestore still initializes.
  - Debug token (`self.FIREBASE_APPCHECK_DEBUG_TOKEN`) is set only when `VITE_VERCEL_ENV !== 'production'`, before init.
  - `initializeAppCheck` is wrapped in a try/catch: the SDK throws on double registration (Vite HMR re-runs module scope), which must not blank the storefront.
- **[MODIFY] `src/services/api.ts`** (`submitOrder`)
  - Normalize the stored RUT to the canonical cleaned form `12345678-5` (`cleanRut` + re-inserted hyphen) for both `customer.rut` and the derived `billing.rut` — the documented storage convention; the rules now pin that exact shape. An uncleanable RUT passes through unchanged and the rules reject the write (fail-closed).
- **[MODIFY] `firestore.rules`** (order-create contract hardening; the Admin SDK bypasses rules, so no serverless path is affected)
  - `customer.city in ['Melipilla', 'San Antonio']` — the two delivery zones (mirrors `DELIVERY_ZONES` in `src/config/delivery.ts`; rules cannot import config).
  - `customer.documentType == 'boleta'` and `billing.documentType == 'boleta'` — the Factura checkout path is disabled (`FACTURA_ENABLED = false`); re-enabling it is now a two-line change (component flag + this pin).
  - `customer.rut.matches('^[0-9]{7,8}-[0-9K]$')` — Modulo-11 itself is not expressible in rules (no loops/string arithmetic); the shape pin plus the client's `validateRut` gate is the depth available here.
  - `createdAt is timestamp` bounded to `request.time ± 15m` via `duration.value(15, 'm')` — `submitOrder` writes `serverTimestamp()`, which resolves at commit time; a caller-chosen literal timestamp is rejected.
  - **All 25 item lines** shape-checked (`isValidOrderItem(data.items[0..24])`, index-guarded). Verified against the documented rules limits: there is **no** function-call count limit — the real budget is **1,000 expressions per request** (depth limit is 20); the full order-create evaluation stays well under 400, so the server-side-catalog recomputation note for lines 10–24 is retired.
- **[MODIFY] `.env.example`** — document `VITE_FIREBASE_RECAPTCHA_SITE_KEY` (+ the optional `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`), with the Console registration, debug-token and enforcement workflow.
- **[MODIFY] `src/tests/services/firebase.test.ts`** — App Check initialization-order and environment cases (below).
- **[MODIFY] `src/tests/security/firestore-rules.test.ts`** — pin the new rules text (zone/boleta/RUT/timestamp/all-25-lines).
- **[MODIFY] `src/tests/security/orderCreateContract.test.ts`** — pin the RUT normalization + zone membership on the real `submitOrder()` payload and the new rules bindings.
- **[MODIFY] docs** — `src/services/AGENTS.md` (firebase.ts row), root `AGENTS.md` §4 (App Check iron rule), `PRODUCTION_READINESS_TODO.md` (checkbox + as-built + owner console checklist entry).

## 4. Robust Unit Testing Plan (MANDATORY)

All in `src/tests/`, Firestore/Firebase mocked at the module boundary; no network, no emulator (no emulator infra exists in this repo — the `orderCreateContract` drift-guard approach is the sanctioned substitute; adding `@firebase/rules-unit-testing` + an emulator dependency would violate the anti-overshooting guardrails).

1. **`src/tests/services/firebase.test.ts`** (extend; module re-imported fresh per scenario with `vi.resetModules()` + `vi.stubEnv`):
   - App Check initialized with `ReCaptchaV3Provider(siteKey)` and `isTokenAutoRefreshEnabled: true`, **after** `initializeApp` and **before** `initializeFirestore`/`getAuth` (asserted via `mock.invocationCallOrder`).
   - Missing site key → `initializeAppCheck` **not** called, `console.warn` fires, `db` still initializes (storefront survives; production variant logs `console.error`).
   - Debug token set only when `VITE_VERCEL_ENV !== 'production'`; the capture mock records its value **at init time** (proving assignment-before-init ordering).
   - The pre-existing `ignoreUndefinedProperties` pin keeps passing.
2. **`src/tests/security/firestore-rules.test.ts`** (content assertions — the repo's rules-testing convention):
   - `c.city in ['Melipilla', 'San Antonio']`, `c.documentType == 'boleta'`, `b.documentType == 'boleta'`, the RUT `matches(...)` pin, `createdAt is timestamp` + the `duration.value(15, 'm')` window, and `isValidOrderItem(data.items[0…24])` — all 25 lines.
3. **`src/tests/security/orderCreateContract.test.ts`**:
   - Real `submitOrder()` payload: `customer.rut === '12345678-5'` from input `'12.345.678-5'`, `billing.rut` identical, `customer.city` ∈ `DELIVERY_ZONES`, `documentType === 'boleta'`.
   - Rules-side bindings asserted as source text (boleta-only, zone, RUT, timestamp window, 25 line guards).
4. **Zero regressions:** the full suite (1004 tests / 89 suites at baseline) must stay green; the factura-payload case in `orderCreateContract` is updated to document that the rules now reject that payload at the boundary (shape allowlist still validated; the code path is retained behind `FACTURA_ENABLED = false`).

## 5. As-Built Documentation & Roadmap Sync Plan

- `src/services/AGENTS.md`: update the `firebase.ts` row + §2 context (App Check init order, env var, debug token, enforcement-as-console-decision).
- Root `AGENTS.md` §4: add the App Check iron rule for public order creation.
- `PRODUCTION_READINESS_TODO.md`: mark 8.16 `[x]` in §1 board + §3 entry (as-built paragraph); add the owner console checklist item (register → monitor → enforce → verify preview checkout with enforcement).
- `.devin/artifacts/task-8.16/walkthrough.md` at wrap-up.
