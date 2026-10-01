# Task 0.23 Walkthrough — One Quantity and Stock Policy Across Handlers

**Branch:** `feat/task-0.23-quantity-stock-policy` (stack layer 2, on top of `feat/task-0.22-delivery-zone-whatsapp`)
**Status:** implemented, reviewed, gates green, wrapped up under `--YOLO` (owner authorization 2026-10-01).
**PR:** created at wrap-up (see the final YOLO report for the URL).

## What changed

- **`api/create-preference.ts`** — the order's lines are consolidated by `productId` (summing
  `normalizeQuantity` per line) **before** the catalog loop, and the stock check runs against the
  consolidated quantity. A crafted order with two lines of the same product (each within stock)
  can no longer oversell in total; the `400` body reports the consolidated `requestedQuantity`.
  The per-product `productCache` map became unnecessary (each productId now appears exactly once)
  and was removed.
- **`api/webhooks/mercadopago.ts`** — the consolidation clamp `Math.max(1, Number(item.quantity) || 1)`
  is replaced by `normalizeQuantity(item.quantity)`: a fractional legacy quantity (2.5) now
  deducts `Math.round(2.5) === 3` units — the exact figure every pricing surface derives — instead
  of the raw 2.5 the old clamp kept.
- **`approve-transfer` / `resolve-payment-review` / `resolve-quote`** — verified already
  conforming (consolidate by `productId`, quantities through `normalizeQuantity`); no change.
- **Tests** — duplicate-line oversell refusal + consolidated single preference line + fractional
  rounding on `create-preference`; fractional deduction on the webhook; fractional deduction on
  `approve-transfer` (the accept criterion's third path). `resolve-payment-review` already pinned
  its fractional case.
- **Docs** — `api/AGENTS.md` §8.2 rewritten: the consolidation contract now lists all five
  stock-mutating paths and pins `normalizeQuantity` (the retired `Math.max` clamp snippet is gone).

## Verification

- `pnpm test` — **104 files / 1303 tests passed** (was 104/1302; +4 new, +1 renamed/extended).
- `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit`, `pnpm run typecheck:server` — all clean.

## Review findings and disposition (code-review skill, fresh-context)

| # | Severity | Finding | Disposition |
| :-- | :-- | :-- | :-- |
| F1 | MAJOR | As-built docs sync absent; `api/AGENTS.md` §8.2 still documented the retired clamp and omitted the newly consolidating paths. | **Fixed** — §8.2 rewritten (all five stock-mutating paths listed, `normalizeQuantity` pinned), roadmap synced (board row + Open Tasks entry removed, one Resolved History row added), this walkthrough written. |
| F2 | MINOR | Fractional-quantity test missing on `approve-transfer` (accept criterion "all three paths"). | **Fixed** — a `2.5`-quantity approval now pins the rounded deduction (10 − 3 = 7). |
| F3 | MINOR | Unplanned `line.name` fallback leaked client-written order text into the MP preference title. | **Fixed** — reverted to the catalog-authoritative title with an inline justification comment. |
| F4 | NIT | The test helper still carried the retired `Math.max(1, Number(…))` idiom. | **Fixed** — helper uses `normalizeQuantity`. |

## Human action items

None — pure server-side normalization; no credentials, no deploy-order constraints beyond the
normal preview gate.
