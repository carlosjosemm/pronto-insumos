# Tasks 0.15 & 0.16: Admin Dispatch `undefined` Crash + `track-order` Production Fail-Closed

**Branch:** `fix/task-0.15-0.16-admin-dispatch-and-track-order-fail-closed` (cut from `main` @ `7a927f1`, verified in sync with `origin/main`; executing in the isolated Windsurf worktree)
**RequestFeedback:** true · **UserFacing:** true
**Scope decision:** both P1 audit findings are bundled in one branch at the owner's request (same precedent as the merged `fix/task-0.12-0.13-*` branch). They are both single-file serverless fixes with no shared code path, so they stay independently reviewable.
**Owner decisions:** (1) **both** 0.15 fixes (handler omission + `ignoreUndefinedProperties` guard); (2) **two commits in one PR** (one per task, not one branch per task); (3) the auto-generated internal tracking reference is **not** implemented here — it is added to the roadmap as the new P2 item **2.13** and built in its own cycle (it spans the webhook, `approve-transfer`, `dispatch-order`, the `Order` type and the tracking copy).
**Status:** Implemented, verified and adversarially reviewed; review findings F1–F6 remediated. Awaiting the explicit **"wrap up and proceed"** command before staging/committing.

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **0.15** and **0.16** (2026-09-29 audit findings, both P1 launch blockers).

### 0.15 — Admin "Marcar Despachado" crashes without a tracking number

`api/_lib/admin/dispatch-order.ts:53-67` writes two `undefined` values whenever the admin leaves the tracking-code field empty:

```ts
trackingCode: trackingCode ? String(trackingCode).trim() : undefined,   // inside `dispatch`
trackingNumber: trackingCode ? String(trackingCode).trim() : undefined, // top-level
```

The UI (`src/admin/components/OrderDetailPanel.tsx:97`) sends `trackingCode: trackingCode.trim() || undefined`, and the **default carrier is the local Melipilla fleet**, which normally has no tracking code — so the most common dispatch path is the one that crashes. `firebase-admin` rejects `undefined` (`Cannot use "undefined" as a Firestore value … enable ignoreUndefinedProperties`), the handler's `catch` turns it into a `500`, and the order is never dispatched. The only existing test (`src/tests/api/admin/dispatch-order.test.ts:67`) always supplies a code, which is why the bug shipped.

### 0.16 — `track-order` fabricates an order in production when Firebase credentials are missing

`api/track-order.ts:32-72` returns a fully fabricated order ("Dra. Andrea Morales", `$189.990`, a `factura` with a fake Razón Social) whenever `getAdminFirestore()` is `null` — **in any runtime**. A deploy that loses `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` shows customers plausible-looking fake tracking data instead of an error, and hides the misconfiguration from operators. `upload-voucher` was already fixed in 2.9 by gating the simulated branch behind `isSimulatedPaymentAllowed()`; `track-order` is the remaining endpoint with the old fail-open contract.

### Audit result (required by 0.15: "audit other Admin writes for `undefined`")

Every Firestore write under `api/` was inspected (`grep` for `: undefined` plus a read of each `.set(` / `.update(` payload): `approve-transfer`, `resolve-payment-review`, `mark-delivered`, `update-stock`, `update-product`, `create-product`, `toggle-visibility`, `upload-voucher`, `order-confirmation` and the Mercado Pago webhook all build defined payloads. The two other `undefined` occurrences are **not** Firestore writes: `create-preference.ts:207` builds the Mercado Pago preference body (JSON over `fetch`, dropped by `JSON.stringify`) and `track-order.ts:169` builds the HTTP response. **`dispatch-order.ts` is the only offender** — but nothing structurally prevents the next handler from repeating it, which is why §3.B adds the shared guard.

---

## 2. Human Action Items & Placeholders (TODO for Human)

No new credentials, no new environment variables, no `.env.example` change — both fixes only tighten existing serverless behaviour.

| # | Action | Where / command |
| :-- | :--- | :--- |
| H1 | Confirm the three `FIREBASE_*` Admin credentials are present in **Vercel Production** (after 0.16 a missing one is a loud `500` instead of fake data — correct, but it must not be hit in practice) | `pnpm dlx vercel@latest env ls` |
| H2 | Manual smoke test on a preview deploy: dispatch a paid order with carrier *Despacho Local Melipilla (Flota Directa)* and an **empty** tracking number → expect `200` + status `DESPACHADO`; then a second dispatch with a code → code persisted | Manual, after deploy |
| H3 | Manual smoke test: open the tracking modal with a wrong RUT (expect `401`) and, if a preview has Admin credentials removed, confirm the honest `500` message | Manual, after deploy |

