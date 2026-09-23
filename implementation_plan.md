# Task 8.6: Consolidate `api/` Endpoints Below the Vercel Hobby Function Cap

**Branch:** `fix/task-8.6-api-consolidation` (created from `main` @ `e4206bc`, after pulling the Phase 5 merge that local `main` was missing)
**Status:** Awaiting user approval — no source code changes until approved.

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **8.6. Consolidate `api/` Endpoints Below the Vercel Hobby Function Cap** 🔴 **BLOCKS EVERY DEPLOYMENT**.

Every deployment — preview *and* production — is rejected at the output stage:

```
Error: No more than 12 Serverless Functions can be added to a Deployment
on the Hobby plan. Create a team (Pro plan) to deploy more.
```

**The problem is worse than the TODO states.** The TODO counts 15 endpoint files, but Vercel counts **every** file under `api/` as a function unless its path contains `/_` (underscore-prefixed segment), starts with `.`, or ends in `.d.ts` ([docs](https://vercel.com/docs/functions/configuring-functions/advanced-configuration); `fs-detectors` skips `fileName.includes('/_')`). That means `api/lib/*` counts too. Current real count on `main` after PR #11:

| Location | Files | Counted? |
| :--- | :--- | :--- |
| `api/admin/*.ts` | 11 handlers | Yes |
| `api/lib/*.ts` | 6 shared modules (`adminAuth`, `firebaseAdmin`, `firestoreEnv`, `mercadopagoSignature`, `email`, `emailTemplates`) | **Yes — undocumented in TODO** |
| `api/*.ts` root | 4 (`create-preference`, `order-confirmation`, `track-order`, `upload-voucher`) | Yes |
| `api/webhooks/mercadopago.ts` | 1 | Yes |
| **Total** | **22** | vs. Hobby cap of **12** |

This also retroactively explains the timeline in the TODO: pre-2026-09-17 deploys succeeded with 4 endpoints + ~4 lib files ≈ 8 functions (< 12); the admin endpoints pushed it to ~19.

**Chosen remediation (TODO option 1 — preferred, no cost):** collapse the 11 `api/admin/*` endpoints behind a single routed entry point, and move all non-route code under `api/_lib/` so it is excluded from the function count by Vercel's documented convention.

**Resulting function count: 6** — `api/admin/[action].ts`, `create-preference`, `order-confirmation`, `track-order`, `upload-voucher`, `webhooks/mercadopago`. Headroom for 6 future functions.

**Guardrail tension (flagged in TODO, resolved here):** root `AGENTS.md` §2.2 mandates *"single-purpose Vercel Serverless Functions"*. A single routed `api/admin/[action].ts` entry point is a deliberate, documented exception — **no** Express/NestJS/Koa/Fastify, just a plain dispatch table. The exception will be recorded in root `AGENTS.md` §2 and `api/AGENTS.md` as part of this change (TODO §8.6 requires recording the decision when it lands).

## 2. Human Action Items & Placeholders (TODO for Human)

- **No new credentials or env vars required.** `process.env` usage is untouched; `.env.example` needs no changes.
- **Post-merge human verification (acceptance criteria, requires Vercel auth):**
  - `pnpm dlx vercel@latest deploy` → confirm Preview URL reaches `● Ready` (proves ≤12 functions).
  - `pnpm dlx vercel@latest deploy --prod` → still gated by the human-produced `public/og-preview.png` asset (root `AGENTS.md` §7 / TODO §7.3) — unrelated to this task.
- **No code placeholders.** Every change is fully implemented in-repo.

## 3. Proposed Changes

### 3.1 `api/` — Serverless Function Restructure

- **[RENAME] `api/lib/` → `api/_lib/`** — all 6 shared modules. Underscore-prefixed paths are excluded from Vercel's function detection; this alone removes ~6 phantom functions and is the documented convention for shared code inside `api/`.
- **[MOVE] `api/admin/*.ts` (11 handlers) → `api/_lib/admin/*.ts`** — handler bodies move **verbatim** (each keeps its own CORS headers, `OPTIONS` preflight, method gate, `verifyAdminToken`, and error handling — zero behavioral drift). Internal imports rewritten: `../lib/x` → `../x`.
- **[NEW] `api/admin/[action].ts`** — single dynamic-segment function. Vercel routes `/api/admin/orders` → `req.query.action === 'orders'`. A plain `Record<string, handler>` dispatch table maps the 11 action names to the moved handlers:
  - `dashboard-stats`, `orders`, `order-history`, `products` (GET) and `approve-transfer`, `dispatch-order`, `mark-delivered`, `update-stock`, `update-product`, `create-product`, `toggle-visibility` (POST).
  - Unknown/missing `action` → `404 { success: false, error: 'Endpoint de administración no encontrado' }`.
  - Defensive normalization: `action` as `string[]` → first element; non-string/empty → 404.
  - No auth/CORS duplication in the dispatcher — delegated handlers enforce their own, exactly as today.
- **[MODIFY] `api/create-preference.ts`, `api/order-confirmation.ts`, `api/track-order.ts`, `api/upload-voucher.ts`, `api/webhooks/mercadopago.ts`** — import path updates only (`./lib/` → `./_lib/`). No logic changes.
- **Public URLs unchanged:** `/api/admin/<action>` resolves identically via the dynamic segment — `src/admin/services/adminApi.ts` needs **zero changes** and `vercel.json` needs **zero changes** (its `((?!api/).*)` catch-all already passes `api/` paths to filesystem routing).

### 3.2 `src/tests/` — Import Path Updates + New Router Suite

- **[MODIFY] `src/tests/api/admin/*.test.ts` (9 files)** — handler imports `api/admin/x` → `api/_lib/admin/x`; lib imports `api/lib/*` → `api/_lib/*`. Assertions untouched.
- **[MODIFY] `src/tests/api/*.test.ts` (7 files)** — `api/lib/*` → `api/_lib/*` imports only.
- **[NEW] `src/tests/api/admin/admin-router.test.ts`** — dispatcher unit tests (see §4).
- **[MODIFY] `scripts/send-test-comms.ts`** — `api/lib` → `api/_lib` imports.

### 3.3 Documentation (as-built, per TODO requirement)

- **[MODIFY] `AGENTS.md` §2.2** — record the documented exception: a single routed `api/admin/[action].ts` entry point is permitted to satisfy the Hobby function cap; the anti-framework rule (no Express/NestJS) still stands.
- **[MODIFY] `api/AGENTS.md`** — fix stale "All 11 serverless functions" claim (real count + new architecture), add `order-confirmation` to §1.1 table (missing), document the `[action]` dispatcher + `api/_lib/` convention in §5, refresh §5.2 intro.
- **[MODIFY] `src/tests/AGENTS.md`** — update `api/` path references in the directory-structure description.
- **[MODIFY] `PRODUCTION_READINESS_TODO.md`** — mark 8.6 `[x]` and correct the stale "15 functions" count.

## 4. Robust Unit Testing Plan (MANDATORY)

**Mocking strategy:** identical to existing suites — `vi.mock` of `api/_lib/adminAuth`, `api/_lib/firebaseAdmin`, `firebase-admin/auth`; mock `VercelRequest`/`VercelResponse` objects. No real network/Firebase calls.

**New suite `src/tests/api/admin/admin-router.test.ts`** (mock all 11 handler modules as `vi.fn()`):

1. **Happy path:** `req.query.action = 'orders'` → `ordersHandler` invoked once with `(req, res)`; same for a POST action (`approve-transfer`).
2. **Unknown action:** `action = 'nukes-inventory'` → 404 JSON `{ success: false }`, no handler invoked.
3. **Missing action:** `action` undefined/empty → 404, no handler invoked.
4. **Array normalization:** `action = ['orders']` → routes to `ordersHandler`.
5. **OPTIONS passthrough:** `method: 'OPTIONS', action: 'orders'` → delegated to handler (which owns preflight), dispatcher does not short-circuit.
6. **All 11 actions mapped:** each key in the dispatch table resolves to its handler module.

**Regression:** all 377+ existing tests must pass unchanged (import-path updates only). Full suite < 5 s.

## 5. As-Built Documentation & Roadmap Sync Plan

- `AGENTS.md` (root) §2.2 — documented exception for the routed admin entry point.
- `api/AGENTS.md` — §1.1 endpoint table (+`order-confirmation`), §5 router architecture + `api/_lib/` exclusion convention, corrected function counts.
- `src/tests/AGENTS.md` — path reference sweep.
- `PRODUCTION_READINESS_TODO.md` — mark **8.6** `[x]`, correct stale count to reflect the lib-file undercount discovered here.

**Verification gates:** `pnpm test` (zero regressions), `pnpm build`, `pnpm lint`, `pnpm format:check`. Best-effort: `pnpm dlx vercel build` to inspect `.vercel/output` function count locally (requires network/CLI; reported if feasible).
