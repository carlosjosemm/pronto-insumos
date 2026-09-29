# Task 0.14: Webhook Reconciliation Gaps

**Branch:** `fix/task-0.14-webhook-reconciliation-gaps` (cut from `main` @ `6c79471`, verified in sync with `origin/main`; executing in the primary working tree)
**RequestFeedback:** true · **UserFacing:** true
**Status:** Implemented, verified (726/726) and adversarially reviewed; review findings R1–R9 disposed of in §7. Awaiting the explicit **"wrap up and proceed"** command before staging/committing.
**Owner decisions (approved 2026-09-29):** (1) settled statuses get an incident, not a review flip; (2) the MP-failure `502` is unconditional; (3) the request `items` requirement is dropped; (4) `maxAgeSeconds` stays unset.

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **0.14 — Webhook reconciliation gaps** _(P1, launch blocker)_, the topmost open item. Seven defects in the payment reconciliation path, all in `api/webhooks/mercadopago.ts` (plus `create-preference` for **g**):

| Item | Defect | Money consequence |
| :-- | :-- | :-- |
| **a** | MP verification failures (revoked token → 401/403, MP 5xx, malformed id) are acked `200` (`:108-116`) | A genuinely paid order is never retried → never reconciled |
| **b** | The duplicate fast path is keyed on `status === 'PAGADO_MERCADOPAGO'` (`:161-174`), not the payment id | A double charge (two approved payment ids) is silently acked as duplicate → never refunded |
| **c** | No order-status guard | An approved payment for a `CANCELADO` / `DESPACHADO` / `ENTREGADO` / `TRANSFERENCIA_APROBADA` order flips it to `PAGADO_MERCADOPAGO` and deducts stock **again** |
| **d** | Only `approved` is processed | A later `refunded` / `charged_back` / `cancelled` leaves the order `PAGADO`, stock deducted, nobody alerted |
| **e** | `newStock = Math.max(0, current − qty)` (`:247`) hides the shortfall; same clamp in `approve-transfer.ts:130` and `resolve-payment-review.ts:175` | Stock hits 0 between preference and payment; the sale is approved but the warehouse never learns there is a shortfall |
| **f** | Signature verified against query `data.id` first (`:54-55`) but the payment fetched is `body.data.id` first (`:43-44`) | A replayed delivery with a tampered body id fetches a **different payment** than the one the HMAC covers |
| **g** | `create-preference` builds preference lines from `req.body.items` (`:117-183`) while the webhook asserts against `order.items` | A mismatched body yields a payable preference that later lands in `PAGO_EN_REVISION` (the Task 0.9 invariant broken on the charge side) |

Also in scope, per **e**: the identical clamp in the two admin handlers named by the roadmap.

---

## 2. Human Action Items & Placeholders (TODO for Human)

No new credentials, no new environment variables, no `.env.example` change — every fix tightens existing serverless behaviour.

| # | Action | Where / command |
| :-- | :--- | :--- |
| H1 | Confirm `WAREHOUSE_NOTIFICATION_EMAIL` is set in **Vercel Production** — the new alerts (double payment, refund/chargeback, invalid-status payment, stock shortfall) are warehouse emails | `pnpm dlx vercel@latest env ls` |
| H2 | After deploy, watch Vercel logs for the new `[Mercado Pago Webhook]` 502 entries: they mean MP is retrying a delivery it could not verify (revoked token / MP outage) — expected until the cause is fixed | Manual, after deploy |
| H3 | Optional smoke test on a preview deploy: dispatch a paid order whose product stock is 0 (or a transfer approval on a short order) and confirm the warehouse alert carries the `Stock insuficiente` note | Manual, after deploy |

---

## 3. Proposed Changes

### 3.A `[MODIFY] api/webhooks/mercadopago.ts` — (a)(b)(c)(d)(e)(f)

**One normalized payment id (f).** Extract it once — query `data.id`/`id` first (the value the official HMAC manifest `id:[data.id];…` is built from), body `data.id`/`id` as fallback — `String(...).trim()` it, and use that single value for the signature, the MP fetch URL, and every comparison. Today the signature uses query-first and the fetch body-first; after this, a tampered body id can no longer redirect the fetch away from the signed id. `maxAgeSeconds` is **deliberately not passed**: MP retries reuse the original `ts`, so a replay window would reject legitimate retries and re-open gap (a).

**MP verification gate (a).**

```ts
if (!mpResponse.ok) {
  if (mpResponse.status === 404) {           // payment does not exist → nothing to reconcile
    return res.status(200).json({ received: true, note: 'Payment not found at Mercado Pago' })
  }
  console.error(/* HTTP status, payment id, "refusing to acknowledge — Mercado Pago will retry" */)
  return res.status(502).json({ error: 'Mercado Pago verification unavailable' })
}
```

