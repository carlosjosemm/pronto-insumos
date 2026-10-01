# Task 8.16 Walkthrough — Firebase App Check for the Public `orders` Create Path

**Branch:** `feat/task-8.16-app-check-order-create-rules`
**Status:** wrapped up (YOLO layer 1 of the 8.16 → 8.2 → 8.11 stack)
**Plan:** [implementation_plan.md](./implementation_plan.md)

## What was implemented

1. **App Check initialization (`src/services/firebase.ts`)** — `initializeAppCheck` with `ReCaptchaV3Provider` (`VITE_FIREBASE_RECAPTCHA_SITE_KEY`), after `initializeApp` and **before** the Firestore/Auth instances. Debug token (`self.FIREBASE_APPCHECK_DEBUG_TOKEN`, optional explicit value via `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`) set only outside a production runtime — where production = `import.meta.env.PROD` **or** `VITE_VERCEL_ENV === 'production'` (the `PROD` term covers locally-built production bundles, where the define is empty — review finding F2). Missing key fails visibly (loud `console.error` in production, `console.warn` in dev) and never blanks the storefront; an `initializeAppCheck` throw (HMR double registration) is caught and warned.
2. **Order-create contract hardening (`firestore.rules`)** — all four enumerated gaps closed: `customer.city in ['Melipilla', 'San Antonio']`; Boleta-only `documentType` in `customer` and `billing`; `customer.rut.matches('^[0-9]{7,8}-[0-9K]$')`; `createdAt is timestamp` within `request.time ± 15m` (`duration.value(15, 'm')`). All **25** item lines are now index-guard shape-checked — verified against the documented rules limits (no function-call count limit; depth 20; 1,000 expressions/request, not approached).
3. **Canonical RUT storage (`src/services/api.ts`)** — `submitOrder` normalizes the purchaser's RUT to `12345678-5` for `customer.rut` + `billing.rut`; uncleanable input passes through and the rules reject it (fail-closed).
4. **Email display boundary (`api/_lib/emailTemplates.ts`)** — `toOrderEmailData` renders the RUT through `formatRut`, so emails keep the `12.345.678-5` notation for both stored cohorts (review finding F1).
5. **`.env.example`** — `VITE_FIREBASE_RECAPTCHA_SITE_KEY` + `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` documented with the console registration, debug-token and enforcement workflow.
6. **Tests** — 8-case `firebase.test.ts` (init order via `invocationCallOrder`, provider/args, debug-token-before-init capture, explicit-token passthrough, production-nevers, missing-key dev/prod branches, HMR throw tolerance); all-25-line + new-pins assertions in `firestore-rules.test.ts`; RUT/zone/boleta drift-guard cases in `orderCreateContract.test.ts`; updated `api.test.ts` / `email.test.ts` expectations.

## Verification

- `pnpm test`: **1265/1265 tests, 101 suites** (baseline 1255; +10 net new).
- `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit`: all clean.

## Code review (adversarial, fresh-context) — findings & disposition

| Finding | Severity | Disposition |
| :-- | :-- | :-- |
| F1 — stored-RUT format change regressed the raw rendering in transactional emails (and the as-built overclaimed "no display surface regressed") | MINOR | **Fixed**: `formatRut` at the `toOrderEmailData` sanitizer boundary (single render authority), email tests updated, TODO claim corrected. Admin surfaces already used `formatRut`; tracking compares cleaned RUTs server-side (verified). |
| F2 — the `VITE_VERCEL_ENV` define is empty on a locally-built production bundle, so the debug-token gate would ship there | MINOR | **Fixed**: production runtime = `import.meta.env.PROD || VITE_VERCEL_ENV === 'production'`, with a self-contained comment. (The same convention question for `simulationPolicy.ts` is pre-existing and out of scope — noted, not silently changed.) |
| F3 — catch-all labeled every `initializeAppCheck` throw as an HMR double-registration | NIT | **Fixed**: neutral message ("initialization failed; continuing without a new instance"). |

Reviewer verdict: APPROVE WITH FINDINGS (all remediated, gates re-run green).

## Remaining human action items (owner console steps)

1. Register App Check for the web app in the Firebase Console — reCAPTCHA **v3** provider.
2. Set `VITE_FIREBASE_RECAPTCHA_SITE_KEY` per environment (`.env.local`, Vercel).
3. Register the local-dev debug token (SDK prints it to the console) if local testing with enforcement is needed.
4. Deploy the hardened rules: `pnpm run deploy:rules` (folded into the standing 0.12 owner gate — the rules pin must be live before enforcement).
5. Monitor → enforce App Check for Firestore, verifying **preview order creation works with enforcement enabled** before enforcing in production.

## PR

Created against `main` as the bottom layer of the stack.
