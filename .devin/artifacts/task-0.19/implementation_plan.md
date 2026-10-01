# Task 0.19: Tighten the Public `orders` Create Rule

**Branch:** `fix/task-0.19-harden-order-create-rule` (stack layer 1, cut from `main`)
**Status:** implemented, reviewed and remediated (see [walkthrough.md](./walkthrough.md) at wrap-up)
**YOLO stack:** layer 1 of 3 — 0.19 → 0.20 → 0.21. 0.19 goes first because it is the P1
security item and the later layers build on the hardened contract.

## 1. Context & Problem Statement

- **Roadmap item:** `PRODUCTION_READINESS_TODO.md` §3, Task 0.19 (P1 · NEW).
- **Re-scope note (2026-09-30 pull):** Task 8.16 already landed the commit-time-bounded
  `createdAt` (`is timestamp` + ±15 m window), the unconditional delivery-zone pin, the
  canonical RUT shape, the Boleta-only `documentType` and all 25 item-line shape guards.
  Those parts of the original 0.19 entry are therefore **already closed**. What remains:
  1. **Order-id format:** the rule binds `data.orderId` to the document id and caps it at
     32 chars, but does not pin the `PRONTO-XXXXXXXX` shape — a crafted id with stripped
     characters (e.g. `PRONTO-ABCD1234.`) is still accepted.
  2. **Voucher-folder collision (the real exploit):** `sanitizeOrderIdForPath`
     (`api/_lib/voucherStorage.ts`) *strips* disallowed characters instead of rejecting
     them. An order whose id is a victim's id plus a stripped character sanitizes into the
     **victim's** voucher folder; `voucher-housekeeping` then treats the victim's voucher as
     an orphan and deletes it (evidence loss). Impact is not money, but it destroys the
     transfer-payment evidence trail.
  3. **Unbounded line values:** `quantity` is `int >= 1` with no ceiling; `price` is
     `number >= 0`, so fractional CLP can be stored.
  4. **No e-mail shape:** `email` is only length-checked.
  5. **Zone exception for WhatsApp:** the zone pin is unconditional, but out-of-zone buyers
     settle by WhatsApp quote (0.22) — their orders must be creatable.
  6. **Admin cursor robustness:** the admin order queue continues from
     `String(createdAt)`; a legacy non-timestamp `createdAt` yields an unparseable cursor
     and the client re-requests the first page forever.

## 2. Human Action Items & Placeholders (TODO for Human)

- **Owner rules redeploy (existing P1 gate, unchanged):** after this task is merged, run
  `pnpm run deploy:rules` and independently verify the tightened contract (a forged
  `createdAt`, a foreign order-id format, a fractional `price`, a huge `quantity`, a
  malformed e-mail and an out-of-zone non-WhatsApp order must all be rejected).
- No new credentials, no new environment variables.

## 3. Proposed Changes

- **[MODIFY] `firestore.rules`**
  - `data.orderId.matches('^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$')` (the generator's exact
    alphabet; legacy `PRONTO-NNNNNN` ids are never re-created).
  - `item.quantity is int && item.quantity >= 1 && item.quantity <= 1000000` — the ceiling
    equals `MAX_STOCK_UNITS` (`api/_lib/admin/adminLimits.ts`), the admin cap on
    `stockCount`. The cart caps a line at the product's `stockCount`, so a tighter ceiling
    (e.g. 999) could reject a legitimate bulk line and dead-end checkout with a generic
    error. Rules cannot import the constant; `orderCreateContract.test.ts` pins them equal.
  - `item.price is int && item.price >= 0` (integer CLP — no cents).
  - `c.email.matches('^[^@]+@[^@]+$')` — shape only, and deliberately no stricter than the
    checkout's own `type="email"` validity (HTML5 accepts a dotless domain), so it cannot
    reject an address the form accepted. Resend is the delivery authority.
  - `isValidCustomer(c, paymentMethod)`: `c.city in ['Melipilla','San Antonio'] ||
    (paymentMethod == 'whatsapp' && isBoundedString(c.city, 80) && c.city.size() > 0)` —
    out-of-zone buyers may only create a WhatsApp quote order, and their commune must be
    non-empty (0.22 owns the UI side).