`502` is deliberate (upstream failure; 5xx → MP retries). Network failures already reach the outer `catch` → `500`. The 5xx is **unconditional** (not env-gated): money safety first; a dev-mode placeholder token now yields `502` instead of the old permissive ack.

**Payability guard (c) — inside the transaction, on the fresh read, replacing the current concurrency check:**

```ts
const PAYABLE_STATUSES  = new Set(['PENDIENTE_PAGO_MERCADOPAGO', 'PAGO_EN_REVISION'])
const SETTLED_STATUSES  = new Set(['PAGADO_MERCADOPAGO', 'TRANSFERENCIA_APROBADA', 'PAGADO_TRANSFERENCIA',
                                    'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO'])
```

1. same payment id already recorded → silent duplicate return (unchanged semantics, now keyed only on the id);
2. **settled** → *incident*: history event + warehouse alert, **no status change, no stock movement**;
3. **anything else** (CANCELADO, pending transfer/quote statuses, unknown) → *review*: `status: 'PAGO_EN_REVISION'` + stamp `mercadopagoPaymentId` + history event + warehouse alert, **no stock movement**;
4. payable → the existing catalog read → amount assertion → approval.

*Why the settled bucket is not flipped to review:* those orders are already paid/shipped — flipping them would regress the customer tracking view (`track-order` reads `DESPACHADO`/`EN_PREPARACION` as fulfilment stages) and would open a double stock-deduction path through `resolve-payment-review`'s **approve** action. The incident is recorded in history and alerted instead. The review flip is reserved for orders whose money/fulfilment state is genuinely unresolved. (If you prefer the literal "anything else → review" reading for settled statuses too, say so — it is a one-line change.)

**Double payment (b).** A second approved payment id for a settled order (step 2 above, which includes `PAGADO_MERCADOPAGO`) writes an `order_status_history` event (`previousStatus === newStatus`, reason "segundo pago aprobado … posible doble cobro", metadata `{ paymentId, previousPaymentId, transactionAmount }`) and sends the warehouse alert — **without stamping the second id over the original payment** (which would erase which payment settled the order).

**Refunds / chargebacks (d).** Payment status in `{refunded, charged_back, cancelled}` now resolves the order and, only when the stored `mercadopagoPaymentId` matches the refunded payment (or is absent on a legacy doc), runs a transaction:

- `PAGADO_MERCADOPAGO` → `PAGO_EN_REVISION` + history + alert;
- `EN_PREPARACION` / `DESPACHADO` / `ENTREGADO` → incident (history + alert, no flip — tracking regression, same rationale);
- anything else (already review/cancelled, or a refund of the *second* payment of a double charge) → silent ack.

No stock movement on refunds (restocking is off-platform, `src/types/AGENTS.md` §2.1).

**Shortfall recording (e).** Inside the approval transaction, per line: `shortfall = max(0, previousStock − 0 − qty)` is recorded in the `inventory_audit_logs` metadata (`stockShortfall` only when > 0) and the order-history metadata (`stockShortfalls: [{ productId, name, requested, available }]` only when non-empty). The warehouse alert gains a shortfall sentence (3.C). The clamp itself (`Math.max(0, …)`) stays — the money is taken, the order is approved, the shortfall is surfaced.

**Structure.** The `orderId` resolution + `getAdminFirestore()` + 0.10 fail-closed gate are hoisted so the approved and refund branches share one copy; the approved branch keeps its existing transaction/email flow.

### 3.B `[MODIFY] api/create-preference.ts` — (g)

Build `rebuiltItems` from **`orderData.items`** (the document `submitOrder` wrote), not `req.body.items`:

- line source becomes the order document; `productId || id`, `normalizeQuantity(quantity)` and `item.name` as before — prices still come from the **current** Firestore catalog with the order's promo percent (Task 0.9 unchanged);
- an order whose `items` are missing/empty → `400` (`El pedido no tiene insumos registrados…`), instead of building an empty MP preference;
- the request contract becomes `orderId` (+ optional `customer` for the payer block): `items` is no longer required or read. The client keeps sending it (no client change); the server ignores it.

### 3.C `[MODIFY] api/_lib/emailTemplates.ts` — new warehouse events + shortfall hint

