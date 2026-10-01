# Task 4.5: Manual Cancellation, Refund, Return & Chargeback Operations

**Branch:** `feat/task-4.5-manual-order-operations` (primary working tree — no worktree; cut from `main` @ `802300e`, which includes PR #43)
**Status:** **Implemented, reviewed, remediated — gates green; awaiting owner "wrap up and proceed".** 96 suites / 1127 tests (+2 suites, +43). Adversarial review returned *approve with findings* (M1 SOP/restock truthfulness, m1–m5, n1–n3); all remediated.

---

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` **4.5 (P2; coordinate with 0.18)**:

> **Evidence:** admin offers cancel only for `PAGO_EN_REVISION`; no general return/cancel workflow exists. Order type lacks a refunded state and webhook preserves fulfilled status by design.

Verified against `main`:

- **Cancel exists in exactly two narrow paths** — `resolve-payment-review` (`cancel` → `CANCELADO`, only from `PAGO_EN_REVISION`) and `resolve-quote` (`decline` → `CANCELADO`, only from `COTIZACION_SOLICITADA_WHATSAPP`). A never-paid `PENDIENTE_PAGO_MERCADOPAGO` / `PENDIENTE_TRANSFERENCIA` / `TRANSFERENCIA_COMPROBANTE_SUBIDO` order **cannot be cancelled in-system** — it stays pending in the KPIs forever.
- **No way to record an incident/note without a status transition.** `order_status_history` is written only by status mutations (and the webhook's own incident events). A refund, a return or a chargeback that leaves the status untouched therefore leaves **no audit trail** — which is exactly what the Accept criteria demand.
- **No refunded state, by design** (`src/types/AGENTS.md` §2.1): refunds stay off-platform; the webhook deliberately preserves a fulfilled status.
- **Restock already exists** as the audited `update-stock` (reason codes `reposicion`/`merma`/`correccion`/`venta_manual`) — 4.5 must not add a second path.

**Owner-confirmed scope:** the SOP **plus** two minimal admin actions — a same-status incident note and a guarded general cancel. No refunded state, no automatic gateway refund, no stock movement in either action, no invented `CANCELADO` for paid/fulfilled orders.

---

## 2. Human Action Items & Placeholders (TODO for Human)

- **None** (no credentials, secrets or env vars; nothing added to `.env.example`).
- **Owner walkthrough is the remaining Accept gate** (not agent-executable): follow the new SOP once against a real cancellation/refund/return/chargeback and confirm the order-history trace reads correctly and restock is limited to received, usable goods.

---

## 3. Proposed Changes

### 3.1 `cancel-order` (new admin action)

**[NEW]** `api/_lib/admin/cancel-order.ts` — mirrors the `resolve-payment-review` cancel branch:

- `POST`, `verifyAdminToken`, `{ orderId, reason }`; `reason` **required** (non-empty, trimmed, ≤500 chars) — the operator's justification/evidence, never credentials.
- **Eligible source statuses** (never settled, never fulfilled): `PENDIENTE_PAGO_MERCADOPAGO`, `PENDIENTE_PAGO`, `PENDIENTE_TRANSFERENCIA`, `TRANSFERENCIA_COMPROBANTE_SUBIDO`.
- **Refused with `409`** (money collected or goods moved — those go through the refund/incident flow, not a silent cancel): `PAGADO_MERCADOPAGO`, `TRANSFERENCIA_APROBADA`, `PAGADO_TRANSFERENCIA`, `EN_PREPARACION`, `DESPACHADO`, `ENTREGADO`. Also refused: `PAGO_EN_REVISION` (has its own audited cancel), `COTIZACION_SOLICITADA_WHATSAPP` (has its own audited decline).
- `CANCELADO` → idempotent `duplicate: true`, no second history write.
- Runs in a `runTransaction` (re-read + guard inside), so it cannot race a webhook approval. **No stock movement.** Writes the order status + an `order_status_history` entry (`reason` = the operator's text, `metadata: { cancelledBy, manual: true }`).
- Fail-safe warehouse alert (`buildWarehouseAlertEmail(..., 'CANCELADO')`), consistent with the two existing cancels. Customer contact stays manual (SOP).

### 3.2 `record-order-incident` (new admin action)

**[NEW]** `api/_lib/admin/record-order-incident.ts`:

- `POST`, `verifyAdminToken`, `{ orderId, kind, note }`.
- `kind` ∈ `CANCELACION` | `REEMBOLSO` | `DEVOLUCION` | `CONTRACARGO` (`400` otherwise); `note` **required** (non-empty, ≤500) — the ledger line / customer-contact evidence.
- Valid for **any** status (a refund or chargeback lands after delivery): appends a **same-status** history event — `previousStatus === newStatus === current status`, `metadata: { event: 'INCIDENTE_MANUAL', incidentKind }`, `reason` = the note. That is the same shape the webhook already uses for its own incidents.
- **No status change, no stock movement, no email** (pure audit trail; the SOP owns communication). Repeatable by design — several incidents per order are legitimate.
- Transactional re-read so the recorded status pair cannot come from a stale read.

### 3.3 Wiring, UI and types

- **[MODIFY]** `api/admin/[action].ts` — register both actions (**16** actions; still **6** Hobby function slots).
- **[MODIFY]** `src/admin/types.ts` — `OrderIncidentKind`, `INCIDENT_KIND_LABELS` (Chilean Spanish), and the two result shapes.
- **[MODIFY]** `src/admin/services/adminApi.ts` — `cancelAdminOrder(orderId, reason)` and `recordOrderIncident(orderId, kind, note)`.
- **[MODIFY]** `src/admin/components/OrderDetailPanel.tsx` — a compact **"Operaciones Manuales"** block in the existing action area:
  - **Cancelar pedido** — rendered only for a cancel-eligible status; a required reason input gates the button.
  - **Registrar incidencia** — a `kind` select + note input + button, available for every status.
  - Restock is **not** re-implemented here: the block points the operator at the existing audited stock adjustment (Inventory), per the task's "restock only physically received, usable units".

### 3.4 Owner SOP

- **[NEW]** `MANUAL_ORDER_OPERATIONS.md` (repo root, matching `MERCADOPAGO_SETUP_GUIDE.md` / `CHECKOUT_AND_PAYMENT_FLOW.md`): the owner runbook —
  1. **Verify funds first** (Mercado Pago ledger / Banco de Chile cartola); never store bank credentials.
  2. **Cancellation** — only never-settled orders, via *Cancelar pedido* (or the review/quote resolution where it applies); a paid or fulfilled order is never silently cancelled.
  3. **Refund** — manual MP/bank refund or credit note, then record a `REEMBOLSO` incident carrying the ledger reference. **No automatic gateway refunds.**
  4. **Return / chargeback** — record `DEVOLUCION` / `CONTRACARGO` incidents.
  5. **Restock** — only physically received, usable units, through the audited stock adjustment (`merma` for damaged/unusable), always quoting the order id.
  6. Customer-contact and escalation steps.

### 3.5 Housekeeping (doc-only, as agreed)

- Tick the **4.4** board row (its work is merged in PR #34) and give **2.18** its missing as-built note + both ticks (merged in PR #41).

### 3.6 Non-goals

- No refunded `OrderStatus`, no automatic gateway refund, no second restock path, no stock movement in either new action, no new dependency, no `firestore.rules` change, no customer email from the incident action.

---

## 4. Robust Unit Testing Plan (MANDATORY)

Boundaries mocked at the edge (`adminAuth`, `firebaseAdmin`, `email`), mirroring `resolve-payment-review.test.ts`. Two new suites; suite count 93 → **95**.

| Suite | Cases |
| :-- | :-- |
| `src/tests/api/admin/cancel-order.test.ts` **(NEW)** | `403`/`405`/`OPTIONS`/db-down `500`; missing `orderId`/`reason` → `400`; each eligible status cancels to `CANCELADO` with **zero** product reads and no stock write; each refused status → `409` + no writes (paid/approved/`EN_PREPARACION`/dispatched/delivered/review/quote); already-`CANCELADO` → `duplicate` with no second history write; the history entry carries the operator reason + actor; warehouse alert fires and an email outage is non-blocking; the `orderId` query fallback; the guard holds inside the transaction (status changed mid-flight) |
| `src/tests/api/admin/record-order-incident.test.ts` **(NEW)** | `403`/`405`/`OPTIONS`/`500`; missing/invalid `kind` → `400`; missing/empty `note` → `400`; each kind appends exactly one same-status history event (`previousStatus === newStatus`, `metadata.event: 'INCIDENTE_MANUAL'`, `incidentKind`, reason = note); **no** order-status update and **no** stock/product read; works for `ENTREGADO` (post-delivery refund/chargeback); multiple incidents append multiple events; history write failure → `500` |
| `src/tests/api/admin/admin-router.test.ts` **(MODIFY)** | add both actions to `ROUTES` (the "maps every declared action" case then covers them) |
| `src/tests/admin/OrderDetailPanel.test.tsx` **(MODIFY)** | cancel control renders **only** for an eligible status (absent for `PAGADO_MERCADOPAGO`/`ENTREGADO`) and stays disabled until a reason is typed; the incident form posts `{ kind, note }` and shows the success banner; a server refusal renders in the error banner |

Zero-regression: the full 93-suite / 1084-test baseline plus the new cases must pass.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- `api/AGENTS.md` — §1.2 counts (14 → 16 actions) and §7 rows for `cancel-order` / `record-order-incident`.
- `src/admin/AGENTS.md` — the *Operaciones Manuales* panel block + a pointer to the SOP.
- `src/tests/AGENTS.md` — the two new suites + counts.
- Root `AGENTS.md` — test counts.
- `PRODUCTION_READINESS_TODO.md` — 4.5 `[x]` + as-built note; plus the 4.4/2.18 housekeeping (§3.5).

## 6. Risks & Edge Cases

- **Cancel eligibility is the load-bearing guard.** Paid/approved/preparation/dispatched/delivered are refused so a refund can never be laundered into a silent `CANCELADO`; the SOP + the `409` message say where to go instead.
- **`TRANSFERENCIA_COMPROBANTE_SUBIDO` is cancellable** even though a voucher exists — the required reason records the operator's "no funds arrived" verification (the SOP's step 1).
- **Same-status history events** do not disturb tracking: `track-order` derives its 5-step timeline from `status`, not from history.
- **No email on incidents** is deliberate (pure audit); flagged here in case the owner wants a warehouse alert for `DEVOLUCION`.

## 7. Verification

`pnpm test` (expect 96 suites), `pnpm build`, `pnpm lint`, `pnpm format:check`,
`pnpm exec tsc --noEmit` + the documented `api/` strict check. Then the adversarial `code-review`
subagent, remediation, as-built docs, roadmap tick, commit + PR.
