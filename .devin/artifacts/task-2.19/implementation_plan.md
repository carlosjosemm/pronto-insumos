# Task 2.19: Last-Moment Price and Stock Check at the Pago Step

**Branch:** `feat/task-2.19-pago-price-stock-recheck` (stack layer 3; cut from `feat/task-2.20-catalog-memory-cache`)
**Status:** implemented under `--YOLO` (owner authorization 2026-10-01; no approval gate)

## 1. Context & Problem Statement

PRODUCTION_READINESS_TODO.md §3, Task 2.19 (P2 · NEW; owner design 2026-09-30; depends on 2.14 for
the uncached read): the cart is revalidated once per page load, and `submitOrder` prices from the
cart's stored `product.price`. Only afterwards does `create-preference` compare against the live
catalog and answer `409`. A long session or a price edit therefore persists a pending ghost order
and surfaces a confusing "total does not match" error.

Owner design: run an **uncached** check when the Pago step opens and again whenever a payment method
is selected; if anything changed (price, stock below the requested quantity, product paused/removed),
update the cart, recompute the total, and show an inline notice listing each change; gate submit
until the shopper acknowledges. No change ⇒ silent. A failed check does not block checkout but is
logged. Reuse `revalidateCartAgainstCatalog` and add a `useRef` in-flight lock around
`handleCompleteOrder`.

## 2. Human Action Items & Placeholders (TODO for Human)

- None. Client-only change; no credential, no external service, no deploy-order constraint.

## 3. Proposed Changes

- [MODIFY] `src/services/api.ts` — `recheckCartProducts(ids)` POSTs `{ ids }` to `/api/catalog`
  (`no-store`, the uncached surface) and returns `{ products, ok }`. A non-OK status, a non-array
  payload, a transport failure or an over-cap id list resolve `ok: false` (logged); the caller then
  proceeds, because `create-preference` remains the authoritative guard.
- [MODIFY] `src/components/CheckoutModal.tsx`
  - New optional prop `onCartReconciled?: (items: CartItem[]) => void`.
  - A Pago-step effect (keyed on `step` + `paymentMethod`) runs the recheck, diffs the cart against
    the live products, and on a change calls `onCartReconciled(revalidateCartAgainstCatalog(...).items)`,
    sets an inline notice and gates submit until "Continuar con el nuevo total" is clicked. A
    sequence guard drops stale responses; a failed check is a no-op.
  - `handleCompleteOrder` gains a `useRef` in-flight lock (two same-tick submits can still pass the
    `isSubmitting` state guard).
- [MODIFY] `src/App.tsx` — pass `onCartReconciled={setCart}` so the reconciled cart (and its total)
  flow back into `App` and down to `CheckoutModal`.
- [MODIFY] `src/tests/components/CheckoutModal.test.tsx` — mock `recheckCartProducts`; add the
  acceptance block.
- [MODIFY] `src/tests/services/api.test.ts` — `recheckCartProducts` contract tests.

## 4. Robust Unit Testing Plan (MANDATORY)

- `CheckoutModal.test.tsx` (a small stateful harness mirrors `App` so the total recomputes):
  - price change between cart and Pago → notice, updated total, submit gated, no order written
    until acknowledged;
  - stock drop → notice + clamped quantity;
  - paused/removed product → notice + line removed;
  - check failure (`ok: false`) → proceeds silently, submit enabled;
  - method re-selection re-checks (the service is called again);
  - double-trigger creates one order (`submitOrder` called once);
  - no change ⇒ silent.
- `api.test.ts`: `recheckCartProducts` POSTs the ids, parses the array, and returns `ok: false` on a
  non-OK status / non-array body / transport failure / over-cap list.
- Full suite green; no live network (`fetch` mocked at the boundary).

## 5. As-Built Documentation & Roadmap Sync Plan

- As-built detail → `src/components/AGENTS.md` §3 (the Pago-step recheck, the notice, the submit
  gate and the in-flight lock) and `src/services/AGENTS.md` (the `recheckCartProducts` uncached
  read), plus a note in `api/AGENTS.md` that the `POST { ids }` surface is now consumed by checkout.
- Roadmap: remove 2.19 from the P2 board and Open Tasks, add one Resolved History row. No owner
  follow-up.
- Walkthrough narrative → `.devin/artifacts/task-2.19/walkthrough.md`.