- `WAREHOUSE_EVENT_LABELS` + the action-hint chain (converted from nested ternaries to a `Record<string, string>` map, same copy for existing keys) gain: **`PAGO_DUPLICADO`**, **`PAGO_ESTADO_INVALIDO`**, **`PAGO_REEMBOLSADO`**.
- `buildWarehouseAlertEmail(data, event, shortfalls?: StockShortfall[])` — new optional third parameter appends `Stock insuficiente: faltan 2× «Turbina» (disponible 0)…` to the action hint. Exported `StockShortfall` type. Backward compatible: every existing call site keeps working.

### 3.D `[MODIFY] api/_lib/admin/approve-transfer.ts` + `api/_lib/admin/resolve-payment-review.ts` — (e)

Same shortfall recording as 3.A (per-line `stockShortfall` in the audit metadata, `stockShortfalls` in the history metadata, shortfall sentence in the warehouse alert they already send). No behavioural change otherwise.

### Explicitly NOT done (scope guardrails)

- No new serverless function (6/12 Hobby slots unchanged), no new dependency, no Firestore rules/schema change, no client change.
- No `resolve-payment-review` status-guard rework (that is Task **4.3**), no rate limiting (Task **8.8**), no pending-order cleanup (Task **8.13**), no `maxAgeSeconds`.
- No re-stamping of `mercadopagoPaymentId` on incidents, no new order fields.

---

## 4. Robust Unit Testing Plan (MANDATORY)

All boundaries mocked (`firebase-admin/app`, `firebase-admin/firestore`, `api/_lib/firebaseAdmin`, `global.fetch`); no live calls.

**`[MODIFY] src/tests/api/mercadopago-webhook.test.ts`** (32 tests today; **+20** measured — 15 in the first pass, 5 added by the review remediation):

- **(a)** MP 500 → `502` + `console.error` + no order lookup; MP 401 → `502`; 404 → `200` (the two existing 404 tests are re-pointed to the new note); production + real credentials + MP 500 → `502` (the old "known gap #5" test is rewritten — the pointer comment in it is removed).
- **(b)** paid order + different payment id → `200`, one history `set` with the double-payment reason/metadata, warehouse email sent, **no** order/stock update; same-id redelivery stays a silent duplicate.
- **(c)** `CANCELADO` + approved → `PAGO_EN_REVISION` + history + alert, no stock; `DESPACHADO` + approved → no status change, no stock, incident history + alert; `TRANSFERENCIA_APROBADA` + approved → incident; `PENDIENTE_TRANSFERENCIA` + approved → review flip.
- **(d)** `refunded` on a `PAGADO_MERCADOPAGO` order (matching id) → `PAGO_EN_REVISION` + history + alert, no stock; `charged_back` on a `DESPACHADO` order → incident, no flip; refund of a *different* payment id → silent ack, no writes.
- **(e)** stock 1 vs qty 3 → approved, stock `0`, history metadata `stockShortfalls` `[{ requested: 3, available: 1 }]`, audit metadata `stockShortfall: 2`, warehouse email contains `Stock insuficiente`; a clean approval asserts `stockShortfalls` is **absent**.
- **(f)** query `data.id = A`, body `data.id = B`, signature valid over **A** → the MP fetch URL contains `A` and not `B`.

**`[MODIFY] src/tests/api/create-preference.test.ts`** (23 tests today; +~3): every order fixture gains its `items` (the current `'any'` default shape can no longer satisfy the endpoint); the 400 test becomes "orderId missing" plus a new "order without items → 400"; new: body items tampered/divergent (different product, different quantity) → the **order document's lines** are charged; body `items` omitted entirely → still `200`.

**`[MODIFY] src/tests/api/admin/approve-transfer.test.ts`** (+1) and **`src/tests/api/admin/resolve-payment-review.test.ts`** (+3 — shortfall + the two R1 guards): shortfall recorded in audit + history metadata and surfaced in the warehouse alert; the review approve is refused (`409`) on an already-settled order while cancel still resolves it.

**`[MODIFY] src/tests/api/email.test.ts`** (+2, added during implementation): the three new warehouse event labels/hints and the shortfall sentence in both the HTML and text parts.

**Zero-regression target:** `pnpm test` — baseline **697/697 (76 suites)** on `main`; measured **726/726 (76 suites)** after this branch (+29: webhook +20, create-preference +3, email +2, approve-transfer +1, resolve-payment-review +3), plus `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit` and the `api/` strict type-check clean.

---

## 5. As-Built Documentation & Roadmap Sync (executed)

