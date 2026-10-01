# Task 0.23: One Quantity and Stock Policy Across Handlers

**Branch:** `feat/task-0.23-quantity-stock-policy` (stack layer 2; cut from `feat/task-0.22-delivery-zone-whatsapp`)
**Status:** implemented under `--YOLO` (owner authorization 2026-10-01; no approval gate)

## 1. Context & Problem Statement

PRODUCTION_READINESS_TODO.md §3, Task 0.23 (P3 · NEW): quantity/stock handling differs across
preference, webhook and transfer approval.

- `api/create-preference.ts` checks stock **per order line**: a crafted order with two lines of
  the same product passes each line's `availableStock < quantity` check but oversells in total
  (2 lines × 8 units against a stock of 10 both pass; 16 > 10).
- `api/webhooks/mercadopago.ts:748` consolidates with `Math.max(1, Number(item.quantity) || 1)`:
  a fractional legacy quantity (e.g. `2.5`) deducts `2.5` units of stock while every pricing
  surface rounds it through `normalizeQuantity` (`Math.round`, minimum 1) — the deduction and the
  price disagree.
- `approve-transfer` and `resolve-payment-review` already consolidate by `productId` and use
  `normalizeQuantity` — they are the reference implementation.

The policy of record: **quantities are positive integers produced by `normalizeQuantity`
(`src/utils/orderTotal.ts`), and stock is checked against quantities consolidated by `productId`.**

## 2. Human Action Items & Placeholders (TODO for Human)

None — no credentials, env vars or external configuration are involved.

## 3. Proposed Changes

- [MODIFY] `api/create-preference.ts` — consolidate the order's lines by `productId` (summing
  `normalizeQuantity` per line) before the catalog loop, and stock-check the **consolidated**
  quantity. The per-line loop keeps its existing pricing/pause/stock logic but reads the
  consolidated quantity, so two lines of the same product can no longer oversell in total.
- [MODIFY] `api/webhooks/mercadopago.ts` — replace `Math.max(1, Number(item.quantity) || 1)` with
  `normalizeQuantity(item.quantity)` in the consolidation, so a fractional legacy quantity rounds
  exactly as it is priced (and the deduction can never be fractional).
- [MODIFY] `src/tests/api/create-preference.test.ts` — duplicate-line oversell refusal; a
  duplicate-line order within stock still charges the consolidated quantity.
- [MODIFY] `src/tests/api/mercadopago-webhook.test.ts` — fractional legacy quantity deducts the
  rounded amount (same figure the preference priced).
- [MODIFY] `api/AGENTS.md` §8.2 — the consolidation contract now covers all three paths.

No new endpoints, no new dependencies, no schema change.

## 4. Robust Unit Testing Plan (MANDATORY)

Vitest suites in `src/tests/`:

- **`api/create-preference.test.ts`** (extend):
  - two lines of the same product whose **sum** exceeds stock ⇒ `400` "Stock insuficiente" with
    the consolidated requested quantity, no MP fetch (each line alone would pass — the old bug);
  - two lines of the same product within stock ⇒ `200`, one preference line with the summed
    quantity;
  - fractional quantity in an order line is priced and stock-checked rounded (e.g. `2.5` ⇒ 3).
- **`mercadopago-webhook.test.ts`** (extend): a fractional legacy quantity (`2.5`) deducts
  `Math.round(2.5) === 3` units — the same figure `computeOrderTotal` prices — never `2.5`.
- **`approve-transfer.test.ts`** (existing coverage confirmed): duplicate-line consolidation and
  `normalizeQuantity` are already pinned ("consolidates duplicate line items…"); no new cases
  needed beyond a fractional-quantity assertion if absent.

Mocking: Firestore Admin doubles + mocked `fetch` per the existing suites; no live network. Full
suite stays green (zero-regression gate).

## 5. As-Built Documentation & Roadmap Sync Plan

- As-built detail → `api/AGENTS.md` §8.2 (the consolidation contract extended to
  `create-preference` + the `normalizeQuantity` webhook pin).
- Roadmap: remove 0.23 from the P3 board and Open Tasks, add one Resolved History row; no owner
  action items (pure server-side normalization).
- Walkthrough narrative → `.devin/artifacts/task-0.23/walkthrough.md`.
