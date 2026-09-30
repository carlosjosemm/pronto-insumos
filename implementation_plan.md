# Task 4.3 (follow-up): Close the `create-product` Price/Unit Hardening Gap

**Branch:** `fix/task-4.3-create-product-price-bound` (primary working tree — no worktree; cut from `main` @ `718a4cd`, which already includes Task 2.15 / PR #42)
**Status:** **Implemented, reviewed, remediated — gates green; awaiting owner "wrap up and proceed".** 93 suites / 1084 tests (+20). Adversarial review returned *approve with findings* (D1–D3 doc drift, N1 note, P1/P2 pre-existing); no code change required, doc findings remediated.

---

## 1. Context & Problem Statement

**Task 4.3 (`PRODUCTION_READINESS_TODO.md`, P1) is already implemented and merged** — PR **#36**, commit `6444114 fix(admin): harden admin state, amount and inventory mutations (Task 4.3)` (merge `ef67f2e`). Its Accept criteria are covered by passing suites (`approve-transfer` 20, `dispatch-order` 18, `resolve-payment-review` 23, `OrderDetailPanel` 22, `update-stock` 8, `update-product` 6, `mark-delivered` 6, `adminAuth` 4, `adminHttp` 4, `toggle-visibility` 4).

**The one real residual** is on the *create* path. 4.3's rule — *"CLP price/total inputs must be finite integers within permitted bounds … never silently `Math.round`"* — was applied to `update-product` and `update-stock`, but **not** to `api/_lib/admin/create-product.ts`, which still coerces with `parseInt(String(...))`:

| Input | Current behaviour (`create-product`) | `update-product` / `update-stock` |
| :-- | :-- | :-- |
| `price: 189.99` | silently becomes **189** | `400` |
| `price: '189.99'` | silently becomes **189** | `400` (number-only) |
| `price: '12abc'` | silently becomes **12** | `400` |
| `price: '1e3'` | silently becomes **1** | `400` |
| `price: 1_000_000_000` | **accepted** (no ceiling) | `400` (`MAX_CLP`) |
| `stockCount: 3.5` | silently becomes **3** | `400` |
| `stockCount: 2_000_000` | **accepted** (no ceiling) | `400` (`MAX_STOCK_UNITS`) |

So a typo at creation time can persist a catalog price or stock level that the sibling edit handlers would refuse — the exact failure class 4.3 closed everywhere else, and the `999_999_999` / `1_000_000` bounds currently exist as **two private copies** that can drift.

Secondary: the Active Action Board row for 4.3 (`PRODUCTION_READINESS_TODO.md:26`) is still unticked while the detail entry is `[x]` with an as-built note.

---

## 2. Human Action Items & Placeholders (TODO for Human)

- **None.** No new credentials, secrets or environment variables; nothing added to `.env.example`.
- **Unchanged human gate (4.3):** the bank-deposit / Mercado Pago-ledger verification before approving a transfer or a review case remains a manual operator step (no bank API exists) — this follow-up does not alter it.

---

## 3. Proposed Changes

- **[NEW]** `api/_lib/admin/adminLimits.ts` — one shared authority for the numeric bounds:
  - `MAX_CLP = 999_999_999` (CLP has no cents) and `MAX_STOCK_UNITS = 1_000_000`.
  - `isValidClpAmount(value): value is number` → `number`, integer, `1…MAX_CLP`.
  - `isValidStockUnits(value): value is number` → `number`, integer, `0…MAX_STOCK_UNITS`.
  - Self-contained header comment on **why it is shared**: three handlers must reject exactly the same values; three private copies drift and let one endpoint accept what another refuses.
- **[MODIFY]** `api/_lib/admin/create-product.ts` — replace both `parseInt(String(price), 10)` / `parseInt(String(stockCount), 10)` calls with the shared guards. **Number-only**, matching `update-product`/`update-stock` (the admin UI already sends `Math.round(price)` / `Math.max(0, Math.round(stockCount))` numbers — `ProductEditModal.tsx:124-125`). `stockCount` keeps its `= 10` default when the key is omitted. Error messages mirror the sibling handlers (they include the bound).
- **[MODIFY]** `api/_lib/admin/update-product.ts` — import `MAX_CLP` + `isValidClpAmount` from the shared module; drop the private constant. Behaviour and message unchanged.
- **[MODIFY]** `api/_lib/admin/update-stock.ts` — import `MAX_STOCK_UNITS` + `isValidStockUnits`; drop the private constant. Behaviour and message unchanged.
- **[MODIFY]** `PRODUCTION_READINESS_TODO.md` — tick the 4.3 board row and append one line to the 4.3 as-built recording this follow-up (create-path parity + the shared bounds module).
- **[MODIFY]** `api/AGENTS.md` — §7 table: note the shared `adminLimits.ts` bounds on the `create-product` / `update-product` / `update-stock` rows.

### Non-goals

- No new dependency, no UI change, no `firestore.rules` / schema change, no other handler touched.
- Not re-opening 4.3's already-merged guards; this is strictly the missing create-path parity.

### Deliberate behaviour change (called out for approval)

`create-product` stops accepting **numeric strings** (`'8990'`). The sole consumer (`ProductEditModal` → `createProductDetails`) already sends numbers, so no client breaks; the tightening is what makes the three handlers consistent.

---

## 4. Robust Unit Testing Plan (MANDATORY)

Boundaries mocked at the edge (`adminAuth`, `firebaseAdmin`), mirroring the existing doubles. **Suite count stays 93** (extend existing files, no new suite).

| Suite | Cases |
| :-- | :-- |
| `src/tests/api/admin/create-product.test.ts` **(extend)** | `it.each` over rejected prices → `400` + `precio`: fractional `189.99`, `NaN`, `Infinity`, `0`, `-500`, out-of-range `1_000_000_000`, and the junk strings the old `parseInt` accepted (`'189.99'`, `'12abc'`, `'1e3'`, `''`); boundary **accepted**: `MAX_CLP` → `200`; `it.each` over rejected `stockCount` → `400` + `stock`: fractional `3.5`, negative `-1`, out-of-range `1_000_001`, `NaN`, `'15'`; omitted `stockCount` still defaults to `10`; the existing create/audit happy path is unchanged |
| `src/tests/api/admin/update-product.test.ts` **(extend)** | boundary **accepted**: `price: MAX_CLP` → `200` (pins the shared ceiling); existing fractional/NaN/out-of-range rejections stay green |
| `src/tests/api/admin/update-stock.test.ts` **(extend)** | boundary **accepted**: `newStock: MAX_STOCK_UNITS` → `200`; existing rejection table stays green |

Zero-regression: the full 93-suite / 1064-test baseline plus the new cases must pass.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- `api/AGENTS.md` §7 — the three handler rows reference the shared `adminLimits.ts` bounds.
- `PRODUCTION_READINESS_TODO.md` — 4.3 board row `[x]`; as-built line notes the create-path parity.

## 6. Risks & Edge Cases

- **Number-only tightening** — only reachable breakage is a non-UI caller sending strings; documented and flagged above.
- **Refactor of two merged handlers** — behaviour-preserving by construction (same guard, same message, bound imported rather than re-declared); their existing suites are the regression net.
- **`stockCount` default** — applied before validation, so an omitted key still yields `10` rather than a `400`.

## 7. Verification

`pnpm test` (expect 93 suites, >1064 tests), `pnpm build`, `pnpm lint`, `pnpm format:check`,
`pnpm exec tsc --noEmit` + the documented `api/` strict check. Then the adversarial `code-review`
subagent, remediation, as-built docs, roadmap tick, commit + PR.
