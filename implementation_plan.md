# Task 0.17: Reconcile Approved/Reversal Payments with Missing Order Data

**Branch:** `feat/task-0.17-missing-order-reconciliation` (primary working tree — no worktree; cut from `main` @ `d39875a`)
**RequestFeedback:** true · **UserFacing:** true
**Status:** **Implemented — 866/866 tests (82 suites)** after review round 1; `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit` and the strict ad-hoc `api/**` tsc all clean. Owner approved the plan 2026-09-29 ("proceed"). Adversarial review round 1 returned F1–F4 (verdict *approve with findings*); every finding is remediated — F1 (test env leak → real Resend call) fixed in the describe `afterEach`, F2 (this file's stale status/details) refreshed, F3 (two missing assertions) added, F4 (dead `if (orderId)` guard) unwrapped. Changes remain uncommitted pending the owner's "wrap up and proceed".

---

## 1. Context & Problem Statement

Roadmap item [PRODUCTION_READINESS_TODO.md](./PRODUCTION_READINESS_TODO.md) §Phase 0, Task 0.17 _(P1; coordinate with 0.11)_:

> **Evidence:** `api/webhooks/mercadopago.ts:175-205,715-725` acknowledges `200` when an approved/reversal payment has no usable `external_reference`/`description` or no matching Firestore order; `src/tests/api/mercadopago-webhook.test.ts:484-514` pins the current behavior. Mercado Pago `404` is correctly acknowledged and is not this gap.
> **Risk:** a real settlement can be acknowledged without durable reconciliation.
> **Fix:** persist a small Firestore incident keyed idempotently by `paymentId` for warehouse/manual reconciliation; no new function. Retry transient conditions; for an irrecoverably missing order, acknowledge only after the incident is durable (avoid endless `5xx`); return `5xx` if incident persistence fails.
> **Accept:** tests cover unusable reference/description or missing order, duplicate delivery, transient recovery and incident-store failure. On preview/test, verify Mercado Pago event semantics; owner ledger reconciliation remains fallback for absent/unreliable events.

**The two acked-but-unreconciled paths today** (both fall through to the generic `200 { received: true }` at `api/webhooks/mercadopago.ts:723-725`):

1. **Unusable reference (lines 175-177):** an `approved` (or `refunded`/`charged_back`) payment whose `external_reference` **and** `description` are both absent/empty gives the webhook no order id at all. Money moved; nothing is recorded anywhere.
2. **Order not found (lines 715-719):** a usable reference resolves to no Firestore order (deleted order, typo'd reference, legacy id purged). Today: one `console.warn`, then ack.

**Transient conditions are already correct and stay untouched:** MP verification `5xx`/`401`/`403` → `502` (MP retries, Task 0.14a); Firestore Admin unavailable in a production runtime → `500` (MP retries, Task 0.10). The incident path is only for the **irrecoverable** case — a verified payment that can never be joined to an order — where retrying forever would just hammer MP; there we persist a durable incident and only then acknowledge.

## 2. Human Action Items & Placeholders (TODO for Human)

* **None.** No new secrets, env vars or external credentials. The incident collection lives in the existing Firestore Admin database; the warehouse alert reuses the existing `WAREHOUSE_NOTIFICATION_EMAIL` / Resend configuration (and is fail-safe: an email failure never blocks the incident or the ack).
* **Owner follow-up (operational, not code):** on a preview/test deploy, verify Mercado Pago event semantics (that approved/reversal notifications actually carry the fields we incident on) and keep the owner ledger reconciliation as the fallback for absent/unreliable events — per the task's Accept clause.

## 3. Proposed Changes

Lean, no new serverless function (the incident logic lives under `api/_lib/`, which does not count against the Vercel Hobby 12-function cap — currently 6/12).

### [NEW] `api/_lib/paymentIncidents.ts`

Single-purpose module, no framework:

* `persistPaymentIncident(adminDb, { paymentId, paymentData, reason })`:
  * Collection: `getCollectionName('payment_incidents')` (env-scoped like every other collection).
  * **Idempotency by `paymentId`:** document id `mp-<paymentId>`; written with Firestore `create()`, which atomically fails when the doc already exists. A duplicate delivery (MP retries the same event) therefore performs **no second write** and resolves to `{ persisted: true, duplicate: true }` — no re-alert, no duplicate incident.
  * Incident document (small, reconciliation-oriented):
    ```ts
    {
      paymentId, paymentStatus, transactionAmount, currencyId,
      externalReference: <raw external_reference or null>,
      description: <raw description or null>,
      payerEmail: <paymentData.payer?.email or null>,
      reason: 'REFERENCIA_NO_UTILIZABLE' | 'PEDIDO_NO_ENCONTRADO',
      status: 'PENDIENTE_RECONCILIACION_MANUAL',
      resolved: false,
      source: 'MERCADOPAGO_WEBHOOK',
      createdAt, updatedAt   // ISO strings, matching existing history docs
    }
    ```
  * Returns `{ persisted: true, duplicate?: boolean }`; **throws** on any real persistence failure (network, permission) so the webhook can fail closed with `5xx`.
* `sendPaymentIncidentAlert(...)` — fire-and-forget-safe warehouse email via the existing `sendEmail`/`getWarehouseEmail`, with a small inline template (`[PRONTO] Pago sin pedido — revisión manual (ID: <paymentId>)`). Email failure is logged, never thrown: the durable incident is the authority, the email is a convenience.

### [MODIFY] `api/webhooks/mercadopago.ts`

Two surgical insertions; no restructuring:

1. **No usable reference:** when `orderId` is falsy for an approved/reversal payment → `persistPaymentIncident(..., reason 'REFERENCIA_NO_UTILIZABLE')` + warehouse alert, then ack `200 { received: true, verifiedStatus, note: 'incident' }` **only if** the incident is durable (persisted or duplicate). Persistence failure → `500` + loud `console.error` (MP retries; Task 0.10 style).
2. **Order not found:** the existing `console.warn` branch (lines 715-719) → same incident treatment with reason `'PEDIDO_NO_ENCONTRADO'` (keeping the warn), then ack only if durable; persistence failure → `500`.
3. Firestore Admin `null` in production → unchanged `500` (transient; retry). Outside production → unchanged simulated `200` (no Admin ⇒ no incident store; the loud log already covers it).

### [MODIFY] `api/_lib/firestoreEnv.ts`

Add `'payment_incidents'` to the `FirestoreCollectionKey` union (the function already accepts arbitrary strings; this makes the new collection first-class).

### [MODIFY] `.env.example`

No changes (no new variables).

## 4. Robust Unit Testing Plan (MANDATORY)

All in `src/tests/api/mercadopago-webhook.test.ts` (the existing webhook suite; boundary-mocked — no live Firebase/MP/network). One new focused block "Task 0.17 — missing-order payment reconciliation":

| # | Case | Assertion |
| :-- | :--- | :--- |
| 1 | **Unusable reference** — approved payment with no `external_reference`/`description` | Incident doc written to `payment_incidents` with doc id `mp-<paymentId>`, correct `reason`/`paymentStatus`/`transactionAmount`; response `200` with `note: 'incident'`; no order lookup attempted |
| 2 | **Order not found** — approved payment, reference resolves to nothing | Incident persisted (`reason: 'PEDIDO_NO_ENCONTRADO'`), `200` + note; **updates** the pinned test at lines 484-514 (which currently asserts bare warn + ack) |
| 3 | **Reversal with missing order** — `refunded` payment, no usable reference | Same incident path (reversals are in scope per the task evidence) |
| 4 | **Duplicate delivery (idempotency)** — second delivery of the same payment | `create()` rejects with an already-exists error → treated as duplicate: **no second write**, still `200`, no second alert |
| 5 | **Transient recovery** — Firestore Admin unavailable in a production runtime | Unchanged `500` (retried by MP) — pins that the incident path does **not** swallow the transient gate |
| 6 | **Incident-store failure** — `create()` throws a non-duplicate error | `500` + loud `console.error`; **no** ack of an unreconcilable settlement |
| 7 | **Warehouse alert** — `WAREHOUSE_NOTIFICATION_EMAIL` configured | Alert email attempted once per incident; a Resend outage is logged, incident still acknowledged (dedicated test) |
| 8 | **Happy paths intact** — existing approved-with-order and reversal-with-order tests | Unchanged and green (no incident written when the order resolves) |

Mocking: `global.fetch` (MP verification), `getAdminFirestore` (existing module mock), the Firestore `create()` as a `vi.fn()` on the incidents-collection double; the duplicate case rejects with an object shaped like a Firestore `ALREADY_EXISTS` error. Full suite (866 tests / 82 suites) must remain green — zero regressions.

## 5. As-Built Documentation & Roadmap Sync Plan

* **`api/AGENTS.md`** — §2.2 webhook section: document the two new incident branches (unusable reference / order not found), the `payment_incidents` collection + `mp-<paymentId>` idempotency key, the durable-then-ack rule, and the `500` on incident-store failure.
* **`src/tests/AGENTS.md`** — add the Task 0.17 block to the `mercadopago-webhook` suite description.
* **`PRODUCTION_READINESS_TODO.md`** — mark Task 0.17 `[x]` after gates pass and review findings are remediated.
* **`walkthrough.md`** — updated at wrap-up (branch, verification, PR link).

## 6. Verification Gates

```bash
pnpm test && pnpm build && pnpm lint && pnpm format:check && pnpm exec tsc --noEmit
```

Then the adversarial read-only code review (`/code-review`), remediation, and — only on the explicit **"wrap up and proceed"** — commit, push and PR.
