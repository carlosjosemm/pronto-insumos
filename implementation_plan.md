# Task 2.13: Internal Dispatch Reference for Courier-less Deliveries

**Branch:** `feat/task-2.13-internal-dispatch-reference` (primary working tree — no worktree; cut from `origin/main` @ `eaf79da`, re-based onto `origin/main` @ `4b2a915` before the PR — see §0)
**RequestFeedback:** true · **UserFacing:** true
**Status:** **Implemented, verified and reviewed — 860/860 tests (82 suites)** after the pre-PR rebase onto PR #30; `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit` and the strict `api/**` tsc all clean. **Owner decisions D1–D5 approved 2026-09-29 ("proceed")** and implemented as recommended. Adversarial review round 1 returned M1–M3 + N1 (verdict *approve with findings*); every finding is disposed of in §6. Committed as `feat(dispatch): internal dispatch reference for courier-less deliveries (Task 2.13)`.

---

## 0. Post-Rebase Delta — What PR #30 (Task 2.12) Changed, and Why This Plan Still Holds

`origin/main` moved from `eaf79da` to `4b2a915` (merge of **PR #30**, `fix(checkout): stop the payment-return URL from claiming an accredited payment and wiping the cart`, plus its Spanish flow-reference doc) while this branch was open. The rebase was **conflict-free in code** — every conflict was in shared documentation:

| 2.12 change | Overlap with 2.13 | Adjustment made |
| :--- | :--- | :--- |
| `src/services/orderSession.ts` (new), `App.tsx`, `CheckoutModal.tsx`, `PaymentReturnModal.tsx` | None — 2.13 touches the dispatch/tracking path | No change; the replayed commit applies cleanly |
| New suite `src/tests/services/orderSession.test.ts` (81 suites / 817 tests on `main`) | The count-bearing lines of `AGENTS.md`, `src/tests/AGENTS.md`, `PRODUCTION_READINESS_TODO.md` | Counts recomputed after the rebase: **82 suites / 860 tests** (817 + the 43 added here), `api/` is 13 suites, `services/` is 11 |
| `src/tests/AGENTS.md` — the `sessionStorage` harness bullet + a Task 2.12 sentence on the `components/` bullet + `orderSession` in the `services/` bullet | Same bullets the 2.13 diff edits | Both sides kept: their `services/`/`sessionStorage`/`components` content **and** the `dispatchReference` + Task 2.13 sentences |
| `PRODUCTION_READINESS_TODO.md` — 2.12 resolved (glance row dropped, §2 row added, §3 block removed) | 2.13 resolves itself in the same file | Both rows now live in §2 (2.13, then 2.12); both glance rows and both §3 blocks are gone; header + baseline refreshed to 860/860 (82 suites) |
| `implementation_plan.md` — 2.12's plan was still in the file | This plan overwrote it on the branch | The 2.13 plan wins (the file is a per-task volatile artifact; 2.12's plan is preserved in its own PR history) |

**Conclusion: no scope, design or decision changes** — 2.12 touched the payment-return/tracking-entry surface, 2.13 touches dispatch, the tracking *payload* and the backoffice.

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **2.13. Internal Dispatch Reference for Courier-less Deliveries** *(P2 — owner idea, 2026-09-29)*.

**As built:** the order's tracking reference is a **free-text field the warehouse types at dispatch time** (`OrderDetailPanel` → "Código de Seguimiento / N° Guía" → `dispatch-order` → `trackingNumber` + `dispatch.trackingCode`). Nothing generates one, and there is no courier API. Task 0.15 made a blank code a supported state, so the default route — **Despacho Local Melipilla (Flota Directa)** — routinely ships with **no reference at all**: `track-order` renders `En tránsito con Despacho Local Melipilla (Flota Directa).` and the customer has nothing to quote on WhatsApp, while the warehouse has no handle to locate the parcel.

**Goal:** mint a human-readable **internal dispatch reference** when the order is dispatched, so the manual `dispatch → delivered` flow emulates a courier system until one is integrated — while never masquerading as a courier guía.

### 1.1 The four design questions the roadmap raises (as resolved here)