`.env.example` is untouched: `ALLOW_SIMULATED_PAYMENTS` (the 0.16 escape hatch) is already documented there from Task 0.10.

---

## 3. Proposed Changes

### 3.A `[MODIFY] api/_lib/admin/dispatch-order.ts` — omit absent keys (root-cause fix)

Build the update payload with conditional keys instead of `undefined` values:

```ts
const cleanCarrier = carrier.trim()
const cleanTrackingCode =
  trackingCode === undefined || trackingCode === null ? '' : String(trackingCode).trim()

const dispatchData: Record<string, unknown> = {
  carrier: cleanCarrier,
  dispatchedAt: nowIso,
  dispatchedBy: authResult.email || authResult.uid || 'admin'
}
if (cleanTrackingCode) dispatchData.trackingCode = cleanTrackingCode

const orderUpdate: Record<string, unknown> = {
  status: 'DESPACHADO',
  dispatch: dispatchData,
  courier: cleanCarrier,
  updatedAt: nowIso
}
// The Admin SDK rejects `undefined` field values (Task 0.15) and the local Melipilla
// fleet usually has no tracking code, so the key is omitted rather than nulled.
if (cleanTrackingCode) orderUpdate.trackingNumber = cleanTrackingCode

batch.update(orderRef, orderUpdate)
```

- `String(...)` coercion is kept so a numeric code from any caller still lands as text; empty / whitespace-only values count as absent.
- Re-dispatching an order without a code now **keeps** the previously stored `trackingNumber` (omitted key = untouched field) — safer than erasing real tracking data.
- The `order_status_history` event already handled absence correctly (`metadata.trackingNumber: … : null`) and is unchanged, as is the `reason` string.

### 3.B `[MODIFY] api/_lib/firebaseAdmin.ts` — one-time `ignoreUndefinedProperties` guard (defense-in-depth)

```ts
const firestore = getFirestore(app)
// Defense-in-depth for Task 0.15: the Admin SDK throws on `undefined` field values
// (what broke dispatch-order). Handlers still omit absent keys; this keeps a stray
// `undefined` in any of the 11 admin handlers from 500-ing an endpoint.
// Called immediately after construction — before the instance is first used, which
// is the only window where Firestore accepts settings.
firestore.settings({ ignoreUndefinedProperties: true })
```

- Mirrors the client-side setting added in Task 0.11 (`initializeFirestore(app, { ignoreUndefinedProperties: true })` in `src/services/firebase.ts`), so both SDKs now behave identically.
- `firebase-admin`'s own `initializeFirestore()` helper is **not** usable here: its `FirestoreSettings` type exposes only `preferRest`, so `ignoreUndefinedProperties` cannot be passed without a cast. `Firestore.settings()` takes the full `@google-cloud/firestore` `Settings` (verified in the installed `@google-cloud/firestore@9.2.0` typings, `types/firestore.d.ts:504`).
- Trade-off accepted and documented: a stray `undefined` is now skipped instead of throwing, so a handler bug of this class degrades to a missing field rather than a `500`. The handler-level omission in §3.A remains the primary fix.

### 3.C `[MODIFY] api/track-order.ts` — fail closed in production (0.16)

```ts
import { isSimulatedPaymentAllowed } from './_lib/simulationPolicy.js'

const TRACKING_UNAVAILABLE_MESSAGE =
  'No pudimos consultar el estado del pedido. Escríbenos por WhatsApp y lo revisamos manualmente.'

    const adminDb = getAdminFirestore()
    if (!adminDb) {
      if (!isSimulatedPaymentAllowed()) {
        console.error(
          '[track-order] Firestore Admin unavailable in a production runtime — refusing to fabricate tracking data.'
        )
        return res.status(500).json({ error: TRACKING_UNAVAILABLE_MESSAGE })
      }
      console.warn('Firestore Admin not available. Returning simulated order tracking response.')
      return res.status(200).json({ /* existing simulated payload, unchanged */ })
    }
```

- Reuses the single shared gate `isSimulatedPaymentAllowed()` (`VERCEL_ENV !== 'production'`, or the strict `ALLOW_SIMULATED_PAYMENTS='true'` opt-in) — the same definition `create-preference` (0.9/0.10) and `upload-voucher` (2.9) already use, so the policy cannot drift.
- The simulated payload itself is left byte-for-byte identical (dev/demo behaviour preserved); only its reachability changes.
- No client change needed: `src/services/orderTracking.ts` already surfaces a real HTTP error message and only simulates on a *transport* failure outside production.

