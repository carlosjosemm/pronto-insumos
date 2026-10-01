# Walkthrough — Task 4.2: Backoffice Readiness Sweep

**Branch:** `feat/task-4.2-backoffice-readiness-sweep`
**Commit:** `8f7754d` — `feat(admin): backoffice readiness sweep — bounded reads, deep links, KPI alignment (Task 4.2)`
**PR:** <https://github.com/carlosjosemm/pronto-insumos/pull/44> → base `main`, `MERGEABLE` / `CLEAN` (19 files, +1266 / −214)

---

## What Was Built

The backoffice readiness sweep (`PRODUCTION_READINESS_TODO.md` §3, Task 4.2):

1. **`orders.ts` — bounded page read.** `orderBy('createdAt','desc')` + server-side
   status filtering (equality; the transfer-approved chip keeps dual-status
   semantics via `in`) + `startAfter(cursor)` + `limit` (default 50, capped 200).
   `total` via a `count()` aggregation; `nextCursor` from the last PAGE document.
   Task 2.15's voucher projection (list drops `voucherUrl`, reports `hasVoucher`)
   preserved through the rebase.
2. **`dashboard-stats.ts` — bounded stats + KPI fix.** `pendingOrders` as a
   status-in `count()` aggregation (the exact all-time count); `lowStockProducts`
   from a bounded `stockCount <= 5` read; sales/monthly volume from one bounded
   recent-orders page. KPI fix: the settlement timestamp (`paidAt`/`approvedAt`)
   decides the sales date and a marked order counts regardless of current status,
   with a reversal exception (review + `paidAt` ≡ refunded money, never counted).
3. **`AdminOrders.tsx`** — deep-link `fetchAdminOrder` fallback beyond the first
   page; the refresh re-find wins over deep-link re-assertion; a retryable
   `role="alert"` banner distinguishes a failed load from an empty queue (incl. a
   specific message for a missing deep link). Merged with Task 2.15's
   voucher-aware `openOrder` and monotonic selection token.
4. **`AdminDashboard.tsx`** — "Facturación confirmada hoy (IVA incluido)".
5. **Small fixes** — `var(--primary)` → `var(--teal-600)` (both sites);
   `ProductEditModal` prop→state sync effect replaced with lazy `useState`
   initializers + keyed remount; placeholder cards relabeled to roadmap 8.5 /
   suspended 3.1.

## Verification Results

- **Vitest:** 1111/1111 passing across 94 suites (zero regressions; +34
  new/updated cases from this task).
- **`pnpm build` / `pnpm lint` / `pnpm format:check` / `pnpm exec tsc --noEmit`:**
  all clean.

## Adversarial Review Disposition (F1–F9, all remediated)

| # | Severity | Finding | Disposition |
| :-- | :-- | :-- | :-- |
| F1 | MAJOR | Status-filtered queries need the composite index `orders(status ASC, createdAt DESC)` which never existed; comment claimed the opposite | `firestore.indexes.json` created + `firebase.json` registered + **deployed and verified live**; comment + plan corrected |
| F2 | MINOR | Refunded money stayed in "Ventas Hoy" (review + surviving `paidAt`) | Reversal guard + test case |
| F3 | MINOR | Deep link re-asserted itself on every reload, discarding the manual selection | Refresh re-find wins + test case |
| F4 | MINOR | Deep-link miss failed silently | Specific banner message + miss test |
| F5 | MINOR | Plan status untrue; tests-guide gap line false; `api/AGENTS.md` sync absent | All landed |
| F6 | NIT | Cursor pagination has no document-id tiebreaker | Accepted + documented (one-at-a-time commits make ties practically impossible; Firestore's implicit `__name__` ordering applies) |
| F7 | NIT | `limit` uncapped; `total` unconsumed | Page hard-capped at 200; `total` kept as the pagination contract, documented in `api/AGENTS.md` |
| F8 | NIT | Low-stock count drops field-less docs | Accepted (stockCount is schema-required; all write paths set it) |
| F9 | NIT | §6.2 described a key expression the code doesn't use | Reworded to the two keyed mount sites |

## Rebase Integration

`origin/main` moved mid-wrap-up (Tasks 2.15 and 4.3 merged). Rebased; six
conflicts resolved by combining both sides:

- `api/_lib/admin/orders.ts` auto-merged (bounded read + the voucher projection).
- `src/admin/components/AdminOrders.tsx` — Task 2.15's `openOrder`/selection-token
  design preserved; my loadError banner, beyond-page fallback, miss message and
  selection-wins logic layered on top.
- `src/tests/api/admin/orders.test.ts` / `src/tests/admin/AdminOrders.test.tsx` —
  both suites merged (Task 2.15's voucher cases + my bounded-read/deep-link cases).
- `api/AGENTS.md` / `src/tests/AGENTS.md` — both guides' updates combined.
- `implementation_plan.md` — the current task's plan kept (now persisted at `.devin/artifacts/task-4.2/` per the owner's artifact-folder decision, 2026-09-30; the volatile root copy is retired).

All five gates re-run green after the rebase (1111/1111, 94 suites).

## Human Action Items

**Resolved during this task (2026-09-30):** the composite index
`orders(status ASC, createdAt DESC)` was declared, deployed
(`firebase deploy --only firestore:indexes --project pronto-insumos`) and
verified live via `firebase firestore:indexes`. Firestore builds new indexes
asynchronously — the definition is registered and the build completes in the
background, so the first status-filtered request may need to wait for the build
to reach `Ready`. Nothing calls that path today (the UI sends no params).

## Roadmap Sync

`PRODUCTION_READINESS_TODO.md` §3 Task 4.2 "As built" entry + the §1 board row
`[x]` are left for the owner to mark at merge, matching the Task 0.18 precedent.