| Roadmap question | Resolution |
| :--- | :--- |
| **(a) Semantics** — an internal dispatch code, not a courier guía | The reference is a **warehouse/route code** (`MEL-260929-07`), always labeled **"Referencia de Despacho"** — never "N° Guía" / "N° Seguimiento". Courier wording stays reserved for `trackingNumber`, which only exists when a real guía was typed. |
| **(b) Override** — a real Starken/Chilexpress guía must replace it, and the model must tell them apart | `dispatch.reference` + **`dispatch.referenceSource: 'generated' \| 'manual'`**. A typed guía becomes the reference (`manual`) and still writes `trackingNumber`/`trackingCode` exactly as today. Re-dispatch **never downgrades** a manual reference to a generated one, and a generated reference stays **stable** across re-dispatches. |
| **(c) Generation point** — payment transition vs. dispatch action | The **dispatch action** (`api/_lib/admin/dispatch-order.ts`) — the moment the parcel physically leaves the warehouse and the label is printed. The payment webhook/`approve-transfer` (the money authorities) are **not touched**: they run days earlier and would mint codes for orders that never ship. |
| **(d) Customer value** — must add something the order id does not | **Zone + Chilean local date + daily sequence** (`MEL-260929-07`) = a genuine *driver route-sheet number*: "parcel #7 of today's Melipilla run". Surfaced in the tracking modal and in the `DESPACHADO` copy; superseded by a real guía when one exists. |

### 1.2 Owner decisions required (D1–D5)

| # | Decision | **Recommended** | Alternative (leaner / different) |
| :-- | :--- | :--- | :--- |
| **D1** | Reference format | `<ZONE>-<YYMMDD>-<NN>`, zone codes from `src/config/delivery.ts` → `MEL-260929-07` / `SAN-260929-03` | zone-free `DSP-260929-07` |
| **D2** | Daily sequence | **Atomic counter doc** in a new server-only `dispatch_counters` collection (env-scoped `dev_dispatch_counters`), incremented inside the dispatch transaction — this is what makes it a route sheet | no counter: random suffix `MEL-260929-7K3Q` (no new collection, handler keeps its `batch`) |
| **D3** | Generation point | `dispatch-order` only | mint at payment approval (`webhook` / `approve-transfer`) |
| **D4** | Override model | `dispatch.reference` + `dispatch.referenceSource`; typed code ⇒ `manual` (and `trackingNumber` as today) | two always-parallel fields (guía + internal code shown together) |
| **D5** | Customer surface | tracking modal line + `DESPACHADO` status copy + admin panel block | admin/warehouse only (no customer surface) |