- **`api/AGENTS.md`:** §2.2 webhook sequence + prose (verification gate 404/502, payability guard, refunds, double payment, shortfall, single signed id); §2.3 idempotency (fast path keyed on the payment id); §3.2/email table gains the three new warehouse events; **§8.5 item 5 is marked RESOLVED (Task 0.14)** and item 3/4 stay untouched (2.9 / 8.8).
- **`src/admin/AGENTS.md`:** §4.3 atomic decrement + §4.3b review note the shortfall metadata and the new alert events.
- **`src/tests/AGENTS.md`:** suite/test counts and the new cases per suite.
- **Root `AGENTS.md`:** the §4 payment bullet gains the new webhook guarantees; the three test-count references are refreshed.
- **`PRODUCTION_READINESS_TODO.md`:** 0.14 removed from §1/§3 and recorded in §2; baseline header refreshed.
- **Commit:** single conventional commit on the task branch, after the human "wrap up and proceed".

---

## 6. Verification Sequence (workflow steps 6 → 8) — executed

1. `pnpm test` — **726/726 across 76 suites**, zero regressions (baseline 697/697).
2. **Negative verification:** the `api/` changes were stashed and the new suites re-run against `HEAD` — **22 of the 23 new/re-pointed tests failed** (the 23rd, the `PENDIENTE_TRANSFERENCIA` review case, was tightened with a matching `totalAmount` so it now fails too, and the R4 `cancelled` test was re-verified against the intermediate version that still listed `cancelled`). The remediation guards were re-verified the same way (R1/R5/R6 fail on the pre-remediation source; R4 fails against the intermediate one).
3. `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit` and the `api/` strict type-check (`--strict --target es2022 --module esnext --moduleResolution bundler --types node --skipLibCheck`) — all clean.
4. Adversarial read-only code review (independent reviewer) — verdict *BLOCK* on one introduced defect, remediated in §7; all gates re-run green afterwards.
5. Stop for human wrap-up; commit/push/PR only on the explicit **"wrap up and proceed"**.

---

## 7. Adversarial Review Disposition (post-implementation)

Verdict: **BLOCK** (one blocker + four minors + three nits + one pre-existing note). All valid findings remediated in the working tree; gates re-run green.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| R1 | BLOCKER | A refund parks an already-deducted order in the *payable* `PAGO_EN_REVISION`, so a later approved payment (or an admin approve) could deduct stock a second time | **Fixed** — an order's lines are deducted **at most once**: the webhook records an incident (not an approval) when the fresh order already carries `paidAt`/`approvedAt`, and `resolve-payment-review`'s approve is refused with `409` while cancel stays available. 3 new tests. |
| R2 | MAJOR | As-built docs still described the pre-0.14 contract | **Fixed** — `api/AGENTS.md` (§2.2/§2.3/§3.2/§8.5 item 5), `src/admin/AGENTS.md` (§4.3/§4.3b), `src/tests/AGENTS.md`, root `AGENTS.md` and `PRODUCTION_READINESS_TODO.md` updated; this plan's status/counts corrected. |
| R3 | MINOR | Incident branches are at-least-once (redelivery duplicates history + alert) | **Documented as accepted** — `api/AGENTS.md` §2.3 states the semantics and stops promising "duplicates never re-notify" for those two branches; no order field is added (the original payment id must be preserved). |
| R4 | MINOR | `cancelled` treated as a reversal although MP only cancels unpaid payments | **Fixed** — `cancelled` dropped from the reversal set with the rationale in code + docs; the test pins the contract (verified to fail against the intermediate version). |
| R5 | MINOR | A refund of a payment parked in review was invisible | **Fixed** — the reversal branch now records the incident for `PAGO_EN_REVISION` orders (no status change) + test. |
| R6 | MINOR | `TRANSFERENCIA_APROBADA`/`ENTREGADO` incident cases promised by §4 were untested | **Fixed** — both fixtures added (2 tests). |
| R7 | NIT | Prototype-key lookup in the warehouse hint/label maps | **Fixed** — own-property lookups, mirroring the admin router and `resolvePromo`. |
| R8 | NIT | The new test describe deleted `MERCADOPAGO_*` env vars without restoring them | **Fixed** — backup/restore like the email describe. |
| R9 | NIT | Partial refunds are invisible (MP keeps the payment `approved`) | **Documented** — recorded as a known limitation in `api/AGENTS.md` §2.2. |
| P1 | pre-existing | Fractional `quantity` is not rounded before the stock write (all three consolidation loops) | **Deliberately not fixed** (out of scope; pre-existing, untouched by this diff). |

**Owner-visible deviation from the approved plan:** the roadmap's (d) listed `cancelled` as a reversal status; the review's MP documentation evidence (cancellations only apply to pending/in-process payments — no money collected) shows it can only create a false positive, so it was dropped and the rationale recorded in `api/AGENTS.md` §2.2.
