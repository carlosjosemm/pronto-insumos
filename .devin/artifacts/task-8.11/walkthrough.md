# Task 8.11 Walkthrough — Resilient Firebase Init

**Branch:** `feat/task-8.11-resilient-firebase-init` (stack layer 3, on top of `feat/task-8.2-server-typecheck`)
**Status:** wrapped up (YOLO layer 3 of the 8.16 → 8.2 → 8.11 stack)
**Plan:** [implementation_plan.md](./implementation_plan.md)

## What was implemented

1. **`src/services/firebase.ts`** — the module-scope `getAuth(app)` call is gone (it threw `auth/invalid-api-key` synchronously on a missing/invalid `VITE_FIREBASE_API_KEY` and aborted the whole storefront import graph → blank page). The module now exports the `app` instance; a self-contained comment explains why auth must never come back here.
2. **`src/admin/services/adminFirebase.ts` (new)** — `getAdminAuth(): Auth | null`: the admin-tree-only guarded accessor. A broken config returns `null` with a loud `[Admin Auth]` error log instead of throwing through the module boundary.
3. **Admin consumers** — `AdminLogin` surfaces a Spanish configuration error on submit and never calls `signInWithEmailAndPassword`; `AdminApp` stays on the login screen with no listener registered; `adminApi.getAuthHeaders()` sends no bearer token (the server answers `401`); `handleSignOut` degrades to clearing local state.
4. **`vite.config.ts`** — `firebase/auth` removed from the `vendor-firebase` manual chunk (only the admin entry imports it). **Measured:** `vendor-firebase` shrank 672.31 kB → **548.31 kB** (−124 kB raw, −35 kB gzip on the shared chunk); the reviewer additionally verified auth-SDK markers exist only in the `admin-*.js` chunks, never in the storefront's.
5. **Tests** — hostile throwing `getAuth` mock in `firebase.test.ts` (module import must succeed without ever calling it — the blank-storefront regression pin); new `src/tests/admin/adminFirebase.test.ts` (instance passthrough, `null` + loud log on throw, chunk-config pin, and the single-source import guard scanning `src/` for any non-admin `firebase/auth`/`adminFirebase` import); broken-config cases in `AdminLogin.test.tsx` / `AdminApp.test.tsx`.
6. **Docs** — `src/services/AGENTS.md` (row + §2.2 caveat + §4.5 rewritten as resolved), `src/admin/AGENTS.md` §3.1 (auth instance ownership), root `AGENTS.md` (four deployment-guardrail passages that described the now-eliminated blank-page mechanism + counts), `src/tests/AGENTS.md` (counts + new suites), roadmap (checkbox + as-built + 8.1 cross-note).

## Verification

- `pnpm test`: **1277/1277 tests, 103 suites** (baseline 1270; +7 net new).
- `pnpm run verify` (test + browser tsc + server tsc + build), `pnpm lint`, `pnpm format:check`: all clean.
- Reviewer-verified against the real installed Firebase SDK: `getAuth` throws on empty config and re-throws on retry (the per-call loudness in `adminApi` is intended fail-visible behavior); `initializeApp`/`initializeFirestore` never throw on the `|| ''`-defaulted config; the built storefront chunks contain no auth-SDK code.

## Code review (adversarial, fresh-context) — findings & disposition

| Finding | Severity | Disposition |
| :-- | :-- | :-- |
| F1 — root `AGENTS.md` still described the eliminated blank-page failure mode in four deployment-guardrail passages | MAJOR | **Fixed** — all four passages rewritten to the post-8.11 behavior (catalog-unavailable card, admin-only config error), keeping the "green build proves nothing / verify env + load the URL" guardrail. |
| F2 — test counts diverged between root `AGENTS.md` and `src/tests/AGENTS.md` | MINOR | **Fixed** — both now say 103 suites / 1277 tests. |
| F3 — two list items in `src/tests/AGENTS.md` lost their Markdown bullets (my perl edit) | MINOR | **Fixed** — `* \`admin/\`` and `* \`security/\`` bullets restored. |
| F4 — the "only `src/admin/**` may import the accessor" invariant was documented but unenforced | MINOR | **Fixed** — recursive single-source import guard added to `adminFirebase.test.ts` (the WhatsApp-guard pattern), matching import statements only so comment prose doesn't false-positive. |
| F5 — broken config logs on every admin API call | NIT | **Confirmed intended** — fail-visible by repo mandate; the reviewer verified the SDK re-throws on every call. No change. |

Reviewer verdict: APPROVE WITH FINDINGS (all remediated; gates re-run green at 1277/1277).

## PR

Created against `feat/task-8.2-server-typecheck` (stack layer 3, top of the stack).
