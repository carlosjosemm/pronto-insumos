# Task 2.14 Walkthrough — Stock-Free Public Catalog (only low stock ≤ 3 is public)

**Branch:** `feat/task-2.14-stock-free-catalog` (stack layer 3, on top of `feat/task-0.23-quantity-stock-policy`)
**Status:** implemented, reviewed, gates green, wrapped up under `--YOLO` (owner authorization 2026-10-01).
**PR:** created at wrap-up (see the final YOLO report for the URL).

## What changed

- **`api/catalog.ts` (NEW, 7th function slot)** — the storefront's only catalog authority:
  - `GET` serves **active** products through an explicit public-field allowlist (name, price,
    category, specs, images, `inStock`, …); `stockCount` is disclosed **only** when it is an
    integer 1–3 (`LOW_STOCK_PUBLIC_THRESHOLD`), otherwise omitted. `isActive`, the ISP registry
    number and audit timestamps never leave the server. CDN-cached
    (`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`) — Firestore reads collapse
    to ~1/min per edge regardless of visitors.
  - `POST { ids }` answers the same shape for specific products with `no-store` (the uncached
    re-check surface 2.19 will use), bounded at 50 ids of ≤ 64 chars and **IP-throttled**
    (`catalog` scope, 120 attempts/60 failures per 15-min window, `429` + `Retry-After`,
    fail-open) — GET is deliberately unthrottled (a counter transaction would defeat the cache).
  - `503` when Firestore Admin is unavailable — it never fabricates a catalog.
- **`firestore.rules`** — `products` / `dev_products` client reads flip to `allow read: if isAdmin()`.
- **`src/config/catalog.ts`** (NEW) — `LOW_STOCK_PUBLIC_THRESHOLD = 3`, shared by the endpoint and
  every storefront cue.
- **`src/services/api.ts`** — `fetchProducts` calls `/api/catalog` (10 s bound kept); the
  `CatalogResult.source` semantics and the fixtures fallback (outside production only) are
  unchanged; the direct Firestore catalog read is gone.
- **`src/types/index.ts`** — `Product.stockCount` is now **optional**: absent = "plenty, the
  server verifies at payment time", never 0. Admin surfaces read full documents and always carry it.
- **Checkout pre-flight** — an absent `stockCount` no longer blocks (only `inStock: false` or a
  disclosed, exceeded count does); `create-preference` stays the authoritative guard.
- **`create-preference`** — the stock refusal discloses exact figures only when the count is an
  integer 1–3; above that (and for `availableStock: 0` or a missing product) the body is generic
  with no `availableStock` key.
- **Low-stock cues** — one cue, driven by the shared constant, on `ProductCard` (replaces `<= 5`),
  `ProductQuickView` ("Últimas unidades — disponible para despacho") and the cart line
  ("Últimas unidades"); owner-approved wording, no number. The admin low-stock KPI stays at ≤ 5.
- **Docs** — `api/AGENTS.md` (endpoint row + function count 7), `src/services/AGENTS.md` §2.2,
  `src/types/AGENTS.md` §2.5, `src/components/AGENTS.md` §6.1, `src/config/AGENTS.md` (catalog.ts).

## Verification

- `pnpm test` — **105 files / 1317 tests passed** (was 104/1303; +1 suite, +14 tests; zero regressions).
- `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit`, `pnpm run typecheck:server` — all clean.

## Review findings and disposition (code-review skill, fresh-context)

| # | Severity | Finding | Disposition |
| :-- | :-- | :-- | :-- |
| F-1 | MAJOR | `POST /api/catalog` performed up to 50 billed Firestore reads per unauthenticated request with no abuse throttle. | **Fixed** — new `catalog` throttle scope (IP: 120 attempts/60 failures per 15-min window, `429` + `Retry-After`, fail-open) wired into the POST branch only; GET stays unthrottled to preserve the CDN cache. |
| F-2 | MINOR | `Product.stockCount` was still required in the type while the catalog omits it — the compiler could no longer defend the invariant. | **Fixed** — `stockCount?: number` with the "absent = plenty" contract documented; the two admin sort/badge sites now null-safe; `src/types/AGENTS.md` §2.5 updated. |
| F-3 | MINOR | The POST bounds (50 ids / 64 chars) and the explicit empty-catalog `[]` body were untested. | **Fixed** — bound tests added; the cache test now asserts the `[]` body. |
| F-4 | MINOR | The new quick-view and cart-line cues had zero test coverage (two of three user-visible deliverables). | **Fixed** — a cue case each (shows at ≤ 3, absent above the threshold). |
| F-5 | MINOR | The "Firebase credentials absent" test passed vacuously against the deleted branch. | **Fixed** — test deleted; the stale as-built paragraph removed from `src/services/AGENTS.md`. |
| F-6 | NIT | Disclosure loose ends: dead `<= 0` clause, fabricated figures on the not-found body, a fractional-count asymmetry, no CORS headers on OPTIONS. | **Fixed** (dead clause dropped; not-found body carries no figures; `Number.isInteger` added to the disclosure; the same-origin OPTIONS behavior documented as intentional). |

## Human action items (not suspended by YOLO)

1. **Deploy order (roadmap owner bullet):** deploy the code (endpoint + storefront) FIRST, then
   `pnpm run deploy:rules`; after the flip verify the storefront catalog still loads and a direct
   client read of `products` is denied.
2. Preview walkthrough of the catalog load + low-stock cues (rides the 8.4 preview gate).