- **[MODIFY] `api/_lib/voucherStorage.ts`**
  - `sanitizeOrderIdForPath` **rejects** (returns `''`) when the trimmed/upper-cased value
    is empty, longer than 32 chars, or contains any character outside `[A-Z0-9-]` — it never
    strips. This alone closes the folder-collision vector.
  - New `isCanonicalOrderId(raw)`: the two accepted shapes (`PRONTO-` + 8 Crockford chars,
    or legacy `PRONTO-` + 6 digits) after normalization.
- **[MODIFY] `api/_lib/admin/voucher-housekeeping.ts`** — skip any order whose id is not
  canonical (`isCanonicalOrderId`), so a crafted document id can never be swept.
- **[MODIFY] `api/_lib/admin/orders.ts`** — when the last page document's `createdAt` is not
  a parseable date, flag it (`createdAtInvalid: true`, blank `createdAt`, loud `console.warn`)
  and **omit** `nextCursor` instead of echoing a cursor that cannot be parsed (the infinite
  first-page loop). Documents whose `createdAt` is a real timestamp are unaffected.
- **[MODIFY] tests** — `src/tests/security/firestore-rules.test.ts` (new pins),
  `src/tests/security/orderCreateContract.test.ts` (id/quantity/price/email pins),
  `src/tests/api/voucher-storage.test.ts` (rejection + `isCanonicalOrderId`),
  `src/tests/api/admin/voucher-housekeeping.test.ts` (non-canonical skip),
  `src/tests/api/admin/orders.test.ts` (invalid-`createdAt` pagination).
- **[MODIFY] docs** — `api/AGENTS.md` (create contract + voucher path authority),
  `PRODUCTION_READINESS_TODO.md` (close 0.19).

## 4. Robust Unit Testing Plan (MANDATORY)

No rules emulator exists in this repo (anti-overshooting guardrail), so rules are pinned by
source-content assertions — the established `firestore-rules`/`orderCreateContract`
convention — plus behavioural tests for the TypeScript helpers.

1. **`firestore-rules.test.ts`:** id-format `matches(...)`, `quantity <= 999`, `price is int`,
   e-mail `matches(...)`, the zone/WhatsApp exception, and the `isValidCustomer(c, paymentMethod)`
   signature.
2. **`orderCreateContract.test.ts`:** the real `submitOrder()` payload still satisfies the new
   pins (id from `generateOrderId()`, integer prices, integer quantities).
3. **`voucher-storage.test.ts`:** `sanitizeOrderIdForPath('PRONTO/123456')` ⇒ `''` (no longer
   `PRONTO123456`), `'../../etc'` ⇒ `''`, `'PRONTO-ABCD1234.'` ⇒ `''`; `isCanonicalOrderId`
   accepts both real shapes and rejects a trailing-character id.
4. **`voucher-housekeeping.test.ts`:** a non-canonical order id is never listed/swept.
5. **`orders.test.ts`:** a page whose last document has a non-timestamp `createdAt` returns no
   `nextCursor` and flags the row, while a valid page still paginates.
6. **Zero regressions:** full suite + the five gates green.

## 5. As-Built Documentation & Roadmap Sync Plan

- `api/AGENTS.md`: the create-contract guards (id format, quantity/price/e-mail bounds, the
  WhatsApp zone exception) and the voucher-path rejection rule.
- `PRODUCTION_READINESS_TODO.md`: remove the 0.19 board row and §3 entry, add one §5 history
  row, and keep the owner redeploy/verify bullet in the Owner-only checklist.
- `.devin/artifacts/task-0.19/walkthrough.md` at wrap-up.
