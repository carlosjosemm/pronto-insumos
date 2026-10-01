# Task 8.13: Stale Pending-Order Accumulation

**Branch:** `feat/task-8.13-stale-pending-order-close` — **top of the stack** `8.4 → 8.12 → 8.13`, cut from `chore/task-8.12-security-headers` @ `c93dc60` (PR #48).
**Status:** Implemented, reviewed, remediated — gates green; awaiting the stack wrap-up commit. Adversarial review returned *approve with findings* (C1 major: unbounded sequential gateway calls could be killed by the platform timeout mid-sweep; C2–C4 minor; C5 nit) plus one pre-existing doc count; all remediated (see the walkthrough).

---

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` **8.13 (P2; coordinate with 2.18)**:

> Every checkout attempt creates a fresh order (`CheckoutModal.tsx:306-307`); failed preferences and abandoned MP sessions leave pending ghosts. Before closing one, check the MP ledger. Late paid notifications go to manual review and must never reopen a cancelled order. Choose the leanest safe close/reuse path on the existing dispatcher; no new function slot. Coordinate retry semantics with 2.18.

Verified against the branch base:

- **The ghosts are real and unbounded.** `submitOrder()` writes a fresh `PENDIENTE_PAGO_MERCADOPAGO` document on every checkout attempt, and nothing ever closes one that the shopper abandons — the status simply accumulates. `cancel-order` (Task 4.5) can close a single order, but only by hand, one at a time, with a typed reason; there is no sweep.
- **The retry half is already built (2.18).** `resumeMercadoPagoPayment(orderId)` re-opens Checkout Pro for the *same* pending order, and `CheckoutModal` shows an advisory pending-payment notice. So the remaining half is the **backstop for orders nobody ever retries** — which is why the task says "close/reuse path on the existing dispatcher" rather than a second retry mechanism.
- **The risk of closing blind is money.** An order can be paid while its webhook delivery was lost: the money is in the Mercado Pago ledger and the order still reads pending. Cancelling it would hide a real payment. Hence "before closing one, check the MP ledger".
- **What already handles a late approval:** the webhook's status guard parks any non-payable order in `PAGO_EN_REVISION` (`metadata.event: 'PAGO_ESTADO_INVALIDO'`, no stock movement, warehouse alert) and never marks it paid. A payment that arrives *after* the sweep therefore lands in manual review — it does not reopen the order as paid. This task must not weaken that, and the sweep must not race it.
- **Constraints:** no new serverless function (guardrail 2 / Hobby cap — the action goes on the existing `api/admin/[action]` dispatcher), no new dependency, no second path to a state another action already owns (`cancel-order` for a single order, `resolve-payment-review` for `PAGO_EN_REVISION`, `resolve-quote` for a quote).

---

## 2. Human Action Items & Placeholders (TODO for Human)

- **None** — no new credential or environment variable. The action reuses `MERCADOPAGO_ACCESS_TOKEN`, which production already sets for the payment path.
- **Owner operational note (not agent-executable):** on a preview or in production, run the sweep **as a dry run first** (the default), read the reported candidates, then execute. The action is admin-authenticated and bounded; the agent must not deploy or run it against production data.

---

## 3. Proposed Changes

### 3.1 The sweep — `api/_lib/admin/close-stale-orders.ts` (new admin action)

Registered on the existing dispatcher (17 actions; still 6 Hobby function slots).

- `POST`, `verifyAdminToken`, `setAdminResponseHeaders`, `OPTIONS` preflight — the shared admin contract, no CORS of its own.
- Body: `{ olderThanHours?, limit?, dryRun? }`.
  - `olderThanHours` clamped to `[1, 720]`, default **48**. The window must comfortably exceed the span in which a legitimate late webhook can still arrive, because the sweep and the webhook can otherwise disagree about the same order.
  - `limit` clamped to `[1, 500]`, default 25 (scan bound).
  - **`dryRun` defaults to `true`** — the caller must pass `dryRun: false` to close anything. This deliberately differs from `voucher-housekeeping` (which defaults to executing): that action deletes unreferenced Storage objects, this one cancels business records, so the safe default differs. The UI passes the flag explicitly.
  - **A wall-clock budget (`STALE_SWEEP_TIME_BUDGET_MS` = 7 s) stops the loop** and reports `timeBudgetExhausted` + `truncated`. Each candidate costs one gateway round-trip plus one Firestore transaction, strictly serially, and the platform kills the function at its own timeout — which would leave a half-finished sweep with **no response and no report**. The budget keeps the run inside that window and returns a complete partial report the operator can act on.
- **Scan — bounded, index-free:** one query, `where('status', 'in', ['PENDIENTE_PAGO_MERCADOPAGO', 'PENDIENTE_PAGO']).limit(limit)`, then the age filter in memory. A single-field `in` filter needs no composite index (the `status` + `createdAt` index is declared only for the `orders` collection, so an index-dependent query would break the `dev_*` twin). A `count()` aggregation on the same filter (index-entry reads only) reports `pendingTotal`, and `truncated` compares it with what was actually scanned, so it means "there really are more pending orders" instead of "the page was full". ⚠️ Stated trade-off: the page is document-id ordered and the age filter runs after the limit, so a page of fresh orders can hide older ones beyond it — a `truncated` run is repeated **later**, not in a tight loop.
- **Per candidate, in order:**
  1. **MP ledger check (the safety gate).** `GET https://api.mercadopago.com/v1/payments/search?external_reference=<orderId>&sort=date_created&criteria=desc&limit=10` with the server token. `external_reference` is exactly the canonical order id the preference was created with.
     - **An approved payment exists → park, never cancel.** The order is set to `PAGO_EN_REVISION` and stamped with the payment id, with an `order_status_history` event (`previousStatus` = the pending status, `newStatus` = `PAGO_EN_REVISION`, `metadata.event: 'PAGO_ACREDITADO_TARDIO'`) whose reason records that the ledger showed a settled payment the webhook never delivered. The event is deliberately **not** the webhook's `PAGO_ESTADO_INVALIDO` (which means "approved for an order that could not be paid automatically" — the opposite case), and the console renders a distinct label for it. No stock movement, no email — the order appears in the console's *Pago en Revisión* queue and in the sweep response, which is the operator's notification.
     - **No approved payment → close.** `status: 'CANCELADO'` + `updatedAt`, plus an `order_status_history` event (`metadata.event: 'CIERRE_AUTOMATICO_PENDIENTE'`, `actorRole: 'ADMIN'`, reason naming the window and the ledger check). No stock movement (nothing was ever deducted for a pending order) and no refund (nothing was collected). The history carries the **verified operator identity** (`changedBy` = uid, `changedByEmail` = the signed-in address), matching every other admin action and what the console's timeline renders.
     - **Ledger unreadable** (no real token, non-2xx, network failure, unparseable body) → **skip the order and record a failure**. Fail closed: an order is never cancelled on an unverified ledger.
  2. **Race guard inside a transaction.** Every close/park re-reads the document and re-asserts that the fresh status is still a pending payment status. A webhook approval landing between the scan and the write therefore wins: the sweep reports the order as `skippedStatusChanged` and writes nothing. The ledger check cannot be moved inside the transaction (it is a network call), so this re-read is what closes the race.
- **Response:** `{ success, dryRun, olderThanHours, scannedOrders, staleOrders, closedCount, parkedCount, skippedStatusChanged, closedSample, parkedSample, failures, truncated }` — `dryRun` lists the candidates in the samples without writing.
- Never throws past the handler boundary: `500` + a loud log on an unexpected error, matching the other admin actions.

### 3.2 Client wiring

- **[MODIFY]** `api/admin/[action].ts` — register `close-stale-orders`.
- **[MODIFY]** `src/admin/types.ts` — `StalePendingOrdersResult`.
- **[MODIFY]** `src/admin/services/adminApi.ts` — `closeStalePendingOrders({ olderThanHours, limit, dryRun })`, mirroring `runVoucherHousekeeping`.
- **[MODIFY]** `src/admin/components/AdminSettings.tsx` — a second maintenance card ("Pedidos Pendientes Antiguos") beside *Mantenimiento de Comprobantes*: a threshold input, a **Revisar** button (dry run) and a **Cerrar pendientes** button (execute, `admin-btn-danger`), plus the result/error banners. It states plainly that a candidate with a settled Mercado Pago payment is never cancelled and is sent to manual review instead.

### 3.3 Documentation

- **[MODIFY]** `api/AGENTS.md` — the action in the dispatcher table/count and its own subsection: the ledger gate, the fail-closed rule, the in-transaction re-read, the index-free bounded scan and the dry-run default.
- **[MODIFY]** `src/admin/AGENTS.md` — the new maintenance card, the dry-run-first flow and the "never cancels a settled payment" guarantee.
- **[MODIFY]** `AGENTS.md` — one line in the payment iron rules: the sweep is a backstop that checks the MP ledger before closing and never reopens a cancelled order (late approvals go to `PAGO_EN_REVISION`).
- **[MODIFY]** `PRODUCTION_READINESS_TODO.md` — mark 8.13 `[x]` with an as-built note.
- **[NEW]** `.devin/artifacts/task-8.13/walkthrough.md` — written at wrap-up.

---

## 4. Robust Unit Testing Plan (MANDATORY)

`src/tests/api/admin/close-stale-orders.test.ts` — the Firestore Admin double from `cancel-order.test.ts` (transaction re-read + collection spies) plus a mocked `global.fetch` for the ledger; no network, no real Firestore.

### Pure helpers

1. `resolveStaleHours` / `resolveSweepLimit`: defaults, clamping at both ends, junk (`NaN`, negative, string, `0`), and that a huge value cannot widen the scan.
2. `createdAtMs`: Firestore `Timestamp`-like, ISO string, epoch number, and an unreadable value (→ 0, i.e. treated as not-stale, so a document with no usable timestamp is never closed).
3. `isStalePendingOrder`: only the two pending payment statuses qualify; a paid/transfer/quote/cancelled order never does, however old; a pending order younger than the window does not.
4. `parseApprovedPaymentId`: picks an approved payment, ignores `pending`/`in_process`/`rejected`/`cancelled`/`refunded` results, tolerates a missing `results` array, a non-array payload and a non-object entry, and prefers the newest when several are approved.

### Handler

1. `OPTIONS` → `200`; non-`POST` → `405`; unauthenticated → `403`; Firestore Admin unavailable → `500`.
2. **Default is a dry run:** with no `dryRun` in the body nothing is written, and the response reports the candidates.
3. **Close path:** a stale pending order with an empty ledger is set to `CANCELADO` with one history event (`CIERRE_AUTOMATICO_PENDIENTE`), the verified operator identity and **zero** product reads — a pending order never moved stock.
4. **Park path:** a stale pending order whose ledger holds an approved payment is set to `PAGO_EN_REVISION` with the payment id stamped and a `PAGO_ACREDITADO_TARDIO` history event — **never** `CANCELADO`.
5. **Fail closed:** a ledger `500`, a `fetch` rejection, a missing/placeholder token, and a body without a `results` array each leave the order untouched and record a failure.
6. **Race guard:** when the transaction re-read sees a non-pending status (the webhook approved mid-sweep), the write is skipped and the response counts `skippedStatusChanged`.
7. **Bounded scan:** the query uses the two pending statuses with the resolved limit; `pendingTotal` comes from the `count()` aggregation; `truncated` is true only when the pending total exceeds what was scanned, and false when the whole pending set was read.
8. **Time budget:** with the clock advanced past the budget the loop stops before its first gateway call, returns `timeBudgetExhausted` + `truncated`, writes nothing and logs — **mutation-verified** (disabling the budget check fails the case).
9. **Audit identity:** the history event records the verified operator's uid and email, not a hard-coded `ADMIN`.
10. **Isolation:** a non-stale pending order, and a stale order in another status, are never touched.

`src/tests/admin/AdminSettings.test.tsx` — the new card: the dry-run button calls the API with `dryRun: true` and the execute button with `dryRun: false`; the result and error banners render.

`src/tests/api/admin/admin-router.test.ts` — the new action is mapped (and the existing 16 stay mapped).

**Regression safety:** the full suite (101 suites / 1255 tests) must stay green, plus the new cases. `pnpm run verify:full` must pass.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- `api/AGENTS.md` — the new action, the ledger gate and the fail-closed/race-guard semantics.
- `src/admin/AGENTS.md` — the maintenance card and the dry-run-first operating flow.
- `AGENTS.md` §4 — the backstop line in the payment iron rules.
- `PRODUCTION_READINESS_TODO.md` — checkbox `[x]` for 8.13 with the as-built note and the remaining owner step (run it dry on a preview, then execute).
