# Walkthrough — Task 4.5: Manual Cancellation, Refund, Return & Chargeback Operations

**Branch:** `feat/task-4.5-manual-order-operations`
**Commit:** `5de7223` — `feat(admin): manual cancellation, refund, return and chargeback operations (Task 4.5)`
**PR:** <https://github.com/carlosjosemm/pronto-insumos/pull/45> → base `main`, `MERGEABLE` / `CLEAN`

---

## What Was Built

The manual money- and goods-side operations the storefront deliberately does not automate
(`PRODUCTION_READINESS_TODO.md` Task 4.5):

1. **`cancel-order`** — the general cancellation for orders that were **never settled and never
   shipped** (`PENDIENTE_PAGO_MERCADOPAGO`, `PENDIENTE_PAGO`, `PENDIENTE_TRANSFERENCIA`,
   `TRANSFERENCIA_COMPROBANTE_SUBIDO`). Required operator reason, **no stock and no money movement**,
   idempotent `duplicate` on `CANCELADO`, the guard re-asserted **inside the transaction** (a webhook
   approval landing mid-flight is never regressed), and a cancel-specific warehouse alert. Paid,
   approved, in-preparation, dispatched, delivered, `PAGO_EN_REVISION` and quote orders are refused
   with `409`.
2. **`record-order-incident`** — a **same-status** `order_status_history` entry
   (`metadata.event: 'INCIDENTE_MANUAL'` + `incidentKind` ∈ `CANCELACION`/`REEMBOLSO`/`DEVOLUCION`/
   `CONTRACARGO`) with a required evidence note. No status change, no stock, no email; valid for any
   status (a refund or chargeback lands *after* delivery) and repeatable.
3. **Shared kind tuple** — `src/utils/orderIncidents.ts`, imported by both the handler and the
   console so the dropdown and the server validation cannot drift.
4. **Panel** — an "Operaciones Manuales" block (cancel gated to eligible statuses and reason-gated;
   incident kind + note always available) and an **incident-kind badge** in the audit timeline.
5. **Restock traceability** — `StockAdjustModal` gained the optional "Nota de trazabilidad"
   (stored as the audit entry's `operatorNotes`), which is what links a movement back to an order id.
6. **Owner SOP** — `MANUAL_ORDER_OPERATIONS.md`: verify funds first, never store credentials,
   refund off-platform, restock only received and usable units.

No refunded status, no automatic gateway refund, no second restock path.

## Rebase onto Task 4.2

`main` moved to `da048ca` (Task 4.2 merged) while this branch was in flight. Two conflicts were
resolved by combining both sides, not by choosing one:

- `OrderDetailPanel.tsx` — kept this task's restructured history map + incident badge and re-applied
  4.2's `var(--primary)` → `var(--teal-600)` fix to both sites.
- `src/tests/AGENTS.md` — merged the `api/admin/` suite line: **20 suites** (4.2's `products` +
  this task's two), 4.2's bounded-read `orders` description, "all 16 actions", and the now-obsolete
  "`products` has no dedicated suite" gap sentence removed.

`api/AGENTS.md` and `src/admin/AGENTS.md` auto-merged; both sides' content verified present.

## Housekeeping (doc-only)

Ticked the **4.2**, **4.4** and **2.18** board rows and added the as-built notes their merged PRs
never got (PR #44 / #34 / #41), plus Resolved History rows. 4.2's composite index
(`orders`: `status` ASC + `createdAt` DESC) was already declared, deployed and verified live during
that task; `pnpm run deploy:indexes` was added so a future index change has a documented command
alongside `deploy:rules` / `deploy:storage-rules`.

## Verification Results

- **Vitest:** 1157/1157 passing across **96 suites** (+2 new suites, +46 cases from this task).
- **`pnpm build` / `pnpm lint` / `pnpm format:check` / `pnpm exec tsc --noEmit`** — clean.
- **`api/` strict tsc** (`--strict --target es2022 --module esnext --moduleResolution bundler
  --types node --skipLibCheck`) — clean.

## Review Disposition

Verdict: **approve with findings**. No code blocker.

| Finding | Disposition |
| :-- | :-- |
| **M1 (major)** — the SOP promised a restock audit trail the code did not provide | Added the traceability note to `StockAdjustModal` + `StockAdjustmentPayload` **and** corrected the SOP to say the `inventory_audit_logs` record is server-side and not yet rendered |
| **m1** — the reused `CANCELADO` warehouse hint told the depot to chase a refund for money never collected | Added a distinct `CANCELACION_MANUAL` event label + action hint and wired `cancel-order` to it |
| **m2** — the incident-kind enum was declared twice | Shared module `src/utils/orderIncidents.ts`; handler and console both import it |
| **m3** — the timeline could not tell a refund from a return | Incident-kind badge in the audit timeline |
| **m4** — plan status line stale | Updated |
| **m5** — as-built docs/counts not yet synced | Full doc pass (api/admin/types/tests/utils AGENTS, root AGENTS, roadmap) |
| **n1** — select label omitted the fourth option | Parenthetical dropped |
| **n2** — SOP said the timeline is "at the bottom of the panel" | Reworded to name the block |
| **n3** — the "non-blocking email" test could not fail | Renamed and now asserts the alert was attempted |
| **p1/p2** — `orderId` whitespace → `500`; `var(--primary)` | Pre-existing, left alone (p2 fixed independently by 4.2) |

## Human Action Items

- **Owner walkthrough (the Accept gate):** follow `MANUAL_ORDER_OPERATIONS.md` once against a real
  cancellation, refund, return/chargeback and restock, and confirm the order-history trace reads
  correctly and that restock was limited to received, usable goods. A local `pnpm dev` rehearsal
  runs against the `dev_*` collections and is safe.
- **No** new secrets, environment variables, rules, migrations or serverless functions.
- Standing, unrelated owner gates: **0.12** (production Firestore rules deploy), **8.9** (production
  env), **9.1** (promo codes).
