# Task 4.4: Admin Inventory Hook-Order Crash

**Branch:** `fix/task-4.4-stock-adjust-hook-order` (primary working tree — no worktree; cut from `main` @ `1637755`)
**Status:** **Implemented, reviewed, gates green — awaiting owner "wrap up and proceed".** 870/870 tests (83 suites) after rebasing onto `origin/main`; build / lint / format:check / tsc all clean. Adversarial review returned *approve with findings* (F1–F4); all remediated in the working tree. See §6.

---

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` §4.4 (P1, small). `StockAdjustModal` called
`if (!product) return null` **before** its four `useState` hooks
(`src/admin/components/StockAdjustModal.tsx`), while `AdminInventory` mounted it
unconditionally with `product={selectedForStock}` and `selectedForStock` starts
as `null`. While the product is null the component registers **zero** hooks; the
first time a warehouse row's **Stock** button sets a product, the same component
instance would call four. The existing test mounted with a product immediately,
so it never exercised the null→product transition.

**Correction established during implementation (2026-09-30).** The task's
premise — that React throws *"Rendered more hooks than during the previous
render"* and crashes the view — is **not reproducible on the installed React
18.3.1**. React's own DEV source
(`node_modules/react-dom/cjs/react-dom.development.js:15464-15483`) dispatches a
render whose previous committed state is `memoizedState === null` to the **mount**
path, so no hook-count comparison runs; a StrictMode repro of the exact
early-return-before-four-hooks shape produced `THREW: null`, `CONSOLE.ERROR
CALLS: 0`. The real, verifiable defect is twofold:

1. The shape is a textbook `react-hooks/rules-of-hooks` violation (4 errors
   pre-fix under the react-hooks rule set; clean post-fix). It is undefined
   behavior and becomes a genuine crash the moment a hook is added above the
   guard or a partial hook set runs before it. `src/admin/**` is currently
   excluded from the full lint rule set (deferred to §8.10), which is why
   `pnpm lint` never surfaced it.
2. Pre-fix, switching from product A to product B while the modal stayed mounted
   kept the stale `useState(product.stockCount)` draft (no remount).

The repo's house convention is explicit: `src/admin/AGENTS.md` §6.2 and
`src/components/AGENTS.md` §2.1 — *scope overlay state by remount, not by reset
effects*; the synchronous prop→state `useEffect` (`set-state-in-effect`) is
forbidden. The fix must therefore be hook-order invariant **and** effect-free.

## 2. Human Action Items & Placeholders

None. Pure admin-UI correctness fix: no env vars, no external services, no owner
gates, no new dependencies.

## 3. Proposed Changes (as built)

- `[MODIFY]` `src/admin/components/StockAdjustModal.tsx` — split into a
  hook-free guard and a stateful form. The exported `StockAdjustModal` keeps
  `product: Product | null`, returns `null` before registering any hook, and
  otherwise renders an inner `StockAdjustForm` (four unconditional `useState`,
  lazy `useState(product.stockCount)`) with `key={product.id}`. Null→product
  mounts the form fresh; A→B remounts it with the new product's stock. No
  `useEffect`.
- `[MODIFY]` `src/admin/components/AdminInventory.tsx` — mount the modal
  conditionally (`{selectedForStock && <StockAdjustModal …/>}`), matching the
  existing `ProductEditModal` mount.
- `[MODIFY]` `src/tests/admin/StockAdjustModal.test.tsx` — null→product rerender
  test, A→B draft re-seed test, and `afterEach(vi.restoreAllMocks)` hygiene.
- `[NEW]` `src/tests/admin/AdminInventory.test.tsx` — integration over the
  reported surface (row **Stock** button → modal → submit).

No other files. No CSS, no API, no types change.

## 4. Robust Unit Testing Plan (as built)

Vitest + `@testing-library/react`; `vi.spyOn` on `src/admin/services/adminApi`.
No network, no Firebase. Added 3 tests / 1 suite; the full suite is 870/870 (83 suites) after rebasing onto `origin/main`.

1. Existing happy-path test — unchanged, green.
2. Null→product rerender — renders nothing for `null`, then rerenders with the
   product: modal appears, spinbutton reads `8`, submit calls
   `updateStockCount({ productId, newStock: 8, reason: 'reposicion' })`,
   `onSuccess`/`onClose` fire once. **Test-revert:** passes pre-fix too (React
   tolerates the 0→4 transition — see §1); it guards the early-return contract
   rather than proving this diff.
3. A→B draft re-seed — **the only revert-sensitive test**: fails pre-fix with
   stale `'8'` instead of `'3'`.
4. `AdminInventory` integration — passes pre-fix too (no crash to catch); its
   value is coverage of the row→modal→submit path.
5. Mock hygiene: `afterEach(() => vi.restoreAllMocks())` in both suites.
6. Zero-regression: 870/870 pass.

## 5. As-Built Documentation & Roadmap Sync Plan

- `src/admin/AGENTS.md` §6.2 bullet and the `AdminInventory` / `StockAdjustModal`
  table rows rewritten as built (hook-order hardening; the crash was latent, not
  observed).
- `PRODUCTION_READINESS_TODO.md` §4.4 marked `[x]` with corrected evidence and
  the verification counts.
- Gates: `pnpm test && pnpm build && pnpm lint && pnpm format:check && pnpm exec tsc --noEmit` — all green.

## 6. Adversarial Review Disposition (round 1 — approve with findings)

| ID | Severity | Finding | Disposition |
| :-- | :-- | :-- | :-- |
| F1 | MAJOR | "Runtime crash" premise false on React 18.3.1; real defect is the `rules-of-hooks` violation + stale-draft edge; docs must not claim a crash fix | **Fixed** — §1 here, `src/admin/AGENTS.md` §6.2, and the §4.4 roadmap entry rewritten to state the latent-violation framing |
| F2 | MINOR | JSDoc said `AdminInventory` renders the component with a null product, which the conditional mount no longer does | **Fixed** — JSDoc reworded (null accepted for callers that mount unconditionally; `AdminInventory` mounts only after selection) |
| F3 | MINOR | `StockAdjustModal.test.tsx` restored spies inline, leaking on a thrown assertion | **Fixed** — `afterEach(vi.restoreAllMocks)`, inline `mockRestore()` removed |
| F4 | MINOR | `AdminInventory.test.tsx` title claimed a hook-order crash that cannot occur | **Fixed** — retitled to the row→modal→submit behavior |

Reviewer also confirmed the wrapper-split is the right call over hoisting (hoisting
would still need a `key` or the forbidden `set-state-in-effect` to re-seed the
draft) and that `key={product.id}` has no bad interaction.
