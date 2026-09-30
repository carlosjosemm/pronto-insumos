# Task 0.18: Detect Partial Mercado Pago Refunds

**Branch:** `feat/task-0.18-partial-refund-detection` (primary working tree — no worktree; cut from `main` @ `a0c088a`)
**Status:** **Implemented, reviewed, gates green — awaiting owner "wrap up and proceed".** 1014/1014 tests (87 suites) after rebasing onto `origin/main` (Task 8.17 merged mid-task); build / lint / format:check / tsc all clean. Adversarial review returned *approve with findings* (F1–F7); all remediated. See §6.

---

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` §0.18 (P2; coordinates with 4.5). The Mercado Pago
webhook is the single payment-reconciliation authority, and it already handles
**full** reversals: a payment whose `status` becomes `refunded` / `charged_back`
parks the settled order in `PAGO_EN_REVISION` (or records the incident for a
fulfilled one) with a `PAGO_REEMBOLSADO` history event + warehouse alert.

The gap is the **partial refund**: Mercado Pago keeps the payment `status:
'approved'` with the original `transaction_amount` and accumulates the returned
money in `transaction_amount_refunded`. Today that delivery is **silently
swallowed**:

- `api/webhooks/mercadopago.ts:405-415` — the duplicate fast path skips any
  notification whose payment id is already recorded on the order, even when
  `transaction_amount_refunded > 0`.
- `api/webhooks/mercadopago.ts:444-449` — the in-transaction concurrency guard
  returns silently for the same payment id.
- `REVERSAL_PAYMENT_STATUSES` only matches `refunded` / `charged_back`, so a
  partially-refunded-but-still-`approved` payment never enters the reversal
  branch.

`api/AGENTS.md` records this as known limitation **R9**. Risk: money is returned
to the customer while the order stays settled and fulfilled, with **no operator
incident** — the warehouse never learns that part of the sale came back.

**Fix (roadmap):** detect the partial refund and create **one deduplicated
manual incident/alert**; no automatic refund pipeline, no automatic gateway
refund — the owner's Mercado Pago/bank ledger remains the reconciliation
authority (full detail stays with 4.5's SOP).

**Detection semantics (verified against Mercado Pago's official documentation,
2026-09-30):** an `approved` payment with
`Number(paymentData.transaction_amount_refunded) > 0`. The [GET payment
reference](https://www.mercadopago.com.cl/developers/en/reference/online-payments/checkout-pro/get-payment/get)
confirms `transaction_amount_refunded` (number, default `0`) on the payment
object our webhook fetches, and the [response-handling
docs](https://www.mercadopago.com.ar/developers/en/docs/checkout-api-payments/response-handling/query-results)
confirm a partial refund keeps `status: 'approved'` with
`status_detail: 'partially_refunded'` — only a full refund flips `status` to
`'refunded'`. The [webhook
docs](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro-preferences/payment-notifications)
confirm the `payment` topic fires on every payment **update** (refunds
included) with the same `payment.updated` body carrying only `data.id`, so the
delivery arrives through the already-configured subscription and the webhook's
re-fetch-by-id makes detection payload-shape-independent. The amount assertion
is unaffected (`transaction_amount` stays at the original value, so settlement
math still reconciles).

**Successive partial refunds:** Mercado Pago allows multiple partial refunds
against the same payment (cumulative ≤ total), each producing a new
`payment.updated` delivery with the *same* payment id. The dedup therefore keys
on **(payment id + cumulative refunded amount)**: a replay of the same refund
state dedups; a genuinely higher refunded amount records a new incident, so new
money movement is never swallowed.

---

## 2. Human Action Items & Placeholders

None in code — no new env vars, secrets, services or webhook configuration (the
refund update arrives through the same `payment` subscription that already
delivers approvals).

**Owner smoke test (optional but recommended, accept criteria):** on a
preview/test Mercado Pago account, trigger a partial refund on a real test
payment and confirm the incident appears exactly once in the order timeline and
the warehouse alert fires. The owner's ledger reconciliation remains the
fallback authority for the actual refunded total.

---

## 3. Proposed Changes

### Webhook (`api/webhooks/mercadopago.ts`)

- **[MODIFY]** Add a `partialRefundAmount` derivation
  (`Number(paymentData.transaction_amount_refunded) || 0`, integer-guarded) and
  a single deduped incident routine used by two surfaces:

  1. **Duplicate fast path (primary — the named R9 gap):** when the order
     already recorded **this payment id** and the delivery carries a partial
     refund, replace the silent `duplicate: true` ack with the incident:
     a small `runTransaction` re-reads the fresh order and, when the dedup
     marker does not already cover this refund state, writes the marker fields
     plus one `order_status_history` event (`metadata.event:
     'PAGO_REEMBOLSO_PARCIAL'`, carrying `paymentId`, `refundedAmount`,
     `transactionAmount`, previous status) — **no status flip, no stock
     movement, no customer email** — then sends the warehouse alert and acks
     `200 { received: true, verifiedStatus: 'approved', note: 'incident', incident: 'REEMBOLSO_PARCIAL' }`.
     A replay (marker already covering this refund state) writes nothing and
     acks with `duplicate: true`.
  2. **Settlement path (delayed-approval edge):** when the approval delivery is
     processed **after** the refund already happened (e.g. MP retried the
     approval during an outage), the settlement still proceeds normally — the
     charge went through and the amount assertion passes — and the same
     incident (marker + history event) is written **inside the same settlement
     transaction**, with the warehouse alert sent alongside the confirmation
     emails. Without this, a payment approved-then-partially-refunded before
     its webhook was processed would settle silently and never be flagged.

- **Dedup mechanism:** three server-written marker fields on the order document —
  `partialRefundPaymentId`, `partialRefundAmount` (the cumulative refunded amount
  at incident time) and `partialRefundAt` — checked inside the transaction, the
  same pattern as `paidAt`/`approvedAt`/`confirmationEmailSentAt`. The guard is
  **monotonic**: same payment id with a lower-or-equal cumulative amount is
  necessarily a stale replay (cumulative refunds only grow) and writes nothing;
  a higher refunded amount (a new partial refund) or a *different* payment id
  records a new incident (a distinct money event). A positive non-integer
  amount is garbage data — logged loudly, treated as absent.

- **Deliberately unchanged:** the full-reversal branch (`refunded` /
  `charged_back`), the double-payment incident (`PAGO_DUPLICADO` — a *different*
  approved payment on a settled order is still a double charge, not a partial
  refund), the amount assertion, and the missing-order incident paths. A partial
  refund **never flips the order status** (the sale mostly stands) and never
  moves stock — restocking the returned units is the operator's 4.5 decision.

### Warehouse alert (`api/_lib/emailTemplates.ts`)

- **[MODIFY]** — add `PAGO_REEMBOLSO_PARCIAL` to `WAREHOUSE_EVENT_LABELS`
  ("Reembolso parcial detectado — revisión manual") and
  `WAREHOUSE_ACTION_HINTS` (reconcile against the Mercado Pago ledger; no
  automatic refund; decide restock/contact per the manual SOP), so the alert
  reads in Spanish like every other event.

### Types

- **[MODIFY] `src/types/index.ts`** — three optional server-written `Order`
  fields: `partialRefundPaymentId?: string`, `partialRefundAmount?: number`,
  `partialRefundAt?: string`.

### Explicitly NOT changed

- No `payment_incidents` document for this case: the order **is** joinable, so
  the order timeline is the audit trail (the missing-order store stays for
  unjoinable payments only).
- No status enum member, no admin action, no automatic refund, no new endpoint,
  no new dependency.

---

## 4. Robust Unit Testing Plan (MANDATORY)

Extend **`src/tests/api/mercadopago-webhook.test.ts`** (the Firestore Admin
double + `fetch` mock at the MP/Resend boundaries; no real network):

1. **Partial refund on a settled order (primary path):** order
   `PAGADO_MERCADOPAGO` with `mercadopagoPaymentId` = the delivered id, payment
   `approved` with `transaction_amount_refunded: 50000` → one history event
   (`PAGO_REEMBOLSO_PARCIAL` with the payment id + refunded amount), marker
   fields stamped, **status unchanged**, **zero product updates**, warehouse
   alert sent, **no customer email**, `200` ack with the incident note.
2. **Replay dedup:** the same delivery again → no second history event, no
   second alert, `duplicate: true` ack — including a **stale delivery with a
   lower cumulative amount** (monotonic dedup: nothing written, no marker
   regression).
3. **Successive partial refunds:** a second delivery with a **higher**
   cumulative `transaction_amount_refunded` (same payment id) → a new incident
   (new money movement is never swallowed); a third delivery repeating the same
   amount → dedup.
4. **Plain duplicate unchanged:** same payment id with **no** refunded amount →
   the existing silent `duplicate: true` skip (no incident, no alert).
5. **Different payment id with a refund on a settled order** → still the
   `PAGO_DUPLICADO` double-payment incident (a second charge is not this
   order's refund).
6. **Full refund unchanged:** `status: 'refunded'` on the recorded payment →
   the existing `PAGO_REEMBOLSADO` reversal (paid order flips to
   `PAGO_EN_REVISION`; fulfilled order keeps status) — no partial-refund event
   double-fired.
7. **Delayed-approval settlement:** an `approved` payment that already carries
   `transaction_amount_refunded > 0` settling a pending order → order settles
   normally (stock deducted, confirmation emails) **and** the partial-refund
   incident is recorded in the same transaction + alerted.
8. **Review-parked order:** partial refund on a `PAGO_EN_REVISION` order whose
   recorded payment id matches → incident, no status change.
9. **Amount integrity:** the settlement amount assertion still uses
   `transaction_amount` (a partially-refunded payment settles when the original
   amount matches the verified total).

Full suite must remain 100% green (baseline on `main` after 1.7/4.6: to be
measured at implementation start) — zero regression policy.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- **[MODIFY] `api/AGENTS.md`** — §2.2 webhook reconciliation guards: the
  partial-refund incident (detection, dedup markers, no-flip/no-stock
  semantics); resolve the R9 known-limitation note.
- **[MODIFY] `src/types/AGENTS.md`** — §2.4c: the three new server-written fields.
- **[MODIFY] `src/tests/AGENTS.md`** — the webhook suite's new coverage.
- **[MODIFY] `src/admin/AGENTS.md`** — one line: the incident appears in the
  order timeline (`PAGO_REEMBOLSO_PARCIAL`) and drives the warehouse alert; the
  panel needs no new block (no status flip).
- **[MODIFY] `PRODUCTION_READINESS_TODO.md`** — mark **0.18 `[x]`** with
  as-built evidence; keep the owner verification of gateway event semantics
  visible as the remaining human step.
- **[MODIFY] `implementation_plan.md`** — this file (volatile artifact).
- **[MODIFY] `walkthrough.md`** — at wrap-up.

**Verification gates:** `pnpm test && pnpm build && pnpm lint && pnpm format:check &&
pnpm exec tsc --noEmit` — all five must pass before the adversarial review.

---

## 6. Adversarial Review Disposition (as built)

Review verdict: **approve with findings**. Disposition of every finding:

- **F1 (MAJOR) — planned docs-sync not landed; guides would assert a limitation
  the code no longer has.** Remediated: `api/AGENTS.md` R9 → as-built
  detection/dedup/no-flip/no-stock semantics; `src/types/AGENTS.md` §2.4c gained
  the three server-written fields; `src/tests/AGENTS.md` gained the webhook
  coverage line; `src/admin/AGENTS.md` gained the partial-refund one-liner; the
  TODO board row is `[x]` with evidence; this plan is at as-built (status line,
  §3 ack shape + monotonic dedup wording, §2 smoke-test framing, working
  webhooks URL).
- **F2 (MINOR) — a stale delivery with a lower cumulative amount recorded a
  spurious incident and ping-ponged the marker.** Remediated: the dedup guard is
  monotonic (`partialRefundAmount <= freshPartialAmount` ⇒ duplicate), with a
  regression test for the lower-amount replay.
- **F3 (MINOR) — a positive fractional `transaction_amount_refunded` was
  silently treated as absent.** Remediated: the garbage-data branch logs loudly
  (`console.warn` with the raw value) before treating it as absent.
- **F4 (MINOR) — the planned full-refund-with-refunded-amount test was
  missing.** Remediated: one test pins that a `refunded`-status payment also
  reporting `transaction_amount_refunded` goes to the reversal branch only
  (`PAGO_REEMBOLSADO`, one incident, no partial-refund event, no marker writes).
- **F5 (NIT) — accidental double-space in `respondMissingOrderIncident`'s
  signature.** Remediated: parameter restored to its own line.
- **F6 (NIT) — unused `orderData` parameter in
  `respondPartialRefundIncident`.** Remediated: parameter and call-site argument
  dropped.
- **F7 (NIT) — confusing `resolve-quote` clause in the new label comment.**
  Remediated: clause deleted; the comment states the webhook raised the event.

Post-remediation gates (re-run after the rebase onto `origin/main`, which
merged Task 8.17 mid-task): 1014/1014 tests (87 suites), build, lint,
format:check, tsc — all green.
