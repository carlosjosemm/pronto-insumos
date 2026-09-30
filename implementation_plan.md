# Task 4.6: Operational Handoff for WhatsApp Quote Orders

**Branch:** `feat/task-4.6-quote-handoff` (primary working tree — no worktree; cut from `main` @ `ef67f2e`)
**Status:** **Implemented, reviewed, gates green — awaiting owner "wrap up and proceed".** 963/963 tests (87 suites); build / lint / format:check / tsc all clean. Adversarial review returned *approve with findings* (F1–F3b); all required findings remediated. See §6.

**Owner decisions recorded 2026-09-30:** (1) implement the **code action** — a minimal
`resolve-quote` admin action on the existing dispatcher, not a documentation-only SOP;
(2) **keep WhatsApp exposed** as a checkout payment method, since the operational route
becomes ready as part of this task.

---

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` §4.6 (P1; coordinate with 4.3). Checkout's WhatsApp
method creates a `COTIZACION_SOLICITADA_WHATSAPP` order (`src/services/api.ts:243-247`),
confirms it to the customer and hands them to WhatsApp
(`src/components/CheckoutModal.tsx:372-405`). That order is a **lead, not a paid sale**,
and today it strands:

- `src/admin/components/OrderDetailPanel.tsx` offers **no** approve / dispatch / close
  action for the quote status — the operator has no way to record what happened to it.
- **No API handler transitions it.** `approve-transfer` explicitly refuses quote
  statuses (409, Task 4.3), `dispatch-order` refuses them, `create-preference` refuses
  them, and the webhook parks any payment arriving for one in `PAGO_EN_REVISION`.
- The customer-side tracking endpoint maps the quote to "Cotización Formal" forever.

**Risk:** the quote remains stranded; off-platform fulfillment (owner sells on
WhatsApp and ships without a system record) produces inaccurate stock, no audit
trail, and a customer who can never track the real sale.

**Fix (roadmap):** define an owner-approved manual quote/Factura handoff — a minimal
action on the existing dispatcher that closes/resolves the quote with an audit trail.
Never use `approve-transfer` on a quote, never manually mark MP paid. Declined /
timeout quotes close without stock movement. No CRM, no new public function.

**Operational model implemented here (owner-approved):**

- **`convert`** — the sale happened **exactly as quoted** (the common case: the
  customer accepts the itemized quote and pays off-platform, e.g. Banco de Chile
  transfer). The operator attests the settled money with a **reconciliation
  reference** (the cartola line or payment receipt — never bank credentials), and one
  Firestore transaction deducts stock for the quote's lines **at most once** and
  stamps the resolution. The quote document itself becomes the sale record, so the
  original quote ID is preserved by construction.
- **`decline`** — the customer declined, never replied (timeout), or the sale closed
  on different terms. The quote closes as `CANCELADO` with **no stock movement**; the
  operator's note records why (and can reference a replacement order id when the
  negotiated sale was registered separately).

**Total-agreement guard on `convert` (same trust level as `approve-transfer`):** the
payable total recomputed from the **current catalog** (promo-aware) must equal the
order's stored `totalAmount` before any stock moves. A mismatch means the catalog
moved after the quote was issued — the operator declines (note: "venta registrada en
PRONTO-…") and registers the negotiated sale through the normal flow instead. This
keeps the SII billing block (`calculateTaxBreakdown(totalAmount)`) and the future
Boleta issuance (1.5) consistent with what was actually charged, and it is the same
check the manual transfer approval already enforces.

**Status semantics (no new enum members):** `convert` → `PAGADO_TRANSFERENCIA` (the
existing terminal paid state for the manual transfer flow); `decline` → `CANCELADO`.
Both are already understood by `dispatch-order` (a converted quote dispatches
normally), `track-order` ("Pago Acreditado" step 2 / "Pedido Cancelado" step 1) and
`approve-transfer`'s refusal guards.

---

## 2. Human Action Items & Placeholders

None. No new env vars, dependencies, services or secrets. The money verification
itself stays a manual operator step (Banco de Chile cartola / payment receipt) — the
system cannot read the bank ledger, so the reconciliation reference is the evidence,
exactly like `approve-transfer`.

Owner walkthrough items (post-deploy, recorded in the roadmap's owner checklist):
accepted quote → verified payment + one stock deduction; declined quote; late reply
(timeout) declined with a note; no duplicate fulfillment on re-click; customer
tracking shows the correct stage.

---

## 3. Proposed Changes

### API — new admin action (13th entry, no new Hobby slot)

- **[NEW] `api/_lib/admin/resolve-quote.ts`** — modeled directly on
  `resolve-payment-review.ts` + the stock-deduction block of `approve-transfer.ts`:
  - CORS headers, `OPTIONS` preflight, `POST`-only gate, `verifyAdminToken`.
  - Body: `{ orderId, resolution: 'convert' | 'decline', reconciliationReference?, notes? }`.
    `convert` requires a non-empty `reconciliationReference` (trimmed, ≤120 chars —
    same cap as `approve-transfer`); `decline` accepts optional `notes` (≤500 chars,
    same cap as `resolve-payment-review`).
  - Order resolved by document key first, `where('orderId','==')` fallback
    (`404` when absent) — same lookup as every admin handler.
  - **One Firestore transaction** (all reads before all writes):
    - Source-state guard: only `COTIZACION_SOLICITADA_WHATSAPP` may be resolved
      (`409` otherwise — cannot race a second administrator, the webhook, or process
      an already-closed quote).
    - Idempotency: current status already equals the target status → `duplicate`
      (`200`, no writes, no second deduction). A settlement marker (`paidAt` /
      `approvedAt`) on a quote → `409` settled (defense-in-depth).
    - `convert`: consolidate line quantities by `productId`
      (`normalizeQuantity` clamp), read every product first; a **missing product or
      invalid catalog price fails closed** (`409`, no partial deduction); recompute
      the payable total promo-aware (`resolvePromoPercent(order.promoCode)` +
      `computeDiscountedUnitPrice`) and require it to equal `order.totalAmount`
      (`409` on divergence); deduct stock with the `Math.max(0, …)` clamp while
      **recording shortfalls** in the audit metadata, history metadata and warehouse
      alert; write `inventory_audit_logs` (`changeType: 'ORDER_FULFILLMENT_DEDUCTION'`,
      `reasonCode: 'venta_manual'`, operatorNotes naming the quote conversion);
      stamp the order `status: 'PAGADO_TRANSFERENCIA'`, `approvedAt`, `approvedBy`,
      `quoteResolvedAt`, `quoteResolution: 'CONVERTIDA'`, `quoteResolvedBy`; write the
      `order_status_history` event carrying `reconciliationReference`, `reconciledAt`,
      `quoteResolution`, items count, verified total and shortfalls in metadata.
    - `decline`: stamp `status: 'CANCELADO'`, `quoteResolvedAt`,
      `quoteResolution: 'DECLINADA'`, `quoteResolvedBy`; history event with the
      operator's note as the reason; **no product reads, no stock movement**.
  - Emails (fail-safe, awaited): `convert` → customer `buildTransferApprovedEmail` +
    warehouse `buildWarehouseAlertEmail(…, 'PAGADO_TRANSFERENCIA', shortfalls)`;
    `decline` → warehouse alert only (the customer is already in the WhatsApp
    conversation; same pattern as `resolve-payment-review`'s cancel).
  - Errors: `409` conflict/settled with `currentStatus`, `200` for resolved/duplicate,
    `500` fail-closed with a loud log.

- **[MODIFY] `api/admin/[action].ts`** — add `'resolve-quote': resolveQuote` to the
  dispatch table (13 entries). No route file, no `vercel.json` change; the module
  lives under `api/_lib/admin/` so the Hobby function count stays at 6.

### Admin UI

- **[MODIFY] `src/admin/services/adminApi.ts`** — add `resolveQuote(orderId,
  resolution, reconciliationReference?, notes?)` mirroring `resolvePaymentReview`'s
  error contract.
- **[MODIFY] `src/admin/components/OrderDetailPanel.tsx`** — new action block rendered
  only for `COTIZACION_SOLICITADA_WHATSAPP`: context line ("verifica la venta fuera de
  la plataforma antes de confirmar"), the reconciliation-reference input (required for
  convert — button disabled until non-empty, same pattern as transfer approval), the
  confirm button and the decline button. Success/error banners and history refresh
  reuse the existing handlers' plumbing.

### Types

- **[MODIFY] `src/types/index.ts`** — three optional `Order` fields:
  `quoteResolvedAt?: string`, `quoteResolution?: 'CONVERTIDA' | 'DECLINADA'`,
  `quoteResolvedBy?: string`. No new `OrderStatus` members, so
  `VALID_ORDER_STATUSES` and `firestore.rules` are untouched.

### Storefront / customer tracking

- **No changes.** Checkout keeps the WhatsApp method (owner decision); `track-order`
  already renders `PAGADO_TRANSFERENCIA` as "Pago Acreditado" and `CANCELADO` as
  "Pedido Cancelado", so a converted or declined quote tracks correctly with zero
  endpoint changes.

### Explicitly NOT changed

- `approve-transfer` keeps refusing quote statuses (its 409 test stays).
- No new email template, no CRM, no new public endpoint, no new Hobby slot, no new
  dependency, no CSS framework, no state library.

---

## 4. Robust Unit Testing Plan (MANDATORY)

New suite **`src/tests/api/admin/resolve-quote.test.ts`** (modeled on
`resolve-payment-review.test.ts`'s Firestore Admin double + `approve-transfer`'s
deduction assertions; `sendEmail`/`getWarehouseEmail` mocked at the boundary; no real
network, no real Firebase):

*Auth & validation*
1. `403` unauthenticated; `405` non-POST; `OPTIONS` → `200` preflight.
2. `400` missing `orderId`; `400` invalid `resolution`; `400` `convert` with an
   empty/whitespace `reconciliationReference`.
3. `404` unknown order (direct-key miss + field-query miss).

*Convert — happy path & guards*
4. Happy path: quote → `PAGADO_TRANSFERENCIA`; product `stockCount` decremented by the
   consolidated quantity; audit log written (`reasonCode: 'venta_manual'`, shortfall
   metadata when applicable); history event carries `reconciliationReference`,
   `quoteResolution: 'CONVERTIDA'`, verified total; order stamped `approvedAt` /
   `approvedBy` / `quoteResolvedAt` / `quoteResolvedBy`; customer email + warehouse
   alert sent; `200 { success, resolution: 'convert' }`.
5. Idempotent re-convert (order already `PAGADO_TRANSFERENCIA`) → `duplicate: true`,
   **zero** writes (no product update, no history, no emails).
6. `409` for a non-quote source status (`PENDIENTE_TRANSFERENCIA`) — no writes.
7. `409` when a settlement marker (`approvedAt`) is present — no second deduction.
8. Fail-closed: missing catalog product → `409`, no product update, no order update,
   no history event; invalid catalog price → `409`.
9. Total mismatch (stored `totalAmount` ≠ catalog-recomputed, promo-aware) → `409`,
   no writes.
10. Oversell shortfall: stock clamped to 0, shortfall recorded in audit metadata +
    history metadata + warehouse alert (never hidden by the clamp).
11. Duplicate lines (same `productId` twice) consolidated into one deduction.
12. Promo-aware recomputation: a quote carrying `promoCode` prices the verification at
    the discounted unit price.
13. Cross-resolution conflict: `decline` on an already-converted quote → `409`.

*Decline*
14. Happy path: quote → `CANCELADO` with `quoteResolution: 'DECLINADA'`; **no product
    reads/updates**, history event with the operator's note, warehouse alert only, no
    customer email.
15. Idempotent re-decline → `duplicate: true`, zero writes.
16. `409` for a non-quote source status.

*Existing suites*
- `admin-router.test.ts`: add the `resolve-quote` mock + ROUTES entry (13 actions
  mapped; unknown-action `404` unchanged).
- `approve-transfer.test.ts`: its quote-refusal case stays green (no behavior change).
- Full suite must remain 100% green (baseline on `main`: 931 tests / 86 suites) — zero
  regression policy.

*UI tests (`src/tests/admin/OrderDetailPanel.test.tsx` additions)*
17. A quote order renders the resolution block; the confirm button stays disabled
    until a reference is typed; decline is available without one.
18. Successful convert shows the success banner, clears the input, refreshes history
    and calls `onOrderUpdated`; a server error surfaces in the error banner.
19. Non-quote orders render no quote block.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- **[MODIFY] `api/AGENTS.md`** — §1.2 function layout (13 admin actions, count
  wording), plus a new admin-handler contract entry for `resolve-quote` (guards,
  transaction, emails, audit trail).
- **[MODIFY] `AGENTS.md` (root)** — §2.2 "12 administrative endpoints" wording → 13.
- **[MODIFY] `src/admin/AGENTS.md`** — document the quote-resolution action block in
  the order-management section (operator attestation, at-most-once deduction,
  decline-without-stock semantics).
- **[MODIFY] `src/tests/AGENTS.md`** — list the new suite in `api/admin/`.
- **[MODIFY] `src/types/AGENTS.md`** — §2.4c `Order` contract: the three new
  server-written fields (`quoteResolvedAt`, `quoteResolution`, `quoteResolvedBy`).
- **[MODIFY] `PRODUCTION_READINESS_TODO.md`** — mark **4.6 `[x]`** with as-built
  evidence; keep the owner-gate line (operator walkthrough + exposure decision)
  accurate: the route is now code-ready, the owner walkthrough remains the gate.
- **[MODIFY] `implementation_plan.md`** — this file (volatile artifact).
- **[MODIFY] `walkthrough.md`** — at wrap-up: branch, commit, PR, verification
  results, review-finding dispositions.

**Verification gates:** `pnpm test && pnpm build && pnpm lint && pnpm format:check &&
pnpm exec tsc --noEmit` — all five must pass before the adversarial review.

---

## 6. Adversarial Review Disposition (as built)

Review verdict: **approve with findings**. Disposition of every finding:

- **F1 (MINOR) — decline path dropped the operator's context; `notes` unreachable
  from the UI.** Remediated: the panel gained a dedicated **Nota de cierre** input
  sent as `notes` on decline (reference stays convert-only), the adapter passes
  `notes` as the 4th argument, and the server appends any `notes` supplied on
  convert to the history reason instead of silently dropping it. New tests pin
  both directions (handler: note carried into the convert reason; UI: decline
  sends the typed note).
- **F2 (MINOR) — warehouse alert rendered the raw `PAGADO_TRANSFERENCIA` enum.**
  Remediated: `WAREHOUSE_EVENT_LABELS` gained a Spanish label ("Venta de
  cotización WhatsApp confirmada (transferencia verificada)") plus an action
  hint for the conversion event.
- **F3 (MINOR) — docs sync pending + stale counts.** Remediated: all guides
  updated (13 admin actions; `api/AGENTS.md` §6.2 contract row + §email-table
  rows; root `AGENTS.md` §2.2; `src/admin/AGENTS.md` §4.3c; `src/tests/AGENTS.md`
  12 suites; `src/types/AGENTS.md` §2.4c fields; this plan's status/counts).
- **F3b (NIT) — success banner overstated side effects on `duplicate`.**
  Remediated: `resolveQuote` surfaces `duplicate` and the banner says "La
  cotización ya estaba cerrada; no se realizó ningún cambio adicional."
- **F4 (NIT) — panel tests restored spies only on the happy path.** Remediated:
  file-level `afterEach(() => vi.restoreAllMocks())` in
  `OrderDetailPanel.test.tsx`.

Post-remediation gates: 963/963 tests (87 suites), build, lint, format:check,
tsc — all green.
