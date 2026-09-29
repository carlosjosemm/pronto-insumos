# Task 2.11: Catalog Fallback Shows Prototype Fixtures and Wipes the Persisted Cart

**Branch:** `fix/task-2.11-catalog-fallback-cart-wipe` (cut from `main` @ `6c79471` — the merged PR #24 — verified in sync with `origin/main`; executing in the isolated Windsurf worktree)
**RequestFeedback:** true · **UserFacing:** true
**Status:** Implemented, verified, adversarially reviewed (findings F1–F7 remediated — see §7) and awaiting the explicit **"wrap up and proceed"** command.

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **2.11** (P1 launch blocker, 2026-09-29 audit).

`fetchProducts()` (`src/services/api.ts:57-82`) races the Firestore read against a **2.5 s timeout** and, on timeout, rejection **or an empty snapshot**, returns the 11 `odon-*` prototype fixtures. Two defects follow:

| # | Defect (as built) | Consequence |
| :-- | :--- | :--- |
| D1 | The fallback is **unconditional** — `isSimulatedFallbackAllowed()` is never consulted (unlike every other simulated path since Task 2.8/0.10) | A production storefront served from a slow or failing Firestore shows **11 prototype items, all `isActive: false` / `inStock: false`** ("all agotado") and no error. A slow 4G first load in Chile is enough to trigger it. |
| D2 | `App.tsx:154-190` cannot tell a real catalog from the fixture fallback, so it runs `revalidateCartAgainstCatalog(cart, res)` on the **first unfiltered load regardless of source** | Every saved `pronto-*` cart line is absent from the fixture catalog ⇒ classified "discontinued" (`cartStorage.ts:184-196`) ⇒ **the cart is emptied, persisted empty, and a misleading "Se actualizó el carro…" toast is shown**. |
| D3 | `hasRevalidated.current` is set even when the load fell back | The one-shot revalidation is consumed by the bad load, so a later successful catalog never revalidates the cart in that session. |

The fixtures themselves are not the bug — `src/data/AGENTS.md` §2.1 documents them as a deliberate **dev/test** artifact ("they never display on the storefront but remain usable by tests and the local offline fallback"). The bug is that production can reach them, and that the cart is mutated from data that was never authoritative.

---

## 2. Human Action Items & Placeholders (TODO for Human)

No new credentials, no new environment variables, no `.env.example` change — this task only tightens client behaviour.

| # | Action | Where / command |
| :-- | :--- | :--- |
| H1 | *(Optional)* Verify the new error state on a preview deploy: open the storefront, block Firestore (DevTools → Network → Offline) and reload → expect the retryable "No pudimos cargar el catálogo" card, never the 11 prototype items; a saved cart must survive | Manual, after deploy |
| H2 | *(Optional)* Confirm `VITE_FIREBASE_*` are present on the Vercel Production target — after this change a missing/blocked catalog shows an honest error instead of fixtures | `pnpm dlx vercel@latest env ls` |

---

## 3. Proposed Changes

### 3.A `[MODIFY] src/services/api.ts` — a source-aware catalog fetch

New explicit contract (the service currently returns a bare `Product[]`, which is exactly why `App` cannot tell the two apart):

```ts
export type CatalogSource = 'firestore' | 'fixtures' | 'unavailable'

export interface CatalogResult {
  products: Product[]
  source: CatalogSource
  /** Customer-safe Chilean-Spanish message, present only when source === 'unavailable'. */
  error?: string
}

/** Bounded wait for the catalog read. Relaxed from 2.5 s (Task 2.11): a first load on
 *  slow Chilean mobile data routinely exceeded it, which is what served fixtures. */
export const CATALOG_FETCH_TIMEOUT_MS = 10_000
```

`fetchProducts(options): Promise<CatalogResult>` — same filtering/sorting/partitioning as today, new source semantics:

| Situation | Production (`!isSimulatedFallbackAllowed()`) | Dev / preview (or `VITE_ALLOW_SIMULATED_PAYMENTS=true`) |
| :--- | :--- | :--- |
| Firestore returns ≥1 active product | `source: 'firestore'` | `source: 'firestore'` |
| Missing `VITE_FIREBASE_*` config | `source: 'unavailable'` + error | `source: 'fixtures'` |
| `getDocs` rejects | `source: 'unavailable'` + error | `source: 'fixtures'` + `console.warn` |
| `getDocs` resolves empty | `source: 'unavailable'` + error | `source: 'fixtures'` |
| Timeout (> `CATALOG_FETCH_TIMEOUT_MS`) | `source: 'unavailable'` + error | `source: 'fixtures'` + `console.warn` |

- Error message (shared constant): `'No pudimos cargar el catálogo de insumos. Revisa tu conexión y reintenta.'`
- Production failures log via `console.error`; dev fallbacks keep the historical `console.warn` — the same convention Task 2.8 established for the other adapters.
- `isActive !== false` continues to filter **Firestore** results.

### 3.B `[MODIFY] src/App.tsx` — consume the source, protect the cart, offer a retry

- New state: `catalogError: string | null` and `catalogRetryKey: number`; `catalogRequestKey` gains the retry key (`${category}|${search}|${sortBy}|${inStockOnly}|${retryKey}`) so a retry re-runs the effect **and** re-shows the skeleton (`loading` is derived from that key).
- `setProducts(res.products)`; `setCatalogError(res.source === 'unavailable' ? res.error : null)`.
- **Cart protection (D2/D3):** the revalidation block only runs when `res.source === 'firestore'` — and only then is `hasRevalidated.current = true`. Fallback data can therefore never remove, clamp or re-price a saved line, and the one-shot revalidation is preserved for the first *authoritative* catalog of the session.
- The "Se actualizó el carro…" toast consequently only fires from a real catalog.

### 3.C `[MODIFY] src/components/ProductList.tsx` — retryable catalog error state

Two optional props, `catalogError?: string | null` and `onRetry?: () => void`. When `catalogError` is set the component renders an error card **in place of the grid** (same container styling as the existing empty state, `AlertCircle` icon, the service's message, and a `Reintentar` button). The existing "No se encontraron insumos odontológicos" copy stays for the genuinely-empty-results case (e.g. a search with no matches).

### 3.D `[MODIFY] src/components/CategoryFilter.tsx` — stop counting the prototype catalog

Found while auditing the fixture blast radius, and the same defect family: `CategoryFilter` computes its pill counts from `const catalog = products || PRODUCTS`, but **`App.tsx` never passes `products`** — so `catalog` is *always* the 11 prototype fixtures and every category pill shows a prototype count (`categoryCounts[cat.id] ?? 0`, rendered at `:105`). The counts are wrong today for every real catalog, and the fallback is a second way prototype data reaches the storefront.

- `catalog = products ?? []` and the `PRODUCTS` import is **removed from the component entirely**.
- `App.tsx` passes the live `products` it already holds.
- With an unavailable/empty catalog the pills still render the canonical `CATEGORIES` taxonomy (a static storefront list, not fixture data) with counts of `0` — which is truthful.

### 3.E Decision point — the `isActive` filter on fallback data

The TODO's fix line ends with *"filter `isActive` on fallback data too"*. Taken literally that makes the dev fallback **empty** (all 11 fixtures are `isActive: false` by design), which contradicts their documented role and would rewrite ~15 assertions in `api.test.ts` that pin the 11-item fallback.

**Recommended (A):** keep the fixtures unfiltered for the **dev-only** fallback and document why — after this change fixtures are *unreachable in production*, so the filter's protective purpose is already satisfied; the dev developer sees the prototype catalog as designed.

Alternatives if you prefer: **(B)** apply the filter literally (dev shows the empty state; ~15 test assertions rewritten), or **(C)** flip the 11 fixtures to `isActive: true` so the filter is consistent *and* dev keeps a catalog — a fixture-contract change that `src/data/AGENTS.md` §2.1 and `src/tests/data/products.test.ts` would have to follow.

### 3.F The fixtures themselves — deliberately out of scope (owner question, answered)

The owner asked whether the `odon-*` fixtures should simply be deleted. **Not in this task**, and the audit is the reason: they have six live consumers, not one —

| Consumer | Role |
| :--- | :--- |
| `src/services/api.ts` | dev/offline catalog fallback (this task's subject) |
| `src/components/CategoryFilter.tsx` | pill counts (fixed in §3.D) |
| `src/admin/services/adminApi.ts:208` | admin inventory fallback (out of scope by owner decision) |
| `scripts/manage-firestore-schema.ts` | `schema:seed` / `schema:seed:dev` seed the catalog from `canonicalProducts` — a **documented operator command** |
| `src/services/firebase.ts` | `seedProductsToFirestore()` — retained, uncalled |
| 4 test suites | `data/products.test.ts` exists *solely* to validate them |

Deleting them is a cross-cutting refactor that first requires a product decision (*what replaces them as the seed source?*), and it would make a P1 bug-fix PR unreviewable. **Proposal:** track it as a new roadmap item (Phase 6 Catalog) so the decision is explicit rather than implicit, and leave the fixtures untouched here.

### Explicitly NOT done (scope guardrails)

- No new dependency, no new component file, no CSS framework changes (the error card reuses the existing inline-style convention of `ProductList`).
- **The admin portal's own fixture fallback is out of scope** (`src/admin/services/adminApi.ts` falls back to the local catalog when `/api/admin/products` is unreachable — an internal surface, no cart to destroy). Flagged, not touched; it can become its own item if you want it.
- No change to `cartStorage.revalidateCartAgainstCatalog` itself (its behaviour is correct given a trustworthy catalog), no change to the checkout/payment paths, no removal of the fixtures.

---

## 4. Robust Unit Testing Plan (MANDATORY)

All boundaries mocked (`firebase/firestore`, `../../services/firebase`); no live Firebase calls.

**`[MODIFY] src/tests/services/api.test.ts`** — migrate to the new contract and add the source matrix (~+7):
- Existing filter/sort/stock tests updated to `result.products` (mechanical; they run on the deterministic empty-snapshot fallback).
- **Production + `getDocs` rejection** ⇒ `source: 'unavailable'`, `products: []`, and an assertion that **no `odon-` fixture leaked** into the payload.
- **Production + empty snapshot** ⇒ `unavailable`; **production + missing config** ⇒ `unavailable`.
- **Production + timeout** ⇒ `unavailable` (fake timers advanced past `CATALOG_FETCH_TIMEOUT_MS`; the rejected-race branch asserted without real waiting).
- **Dev/preview** (VERCEL_ENV unset) for rejection and empty snapshot ⇒ `source: 'fixtures'` with all 11 items; **`VITE_ALLOW_SIMULATED_PAYMENTS='true'` in production** ⇒ fixtures (escape hatch pinned).
- **Firestore success** ⇒ `source: 'firestore'`, `isActive: false` documents excluded.
- Env hygiene: `vi.unstubAllEnvs()` + `vi.restoreAllMocks()` per test (the console spies must not leak into later suites), and the dev-path cases stub `VITE_VERCEL_ENV` explicitly instead of relying on ambient values.

**`[MODIFY] src/tests/components/AppCartPersistence.test.tsx`** — mock updated to the new shape, plus (~+3):
- **The regression this task exists for:** production + `source: 'unavailable'` on mount with a saved cart ⇒ the cart is **unchanged** (same badge count, `localStorage` still holds the lines), **no** "Se actualizó el carro…" toast, and the retryable error card is rendered.
- Production + `source: 'fixtures'` (escape hatch) ⇒ cart still untouched (source gate, not just the env gate).
- **Retry recovers:** click `Reintentar` ⇒ the next mocked response returns `source: 'firestore'` ⇒ the grid renders and the cart is revalidated normally (proves the one-shot flag was not consumed by the failed load).

**`[MODIFY] src/tests/components/AppPaymentReturn.test.tsx`** — mock updated to the new shape only.

**`[MODIFY] src/tests/components/ProductList.test.tsx`** (+3) — `catalogError` renders the message + `Reintentar` and calls `onRetry`; without it the existing empty state still renders.

**`[NEW] src/tests/components/CategoryFilter.test.tsx`** (+3) — the pills count the catalog they are handed (never the prototype counts), report `0` for an empty catalog, and still surface non-canonical categories.

**`[NEW] src/tests/components/AppCatalog.test.tsx`** (+2) — the App-level wiring: pill counts survive a filter change (review F1) and an unexpected fetch throw renders the retryable card (review F5).

**Zero-regression target:** `pnpm test` — **697 tests / 76 suites** on `main` before this change → **measured 746 / 78** after rebasing onto the merged Task 0.14 work (+20 from this branch), all green, plus `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit` and markdownlint (0 warnings) clean.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- **`src/services/AGENTS.md`:** §1.1 `api.ts` row, §2.2 rewritten around the `CatalogResult` contract + the source matrix + the 10 s bound, and §6's simulated-fallback table gains the catalog row (dev-only, never authoritative for the cart).
- **`src/components/AGENTS.md`:** the catalog error/retry state, the two new `ProductList` props, and the `CategoryFilter` live-catalog contract (§3.D).
- **`src/data/AGENTS.md`:** §2.1 — the fixtures' role restated: dev/test fallback, **unreachable in production** since Task 2.11, plus a pointer to the new roadmap item about their future.
- **`src/tests/AGENTS.md`:** suite/test counts and the new cases.
- **`PRODUCTION_READINESS_TODO.md`:** **2.11** moves from §3 to the §2 resolved table and its row is dropped from the §1 glance table; **new item 6.4** (Phase 6 Catalog) records the "decide the fate of the `odon-*` prototype fixtures" question with the six-consumer audit; the baseline header refreshed with the measured counts.
- **Root `AGENTS.md`:** the three test-count references, if the suite count changes.

---

## 6. Verification Sequence (workflow steps 6 → 8)

1. `pnpm test` — full suite green, including the ~12 new cases.
2. **Negative verification** — restore the pre-fix `api.ts`/`App.tsx` behaviour temporarily and confirm the new cart-protection and production-error tests fail, then restore and `diff`-verify.
3. `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit` — clean.
4. Adversarial read-only code review (defensive guards, runtime separation, observability, test completeness), findings remediated and re-verified.
5. Stop for human wrap-up; commit only on explicit **"wrap up and proceed"**.

---

## 7. Adversarial Review Findings & Remediation (executed)

An independent read-only reviewer inspected `git diff HEAD`, re-ran every gate and reproduced the guards. Verdict: **approve with findings** — all remediated:

| # | Severity | Finding | Remediation |
| :-- | :--- | :--- | :--- |
| F1 | Minor (user-visible) | The pills counted `App`'s **filtered** `products`, so selecting a category zeroed every other pill — and no test pinned the App→pills wiring | `CatalogResult` gained `catalog` (the **unfiltered** source set); `App` keeps it in state and passes it as a now-**required** `catalog` prop; `src/tests/components/AppCatalog.test.tsx` pins it (fails when reverted) |
| F2 | Major | As-built docs still described the pre-change contract (2.5 s, unconditional fixture fallback) and stale counts | §5 executed: `src/services/AGENTS.md` §1.1/§2.2/§6, `src/components/AGENTS.md` (retry key, `ProductList` error state, pill contract), `src/data/AGENTS.md` §2.1, `src/tests/AGENTS.md`, root `AGENTS.md`, `PRODUCTION_READINESS_TODO.md` — counts measured at 746/78 |
| F3 | Minor | The "missing credentials" branch is unreachable in a browser (module-scope `getAuth()` throws at import) | Documented as a caveat in `api.ts` and the services guide; kept as defense-in-depth |
| F4 | Minor | `console.error` spies were never restored; dev-path tests leaned on ambient env | `afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers() })` + explicit `vi.stubEnv('VITE_VERCEL_ENV', …)` in the dev cases |
| F5 | Minor | An unexpected throw in the effect rendered the misleading empty state | The effect's `catch` now sets the same retryable `catalogError`; pinned by an App-level test |
| F6 | Minor | Plan bookkeeping mismatched the change set; the new suite was untracked | Plan §4/§7 reconciled; `src/tests/components/CategoryFilter.test.tsx` staged at commit time |
| F7 | Process | The session runs inside a pre-existing Windsurf worktree while `AGENTS.md:44` retires the worktree protocol | No action in code — flagged to the owner (the guardrail also references a `development-workflow` skill that does not exist in this repo) |
| P1/P3 | Pre-existing nits | The race timer was never cleared; a malformed document could reject the whole read | Both fixed in `api.ts` (`clearTimeout` in a `finally`, `?? ''` field guards) with a test for the malformed-document case |
