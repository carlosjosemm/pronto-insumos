# Task 2.20: Stop Re-Reading the Whole Catalog on Every Filter Change

**Branch:** `feat/task-2.20-catalog-memory-cache` (stack layer 2; cut from `feat/task-2.24-neutral-storefront-claims`)
**Status:** implemented under `--YOLO` (owner authorization 2026-10-01; no approval gate)

## 1. Context & Problem Statement

PRODUCTION_READINESS_TODO.md §3, Task 2.20 (P2 · NEW; "do after 2.14"): the catalog fetch effect in
`src/App.tsx` depends on `selectedCategory`, `search`, `sortBy` and `inStockOnly`, so every
filter/sort/stock toggle calls `fetchProducts`, which hits `GET /api/catalog`. The endpoint is
CDN-cached, but the request still crosses the network on each toggle, and the whole active catalog
is re-downloaded and re-parsed per keystroke/toggle. The catalog is filter-independent, so it only
needs to be read once per page session.

## 2. Human Action Items & Placeholders (TODO for Human)

- None. Client-only change; no credential, no external service, no deploy-order constraint.

## 3. Proposed Changes

- [MODIFY] `src/services/api.ts`
  - Module-level cache of the raw (unfiltered) catalog read: `{ catalog, source, error?, cachedAt }`.
    A `firestore`/`fixtures` result is cached; an `unavailable` result is **not** cached, so a
    retry always re-reads.
  - `CATALOG_CACHE_TTL_MS = 5 * 60 * 1000` — a sliding idle window: each cache read refreshes
    `cachedAt`, so an active shopper keeps the catalog and an idle tab re-reads after ~5 min.
  - `invalidateCatalogCache()` — exported so `App` can force a re-read on manual retry and so tests
    can reset the module state between cases.
  - `fetchProducts` now loads the raw catalog through the cache and applies
    category/search/sort/stock client-side (unchanged semantics). The result array is copied before
    sorting so a cached array is never mutated in place.
- [MODIFY] `src/App.tsx` — `handleRetryCatalog` calls `invalidateCatalogCache()` before re-arming
  the request key, so the retry button always re-reads.
- [MODIFY] `src/tests/services/api.test.ts` — add a top-level `invalidateCatalogCache()` in
  `beforeEach` (module state would otherwise leak across the file's cases) and a new suite covering
  the cache behavior.

## 4. Robust Unit Testing Plan (MANDATORY)

- New suite in `src/tests/services/api.test.ts`:
  - the endpoint is fetched **once** across category/search/sort/stock option changes;
  - `invalidateCatalogCache()` forces the next call to re-read;
  - the idle window (fake timers, `CATALOG_CACHE_TTL_MS + 1`) forces a re-read;
  - an `unavailable` result is not cached, so a retry re-reads (production, endpoint down);
  - the returned `products`/`catalog`/`source` shape is unchanged and filtering still applies.
- Existing `fetchProducts` filtering/sorting and Task 2.11 source suites stay green (reset cache per
  test). Full suite green; no live network (`fetch` mocked at the boundary).

## 5. As-Built Documentation & Roadmap Sync Plan

- As-built detail → `src/services/AGENTS.md` §2.2 (the in-memory catalog cache, the TTL, the
  invalidation contract) and a note in `src/components/AGENTS.md` §2.1 (the effect no longer
  re-reads the endpoint per filter change).
- Roadmap: remove 2.20 from the P2 board and Open Tasks, add one Resolved History row. No owner
  follow-up.
- Walkthrough narrative → `.devin/artifacts/task-2.20/walkthrough.md`.