**Explicit non-goals (anti-overshooting):** no new serverless function (the module lives in `api/_lib/` — function count stays **6/12**), no courier API integration, no backfill for orders dispatched before this task (they keep today's copy), no dispatch email, no `firestore.rules` change (see §3.H), no new env var.

---

## 2. Human Action Items & Placeholders (TODO for Human)

**None — no new credentials, no `.env.example` change.**

| # | Note | Where |
| :-- | :--- | :--- |
| H1 | `dispatch_counters` is written **exclusively** through the Admin SDK (service account bypasses security rules) and is never read by a client — **no `firestore.rules` entry, no index, no TTL policy** required (the documents must persist; they *are* the sequence). | — |
| H2 | Optional post-deploy spot check: dispatch a dev order and confirm `dispatch.reference` + the counter doc (`dev_dispatch_counters/MEL-YYMMDD`) in the Firebase console. | Manual |

---

## 3. Proposed Changes

### 3.A `[NEW] api/_lib/dispatchReference.ts` — the reference authority (pure, unit-testable)

Server-only, dependency-free, ESM `.js` specifiers per `api/AGENTS.md` §1.3. Lives under `_lib/` → **not counted** as a serverless function.

```ts
export const DISPATCH_REFERENCE_COLLECTION = 'dispatch_counters'

/** 'generated' = minted by PRONTO (internal code) · 'manual' = typed by the warehouse (real guía). */
export type DispatchReferencePlan =
  | { kind: 'manual'; reference: string }
  | { kind: 'keep'; reference: string; source: DispatchReferenceSource }
  | { kind: 'mint' }

/** Chilean local YYMMDD (America/Santiago) — a 21:00 Melipilla dispatch belongs to that local day. */
export function chileanDateKey(date: Date): string            // '260929'

/** 'Melipilla' → 'MEL' · 'San Antonio' → 'SAN' · unknown/legacy city → Melipilla's code. */
export function resolveDispatchReferencePrefix(city?: string): string

export function counterDocumentId(prefix: string, dateKey: string): string   // 'MEL-260929'
export function formatDispatchReference(prefix: string, dateKey: string, sequence: number): string  // 'MEL-260929-07'

/** Pure decision: typed code ⇒ manual · existing manual kept · existing generated kept · else mint. */
export function planDispatchReference(input: {
  typedCode?: string
  existingReference?: string
  existingSource?: DispatchReferenceSource
}): DispatchReferencePlan
```

* Zone codes come from a **new export in `src/config/delivery.ts`** (§3.C) — the zone list is never re-declared in `api/` (root `AGENTS.md` §3.4 / `src/config/AGENTS.md` §1).
* `chileanDateKey` mirrors `dashboard-stats.ts`'s `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' })` precedent.
* Sequence is zero-padded to 2 (`01`), and grows naturally past 99 (`100`) — no truncation, no wrap.

### 3.B `[MODIFY] api/_lib/admin/dispatch-order.ts` — mint / keep / override inside one transaction

1. Gates (`OPTIONS`/`405`/`403`/`400`/`404`) and the doc-key-first + legacy-field-fallback resolution are **unchanged**.
2. The current `db.batch()` becomes **`db.runTransaction()`** (all reads before writes, mirroring `approve-transfer`):
   ```
   tx.get(orderRef)                    → fresh snapshot (the decision must not race a re-dispatch)
   plan = planDispatchReference({ typedCode, existingReference, existingSource })
   if plan.kind === 'mint':
       tx.get(counterRef)              → next = lastNumber + 1 (guarded: non-integer/absent ⇒ 1)
       tx.set(counterRef, { lastNumber: next, updatedAt }, { merge: true })
       reference = formatDispatchReference(prefix, dateKey, next)   // prefix from order.customer.city
   tx.update(orderRef, { status: 'DESPACHADO', courier, updatedAt, dispatch: {...}, ...trackingNumber })
   tx.set(historyRef, { ...audit event... })
   ```
3. `dispatch` block written: `{ carrier, reference, referenceSource, dispatchedAt, dispatchedBy }` + `trackingCode` when a code was typed — **and the previously stored `dispatch.trackingCode` is carried forward on a code-less re-dispatch** (the whole map is replaced by `update()`, so this also closes the small pre-existing inconsistency where a re-dispatch silently dropped the block's `trackingCode` while the top-level `trackingNumber` survived).
4. Top-level `trackingNumber` semantics are **unchanged** (written only when a code is typed; omitted ⇒ untouched).
5. History event: `metadata: { carrier, trackingNumber: code || null, dispatchReference: reference, referenceSource }`, `reason: 'Despachado vía <carrier> (N° Seguimiento: X)'` for a manual code / `'(Ref. Despacho: MEL-260929-07)'` for a generated one.
6. Response gains `dispatchReference` + `referenceSource` (consumed by the admin panel).
7. Fail-closed: any transaction failure ⇒ the existing `500` + loud `console.error` — a dispatch is never recorded without its reference.

### 3.C `[MODIFY] src/config/delivery.ts` — zone → reference-code map (single source)

```ts
/** Internal dispatch-reference prefix per zone (Task 2.13) — a warehouse code, never a courier guía. */
export const DELIVERY_ZONE_REFERENCE_CODES: Record<DeliveryZone, string> = {
  Melipilla: 'MEL',
  'San Antonio': 'SAN'
}
```

### 3.D `[MODIFY] src/types/index.ts` — domain contract

```ts
export type DispatchReferenceSource = 'generated' | 'manual'

// Order.dispatch
dispatch?: {
  carrier: 'starken' | 'chilexpress' | 'blue_express' | 'despacho_local_melipilla' | string
  trackingCode?: string
  reference?: string                 // Task 2.13 — server-written
  referenceSource?: DispatchReferenceSource
  dispatchedAt: string
  dispatchedBy: string
}

