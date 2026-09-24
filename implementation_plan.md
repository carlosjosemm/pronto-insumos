# Task 8.7: Progressive Catalog Rendering (Lazy Product Cards / "Load More")

**Branch:** `feat/task-8.7-lazy-product-cards` (created from `origin/main` @ `e0b11f6` — `main` itself is checked out in another worktree, so the branch was cut directly from the remote ref)
**Status:** Awaiting user approval — no source code changes until approved.

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **8.7. Progressive Catalog Rendering (Lazy Product Cards / "Load More")**.

`ProductList.tsx` renders the entire filtered catalog in a single pass (`products.map(...)`), and `fetchProducts()` already returns the full result set. With the production catalog at **75 active `pronto-*` items**, the storefront mounts all 75 product cards — imagery, badges, price block, cart stepper each — in one very long column on first paint. The storefront is browsed between patients **on a phone**, so scroll length and first-paint cost are a genuine UX problem.

**Required capability:** progressive disclosure on the client only — no new data layer, no change to the fetch, no virtualization library (explicitly forbidden by the task's Anti-Overshooting clause). Reveal a first page of cards, then a single accessible `<button>` (plus an optional IntersectionObserver sentinel, **approved by the user: include it**) to reveal further pages, with a live `Mostrando N de M` count.

## 2. Human Action Items & Placeholders (TODO for Human)

**None.** This task is purely client-side rendering logic:

- No new credentials, secrets, or environment variables.
- No new runtime dependency (acceptance criterion; the hook uses the platform `IntersectionObserver` API).
- No human-produced assets.

`.env.example` is untouched.

## 3. Proposed Changes

Page size: **16** (matches the TODO's own example, `Mostrando 16 de 75`; 4 rows of the desktop grid).

- **[NEW] `src/hooks/useIncrementalReveal.ts`** — DOM-side-effect hook in `src/hooks/` (per the TODO's placement constraint; never `src/utils/`). API:
  - `useIncrementalReveal(total: number, resetKey: string)` → `{ visibleCount, hasMore, revealMore, sentinelRef }`.
  - State: `visibleCount`, initialized to `PAGE_SIZE` (16), clamped to `[PAGE_SIZE, total]`.
  - `revealMore()` advances one page; `hasMore = visibleCount < total`.
  - **Reset:** an effect keyed on `resetKey` (the App's `catalogRequestKey` = `${category}|${search}|${sortBy}|${inStockOnly}`) resets to page 1 whenever any catalog control changes. Also clamps down if `total` shrinks below the current count.
  - **Sentinel:** a `sentinelRef` attached to a bottom-of-grid sentinel `<div>`; an `IntersectionObserver` (rootMargin ~`200px`, created only when `hasMore` and only if `typeof IntersectionObserver !== 'undefined'` — jsdom/test guard) calls `revealMore()` when the sentinel enters the viewport. The **button remains the primary keyboard-reachable control**; the observer only auto-reveals, it never replaces the button. Observer is disconnected on unmount / when `hasMore` flips false.
- **[MODIFY] `src/components/ProductList.tsx`** —
  - New optional prop `resetKey?: string` threaded from App.
  - Slice: `products.slice(0, visibleCount)` drives the grid; each card keeps `key={product.id}` and the existing `(index % 4) * 60ms` stagger — because cards are keyed by product id, already-revealed cards keep their DOM nodes and the `product-card-entrance` animation **runs once per card** (React does not remount them on reveal; the requirement is already satisfied by the existing keying, now made explicit with a test).
  - Below the grid, only when `hasMore`: a `.load-more-row` containing
    - the sentinel `<div ref={sentinelRef} aria-hidden="true" />`,
    - `<button className="btn-load-more">Cargar más insumos</button>`,
    - `<p className="load-more-count" aria-live="polite">Mostrando {visibleCount} de {products.length}</p>` — the live region announces each reveal to screen readers.
  - Loading skeletons, empty state, and props are unchanged.
- **[MODIFY] `src/App.tsx`** — pass `resetKey={catalogRequestKey}` to `<ProductList />` (one line).
- **[MODIFY] `src/index.css`** — small `.load-more-row` / `.btn-load-more` / sentinel block next to the product-grid section, using existing tokens only (`--ink-800`, `--border-subtle`, `--radius-md`, spacing scale). No new colors; no raw hex. **Plus (approved AC addition): a new `@media (max-width: 560px)` rule collapsing `.products-grid` to a single column** — the 2-column phone layout wraps card details excessively and is hard to read; 561–768px keeps its 2 columns.

**Explicitly NOT done (Anti-Overshooting):** no `react-window`/`@tanstack/react-virtual`, no TanStack Query, no change to `fetchProducts()`, no URL/state persistence of the page number.

## 4. Robust Unit Testing Plan (MANDATORY)

**[MODIFY] `src/tests/components/ProductList.test.tsx`** — keep the 3 existing tests green, add a new describe block using a `makeProducts(n)` factory:

1. **Initial page:** render 40 products → exactly 16 `.product-card-entrance` wrappers mounted; `Mostrando 16 de 40` visible.
2. **Reveal one page:** click `Cargar más insumos` → 32 cards mounted, count reads `Mostrando 32 de 40`, button still present.
3. **End of list:** reveal twice (or render 20 products and click once) → all cards mounted, count `Mostrando 40 de 40`, **button gone**.
4. **Short catalog:** render 10 products → no button, no sentinel, no count row (everything already visible).
5. **Reset on filter change:** reveal to page 2, `rerender` with the same products but a changed `resetKey` → back to 16 cards and `Mostrando 16 de 40`.
6. **Shrinking result set:** reveal to page 3, rerender with fewer products than `visibleCount` → clamped, no crash, button hidden.
7. **Animation-once guarantee:** after clicking reveal, assert the first-page card wrappers are the *same DOM nodes* (e.g. capture element references before/after and assert identity) — proves no remount / no re-triggered entrance animation.
8. **Loading & empty states unchanged** (covered by existing tests; re-assert the button never renders during `loading`).

**[NEW] `src/tests/hooks/useIncrementalReveal.test.tsx`** — hook-level coverage via `renderHook`:

- `visibleCount` starts at 16 and `hasMore` is true for `total > 16`, false for `total <= 16`.
- `revealMore()` advances by exactly one page and clamps at `total`.
- `resetKey` change resets to 16; `total` shrink clamps.
- **Sentinel:** mock a minimal `IntersectionObserver` class (capture the callback, expose `trigger(isIntersecting)`), assert an observer is instantiated only while `hasMore`, that an intersecting sentinel calls reveal, a non-intersecting one does not, and it disconnects when the list is exhausted. Also assert the hook no-ops safely when `IntersectionObserver` is `undefined` (delete from `globalThis` for one test).
- `prefers-reduced-motion` needs no JS: the suppression already exists in `src/index.css` (`@media (prefers-reduced-motion: reduce)` → `animation: none !important` on `.product-card-entrance`); no new animation is introduced.
- **Single-column mobile grid (approved AC addition):** jsdom cannot evaluate media queries, so a small file-content guard suite (`src/tests/styles/storefrontCss.test.ts`, mirroring the `readFileSync` pattern of `firestore-rules.test.ts`) asserts that `src/index.css` contains a `@media (max-width: 560px)` block collapsing `.products-grid` to `1fr`, and that the 561–768px 2-column rule is still present.

**Mocking strategy:** no network, no Firebase — `ProductList` receives plain arrays. The only new boundary is `IntersectionObserver`, mocked per-suite (setup.ts currently provides **no** global IO mock — verified — so the hook must guard for its absence and tests provide their own double).

**Zero regressions:** full suite (429 tests / 59 suites on main) plus the new tests must stay green, and `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm format:check` must all pass.

## 5. As-Built Documentation & Roadmap Sync Plan

- **`src/components/AGENTS.md`** — document the progressive-reveal contract in the `ProductList.tsx` section: page size 16, `resetKey` contract with `App`'s `catalogRequestKey`, button-primary/sentinel-secondary reveal, aria-live count, animation-once keyed-by-id guarantee.
- **`src/hooks/`** — record `useIncrementalReveal` in the hooks documentation (root `AGENTS.md` §5 table already describes `src/hooks/` as the home for DOM-side-effect hooks; add the hook to `src/hooks/` docs if a local AGENTS.md exists, otherwise note it in `src/components/AGENTS.md`).
- **`src/tests/AGENTS.md`** — note the new hook suite and the local IntersectionObserver mock pattern.
- **`PRODUCTION_READINESS_TODO.md`** — mark **8.7** `[x]` with an as-built summary once verification passes.
