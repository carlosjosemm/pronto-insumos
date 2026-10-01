# Task 2.24: Neutral Storefront Claims, Ratings Off, Simplified Shipping Bar

**Branch:** `feat/task-2.24-neutral-storefront-claims` (stack layer 1 — bottom, cut from `main`)
**Status:** implemented under `--YOLO` (owner authorization 2026-10-01; no approval gate)

## 1. Context & Problem Statement

PRODUCTION_READINESS_TODO.md §3, Task 2.24 (P2 · owner decisions 2026-09-30): the storefront
makes certification/registry claims PRONTO cannot document ("Registro ISP Chile", "Insumos Médicos
Certificados", "Dispositivos Homologados Registro ISP", "Normativa ISP Homologada", "Pago 100 %
Seguro"), on a store whose category is regulated. That is misleading-advertising exposure under
Chilean consumer law (Ley 19.496), separate from the suspended legal-copy task 7.1. It also renders
a star-rating UI with no review system behind it, and a free-shipping progress bar that implies a
charge which does not exist (task 3.1 is suspended, so freight is zero at every amount).

The owner confirmed there is no substantiation available now, so every claim in the approved table
is reworded, ratings are disabled behind a flag, and the shipping bar becomes a single statement.

## 2. Human Action Items & Placeholders (TODO for Human)

- None. This is copy/config only: no credential, no external service, no deploy-order constraint.
- The owner may later supply certification documentation; a claim can then return by editing the
  copy (and, for reviews, by flipping `REVIEWS_ENABLED` once a review source exists).

## 3. Proposed Changes

- [NEW] `src/config/features.ts` — `REVIEWS_ENABLED = false`, the one-line re-enable switch for the
  rating/review UI (the same pattern as `FACTURA_ENABLED` in `CheckoutModal.tsx`).
- [MODIFY] `src/components/Footer.tsx` — apply the owner-approved neutral wording table: value-prop
  card ("Insumos odontológicos" / "Para clínicas, gabinetes y laboratorios"), logistics bullet
  ("Despacho sin costo en Melipilla y San Antonio"), invoicing bullet ("Boleta electrónica · IVA
  19%"), remove the two datasheet/registry bullets, trust badges ("Pago procesado por Mercado Pago
  Chile", "Insumos para clínicas y laboratorios dentales") and the bottom bar ("Depósito dental en
  Melipilla", "Boleta electrónica").
- [MODIFY] `src/components/Hero.tsx` — trust row item ("Para clínicas y laboratorios" / "Catálogo
  odontológico con atención directa por WhatsApp") and the image fallback label
  ("Equipamiento e Instrumental Clínico").
- [MODIFY] `src/components/ProductQuickView.tsx` — remove the "Normativa ISP Homologada" span and
  one divider from the guarantee note; gate the rating block behind `REVIEWS_ENABLED`.
- [MODIFY] `src/components/ProductCard.tsx` — gate the rating block behind `REVIEWS_ENABLED`.
- [MODIFY] `src/components/CategoryFilter.tsx` — omit the "Mejor Calificados" / "Más Reseñas" sort
  options when `REVIEWS_ENABLED` is false.
- [MODIFY] `src/App.tsx` — coerce a `sortBy` of `rating`/`reviews` to `featured` while reviews are
  disabled (the `sortBy` handling inside `fetchProducts` stays untouched so re-enabling is the flag
  plus a review source).
- [MODIFY] `src/components/Cart.tsx` — replace the progress bar, the percentage and the "Agrega $X
  más para Despacho GRATIS" line with the single statement "Despacho sin costo a Melipilla y San
  Antonio", keeping the zone/minimum note. `FREE_SHIPPING_THRESHOLD` stays exported in
  `src/config/delivery.ts` for 3.1 and `LegalModal`; the now-unused import is dropped from `Cart`.
- [MODIFY] `src/tests/components/ClinicalStorefront.test.tsx` — update the pinned hero/footer copy
  and add absence assertions for the retired strings.
- [MODIFY] `src/tests/components/ProductCard.test.tsx` — the rating-render assertion becomes a
  "no rating UI while disabled" assertion.
- [NEW] `src/tests/components/storefrontClaims.test.ts` — source-content guard: none of the retired
  claim strings may remain anywhere under `src/components/` (the pattern of the existing
  `Factura Electrónica Inmediata` guard and `contact.test.ts`'s directory scan).
- [MODIFY] `src/tests/components/Cart.test.tsx` — assert the single shipping statement at a below-
  and an above-threshold subtotal (the bar never renders a percentage or a threshold nudge).

## 4. Robust Unit Testing Plan (MANDATORY)

- **`storefrontClaims.test.ts`** (new, source-content): read every `.ts`/`.tsx` under
  `src/components/` and assert none of the retired strings appear (case-insensitive, including the
  `Factura Electrónica Inmediata` / `Registro ISP Chile` / `100 % Seguro` family). Also assert the
  scanned file count is non-trivial so the guard cannot silently pass on an empty glob.
- **`ClinicalStorefront.test.tsx`**: hero renders the new neutral strings and no retired claim;
  footer renders the new strings and no retired claim; `Registro ISP Chile` and
  `Dispositivos Homologados Registro ISP` are absent.
- **`ProductCard.test.tsx`**: with `REVIEWS_ENABLED = false`, a product with `reviewsCount > 0`
  renders **no** `.product-rating` and no numeric rating; zero-review products keep rendering none.
- **`ProductDetailModal.test.tsx`** (ProductQuickView): no rating row for a reviewed product while
  disabled; the guarantee note no longer contains "Normativa ISP Homologada".
- **`CategoryFilter.test.tsx`**: the sort `<select>` offers no `rating`/`reviews` option while
  disabled and still offers `featured` / `price-low` / `price-high`.
- **`Cart.test.tsx`**: the drawer renders "Despacho sin costo a Melipilla y San Antonio" and the
  `Compra mínima San Antonio: $60.000` note at every subtotal, with no `%` progress figure.
- Full suite stays green (zero-regression gate). No network, no timers needed.

## 5. As-Built Documentation & Roadmap Sync Plan

- As-built detail → `src/components/AGENTS.md` (the neutral-wording sweep, the disabled ratings and
  the simplified shipping statement) and `src/config/AGENTS.md` (new `features.ts` row).
- Roadmap: remove 2.24 from the P2 board and Open Tasks, add one Resolved History row. No owner
  follow-up (the acceptance is fully automated).
- Walkthrough narrative → `.devin/artifacts/task-2.24/walkthrough.md`.