// OrderTrackingInfo.fulfillment
dispatchReference?: string
dispatchReferenceSource?: DispatchReferenceSource
```

### 3.E `[MODIFY] api/track-order.ts` — customer copy + payload

`DESPACHADO` branch:
| State | `statusDescription` |
| :--- | :--- |
| Real guía (`trackingNumber`) | `En tránsito con <courier> (N° Seguimiento: <guía>).` *(unchanged)* |
| Generated reference | `En tránsito con <courier> (Ref. Despacho: MEL-260929-07).` |
| Neither (legacy) | `En tránsito con <courier>.` *(unchanged)* |

Payload adds `fulfillment.dispatchReference` + `fulfillment.dispatchReferenceSource`; `trackingNumber` unchanged. The simulated/dev payload is untouched.

### 3.F `[MODIFY] src/components/OrderTrackingModal.tsx` — customer surface

"Logística & Despacho" card gains two conditional lines, rendered by precedence so a manual dispatch (reference === guía) never shows a duplicate:
* `N° Guía / Seguimiento: <trackingNumber>` when a real guía exists — **always wins**;
* otherwise `Referencia de Despacho: <reference>` (with the *(código interno)* marker when `referenceSource === 'generated'`).

Vanilla tokens only (`var(--…)`), no new CSS.

### 3.G `[MODIFY] src/admin/services/adminApi.ts` + `src/admin/components/OrderDetailPanel.tsx` — backoffice

* `dispatchAdminOrder()` returns the new `dispatchReference` / `referenceSource` (`DispatchOrderResult` in `src/admin/types.ts`, typed with the shared `DispatchReferenceSource`).
* Success banner: `¡Pedido marcado como despachado! Ref. Despacho: MEL-260929-07` (guía when manual).
* New compact **"Despacho"** block in the panel when `order.dispatch` exists — carrier label via `CARRIER_LABELS`, reference + source label, `dispatchedAt` (the audit timeline already carries `dispatchedBy`) — today the panel shows none of this.

### 3.H `[MODIFY]` — none in `firestore.rules`

`dispatch` is **already** absent from `isValidOrderCreate()`'s `keys().hasOnly([...])` and client `update`/`delete` on `orders` is denied outright (`firestore.rules`), so the new nested fields are server-written by construction. `src/tests/security/firestore-rules.test.ts`'s admin-only negative list already pins `dispatch` — no rules edit, no contract-drift risk.

### 3.I `[DELETE]` — none.

---

## 4. Robust Unit Testing Plan (MANDATORY)

All boundaries mocked (Firestore Admin doubles, no network); deterministic dates injected into the pure helpers.

### 4.1 `[NEW] src/tests/api/dispatchReference.test.ts` (~14 tests)

| # | Case |
| :-- | :--- |
| 1–3 | `chileanDateKey`: `2026-09-30T01:00Z` ⇒ `260929` (Santiago is UTC−3/−4 — the local-day boundary), midday UTC, and a `Date` in DST transition |
| 4–6 | `resolveDispatchReferencePrefix`: `Melipilla`, `San Antonio`, case/accents/whitespace (`' san antonio '`), unknown/legacy/undefined city ⇒ `MEL` |
| 7–8 | `formatDispatchReference`: `01` padding, `07`, `100` (no truncation); `counterDocumentId` shape |
| 9–12 | `planDispatchReference`: typed code ⇒ `manual`; typed whitespace/`undefined` + existing `manual` ⇒ `keep(manual)`; + existing `generated` ⇒ `keep(generated)`; + nothing ⇒ `mint` |
| 13–14 | Guards: a numeric code coerced (`998877`) ⇒ `manual`; an unknown `referenceSource` value falls back to `mint`/`keep` safely (never emits an undefined reference) |

### 4.2 `[MODIFY] src/tests/api/admin/dispatch-order.test.ts` (~+10 tests, mock gains `runTransaction` + counter double)

* **Mint:** code-less dispatch ⇒ `dispatch.reference` matches `/^MEL-260929-\d{2}$/`, `referenceSource: 'generated'`, counter doc `dev_dispatch_counters/MEL-260929` incremented to `1`, **no** `trackingNumber` key (Task 0.15 contract preserved), no `undefined` anywhere (existing deep scan).
* **Sequence:** a second dispatch ⇒ `-02`; a `San Antonio` order ⇒ `SAN-…` counter, independent sequence.
* **Manual override:** typed code ⇒ `reference === code`, `referenceSource: 'manual'`, `trackingNumber` written as today.
* **Re-dispatch:** code-less after generated ⇒ same reference, **counter not incremented**; code-less after manual ⇒ stays manual (never downgraded); typed code after generated ⇒ manual override.
* **Legacy carry-forward:** an order with `dispatch.trackingCode` but no `reference` re-dispatched without a code keeps the block's `trackingCode`.
* **Audit:** history `metadata.dispatchReference`/`referenceSource` + the two `reason` variants.
* **Failure:** a throwing transaction ⇒ `500`, no partial write.
* Existing 0.15 cases (blank/whitespace/numeric code, deep `undefined` scan, legacy field fallback) stay green, with the one `reason` assertion re-pointed to the new string.

### 4.3 `[MODIFY] src/tests/api/track-order.test.ts` (~+4 tests)

* `DESPACHADO` + generated reference ⇒ `(Ref. Despacho: MEL-260929-07)` and `fulfillment.dispatchReference`/`dispatchReferenceSource` in the payload.
* `DESPACHADO` + manual guía ⇒ `(N° Seguimiento: …)`, source `manual`.
* `DESPACHADO` legacy (neither) ⇒ current copy, both fields absent.
* Non-dispatched statuses never expose a reference.

### 4.4 `[MODIFY] src/tests/admin/OrderDetailPanel.test.tsx` (~+3 tests)

Generated reference renders as *Referencia de Despacho*; a manual guía renders as *N° Guía* and **never** as an internal reference; the success banner surfaces the minted reference (via the `adminApi` mock).

### 4.5 Zero regression

Every pre-existing suite must stay green (baseline: **794 tests / 80 suites**); `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit` and the strict `api/**` tsc all clean.

**As executed:** **860/860 tests in 82 suites** (+43 tests, +1 suite on top of PR #30; 4 suites added or extended), all five gates green, plus the strict `api/**` tsc. Wall-clock on this machine is environment-bound (jsdom setup dominates) — the test bodies themselves run in ~8–12 s.

---

## 5. As-Built Documentation & Roadmap Sync Plan

| File | Update |
| :--- | :--- |
| `api/AGENTS.md` | §6.2 `dispatch-order` row (transaction + reference) + new **§8.6** (format, counter, semantics, precedence, audit, customer surface, out-of-scope) + §8.5 gap #7 (raw carrier key → Task 2.16) |
| `src/types/AGENTS.md` | §1 file map (`DispatchReferenceSource`), §2.4 tracking payload, §2.4c `Order.dispatch` |
| `src/admin/AGENTS.md` | §1.2 *Marcar Despachado* bullet (the mint + override + panel block, replacing "There is no tracking-number generation anywhere in the system") |
| `src/components/AGENTS.md` | §4.2 step 4 + new §4.2b (reference precedence in the modal) |
| `src/config/AGENTS.md` | `delivery.ts` row: `DELIVERY_ZONE_REFERENCE_CODES` |
| `src/tests/AGENTS.md` | counts (82/860) + the new `dispatchReference` suite + the `dispatch-order`/`track-order` Task 2.13 coverage |
| root `AGENTS.md` | the three count-bearing lines (`:14`, `:138`, `:207`) |
| `PRODUCTION_READINESS_TODO.md` | **2.13** ticked, moved to §2 Resolved, glance-table row removed; baseline header → 860/860 (82 suites) + "Last updated"; **new 2.16** (raw carrier key in customer copy) added to §1 and §3 |

**Branch:** `feat/task-2.13-internal-dispatch-reference` · **Commit:** `feat(dispatch): internal dispatch reference for courier-less deliveries (Task 2.13)` after the explicit *"wrap up and proceed"*.

---

## 6. Adversarial Review — Findings & Disposition

Round 1 (fresh-context reviewer, read-only): verdict **APPROVE WITH FINDINGS**. All gates re-verified by the reviewer; the new tests were proven revert-sensitive with a throwaway probe (20 failures against the pre-change tree).

| # | Severity | Finding | Disposition |
| :-- | :--- | :--- | :--- |
| M1 | Minor | A pre-2.13 guía (`dispatch.trackingCode` only) was not promoted into the plan, so a code-less re-dispatch minted a route code that **masked the real guía** in the admin panel while `track-order` still showed the guía — admin/customer divergence. | **Fixed:** the handler promotes `dispatch.trackingCode` into the plan inputs (`existingSource: 'manual'`), so a legacy re-dispatch keeps the guía and burns no counter. Two tests replace the old carry-forward case (promotion + a no-guía legacy order still mints). |
| M2 | Minor | `DispatchOrderResult` re-declared the `'generated' \| 'manual'` union instead of importing `DispatchReferenceSource`. | **Fixed:** `src/admin/types.ts` now imports the shared type from `../types`. |
| M3 | Minor | `implementation_plan.md` was stale (status, §3.F/§3.G wording) and its §5 under-scoped the repo's TODO convention. | **Fixed:** this revision — status, §3.F precedence, §3.G, §4.5 counts and §5 (full TODO move + baseline refresh + 2.16) all reconciled. |
| N1 | Nit | New spies restored at the end of a test body instead of in an `afterEach`. | **Fixed (partially):** `src/tests/api/admin/dispatch-order.test.ts` gained `afterEach(() => vi.restoreAllMocks())` and dropped its inline restore; the panel suite keeps the file's existing convention (its new spies are the last cases in the file). |
| P1 | Minor (pre-existing) | `dispatch-order` stores the raw `CarrierType` key in `courier`, so customers read *"En tránsito con despacho_local_melipilla"*. | **Not fixed here** (out of scope, pre-existing): recorded as **Task 2.16** in the roadmap, per the reviewer's recommendation. |
| P2 | Nit (pre-existing) | Untyped `runTransaction` callback adds Vercel `TS7006` log noise (tracked by Task 8.2). | **Accepted:** matches every other handler (`approve-transfer`, `resolve-payment-review`, `upload-voucher`, the webhook); annotating with `FirebaseFirestore.Transaction` is what produces the `TS2503` noise 8.2 documents. |