### Explicitly NOT done (scope guardrails)

- No new serverless function (Hobby slot count stays **6/12**), no new dependency, no Firestore schema/rules change, no UI/CSS change.
- No 0.12/0.14 webhook work, no refactor of the other admin handlers, no shared "sanitize payload" utility (one guard in one place is enough — anti-overshooting).
- No change to the `dispatch` map's existing field names or to the tracking-modal payload shape.

---

## 4. Robust Unit Testing Plan (MANDATORY)

All boundaries mocked (`firebase-admin/app`, `firebase-admin/firestore`, `api/_lib/firebaseAdmin`, `api/_lib/adminAuth`); no live Firebase calls.

**`[MODIFY] src/tests/api/admin/dispatch-order.test.ts`** (+3; the 2 existing tests are kept untouched → 5)

- **Regression for the crash:** POST without `trackingCode` → `200` + `status: 'DESPACHADO'`; the captured `batch.update` payload is deep-scanned for `undefined` (a recursive helper — `JSON.stringify` would silently drop it) and asserts the **`trackingNumber` key is absent** and `dispatch.trackingCode` is absent, while `dispatch.carrier` / `dispatchedAt` / `dispatchedBy` are present. History event asserts `metadata.trackingNumber === null`.
- **Absent-value edge cases:** `trackingCode: ''`, `'   '` (whitespace) → treated as absent, no `undefined`, no empty-string key; `trackingCode: 998877` (number) → coerced to `'998877'`.
- Existing happy path (code supplied ⇒ `trackingNumber: 'STK-998877'`) and the doc-id→field-query fallback test stay green.

**`[MODIFY] src/tests/api/track-order.test.ts`** (+3; the 8 existing tests are kept untouched → 11)

- Adds the 0.10-style env backup: `delete process.env.VERCEL_ENV` / `ALLOW_SIMULATED_PAYMENTS` in `beforeEach`, restored in `afterEach` (a developer shell can never flip the gate).
- **Production fail-closed:** `VERCEL_ENV=production` + `getAdminFirestore()` → `null` ⇒ `500` + `console.error` spy called; the response body is asserted to contain **no fabricated data** (`JSON.stringify(res.json.calls[0][0])` must not contain `Dra. Andrea Morales`, `189990` or `factura`).
- **Escape hatch:** `VERCEL_ENV=production` + `ALLOW_SIMULATED_PAYMENTS='true'` ⇒ `200` simulated payload (documented demo path).
- **Dev/preview contract pinned:** `VERCEL_ENV` unset + Admin `null` ⇒ `200` simulated payload (`simulated` behaviour preserved for local work).
- The existing 404 / 401 / happy-path / legacy-Base64-voucher tests (which mock a real Admin double) are unaffected.

**`[NEW] src/tests/api/firebaseAdmin.test.ts`** (+3) — pins §3.B the same way `src/tests/services/firebase.test.ts` pins the client setting:

- `getAdminFirestore()` calls `settings({ ignoreUndefinedProperties: true })` exactly once, on the instance it returns (fresh module via `vi.resetModules()` + dynamic import so the module singleton is exercised per case).
- Missing credentials ⇒ `null` (existing degradation contract unchanged) and `getFirestore` never called.
- `initializeApp` rejection ⇒ `null` + `console.error` (init-failure path preserved).

**Zero-regression target:** `pnpm test` — **663 tests / 72 suites** on `main` → **measured 672 tests / 73 suites** after this change (+9: dispatch +3, track-order +3, the new `firebaseAdmin` suite +3) → **697 tests / 76 suites** after rebasing onto the merged 0.12 + 0.13 work, all green, plus `pnpm build`, `pnpm lint`, `pnpm format:check` and `pnpm exec tsc --noEmit` clean (and the `api/` strict type-check from TODO 8.2 re-run on the three touched files).

---

## 5. As-Built Documentation & Roadmap Sync Plan

