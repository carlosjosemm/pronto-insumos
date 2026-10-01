# Task 2.19 — Walkthrough

**Branch:** `feat/task-2.19-pago-price-stock-recheck` (stack layer 3 of 3, cut from `feat/task-2.20-catalog-memory-cache`)
**Status:** wrapped up under `--YOLO` (owner authorization 2026-10-01)

## Outcome

The Pago step now re-checks only the cart's products against the **uncached** catalog surface when
it opens and again whenever the payment method changes. A reprice, a stock shortfall or a
paused/removed line is applied to the cart, reported to `App`, and shown in an inline notice; the
submit stays gated until the shopper acknowledges. A failed check proceeds (the server stays the
authoritative guard), and a `useRef` lock makes the order/charge single-shot.

- `src/services/api.ts` — `recheckCartProducts(ids)` POSTs the deduplicated ids to `/api/catalog`
  (`no-store`), returns `{ products, ok }`, and fails open (`ok: false` + warn) on a non-OK status,
  a non-array payload, a transport failure or a list above the 50-id cap.
- `src/components/CheckoutModal.tsx` — the Pago-step re-check effect, `describeCartChanges`, the
  inline `role="alert"` notice + `Continuar con el nuevo total` gate, the `reconcilePendingRef` /
  `reconcileSeqRef` guards, the `onCartReconciled` callback (held in a ref so the effect does not
  depend on its identity), and the `submittingRef` in-flight lock on `handleCompleteOrder`.
- `src/App.tsx` — passes `onCartReconciled={setCart}` so the reconciled cart and its total flow back.

## Tests

- `src/tests/components/CheckoutModal.test.tsx` — a stateful harness mirrors `App` (recomputes the
  total): price change (notice + repriced total + gated submit + no order written), stock drop
  (clamped quantity), removed/paused line (deleted), failed check (proceeds silently), a method
  change before acknowledgment (gate survives), re-check on method selection, nothing changed
  (silent), and two same-tick submits creating one order.
- `src/tests/services/api.test.ts` — `recheckCartProducts` posts the deduplicated ids and fails open
  on a non-OK status / non-array payload / transport failure / over-cap list; empty list
  short-circuits.

## Verification (all five gates)

- `pnpm test` — 107 suites / 1370 tests, all passing.
- `pnpm exec tsc --noEmit`, `pnpm run typecheck:server`, `pnpm build` — clean.
- `pnpm lint` — clean; `pnpm format:check` — clean.

## Review findings and disposition

Adversarial review verdict: approve with findings. All findings remediated.

| Finding | Severity | Disposition |
| :-- | :-- | :-- |
| F1 — as-built docs/roadmap sync missing | major | Remediated: `src/components/AGENTS.md` §3.2.2, `src/services/AGENTS.md` §2.2 item 6, `api/AGENTS.md` §1.1 note, `src/tests/AGENTS.md`; task closed in the roadmap. |
| F2 — a payment-method change before acknowledgment silently cleared the gate | minor | Remediated: `reconcilePendingRef` keeps an unacknowledged notice until the shopper clicks the acknowledgment button; a test pins it. |
| F3 — the gate depended on `onCartReconciled` referential stability | minor | Remediated: the callback is held in a ref and removed from the effect deps, so an inline lambda cannot re-run the check. |
| F4 — new `describe` titles carried a task number | nit | Remediated: retitled. |

## Owner follow-ups

None — the acceptance is fully automated.
