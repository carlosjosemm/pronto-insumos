# Task 2.20 — Walkthrough

**Branch:** `feat/task-2.20-catalog-memory-cache` (stack layer 2 of 3, cut from `feat/task-2.24-neutral-storefront-claims`)
**Status:** wrapped up under `--YOLO` (owner authorization 2026-10-01)

## Outcome

The raw catalog is held in memory for the page session, so `GET /api/catalog` is read at most once
across category/search/sort/stock changes; the filters apply client-side from the cached catalog.
A sliding 5-minute idle window refreshes it, overlapping calls (a keystroke burst) share one
in-flight read, an `unavailable` result is never cached, and `invalidateCatalogCache()` backs the
manual retry.

- `src/services/api.ts` — module-level cache (`{ catalog, source, error?, cachedAt }`),
  `CATALOG_CACHE_TTL_MS = 5 * 60 * 1000`, `invalidateCatalogCache()`, a shared in-flight read, and a
  `fetchProducts` that filters from the cache. Both returned arrays are copies, so a consumer cannot
  mutate the cache by sorting `products` or `catalog` in place.
- `src/App.tsx` — `handleRetryCatalog` invalidates the cache before re-arming the request key.
- Test mocks that stub `../../services/api` for `App` gained `invalidateCatalogCache: vi.fn()`.

## Tests

New `fetchProducts - in-memory catalog cache` block in `src/tests/services/api.test.ts`:
- one endpoint read across category/search/sort/stock changes;
- one shared read across overlapping (un-awaited) calls;
- re-read after `invalidateCatalogCache()` and after the sliding idle window (fake timers);
- an `unavailable` result is never cached (retry re-reads);
- a sorted read never mutates the cached catalog;
- the source-aware result shape and client-side filtering are preserved.
A top-level `invalidateCatalogCache()` reset in `beforeEach` keeps the module state from leaking
between the file's cases.

## Verification (all five gates)

- `pnpm test` — 107 suites / 1356 tests, all passing.
- `pnpm exec tsc --noEmit`, `pnpm run typecheck:server`, `pnpm build` — clean.
- `pnpm lint` — clean; `pnpm format:check` — clean.

## Review findings and disposition

Adversarial review verdict: approve with findings (both minor, optional hardening). Both remediated.

| Finding | Severity | Disposition |
| :-- | :-- | :-- |
| F1 — cached `catalog` returned by reference while only `products` was copied | minor | Remediated: `catalog` is now returned as a copy, and a test pins that a sorted read never mutates the cache. |
| F2 — no in-flight de-duplication; overlapping calls could each read the endpoint | minor | Remediated: `loadRawCatalog` shares one in-flight read; a test fires three un-awaited calls and asserts a single fetch. |

## Owner follow-ups

None — the acceptance is fully automated.