- **`api/AGENTS.md`:** §1 `firebaseAdmin` bullet gains the `ignoreUndefinedProperties: true` note; §3.1 `track-order` — the "⚠️ simulated fallback fabricates a plausible order" warning is replaced by the as-built fail-closed contract (`500` in production, `isSimulatedPaymentAllowed()` escape hatch); the admin-handler section records the omit-absent-keys dispatch contract.
- **`src/admin/AGENTS.md`:** §1 *Marcar Despachado* — the tracking number is optional and absent keys are omitted from the Admin SDK write (the crash documented as fixed).
- **`src/tests/AGENTS.md`:** suite/test counts (refreshed to the measured baseline — 697/76 after the rebase), the new `firebaseAdmin` suite in the `api/` inventory, the dispatch/track-order additions — **and a one-line hygiene fix**: the file carried a stray leftover `<<<<<<< HEAD` conflict marker at line 30 (shipped on `main` by the 2.9 commit). It is deleted here; flagging it explicitly rather than silently.
- **Root `AGENTS.md`:** the three test-count references (operational state, test command comment, pre-flight step) are refreshed to the measured baseline (697/76 after the rebase) — the counts live here too.
- **`PRODUCTION_READINESS_TODO.md`:** 0.15 and 0.16 are removed from §3 and recorded as one-line outcomes in §2, their rows dropped from the §1 glance table, the new **2.13** item added to Phase 2, the baseline header refreshed (697/76), and the two `api/track-order.ts` line references elsewhere in the file shifted by the +13 lines this change adds.
- **Commit split (owner decision):** two commits, one PR. Commit 1 = Task 0.15 (code, tests, `src/admin/AGENTS.md`). Commit 2 = Task 0.16 (code, tests) **plus the shared as-built docs** (`api/AGENTS.md`, `src/tests/AGENTS.md`, root `AGENTS.md`, `PRODUCTION_READINESS_TODO.md`, this plan) — those files carry both tasks' updates and cannot be split without partial staging, so they travel together in the second commit rather than being fragmented.

---

## 6. Verification Sequence (workflow steps 6 → 8) — executed

1. `pnpm test` — **697/697 tests across 76 suites, green** after rebasing onto the merged 0.12 + 0.13 work (+9 from this branch, zero regressions).
2. **Negative verification:** the buggy `HEAD` sources were temporarily restored and the new suites re-run — 4 of the new tests fail (dispatch without a code, blank/whitespace code, the Admin `settings` contract, the production `500`), proving they are real regression guards, not tautologies. The fixed versions were then restored and `diff`-verified byte-for-byte.
3. `pnpm build` — production bundle compiles (only the pre-existing chunk-size warning).
4. `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit` — all clean; the three touched `api/` files also pass the TODO 8.2 strict check (`tsc --noEmit --strict --module esnext --moduleResolution bundler --types node`).
5. Adversarial read-only code review (independent reviewer, `git diff HEAD` + contract docs + an empirical reproduction against real `firebase-admin`): verdict **approve with findings**; F1–F6 (stale as-built docs, unclosed roadmap entry, stale test counts, shifted line refs, a pre-existing blanket claim, plan bookkeeping) all remediated, plus the stray `<<<<< HEAD` marker removed. No findings left open.
6. Stop for human wrap-up; commit only on explicit **"wrap up and proceed"**.

---

## 7. Rebase onto the Merged 0.12 + 0.13 Work (post-review)

`origin/main` advanced to the merge of PR #23 (Tasks 0.12 + 0.13) while this branch was under review. The rebase applied commit 1 cleanly and produced six conflicts in commit 2, all resolved by hand:

| File | Conflict | Resolution |
| :--- | :--- | :--- |
| `api/track-order.ts` | Import block — their `resolveOrderByCanonicalId` helper vs. my `isSimulatedPaymentAllowed` + message constant | Both kept; `getCollectionName` dropped (the shared resolver owns the collection lookup now) |
| `src/tests/api/track-order.test.ts` | Both sides appended tests at the same anchor | Both kept — the two Task 0.12 cases and my Task 0.16 describe block; 13 tests in the file, green |
| `AGENTS.md` | Firestore-rules bullet + three test-count references | Took their 0.12 bullet (it already carries the backtick fix), then re-measured the counts |
| `PRODUCTION_READINESS_TODO.md` | §2 resolved-table rows | All four rows kept (0.12, 0.13, 0.15, 0.16) |
| `src/tests/AGENTS.md` | `api/` suite inventory + counts | Their base, with `firebaseAdmin` added to the list and the 0.15/0.16 paragraph appended |
| `implementation_plan.md` | Whole-file (both tasks rewrote it) | Took this task's version — the file is a per-task volatile artifact by convention |

Post-rebase verification: `pnpm test` **697/697 (76 suites)**, plus `pnpm lint`, `pnpm build`, `pnpm format:check` and `tsc --noEmit` clean. Every count reference in the repo was re-measured, not carried over.
