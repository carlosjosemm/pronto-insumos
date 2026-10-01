# Task 2.14: Stock-Free Public Catalog (only low stock ≤ 3 is public)

**Branch:** `feat/task-2.14-stock-free-catalog` (stack layer 3; cut from `feat/task-0.23-quantity-stock-policy`)
**Status:** implemented under `--YOLO` (owner authorization 2026-10-01; no approval gate)

## 1. Context & Problem Statement

PRODUCTION_READINESS_TODO.md §3, Task 2.14 (P2 · owner decision 2026-09-30): the public
`products` / `dev_products` Firestore rules are `allow read: if true`, so anyone can read exact
`stockCount` values and paused (`isActive: false`) documents; `create-preference`'s `400` bodies
also return the exact `availableStock`, so stock is probeable by anyone able to register an order.
The UI hides counts only cosmetically, and every filter change re-reads the whole collection
(billed per visitor — the cost half is Task 2.20).

Goal: exact stock leaves the public surface. The only public stock signal is `inStock` plus a
low-stock cue when 1–3 units remain (`LOW_STOCK_PUBLIC_THRESHOLD = 3`, owner decision), served
from a new CDN-cached public endpoint that returns an explicit field allowlist.

## 2. Human Action Items & Placeholders (TODO for Human)

- **Deploy order matters (roadmap):** ship the endpoint + storefront change first, then deploy the
  rules flip (`pnpm run deploy:rules`) — flipping first blanks the live catalog. Recorded as an
  owner checklist item; no code placeholder needed.

## 3. Proposed Changes

- [NEW] `src/config/catalog.ts` — `LOW_STOCK_PUBLIC_THRESHOLD = 3`, the shared constant driving
  the endpoint's stock disclosure and the storefront's single low-stock cue.
- [NEW] `api/catalog.ts` — public endpoint (7th of 12 Hobby slots):
  - `GET` — Admin SDK reads the env-scoped `products` collection, filters `isActive !== false`,
    maps every document through an explicit public-field allowlist (id, sku, name, brand,
    category, price, priceNeto, originalPrice, rating, reviewsCount, inStock, prescriptionRequired,
    tag, description, specs, placeholderTheme, mediaBadge, unitOfSale, images, packageContents,
    manufacturer). `stockCount` is included **only when an integer 1–3**, otherwise omitted;
    `isActive` / `ispRegistrationNumber` / timestamps / internal fields never leave. Answers
    `200` with `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (Firestore reads
    collapse to ~1/min regardless of visitors), `503` when Firestore Admin is unavailable.
  - `POST { ids }` — same shape for specific products (bounded: array of strings, ≤ 50 ids of
    ≤ 64 chars), `Cache-Control: no-store` (used by the future 2.19 uncached preflight).
  - `OPTIONS` preflight + `405` for other methods, mirroring the existing endpoints.
- [MODIFY] `firestore.rules` — `products` / `dev_products` become `allow read: if isAdmin()`
  (the admin console reads through `/api/admin/products`; the storefront reads the endpoint).
- [MODIFY] `src/services/api.ts` — `fetchProducts` reads `/api/catalog` (GET) instead of a direct
  Firestore `getDocs`; `CatalogResult` semantics unchanged (`source: 'firestore'` on success;
  fixtures fallback only outside production; `unavailable` + retry in production). The direct
  Firestore catalog read is removed from the storefront (only `setDoc` remains for orders).
- [MODIFY] `src/components/CheckoutModal.tsx` — the pre-flight stock checks treat an absent
  `stockCount` as "plenty, the server verifies" (an issue requires `inStock === false` or a
  **present** `stockCount` that is ≤ 0 / below the quantity) — an absent count must never block
  checkout.
- [MODIFY] `src/components/ProductCard.tsx` — the low-stock cue keys off
  `LOW_STOCK_PUBLIC_THRESHOLD` (replaces the local `<= 5`).
- [MODIFY] `src/components/ProductQuickView.tsx` + `src/components/Cart.tsx` — the same
  constant-driven "Últimas unidades" cue (owner-approved wording, no number) on the quick view
  and the cart line; absent `stockCount` means "plenty, the server verifies".
- [MODIFY] `firestore.rules` — `products` / `dev_products` read flips to `isAdmin()`.

## 4. Robust Unit Testing Plan (MANDATORY)

- **`src/tests/api/catalog.test.ts`** (new) — allowlist shape (no `stockCount` above 3, no
  `isActive`/`ispRegistrationNumber`/timestamps), inactive products filtered, ≤ 3 rule (1–3
  present, 0/4+ omitted), `inStock` always present, cache header on GET, `POST ids` `no-store`,
  `POST` validation (non-array / non-string / oversized ids ⇒ `400`), Admin down ⇒ `503`,
  `GET` empty catalog ⇒ `200 []`.
- **`src/tests/security/firestore-rules.test.ts`** — the products blocks now pin
  `allow read: if isAdmin()` (the old public-read pin is inverted).
- **`src/tests/components/ProductCard.test.tsx`** — badge shows at `stockCount: 3`, absent at 4+
  and when `stockCount` is missing.
- **`src/tests/components/CheckoutModal.test.tsx`** — the pre-flight no longer blocks when
  `stockCount` is absent (`inStock: true`, no `stockCount`) — the "server verifies" contract.
- **`src/tests/services/api.test.ts` / `AppCatalog.test.tsx`** — `fetchProducts` now resolves
  through `/api/catalog` (mocked `fetch`): success ⇒ `source: 'firestore'`, endpoint failure in
  production ⇒ `unavailable`, outside production ⇒ `fixtures`; filtering/sorting semantics unchanged.
- Full suite stays green (zero-regression gate); no live network — Firestore Admin via doubles,
  `fetch` mocked.

## 5. As-Built Documentation & Roadmap Sync Plan

- As-built detail → `api/AGENTS.md` (new §1.1 endpoint row + §1.2 function count 7/12),
  `src/services/AGENTS.md` §2.2 (the catalog now comes from `/api/catalog`),
  `src/config/AGENTS.md` (the new `catalog.ts` constant file),
  `src/components/AGENTS.md` (the ≤ 3 cue on card/quick view/cart line).
- Roadmap: remove 2.14 from the P2 board and Open Tasks, add one Resolved History row, add the
  **deploy-order** owner bullet (endpoint + storefront first, rules flip last).
- Walkthrough narrative → `.devin/artifacts/task-2.14/walkthrough.md`.
