# Task 0.20: Freeze the Charged Amount and Expire Preferences (24 h)

**Branch:** `fix/task-0.20-freeze-preference-amount` (stack layer 2, cut from
`fix/task-0.19-harden-order-create-rule`)
**Status:** implemented, reviewed and remediated (see [walkthrough.md](./walkthrough.md) at wrap-up)
**YOLO stack:** layer 2 of 3.

## 1. Context & Problem Statement

- **Roadmap item:** `PRODUCTION_READINESS_TODO.md` §3, Task 0.20 (P2 · NEW).
- **Gap:** `/api/create-preference` builds the Mercado Pago preference with no expiry, and
  the webhook asserts the paid amount against the **current** catalog. Any admin price edit,
  product pause or stock change between preference creation and payment therefore sends a
  customer who paid the correct, quoted amount to `PAGO_EN_REVISION` — manual work plus a
  charged customer who is told nothing. An unexpired link can also be paid days later
  against a moved catalog or a swept order, and the webhook never checks
  `currency_id === 'CLP'`.
- **Design:** freeze the payable amount onto the order at preference time and expire the
  link with it. The webhook asserts against the freeze when present and keeps the catalog
  recomputation as the fallback for orders created before the freeze existed.

## 2. Human Action Items & Placeholders (TODO for Human)

- None. No new credentials or environment variables.
- **Owner check (optional):** if the Mercado Pago account has offline/cash payment methods
  enabled, their validity must be at least the 24 h link expiry — confirm in the Mercado
  Pago dashboard. Card/Webpay payments settle in minutes, and a payment already `in_process`
  when the link expires still completes.

## 3. Proposed Changes

- **[NEW] `api/_lib/preferenceSnapshot.ts`** — the snapshot authority:
  `PREFERENCE_TTL_MS` (24 h), `buildPreferenceSnapshot(pricedTotal, lines, now)` producing
  `{ pricedTotal, priceSnapshot, preferenceCreatedAt, preferenceExpiresAt }`, and
  `readFrozenPricedTotal(orderData)` returning the frozen integer total or `null`.
  `close-stale-orders` already defaults to a 48 h window (this 24 h expiry + a 24 h buffer),
  so the two agree.
- **[MODIFY] `api/create-preference.ts`**
  - Capture the resolved order's `DocumentReference` (a legacy order resolved through the
    `orderId` field query is not addressed by its canonical id).
  - Write the snapshot **before** minting the preference, so a preference that exists always
    has a snapshot; best-effort with a loud `console.warn` on failure (the webhook's catalog
    fallback remains, so a snapshot-write failure never blocks a sale).
  - Mercado Pago payload gains `expires: true` and
    `expiration_date_to = snapshot.preferenceExpiresAt`.
- **[MODIFY] `api/webhooks/mercadopago.ts`** — in the amount assertion:
  - `frozenTotal = readFrozenPricedTotal(freshOrderData)`; `expectedAmount` is the frozen
    total when present, else the catalog recomputation (unchanged fallback).
  - `priceSnapshotDiverged` when the live catalog no longer equals the freeze → a loud
    `console.warn` soft alert plus `frozenTotal` / `priceSnapshotDiverged` / `catalogTotal`
    in the approval history metadata (no status change, no failure).
  - `currencyVerified = paymentData.currency_id === 'CLP'` joins `amountVerified`; the
    review-history reason and metadata name the currency.
- **[MODIFY] tests** — `src/tests/api/create-preference.test.ts` (snapshot written + the MP
  expiry fields + the best-effort failure path; the Firestore double now exposes the resolved
  ref's `update`), `src/tests/api/mercadopago-webhook.test.ts` (settles against the freeze
  despite a catalog edit, one deduction; a non-CLP payment parks in review with no stock
  movement; the no-snapshot fallback; `currency_id: 'CLP'` added to the approved fixtures),
  `src/tests/security/{firestore-rules,orderCreateContract}.test.ts` (the snapshot keys are
  not client-writable — the create allowlist already excludes them).
- **[MODIFY] docs** — `api/AGENTS.md` (create-preference + webhook sections),
  `PRODUCTION_READINESS_TODO.md` (close 0.20).

## 4. Robust Unit Testing Plan (MANDATORY)

No live MP/E2E environment exists; the boundary is mocked (fetch + Firestore Admin double).

1. **Snapshot write:** the update lands on the resolved order document with
   `pricedTotal === expectedTotal`, the per-line `priceSnapshot`, and a 24 h
   `preferenceCreatedAt → preferenceExpiresAt` span; the MP payload carries the same
   `expiration_date_to`.
2. **Best-effort failure:** a rejecting snapshot write still mints the preference (200), logs
   loudly, and leaves the webhook on its catalog fallback.
3. **Webhook, price edit between preference and payment:** `pricedTotal` frozen at 189990
   with the catalog now at 199998 and a payment of 189990 ⇒ `PAGADO_MERCADOPAGO`, exactly one
   stock deduction, the soft-alert log, and no `PAGO_EN_REVISION`.
4. **Webhook, currency mismatch:** `currency_id: 'USD'` ⇒ `PAGO_EN_REVISION`, zero stock
   deduction.
5. **Webhook, snapshot absent:** the pre-0.20 order still settles on the catalog total.
6. **Zero regressions:** full suite + the five gates green.

## 5. As-Built Documentation & Roadmap Sync Plan

- `api/AGENTS.md`: the create-preference section (snapshot write, `expires` /
  `expiration_date_to`) and the webhook amount-assertion section (freeze-first, catalog
  fallback, CLP-only, the soft alert).
- `PRODUCTION_READINESS_TODO.md`: remove the 0.20 board row and §3 entry, add one §5 history
  row.
- `.devin/artifacts/task-0.20/walkthrough.md` at wrap-up.
