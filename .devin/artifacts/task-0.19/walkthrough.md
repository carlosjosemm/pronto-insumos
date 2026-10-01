# Task 0.19 — Walkthrough

**Branch:** `fix/task-0.19-harden-order-create-rule` (YOLO stack layer 1 of 3)
**Plan:** [implementation_plan.md](./implementation_plan.md)
**PR:** _created at wrap-up_

## What shipped

Re-scoped against the 2026-09-30 pull (Tasks 8.16 / 8.2 / 8.11 had already landed the
commit-time `createdAt` window, the unconditional zone pin and all 25 item-line guards).
The residual work, delivered here:

1. **`firestore.rules` — the public `orders` create contract**
   - `data.orderId.matches('^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$')` replaces the length-only
     bound, so an id can never carry a character a path sanitizer would strip.
   - `item.quantity` int in `[1, MAX_STOCK_UNITS]` (1,000,000) and `item.price` int `>= 0`.
     The quantity ceiling equals the admin stock cap so it can never be tighter than what
     the cart can offer (see the review finding below).
   - `c.email.matches('^[^@]+@[^@]+$')` — a shape guard no stricter than the checkout's own
     `type="email"` validity.
   - `isValidCustomer(c, paymentMethod)` pins `c.city in ['Melipilla','San Antonio']` with a
     WhatsApp-quote exception (non-empty bounded commune) — out-of-zone buyers settle
     delivery in a direct chat (0.22 owns the UI side).
2. **`api/_lib/voucherStorage.ts`** — `sanitizeOrderIdForPath` now **rejects** (returns `''`)
   instead of stripping, closing the voucher-folder collision; new `isCanonicalOrderId`
   recognizes the two id shapes the app generates; `isVoucherStoragePathForOrder` refuses an
   empty segment.
3. **`api/_lib/admin/voucher-housekeeping.ts`** — the sweep skips any target whose id is not
   path-safe or not canonical, so a crafted id can never list another order's folder.
4. **`api/_lib/admin/orders.ts`** — a non-timestamp `createdAt` is flagged
   (`createdAt: ''` + `createdAtInvalid: true` + a warning) and, when it is the last row of a
   full page, the `nextCursor` is omitted rather than echoed (the infinite-first-page loop).

## Verification

`pnpm run verify:full` (tests + `tsc --noEmit` + `typecheck:server` + build + lint +
format:check) — **103 suites / 1282 tests pass**, build clean, lint clean, format clean.

New/changed coverage: `firestore-rules.test.ts` (id format, line bounds, e-mail shape, the
WhatsApp zone exception), `orderCreateContract.test.ts` (rules pins + the
`MAX_STOCK_UNITS` sync + the real `submitOrder()` payload), `voucher-storage.test.ts`
(rejection + `isCanonicalOrderId`), `voucher-housekeeping.test.ts` (non-canonical skip),
`orders.test.ts` (invalid `createdAt` pagination).

## Review findings and disposition

| # | Severity | Finding | Disposition |
| :-- | :-- | :-- | :-- |
| F1 | MAJOR | `quantity <= 999` had no client mirror — the cart caps a line at `stockCount` (admin-capped at 1,000,000), so a legitimate bulk line would be rejected wholesale and surface only as the generic checkout failure. | **Fixed** — the ceiling is now `MAX_STOCK_UNITS` (the same cap the cart can never exceed), with a drift assertion in `orderCreateContract.test.ts`. |
| F2 | MAJOR | Docs/roadmap sync missing; plan asserted "implemented" with no walkthrough. | **Fixed** — `api/AGENTS.md` (§3.2, §3.3, §8.1, §8.5, the admin `orders` entry), the roadmap closure (board row + §3 entry removed, one §5 history row, the owner redeploy bullet updated), the test counts in `AGENTS.md` / `src/tests/AGENTS.md`, this walkthrough, and the plan's status line. |
| F3 | MINOR | The e-mail rule required a dot while HTML5 `type="email"` accepts a dotless domain — a user-reachable dead-end; the plan's regex also disagreed with the shipped rule. | **Fixed** — the rule is relaxed to `^[^@]+@[^@]+$` (no dead-end, still rejects junk), tests and the plan updated. |
| F4 | MINOR | The WhatsApp zone exception accepted an empty commune. | **Fixed** — `c.city.size() > 0` added to the exception. |
| F5 | MINOR | Stale test counts in the two guides. | **Fixed** — 1277 → 1282 in `AGENTS.md` (×2) and `src/tests/AGENTS.md` (×2). |
| F6 | NIT | `MAX_ORDER_ID_LENGTH` exported but unused outside its module. | **Fixed** — export dropped. |
| F7 | NIT | The new `createdAtInvalid` response field was undocumented. | **Fixed** — documented in the `api/AGENTS.md` admin `orders` entry. |

Pre-existing issues the review surfaced but deliberately left out of this task:
`MAX_STOCK_UNITS` vs a practical per-line sale cap (folds into Task 0.23) and
`CheckoutModal`'s reliance on native `type="email"` validity only.

## Human action items

- **Owner (P1):** run `pnpm run deploy:rules` and independently verify the tightened
  contract (a decoy document, a forged `taxBreakdown`, a crafted `createdAt`, a
  non-`PRONTO-XXXXXXXX` id, a fractional `price`, a quantity above `MAX_STOCK_UNITS`, a
  malformed e-mail, a foreign-zone non-WhatsApp order and admin-only field pre-injection
  must all be rejected). Recorded in the roadmap's Owner-only checklist.
