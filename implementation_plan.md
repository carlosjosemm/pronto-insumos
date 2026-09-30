# Task 4.3: Admin Handler Hardening

**Branch:** `fix/task-4.3-admin-handler-hardening` (primary working tree — no worktree; cut from `main` @ `42989df`)
**Status:** **Implemented, reviewed, gates green — awaiting owner "wrap up and proceed".** 910/910 tests (86 suites); build / lint / format:check / tsc all clean. Adversarial review returned *approve with findings* (F1–F8); all remediated. See §6.

---

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` §4.3 (P1). The 12 administrative handlers under
`api/_lib/admin/` are the money/stock authority for the backoffice, but several
accepted transitions and amounts the client can forge, and two inventory
mutators lost writes under concurrency (full detail in the review scope below):

- No source-state guards in `approve-transfer` / `dispatch-order` / `mark-delivered`.
- No amount verification on transfer approval (silently skipped a missing product).
- No operator evidence for transfer approval; `resolve-payment-review` accepted an
  empty note and the panel always showed a fixed "amount mismatch" message.
- `update-stock` accepted `NaN`/fractional counts and read-then-batched outside a
  transaction; `update-product` silently rounded prices; `toggle-visibility`
  read-then-batched a stale `inStock`.
- `verifyAdminToken` ignored token revocation; every handler emitted a wildcard
  `Access-Control-Allow-Origin`.

## 2. Human Action Items & Placeholders

None. No new env vars, dependencies or services. The bank-deposit / receipt
verification itself stays a manual operator step (no bank API); this change adds
the attestation field and audit trail.

## 3. Proposed Changes (as built)

- `[NEW]` `api/_lib/admin/adminHttp.ts` — `setAdminResponseHeaders` (no
  `Access-Control-Allow-Origin`) + `isAdminPreflight`; applied to all 12 handlers.
- `[MODIFY]` `api/_lib/admin/approve-transfer.ts` — source-state guards, catalog
  recompute (promo-aware, fail-closed), required `reconciliationReference`,
  normalized `orderId`.
- `[MODIFY]` `dispatch-order.ts` / `mark-delivered.ts` — source-state guards;
  `mark-delivered` moved into a transaction.
- `[MODIFY]` `resolve-payment-review.ts` — approve requires a note; line
  quantities use the shared `normalizeQuantity`.
- `[MODIFY]` `update-stock.ts` / `toggle-visibility.ts` — transactional
  read-modify-write; whole-unit / CLP bounds.
- `[MODIFY]` `update-product.ts` — integer price bounds, category normalization,
  price-change audit.
- `[MODIFY]` `adminAuth.ts` — `verifyIdToken(token, true)` (revoke-aware).
- `[MODIFY]` `src/admin/services/adminApi.ts` + `src/admin/components/OrderDetailPanel.tsx`
  — required bank reference input; incident-specific `PAGO_EN_REVISION` reason.
- Tests: rewrote `approve-transfer`/`update-stock`, extended
  `resolve-payment-review`/`update-product`/`adminAuth`/`OrderDetailPanel`, added
  `mark-delivered`/`toggle-visibility`/`adminHttp` suites.

## 4. Robust Unit Testing Plan (as built)

Boundary mocks via `vi.mock` on `adminAuth`/`firebaseAdmin`; no network. Added
9 tests / 4 suites over the pre-change 901 (net suite count 86). Coverage
includes: quote/dispatched/`approvedAt` rejection, promo-aware match and
mismatch, missing product, absent total, no-writes-on-conflict, duplicate
idempotency, NaN/fractional stock, malformed line quantity, revoke-aware auth,
CORS absence (+ a source guard that fails if any handler reintroduces the
header), and the UI reference/incident paths.

## 5. As-Built Documentation & Roadmap Sync Plan

- `api/AGENTS.md` §6 intro + §6.1 (revoke-aware) + §6.2 rows (all changed handlers).
- `src/admin/AGENTS.md` §4.3 / §4.3b (reference + incident + required note).
- `PRODUCTION_READINESS_TODO.md` §4.3 marked `[x]` with an as-built note.
- Gates: `pnpm test && pnpm build && pnpm lint && pnpm format:check && pnpm exec tsc --noEmit` — all green.

## 6. Adversarial Review Disposition (round 1 — approve with findings)

| ID | Severity | Finding | Disposition |
| :-- | :-- | :-- | :-- |
| F1 | MAJOR | No promo-aware approve-transfer test (Accept criterion) | **Fixed** — added discounted-match (200) and undiscounted-mismatch (409) tests |
| F2 | MINOR | No test pins the wildcard-CORS removal | **Fixed** — `adminHttp.test.ts` asserts no ACAO + a source guard across all handler files |
| F3 | MINOR | `mark-delivered` read-then-batch race (duplicate history) | **Fixed** — moved into `runTransaction` |
| F4 | MINOR | `DESPACHADO` re-dispatch allowed by the handler but unreachable in the UI | **Accepted** — kept (tested handler feature); comment reworded to be accurate; UI exposure is a pre-existing gap belonging to §4.2 |
| F5 | MINOR | Untrimmed `orderId` written while lookup trimmed | **Fixed** — single `cleanOrderId` used for lookup + writes |
| F6 | MINOR | `src/admin/AGENTS.md` §4.3b said the review note is optional | **Fixed** — now "required for approve, optional for cancel" |
| F7 | NIT | `itemsCount` counts raw lines, not consolidated products | **Accepted** — cosmetic; "items" reads as order lines |
| F8 | MAJOR (pre-existing) | `resolve-payment-review` wrote `NaN`/fractional `stockCount` for malformed quantities | **Fixed** — uses the shared `normalizeQuantity`; regression test added |

Also strengthened: a conflicted approval now asserts **zero** history/audit
writes (F1-adjacent), and an absent `totalAmount` case (409) was added.
