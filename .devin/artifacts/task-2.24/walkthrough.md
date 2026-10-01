# Task 2.24 — Walkthrough

**Branch:** `feat/task-2.24-neutral-storefront-claims` (stack layer 1 of 3, cut from `main`)
**Status:** wrapped up under `--YOLO` (owner authorization 2026-10-01)

## Outcome

The storefront no longer makes certification/registry claims it cannot document, the rating/review
UI is disabled behind a flag, and the cart's free-shipping progress bar became a single factual
statement (freight is free at every amount, so a threshold nudge implied a charge that does not
exist).

- Neutral wording applied across `Footer`, `Hero` and `ProductQuickView` (the owner-approved table
  in the roadmap entry, applied verbatim).
- `REVIEWS_ENABLED = false` in the new `src/config/features.ts`; `ProductCard` and
  `ProductQuickView` render no stars/review count, `CategoryFilter` offers no rating/review sort
  options, and `App` coerces a `sortBy` of `rating`/`reviews` to `featured`. The `rating` /
  `reviewsCount` fields and the `fetchProducts` sort branches stay in place.
- `Cart` renders `Despacho sin costo a Melipilla y San Antonio` + the zone/minimum note; the
  progress bar, the percentage and the "Agrega $X más" line are gone. `FREE_SHIPPING_THRESHOLD`
  stays exported in `src/config/delivery.ts` for the suspended per-zone-rates task and `LegalModal`.
- `Footer`'s trust-bar `aria-label` renamed from "Certificaciones y sellos de confianza" to
  "Formas de pago, boleta y despacho" (the badges no longer make certification claims).

## Tests

- New `src/tests/components/storefrontClaims.test.ts` — case-insensitive `readFileSync` scan of the
  `src/components/` tree plus `src/App.tsx`; fails if any retired claim string is reintroduced.
  `LegalModal.tsx` carries one documented exception (draft legal copy under the suspended
  legal-copy task — see below).
- Updated `ClinicalStorefront`, `ProductCard`, `ProductDetailModal`, `CategoryFilter`, `Cart`.

## Verification (all five gates)

- `pnpm test` — 107 suites / 1349 tests, all passing.
- `pnpm exec tsc --noEmit`, `pnpm run typecheck:server`, `pnpm build` — clean.
- `pnpm lint` — clean; `pnpm format:check` — clean.

## Review findings and disposition

Adversarial review verdict: approve with findings. All required findings remediated.

| Finding | Severity | Disposition |
| :-- | :-- | :-- |
| F1 — as-built docs/roadmap sync missing | major | Remediated: `src/components/AGENTS.md`, `src/config/AGENTS.md`, `src/tests/AGENTS.md` updated; task closed in the roadmap. |
| F2 — guard's blanket `LegalModal.tsx` exclusion suppressed a listed string | minor | Remediated: the guard now scans every component file and allows exactly one documented `{ file, claim }` residual pair instead of skipping the whole file. |
| F3 — guard was case-sensitive and scoped narrower than the plan | minor | Remediated: matching is case-insensitive; the scope (component tree + `src/App.tsx`, admin/tests excluded) is documented in the test. |
| F4 — new `describe` title carried a task number | minor | Remediated: retitled. |
| F5 — `App` coercion comment claimed a persistence that does not exist | nit | Remediated: comment corrected (the branch is defensive for a legacy/future persisted value). |
| F6 — Footer trust-bar `aria-label` still said "Certificaciones" | nit | Remediated: renamed. |

## Owner awareness (out of the approved table, not changed)

The review flagged marketing copy of the same class that the owner's table does not list, so it was
left untouched: `Hero.tsx` "Calidad Quirúrgica · Estándar Clínico ISP" and "Emitida automáticamente
con cada compra" (the latter contradicts the suspended Boleta-issuance state), and the `Certificado
ISP` / `Normativa ISP` tags in `src/data/products.ts` (the `odon-*` fixtures are inactive). The
owner may want a follow-up sweep if documentation still does not exist.

## Owner follow-ups

None — the acceptance is fully automated (source-content guard + component tests).
