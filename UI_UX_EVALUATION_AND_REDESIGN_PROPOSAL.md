# UI/UX Evaluation & Redesign Proposal — PRONTO Insumos Storefront

## Second-Pass Design Audit: Why the Storefront Still Reads as Amateur

**Date:** September 21, 2026 — **revised** after an independent second audit; all incorporated claims were re-verified against code.
**Scope:** Customer-facing storefront only (Admin portal excluded — it ships its own `admin.css`).
**Language rule:** all workflow documents, plans, and agent communication in **English**; storefront UI copy stays **`es-CL`** for the Chilean market.
**Explicitly out of scope:** _Acquisition_ of product photography — the absence of product images is a known data-quality issue owned by the catalog/inventory track. What remains in scope here is the **UI contract** for media: placeholder design, art-direction rules, and loading behavior for when images land.
**Branch:** `feat/ui-ux-premium-redesign`
**Status:** Evaluation of record. Supersedes the previous overhaul proposal — that effort delivered layout scaffolding and section photography (kept), but its palette/typography decisions are the root cause of the "AI-generated, soul-less" look.
**Guardrails respected:** Vanilla CSS only. No Tailwind/Bootstrap/UI kits. No new runtime dependencies beyond Google Fonts. React 18 state untouched.
**Implementation contract:** This document is self-contained. Appendices B–E close every open decision — turnkey asset-generation prompts for a human producer (B), the final `es-CL` copy deck (C), verbatim code & data specs (D), and the AGENTS.md as-built sync checklist (E). The implementing agent must not make design, copy, or business-rule decisions; where this document conflicts with an `AGENTS.md` file, **this document wins during implementation**, and the AGENTS.md file is updated to the as-built state in the same commit (Appendix E).

---

## 🎯 1. Executive Summary — The Diagnosis

Two compounding problems make the storefront read as generated rather than designed:

1. **Hygiene failures** — three competing brand hues, ~13 hue families total, playful/mismatched typefaces, card-in-card monotony, dead CSS, and literal AI-patching residue.
2. **Credibility & surface gaps** (found in second audit) — no real brand mark or favicon, a broken social-share image, fabricated-looking social proof, a stock-count confidentiality violation, an unaudited mobile experience, and conversion-critical surfaces (cart, checkout, payment) that were never designed, only styled.

| #   | Problem                                                                                                                                                                                                                   | Severity    | Effort  |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------- | :------ |
| 1   | **Three competing brand hues** (navy `#102748`, chartreuse `#CAE400`/`#ECEFBE`, terracotta `#C84B31`) at equal weight + muddy olive `#3D4A00` text on lime pills                                                          | 🔴 Critical | Low     |
| 2   | **Off-palette color sprawl** — ~9 additional hardcoded hues (`#38bdf8`, `#34d399`, `#25d366`, `#f59e0b`, `#be123c`, `#b45309`, `#059669`, `#2563eb`, `#d97706`) + 4 pastel placeholder-theme families                     | 🔴 High     | Low-Med |
| 3   | **Approved-palette contrast flaw** — proposed `--accent #0E7490` on navy surfaces ≈ **2.8:1** (fails WCAG); needs a dual accent token before any implementation                                                           | 🔴 Critical | Low     |
| 4   | **Typography register mismatch** — `Baloo Da 2` (toy-like) headings + `Syne` (experimental display face) as body text                                                                                                     | 🔴 High     | Low     |
| 5   | **No brand identity surface** — generic Lucide logo, no favicon, `og-preview.png` referenced 3× but does not exist                                                                                                        | 🔴 High     | Medium  |
| 6   | **Card-in-card monotony** — identical chrome on every section; no full-bleed moment, no hierarchy                                                                                                                         | 🟠 High     | Medium  |
| 7   | **Credibility leaks** — stock count printed raw (violates own confidentiality rule), hardcoded placeholder phone in 5 files, fake-looking ratings/discounts in fallback data, footer shipping copy contradicts cart logic | 🟠 High     | Low     |
| 8   | **Message & badge inflation** — "Factura Electrónica 19% IVA" ×4; 12+ chip styles                                                                                                                                         | 🟠 Medium   | Low     |
| 9   | **Mobile never designed** — 1-col grid ≤768px, phone/tracking hidden, pills scroll without affordance, no `inputmode`                                                                                                     | 🟠 High     | Medium  |
| 10  | **Conversion surfaces un-audited** — payment step is text-only, no Boleta/Factura explainer, no shipping estimate                                                                                                         | 🟠 Medium   | Medium  |
| 11  | **"AI residue" tells** — dead `.hero-glow`, `-webkit-*: unset` leftovers, `--radius-full: 8px`, `spin` with no keyframes, `⏳` emoji loader, triple token aliases                                                         | 🟠 Medium   | Low     |
| 12  | **No motion/state system, no spacing scale** — quality lives in these details                                                                                                                                             | 🟡 Medium   | Medium  |

**Revised impact estimate:** palette + typography surgery closes roughly **half** the perceived quality gap. The other half is brand assets (logo/favicon/OG), placeholder/media design, mobile UX, credibility fixes, and micro-interaction polish.

---

## 🔍 2. What Was Audited

- `src/index.css` (2,761 lines — the entire design system)
- `index.html` (fonts, meta, OG/JSON-LD)
- `src/App.tsx` (composition order)
- All storefront components: `Navbar`, `Hero`, `PromoStrip`, `CategoryFilter`, `CategoryShowcase`, `ProductCard`, `ProductList`, `ProductQuickView`, `Cart`, `CheckoutModal`, `PaymentReturnModal`, `OrderTrackingModal`, `Footer`, `ErrorBoundary`
- `src/data/products.ts`, `scripts/import-catalog-csv.ts`, `src/services/whatsapp.ts` (data/placeholder pipeline)
- `public/` (asset inventory)
- Test constraints (`src/tests/` — 343 tests assert on text/roles, not colors)
- **Independent second audit** — every claim re-verified; validation table in Appendix A.

---

## 🎨 3. Finding — The Color System Failure (Root Cause)

### 3.1 The Three Conflicting Font Colors

| Color                      | Where it appears                                                                                | Hue   | Character           |
| :------------------------- | :---------------------------------------------------------------------------------------------- | :---- | :------------------ |
| **Intense Blue `#102748`** | Brand name, hero title, card titles, headings, prices                                           | ~216° | Serious, corporate  |
| **Cayenne `#C84B31`**      | Hero title `<span>`, italic taglines, tag chips, cart badge                                     | ~9°   | Rustic, informal    |
| **Olive `#3D4A00`**        | Text on every lime pill/CTA (`hero-pill-tag`, `guarantee-badge`, `btn-primary`, `btn-checkout`) | ~68°  | Institutional, drab |

Chartreuse `#CAE400` (~68°) sits dissonant between navy (216°) and cayenne (9°): neon against the former, acidic against the latter — and at maximum saturation against two muted darks it reads "safety signage," not "premium healthcare." The olive `#3D4A00` text paired with it harmonizes with neither parent. Three hues, three saturation registers, no shared relationship — the textbook "three brand decks collided" look.

### 3.2 Off-Palette Sprawl — ~9 More Hardcoded Hues

| Hardcoded color                     | Location                                                       |
| :---------------------------------- | :------------------------------------------------------------- |
| `#38bdf8` sky                       | `Navbar` ×3 utility icons, `Footer` link hover + tracking link |
| `#34d399` emerald                   | `Navbar` FileCheck icon                                        |
| `#25d366` WhatsApp green            | `.btn-whatsapp-inquiry`, Footer CTA                            |
| `#f59e0b` amber                     | Star ratings (`ProductCard`, `ProductQuickView`)               |
| `#b45309`/`#fef3c7`/`#fde68a` amber | `.product-regulated-chip`, tracking banners                    |
| `#be123c`/`#fecdd3` rose            | `.rx-badge`, `.detail-rx-alert`                                |
| `#059669` emerald-600               | Stock dots, tracking timeline                                  |
| `#2563eb`/`#eff6ff` blue-600        | `PaymentReturnModal` pending state                             |
| `#d97706` amber-600                 | `OrderTrackingModal` warning + button                          |

~60 inline `style={{ color: '#hex' }}` occurrences bypass the token system entirely.

### 3.3 Warm/Cool Surface Clash

Page bg `--brand-cream #FDF8F3` (warm) → card/input surfaces `--brand-frozen #F0F4F8` (cool) → highlights `--brand-almond #F5EDE4` (warm) → tech headers `#f8fafc` (cool) → borders `#E5DDD4` (warm tan). The eye registers alternating temperatures as "dirty."

### 3.4 Placeholder-Theme Sprawl (Inside the Product Grid)

`ProductCard` assigns `placeholderTheme` (`gradient-teal/blue/cyan/emerald/indigo/slate/red/amber`), resolving to **4 more pastel hue families** (`#E8EDF5`, `#F5F7E8`, `#F9F3EC`, `#EDF1F5` — `index.css:1271-1318`). Decorative variety with no meaning. Nuance: the production `pronto-*` catalog imports uniformly as `gradient-teal`, so the variety shows only in the fallback fixture — but the theme system itself should collapse to one neutral treatment.

### 3.5 Where Each Color Should Have Been Used

- **Navy `#102748`** — the strongest asset. Keep as anchor.
- **Cayenne `#C84B31`** — demote to _semantic_ commercial signal (discount/low-stock) at <3% coverage; fails as heading/tagline font color.
- **Lime/limonade/olive** — retire entirely.

---

## ✍️ 4. Finding — Typography Register Mismatch

| Token                       | Font               | Problem                                                                                                                                                  |
| :-------------------------- | :----------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--font-display`            | **Baloo Da 2**     | Rounded, inflated, playful — designed for friendly/children's contexts. On a B2B clinical supplier it reads toy-like; the single biggest "amateur" tell. |
| `--font-sans`/`--font-body` | **Syne**           | Experimental art-gallery display face; eccentric proportions make poor body copy at 0.8–0.95rem. Produces the constant "something is off" feeling.       |
| `--font-mono`               | **JetBrains Mono** | Fine for REF/SKU. Keep.                                                                                                                                  |

Also: no real display scale (hero only `2.6rem`), dominant sizes cluster at 0.65–0.875rem, uppercase micro-labels overused, decorative italics in functional bars.

**Second-audit amendment (valid):** the originally proposed `Space Grotesk + Inter` is itself the 2024–2026 default "AI landing page" pairing — swapping one generated-looking stack for another. The typeface decision is **re-opened** (see §10.2): a serif/humanist display face would signal "established firm" far better than another geometric grotesque.

---

## 📐 5. Finding — Layout & Visual Hierarchy

- **Card-in-card monotony:** identical chrome (`1px border` + `radius-md` + `shadow-xs`) on utility bar → navbar → hero → promo strip → pills → filter row → showcase hub → product cards. Everything boxed = nothing is a hero.
- **Four stacked horizontal bands** between hero and catalog (promo strip → pills → filter row → showcase hub).
- **Message repetition:** "Factura Electrónica 19% IVA" ×4; "Despacho Melipilla & RM" ×5; "ISP certificado" ×4 on one page.
- **Badge inflation:** 12+ distinct pill/chip variants with unique color pairs.
- **Micro-geometry:** `--radius-full: 8px` (a "full" radius equal to `md` — nothing is pill-shaped); indistinguishable 4/6/8/12 steps; border + shadow stacked on the same elements.

---

## 🧟 6. Finding — "AI Residue" Tells in Code

| Tell                                                                                       | Location                                                       |
| :----------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| `.hero-glow { display: none }` w/ comment _"Eliminated radioactive neon orb"_              | `index.css:425`                                                |
| `-webkit-background-clip: unset` / `-webkit-text-fill-color: unset` leftovers              | `.hero-title span`                                             |
| `animation: spin` with **no `@keyframes spin` defined** — loader never spins               | `ProductList.tsx:17`                                           |
| `⏳` emoji inside `brand-icon-wrapper` as the loading state                                | `ProductList.tsx:18`                                           |
| Triple-aliased tokens (`--navy-*`/`--teal-*`/`--slate-*`/`--emerald`/`--cyan`/`--primary`) | `:root`; `OrderTrackingModal` still consumes `var(--teal-600)` |
| Italic slogan inside results count                                                         | `CategoryFilter.tsx:115`                                       |

---

## 🧾 7. Finding — Credibility & Content Gaps (Second Audit)

### 7.1 Media Pipeline (UI contract only — acquisition is out of scope)

- All 11 prototype products have `images: []`; the CSV importer (`scripts/import-catalog-csv.ts:210`) also writes `images: []` for the real `pronto-*` catalog. **Every product card renders the icon-on-dot-grid placeholder.** The placeholder _is_ the current product visual — its design matters, and it must not look like an empty template state.
- **Art-direction contract needed now:** when images land, `object-fit: cover` on the fixed 180px box (`index.css:1373`) will arbitrarily crop them. Define: 4:3 media area, `object-fit: contain` on white with uniform padding (catalog-standard for supplies), image fade-in/skeleton while loading, and consistent angle/lighting guidance handed to whoever produces the photos.
- The repeated product name inside the placeholder duplicates the card title — a placeholder should show _category iconography_, not repeat the label.

### 7.2 Brand Identity Surface — Missing Entirely

- The "logo" is a generic Lucide `Activity` icon in a navy square + lime `ODONTOLOGÍA` sticker (`Navbar.tsx:69-77`) — the most literal template tell available.
- **No favicon** (nothing in `index.html`, nothing in `public/`).
- `og:image`, `twitter:image`, JSON-LD `image` all point to `https://pronto-insumos.vercel.app/og-preview.png` — **a file that does not exist.** WhatsApp shares (the store's own sales channel) render a broken preview.
- Naming drift: `PRONTO` + badge (nav), `PRONTO ODONTOLOGÍA` (footer), `PRONTO INSUMOS ODONTOLÓGICOS SPA` (legal), `PRONTO INSUMOS` (title). One canonical lockup needed.

### 7.3 Social Proof & Placeholder Data

- **Fabricated-looking ratings:** 10 of 11 prototype items show 4.7–5.0★ with 25–190 reviews — on `isActive: false` fixtures. The production `pronto-*` import sets `reviewsCount: 0` (stars correctly don't render), so this affects the dev/fallback experience — but it also means **the ratings UI exists with no real review system behind it.** **Decision (approved):** keep the star UI code — it stays dormant on real products — and clean the fabricated fixture values.
- **Permanent-discount pattern:** all 11 prototypes carry `originalPrice > price` (17–23% "off" everything). Production items import without `originalPrice`, so live cards show no strikethrough — but the fallback normalizes a discount-store look that should be used _selectively_, not universally.
- **Placeholder phone hardcoded:** `+56 9 1234 5678`/`56912345678` is hardcoded in `Navbar`, `Hero`, `Footer`, `ProductQuickView`, `ErrorBoundary` — even though `VITE_WHATSAPP_NUMBER` exists and is correctly consumed by `whatsapp.ts` and `PaymentReturnModal`. Partial centralization is worse than none: changing the env var silently leaves 5 stale copies.
- **Fictional manufacturers** beside real ones (NSK, W&H, Hu-Friedy, Septodont vs. DentFill, SterilMax, ImpressDent, SteriTex). Acceptable in fixtures; the real catalog must carry real brand names — B2B credibility is _recognizable brands_.
- **Copy/logic contradiction (new finding, missed by both audits):** `Footer.tsx:85` advertises _"Despacho Gratuito sobre $100.000"_ while `Cart.tsx:14` computes against `FREE_SHIPPING_THRESHOLD = 150000` and `components/AGENTS.md` documents $150.000. **Resolved:** `$150.000` wins — the cart constant moves to `src/config/delivery.ts` (Appendix D.1) as the single source of truth; the footer is corrected.

### 7.4 Stock-Count Confidentiality Violation ⚠️

`ProductCard.tsx:96` renders `Últimas {product.stockCount} unid.` — displaying the **exact raw stock count**, which `src/data/AGENTS.md` §3 defines as _"strictly confidential internal data … must never be displayed as raw numbers to public users."_ The design fix is also the compliance fix: show `Últimas unidades` — never an integer (final string, Appendix C.9).

---

## 📱 8. Finding — UX Surfaces Never Audited (Second Audit)

### 8.1 Mobile (where Chilean dentists actually browse — between patients)

- Product grid collapses to **1 column ≤768px** — one giant card per screen; e-commerce standard is 2-col.
- `.top-utility-bar` is **hidden ≤768px** — taking the phone number and order-tracking link with it; the two actions a mobile buyer most wants.
- Category pills scroll with a mask fade but no scroll affordance.
- No `inputmode`/`type` hints anywhere — RUT (numeric), phone, email, ZIP all open the wrong mobile keyboards.
- No sticky add-to-cart / cart CTA on product or quick-view.

### 8.2 Checkout, Cart & Payment (conversion-critical, never designed)

- Step-2 payment selection is **text-only option cards** — no Webpay/Redcompra/Mercado Pago marks at the moment of maximum payment anxiety.
- The **Boleta vs Factura** legal distinction is never explained in customer language — a uniquely Chilean confusion point that deserves a one-line explainer at the toggle.
- **Delivery cost transparency:** free-shipping threshold lives in the cart bar and a (wrong) footer bullet; no shipping estimate in checkout.
- Voucher upload, tracking timeline, and stock-error recovery exist but were styled ad hoc with inline hexes (§3.2).

### 8.3 Product Card IA for B2B Buyers

Procurement priority order is **REF → unit of sale → price → stock → regulatory**. Current card: category+manufacturer → title → stars → description → price. There is no `unitOfSale` field — units appear only inside some names (`(Caja 100 un)`, `(50 carpules)`, `(500g)`, `(10 pzas)` — 4 of 11). A dedicated `unitOfSale`/`presentation` field (schema + CSV + card) is a small data-model addition with large procurement value.

### 8.4 Micro-Interactions & Motion — No System

Add-to-cart gives **no "added ✓" button state** (only navbar badge pulse + toast); drawer/modal entrances are one-off animations; no image fade-in; no hover-state consistency pass. Define a small motion spec: 150–250ms, `cubic-bezier(0.4,0,0.2,1)`, what animates (cart add, drawer, modal, image load, hover lift) — and nothing else.

### 8.5 Accessibility — Partial, Not Audited

- ✅ `:focus-visible` rings, `role="dialog" aria-modal`, `role="tab"` — genuinely good.
- ❌ **No focus trap** in any of the 4 modals — Tab escapes into the page behind the overlay.
- ❌ `aria-live` exists only on the toast container — cart quantity changes announce nothing.
- ❌ `prefers-reduced-motion` covers only a subset of animations.
- ⚠️ Lime-as-focus-indicator (1.4:1) already documented in `AGENTS.md` — resolved automatically by the palette fix.

### 8.6 Owner-Directed Functional Additions (Sep 21)

Five functional changes with UI/copy implications, added to this overhaul's scope by the owner:

1. **Delivery zone = Melipilla + San Antonio only; remove all pickup/retiro wording.**
   - _Copy sweep:_ `Navbar.tsx:33` utility bar (`Despacho prioritario en Melipilla y rutas RM | Retiro en Av. Ortúzar` → `Despacho a clínicas en Melipilla y San Antonio`), `Hero.tsx:32` description (`Melipilla, Talagante, Peñaflor y la Región Metropolitana` → `Melipilla y San Antonio`), `Hero.tsx:71-72` trust item (drop the "Retiro" claim), `ProductQuickView.tsx:309` (`despacho y retiro` → `despacho`), `Cart.tsx:100-101` free-shipping text, `Footer.tsx` (lines 31, 82, 85, 152 and RM mentions), `PaymentReturnModal.tsx:103`, `index.html` meta descriptions + JSON-LD `areaServed` (Melipilla/Talagante/Peñaflor/RM → Melipilla, San Antonio).
   - _Distinction:_ keep "Bodega: Av. Ortúzar 750, Melipilla" as corporate/warehouse info — it identifies the physical depot. Remove only _pickup-as-fulfillment-option_ wording ("Retiro Presencial", "retiro express", "y retiro").
   - _`RM` references_ describing delivery coverage → `San Antonio` (San Antonio is technically Valparaíso region — copy should say "Melipilla y San Antonio", not "RM").
   - _Supersedes_ pending roadmap task 3.1's zone list (Local Pickup / RM routes) — that task is now defined as: Melipilla + San Antonio, no pickup.
   - _Guardrails sync required:_ root `AGENTS.md` still mandates the old model — §1 geography ("Melipilla + Región Metropolitana"), §3.3 Factura support, §3.4 "Local Pickup in Melipilla (Av. Ortúzar)". Update AGENTS.md during implementation so future agents don't re-add removed functionality.

2. **Modal scroll-lock (bug).** When `ProductQuickView` (or any overlay) opens, the main page keeps scrolling behind it. Fix: lock `document.body.style.overflow = 'hidden'` on mount, restore on unmount — applied uniformly to `ProductQuickView`, `CheckoutModal`, `OrderTrackingModal`, `PaymentReturnModal`, and the `Cart` drawer. Turnkey hook in Appendix D.3 (`src/hooks/useScrollLock.ts` — a **new** directory; `src/utils/AGENTS.md` requires utils to stay pure, so hooks cannot live there).

3. **Cart-aware product cards.** A card currently shows a dumb "Agregar" button even when the product is already in the cart. Standard e-commerce behavior: once qty > 0, the card swaps the button for a quantity stepper `[−] n [+]` (reusing `.quantity-controls` styles, clamped to `stockCount`). Full prop-threading and render spec in Appendix D.6. `AppCartPersistence`/`ProductCard` tests updated.

4. **Minimum order for delivery outside Melipilla: $60.000** (display `$60.000` — `formatCLP` already emits no "CLP" suffix).
   - Checkout Step 1 gets a delivery-zone control: `Comuna de despacho` select with `Melipilla` / `San Antonio` (replaces the free-text `Ciudad / Comuna` input — two zones only).
   - Rule: `zone === 'San Antonio' && subtotal < 60000` → block progression with `La compra mínima para despacho a San Antonio es de $60.000`.
   - Constant in shared config (`src/config/delivery.ts`: `DELIVERY_ZONES`, `MIN_ORDER_OUTSIDE_MELIPILLA = 60000`) so the `Cart` drawer can surface the same rule proactively.

5. **Factura disabled — Boleta only (future feature).**
   - `CheckoutModal` Step 1: remove the `🏢 Factura Electrónica` option card; `documentType` stays `'boleta'`; skip `validateFacturaFields`; hide the RUT-empresa/razón-social/giro block. Gate behind a flag (`const FACTURA_ENABLED = false`) so the path re-enables cleanly later — order schema keeps `documentType` + optional factura fields.
   - _Copy consequence:_ storefront can no longer advertise "Factura Electrónica Inmediata (19% IVA)" — sweep `Navbar:54`, `Footer:104,148`, `PaymentReturnModal`, promo copy → `Boleta Electrónica · IVA 19%`. "Total Facturado" labels → `Total a Pagar`. If clinics still need factura, they route through the WhatsApp cotización path (note: `¿Necesitas Factura Electrónica para tu clínica? Cotízala por WhatsApp.` — final string in Appendix C.5).

#### Resolved Rule Details (owner, Sep 21 — closes all open business-rule questions)

- **Free-shipping threshold:** `$150.000` is the single winning number. `FREE_SHIPPING_THRESHOLD` moves from `Cart.tsx:14` into `src/config/delivery.ts` (Appendix D.1) and is imported everywhere; `Footer.tsx:85` is corrected to `$150.000`. Free shipping applies to **both** zones at subtotal ≥ `$150.000` — existing cart progress-bar logic is unchanged.
- **Minimum order:** `MIN_ORDER_OUTSIDE_MELIPILLA = 60000` is the **only** minimum-sale amount in the system. It gates delivery eligibility for `San Antonio` only; `Melipilla` has **no** minimum order. Enforced at checkout progression (Step 1 → 2) and surfaced proactively in the `Cart` drawer (final strings: Appendix C.4/C.5).
- **Turnkey code:** `src/config/delivery.ts`, `src/config/contact.ts`, `src/hooks/useScrollLock.ts`, `src/hooks/useFocusTrap.ts` are specified verbatim in Appendix D — implement exactly as written.
- **Copy:** every user-facing string is final in Appendix C — implement verbatim; do not draft new copy.
- **Assets:** all images are produced by a human from the turnkey prompts in Appendix B and dropped at the specified paths; the agent never generates or invents imagery.

---

## ✅ 9. What Works — Do Not Touch

- **The 6 delivered photos** (`hero`, 4 category banners, promo bg) — genuinely good assets. (Correction to first pass: this approval covered _section_ imagery; it does not extend to product media, which has none — see §7.1. Note: `promo-strip-bg` becomes orphaned once PromoStrip is deleted — **decided: drop it**; delete `public/assets/promo-strip-bg.jpg` with the component in Phase 4.)
- **Composition order** hero → categories → showcase → grid → footer — sound narrative.
- **Category showcase hub + contextual banner**, **segmented pills with counts** — good patterns; keep mechanics.
- **Focus/keyboard scaffolding** — preserve.
- **CLP/SII/RUT domain logic** — untouched.
- **Vanilla CSS architecture** — refine, don't replace.

---

## 🧭 10. Redesign Direction — "Quiet Clinical Confidence"

The restraint of a premium dental-equipment catalog crossed with a modern Chilean B2B storefront: one ink, one accent (with a dark-surface variant), unified neutrals, real typography, generous whitespace, near-zero decorative chrome.

### 10.1 Palette — Approved Option A, **with dual accent tokens (mandatory fix)**

Navy stays the anchor; a single analogous cyan accent replaces lime; cayenne is demoted to semantic commercial signal.

```css
:root {
  /* Anchor (keep) */
  --ink-900: #0b1a33; /* footer, utility bar, darkest surfaces */
  --ink-800: #102748; /* brand blue — headings, primary buttons */
  --ink-700: #1a3a6a; /* hover */
  --ink-600: #2a4a7f; /* borders on dark */

  /* THE single brand accent — TWO surface variants (contrast fix) */
  --accent: #0e7490; /* light surfaces: links, active states, icons — 5.3:1 on white */
  --accent-strong: #0c6379; /* accent hover on light */
  --accent-soft: #e6f4f7; /* accent tint fills (pills, info boxes) */
  --accent-border: #b7dee6;
  --accent-on-dark: #67e8f9; /* navy surfaces ONLY: icons, links, hovers — ~8:1 on --ink-800 */

  /* Warm semantic — commercial urgency ONLY (discount, low-stock, cart count) */
  --signal: #c24a32;
  --signal-soft: #fbefea;
  --signal-border: #efc9be;

  /* Unified cool-neutral surfaces (kill warm/cool clash) */
  --surface-bg: #f5f7f9;
  --surface-card: #ffffff;
  --surface-muted: #eef2f5;
  --border-subtle: #e4e9ee;
  --border-strong: #c9d2db;

  /* One neutral text ramp */
  --text-primary: #0f1e33;
  --text-secondary: #44536a;
  --text-muted: #6b7a8f;
  --text-inverse: #ffffff;

  /* Spacing scale — 4px base (new) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  /* Geometry — fixed */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-full: 999px;
}
```

**Rules:** `--accent` never appears on `--ink-*` surfaces (that's what `--accent-on-dark` is for — fixes the 2.8:1 failure _and_ preserves the current passing footer hover). `--signal` never colors headings or taglines. Status colors (`--success/--warning/--danger`) quarantined to functional states.

**Retired:** `--brand-limonade`, `--brand-accent-green`, `--brand-accent-green-text`, and every §3.2 hardcode.

### 10.2 Typography — Approved: T1 Fraunces + Inter

| Option                   | Display                              | Body                | Status                                                                                       |
| :----------------------- | :----------------------------------- | :------------------ | :------------------------------------------------------------------------------------------- |
| **T1 — Editorial serif** | **Fraunces** (600–700, optical size) | **Inter** (400–600) | ✅ **Approved** — "established firm" gravitas; serif wordmark over navy reads human-designed |
| T2 — Humanist grotesque  | Manrope (700)                        | Inter               | Declined — safer but less distinctive                                                        |
| T3                       | Space Grotesk                        | Inter               | Rejected — the default AI-startup stack; keeps the generated look                            |

Keep `JetBrains Mono` for REF/SKU. New scale: `--fs-display: clamp(2.5rem, 4vw, 3.5rem)`, `--fs-h2: 1.5rem`, `--fs-h3: 1.125rem`, `--fs-body: 1rem`, `--fs-small: .875rem`, `--fs-micro: .75rem` (uppercase micro-labels capped at ≤3 per section; **no italics anywhere**).

### 10.3 Brand Identity (new phase — P0)

1. **Wordmark lockup — implemented in code, not an image** (crispness + accessibility). Exact spec:
   - `PRONTO` — Fraunces 600, `1.375rem` (navbar) / `1.25rem` (footer); `var(--ink-800)` on light surfaces, `var(--text-inverse)` on navy.
   - Descriptor `INSUMOS ODONTOLÓGICOS` — Inter 600, `0.5625rem`, uppercase, `letter-spacing: 0.14em`; `var(--text-muted)` on light, `var(--accent-on-dark)` on navy.
   - Bespoke detail: one hand-drawn SVG underline beneath the wordmark — `path d="M2 4 Q 25 7 50 4 T 98 4"`, `stroke: var(--signal)`, `stroke-width: 3`, `fill: none`, `stroke-linecap: round`, spanning ~70% of wordmark width. The same motif is the favicon mark (B.2).
   - Replaces the Lucide `Activity` icon + `ODONTOLOGÍA` sticker (`Navbar.tsx:69-77`, `Footer.tsx:60-65`). No icon mark of any kind.
2. **Favicon** — `public/favicon.svg`, produced per Appendix B.2 (human-generated preferred; the turnkey fallback SVG in B.2 is already final, so the phase is never blocked).
3. **`og-preview.png`** — human-generated per Appendix B.1, dropped at `public/og-preview.png` (the three existing meta references at `index.html:22,30,43` already point there; the file must exist before `vercel --prod`).
4. **Canonical naming rule** — storefront uses `PRONTO` + `INSUMOS ODONTOLÓGICOS` descriptor; `<title>`/meta use `PRONTO Insumos Odontológicos`; the legal line keeps `PRONTO INSUMOS ODONTOLÓGICOS SPA`. The `ODONTOLOGÍA` sticker and `PRONTO ODONTOLOGÍA` lockup are retired (full mapping in Appendix C.1/C.8).

### 10.4 Layout Restructuring

| Section                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| :----------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hero**                 | **Full-bleed navy band** (approved): edge-to-edge `--ink-800`, white headline in display face, single accent CTA (white or `--accent-on-dark` treatment), photo right with soft mask. Trust items = quiet inline icon row using `--accent-on-dark` icons — no pill chrome. Absorbs PromoStrip's unique messages (approved: fold & delete).                                                                                              |
| **PromoStrip**           | **Delete** — fold unique messages into hero trust row; update `PromoStrip.test.tsx` accordingly.                                                                                                                                                                                                                                                                                                                                        |
| **Category pills**       | Keep mechanics; icons → `--text-muted`; active = navy text + `--accent` underline.                                                                                                                                                                                                                                                                                                                                                      |
| **Filter row**           | Remove `results-slogan-tagline`.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Category showcase**    | Unbox hub (heading + open grid, no border card); drop `category-card-tag-pill` overlay.                                                                                                                                                                                                                                                                                                                                                 |
| **Product cards**        | Media: single neutral placeholder (collapse the 8 gradient themes), category icon only (drop the repeated name). Badge diet: max 1 on media (priority discount > Rx > mediaBadge). REF as muted mono line in body, `unitOfSale` under it (Appendix D.5). **Remove raw `stockCount`** → `Últimas unidades` (no integer — the §7.4 compliance fix); normalize `Sin Stock` → `Sin stock`. Featured strip → `var(--signal)` (Appendix D.7). |
| **Footer**               | Icons → `--accent-on-dark`/muted-on-dark; link hover → `--accent-on-dark` (preserves ~8:1); correct `$100.000` → `$150.000` (Appendix D.1/C.8).                                                                                                                                                                                                                                                                                         |
| **Modals/drawer/toasts** | Re-token all §3.2 inline hexes; WhatsApp button → navy (drop `#25d366`); toast edge → `--accent`. Add **focus trap** to all 4 modals + the Cart drawer (D.4).                                                                                                                                                                                                                                                                           |

### 10.5 The "Soul" Layer — Concrete Tactics (replaces aspirational §8.5)

1. ~~**A named human:** "Habla con [Nombre]…" + photo + direct WhatsApp~~ — **declined by owner (Sep 21)**; do not build this slot.
2. **Local specificity (decided placements):** `delivery-routes.png` figure under the checkout zone select (Appendix B.3/D.9b); `bodega-ortuzar.jpg` figure in Footer column 1 under the address block (Appendix B.4/D.9b). Each renders **only if its asset was delivered** — omit the `<figure>` entirely otherwise; never a placeholder. Concrete fact used in copy: `Pedidos antes de las 16:00 se despachan el mismo día` (Appendix C.3).
3. **Real hero copy (final):** `El depósito dental que despacha el mismo día` replaces "Abastecimiento Odontológico de Precisión" (the most generated-sounding line on the page) — full strings in Appendix C.3.
4. **Bespoke detail (decided — exactly one):** a hand-drawn SVG underline in `var(--signal)` under the hero keyword span `el mismo día` — `path d="M2 6 Q 50 0 100 5"` in a `viewBox="0 0 100 8"` SVG, `stroke-width: 3`, `stroke-linecap: round`, `fill: none`, `preserveAspectRatio="none"`, positioned `absolute` under the span. The same motif sits under the wordmark (§10.3). No other texture/decoration is added.
5. **Asymmetry & whitespace:** hero grid 1.4fr/0.8fr; section spacing via `--space-*` scale (48–64px between majors, not uniform 2rem).

### 10.6 Mobile Pass

- Product grid **2 columns ≤768px** (cards keep full chrome).
- **Mobile utility access (decided):** new `.nav-mobile-utility` row inside `<header className="navbar">`, visible ≤768px only — `Mesa Clínica` link + `Seguimiento` button (markup + CSS: Appendix D.9).
- **Pill scroll affordance (decided):** thin visible scrollbar on `.category-pills`, CSS-only, no JS (Appendix D.9).
- **Input hints (decided):** `type="tel"` + `inputmode="tel"` on phone; `type="email"` on email; `inputmode="numeric"` on zip; RUT and SIS-registry inputs keep `inputmode="text"` — a numeric keypad cannot produce the `K` check digit, so do **not** "fix" them to numeric.
- Sticky `Agregar` bar on `ProductQuickView` footer ≤768px.

### 10.7 Motion & State Spec

150–250ms `cubic-bezier(0.4,0,0.2,1)`; animates: add-to-cart (button → "Agregado ✓" → revert), drawer/modal entrance, image fade-in, card hover lift, badge pulse. Replace the `⏳` loader with product-card skeletons (shimmer spec: Appendix D.8); the undefined `animation: spin` reference at `ProductList.tsx:17` is **deleted** with the loader block.

---

## 🗺️ 11. Implementation Phases

| Phase                            | Content                                                                                                                                                                                                                                                                                                                                  | Files                                                                                                                                                                    | Priority                           |
| :------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------- |
| **1 — Token & font surgery**     | New `:root` (incl. `--accent-on-dark`, spacing scale, radius fix), font swap, type scale; retire lime/olive                                                                                                                                                                                                                              | `index.css`, `index.html`                                                                                                                                                | **P0**                             |
| **2 — Credibility fixes**        | `stockCount` → `Últimas unidades`; unify WhatsApp number/display/links behind `src/config/contact.ts` (D.2); correct `$100.000` → `$150.000`; collapse placeholder themes; fixtures: set `rating: 0` + `reviewsCount: 0` on all 11 `odon-*` items and keep `originalPrice` **only on `odon-401`** (one demo discount; star UI code kept) | `ProductCard`, `Navbar`, `Hero`, `Footer`, `ProductQuickView`, `ErrorBoundary`, `products.ts`, `src/config/contact.ts`                                                   | **P0**                             |
| **3 — Brand surface**            | Wordmark lockup (§10.3 code spec), `favicon.svg` (B.2 — human asset or turnkey fallback SVG), `og-preview.png` (B.1 — human-supplied, required before `--prod`), canonical naming (C.1/C.8)                                                                                                                                              | `Navbar`, `Footer`, `index.html`, `public/`                                                                                                                              | **P0**                             |
| **4 — Hero & chrome cleanup**    | Full-bleed navy hero, delete PromoStrip, badge diet, slogan removal, unbox showcase                                                                                                                                                                                                                                                      | `Hero`, `PromoStrip`, `CategoryFilter`, `CategoryShowcase`, `index.css`, `App.tsx`                                                                                       | **P1**                             |
| **5 — Functional UX additions**  | `useScrollLock` on all 5 overlays (D.3), cart-aware card stepper (D.6), delivery-zone select + `$60.000` San Antonio min order (D.1, C.5), factura disabled flag (C.5), pickup-wording removal + zone copy sweep (Appendix C)                                                                                                            | `CheckoutModal`, `Cart`, `ProductCard`, `ProductList`, `App.tsx`, `src/config/delivery.ts`, `src/hooks/`, `Navbar`, `Hero`, `Footer`, `PaymentReturnModal`, `index.html` | **P1**                             |
| **6 — Inline-style migration**   | ~60 hexes → tokens                                                                                                                                                                                                                                                                                                                       | `Footer`, `Navbar`, `OrderTrackingModal`, `PaymentReturnModal`, `CheckoutModal`, `ProductQuickView`, `ErrorBoundary`                                                     | **P1**                             |
| **7 — Mobile pass**              | 2-col grid, reachable phone/tracking, pill affordance, `inputmode`                                                                                                                                                                                                                                                                       | `index.css`, `Navbar`, `CheckoutModal`, `ProductQuickView`                                                                                                               | **P1**                             |
| **8 — Motion & a11y**            | Motion spec, `Agregado ✓` state (C.9), skeletons (D.8), focus traps (D.4), `aria-live` cart                                                                                                                                                                                                                                              | `index.css`, `Cart`, `ProductCard`, modal components                                                                                                                     | **P2**                             |
| **9 — Media contract & card IA** | `object-fit: contain` 4:3 white media area, image fade-in, placeholder redesign; **`unitOfSale` field** — full spec Appendix D.5; REF-first card hierarchy                                                                                                                                                                               | `index.css`, `ProductCard`, `ProductQuickView`, `src/types`, `schemaValidation`, `import-catalog-csv.ts`, `products.ts`                                                  | **P2** (ready before photos exist) |
| **10 — Alias deprecation**       | Migrate `var(--teal-*)`/`var(--navy-*)` consumers → canonical                                                                                                                                                                                                                                                                            | `App.tsx`, `OrderTrackingModal`, `index.css`                                                                                                                             | **P2**                             |
| **11 — Docs sync (as-built)**    | Update every `AGENTS.md` section listed in Appendix E to describe the built state — same commit as the phase that lands each change                                                                                                                                                                                                      | root `AGENTS.md`, `src/{components,data,types,utils,services,tests}/AGENTS.md`                                                                                           | **P0 (per-phase)**                 |

**Verification:** `pnpm test` + `pnpm build` (tests assert text/roles — safe; `PromoStrip.test.tsx`, `CheckoutModal` factura/zone tests, `ProductCard` stepper tests, and copy-dependent suites like `ClinicalStorefront` get updated). Contrast targets: `--accent` on white ≥4.5:1; `--accent-on-dark` on `--ink-800` ≥4.5:1; body text ≥4.5:1; `prefers-reduced-motion` respected. Before `vercel --prod`: `public/og-preview.png` exists (B.1) and the Appendix E checklist is complete.

---

## 📋 12. Decisions

| #   | Decision                                                                                                                                         | Status                               |
| :-- | :----------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------- |
| 1   | **Palette:** Option A — navy + clinical cyan, **plus mandatory `--accent-on-dark` variant** (fixes the 2.8:1 flaw the first pass missed)         | ✅ Approved + amended                |
| 2   | **Hero:** full-bleed navy band, white headline, photo right                                                                                      | ✅ Approved                          |
| 3   | **PromoStrip:** fold unique messages into hero, delete component                                                                                 | ✅ Approved                          |
| 4   | **Typeface:** T1 — Fraunces display + Inter body (over the originally proposed Space Grotesk)                                                    | ✅ Approved                          |
| 5   | **Ratings policy:** keep the star UI code (production items have `reviewsCount:0` → nothing renders); clean fabricated fixture values            | ✅ Approved                          |
| 6   | **Named human contact** in hero/footer                                                                                                           | ❌ Declined — do not build this slot |
| 7   | **`unitOfSale` data field** for card IA (schema + types + card UI + CSV import)                                                                  | ✅ Approved                          |
| 8   | **Product photography acquisition**                                                                                                              | 🚫 Out of scope — data-quality track |
| 9   | **Delivery zones:** Melipilla + San Antonio only; all pickup/retiro wording removed (supersedes roadmap 3.1's zone list)                         | ✅ Approved (owner)                  |
| 10  | **Modal scroll-lock:** body scroll frozen behind every overlay (QuickView, Checkout, Tracking, PaymentReturn, Cart drawer)                       | ✅ Approved (owner)                  |
| 11  | **Cart-aware cards:** quantity stepper replaces "Agregar" once product is in cart                                                                | ✅ Approved (owner)                  |
| 12  | **Min order outside Melipilla:** $60.000 for San Antonio despacho, shown via `formatCLP` (no "CLP")                                              | ✅ Approved (owner)                  |
| 13  | **Factura disabled:** Boleta only; factura path flag-gated for future; "Factura" marketing copy → Boleta                                         | ✅ Approved (owner)                  |
| 14  | **Free-shipping threshold:** `$150.000` wins; footer corrected; both zones qualify                                                               | ✅ Resolved                          |
| 15  | **Minimum order scope:** `$60.000` applies only to `San Antonio` delivery eligibility; `Melipilla` has no minimum — the only minimum-sale amount | ✅ Resolved (owner)                  |
| 16  | **Featured strip:** re-token to `var(--signal)` (commercial highlight), not removed                                                              | ✅ Resolved                          |
| 17  | **Pill scroll affordance:** thin visible scrollbar, CSS-only                                                                                     | ✅ Resolved                          |
| 18  | **Mobile utility access:** condensed `.nav-mobile-utility` row inside navbar ≤768px                                                              | ✅ Resolved                          |
| 19  | **`spin` animation:** reference deleted — skeletons replace the loader                                                                           | ✅ Resolved                          |
| 20  | **Hero copy & all UI strings:** final `es-CL` deck in Appendix C — implement verbatim                                                            | ✅ Resolved                          |
| 21  | **Bespoke detail:** exactly one — `var(--signal)` hand-drawn underline (hero keyword + wordmark)                                                 | ✅ Resolved                          |
| 22  | **AGENTS.md role:** as-built documentation only; synced per Appendix E in the same commit as each change                                         | ✅ Resolved (owner)                  |
| 23  | **Fixture cleanup:** all 11 `odon-*` items get `rating: 0`/`reviewsCount: 0`; `originalPrice` survives only on `odon-401`                        | ✅ Resolved                          |

---

## 📎 Appendix A — Second-Audit Claim Validation

Every claim from the independent audit re-verified against code on Sep 21, 2026:

| Audit claim                                                                     | Verdict                                                                                                                                    | Evidence / nuance                                                       |
| :------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| Zero product photos across catalog                                              | ✅ Confirmed (corrected: 11 products, not 12) — and production `pronto-*` items also `images: []`                                          | `products.ts` all entries; `import-catalog-csv.ts:210`                  |
| Placeholder gradients = +4 hue families                                         | ✅ Confirmed — nuance: variety only in fallback; production is uniform `gradient-teal`                                                     | `index.css:1271-1318`                                                   |
| `object-fit: cover` will crop real photos                                       | ✅ Confirmed                                                                                                                               | `index.css:1373`                                                        |
| No favicon; `og-preview.png` missing                                            | ✅ Confirmed                                                                                                                               | `public/` = 6 files only; `index.html` references nonexistent asset     |
| Generic Lucide logo; naming drift                                               | ✅ Confirmed                                                                                                                               | `Navbar.tsx:69-77`; `Footer.tsx`; `index.html`                          |
| Fabricated ratings / permanent discounts                                        | ✅ Confirmed with nuance — affects `isActive:false` fallback seeds; production imports `reviewsCount:0`, no `originalPrice`                | `products.ts`; `import-catalog-csv.ts:196-197`                          |
| Placeholder phone in 4 places                                                   | ✅ Confirmed — worse: env var exists but 5 files bypass it                                                                                 | `Navbar/Hero/Footer/ProductQuickView/ErrorBoundary` vs `whatsapp.ts:15` |
| Fictional manufacturers                                                         | ✅ Confirmed                                                                                                                               | `products.ts` manufacturers list                                        |
| Cyan `#0E7490` on navy ≈ 2.8:1; footer hover regresses                          | ✅ Confirmed — recomputed ≈2.79:1; `#38bdf8` on navy-950 ≈8:1                                                                              | contrast math; `index.css:2516`                                         |
| Space Grotesk + Inter = AI-default stack                                        | ⚖️ Subjective but fair — decision re-opened                                                                                                | §10.2                                                                   |
| "Soul" section aspirational                                                     | ✅ Valid — replaced with concrete tactics                                                                                                  | §10.5                                                                   |
| Mobile never audited                                                            | ✅ Confirmed — 1-col grid, hidden utility bar, no `inputmode`, no affordance                                                               | `index.css:2635-2746`                                                   |
| Checkout/payment surfaces un-audited                                            | ✅ Confirmed — text-only payment cards, no marks, no explainer                                                                             | `CheckoutModal.tsx:714-788`                                             |
| `Últimas N unid.` leaks raw stock                                               | ✅ Confirmed — violates `src/data/AGENTS.md` confidentiality rule                                                                          | `ProductCard.tsx:96`                                                    |
| No B2B card IA / unit of sale                                                   | ✅ Confirmed — no `unitOfSale` field; units embedded in 4 of 11 names                                                                      | `types`, `products.ts`                                                  |
| No motion system                                                                | ✅ Confirmed                                                                                                                               | `App.tsx` badge pulse only; no added-state                              |
| A11y asserted not audited                                                       | ✅ Confirmed — `role="dialog"` yes, focus trap no; lime-as-focus already documented                                                        | all 4 modals                                                            |
| Lime text-on-white ~1.4:1                                                       | ⚠️ Misstated — lime is a _fill_ (dark text on it passes); the 1.4:1 figure is as a focus indicator per `AGENTS.md`. Point stands in spirit | `index.css:91`                                                          |
| No spacing scale; §10 decisions truncated                                       | ✅ Confirmed                                                                                                                               | fixed in §10.1/§12                                                      |
| **(Missed by both)** Footer `$100.000` vs cart `FREE_SHIPPING_THRESHOLD=150000` | ✅ New finding added                                                                                                                       | `Footer.tsx:85` vs `Cart.tsx:14`                                        |

---

## 📎 Appendix B — Asset Generation Brief (Human-Produced Assets)

The implementing agent does **not** generate images. A human produces the assets below using these turnkey prompts (tool-agnostic — Midjourney / DALL·E / Firefly / Figma), drops the files at the specified paths, and hands them to the agent. Each prompt embeds the approved palette and lockup so no design judgment is required. The **If missing** column defines the only permitted fallback — an agent must never invent a placeholder or a substitute image.

### B.0 Deliverable Manifest

| #   | Deliverable     | Path                                | Spec                                                     | Consumed by                                                 | If missing at implementation time                                          |
| :-- | :-------------- | :---------------------------------- | :------------------------------------------------------- | :---------------------------------------------------------- | :------------------------------------------------------------------------- |
| B.1 | OG share image  | `public/og-preview.jpg`             | 1200×630 **JPEG**, ≤300 KB — delivered (see B.1 amendment) | `index.html` (`og:image`, `twitter:image`, JSON-LD `image`) | Ship the meta tags anyway; **block `vercel --prod` until the file exists** |
| B.2 | Favicon         | `public/favicon.svg`                | SVG, 64×64 viewBox                                       | `index.html` `<link rel="icon">`                            | Implement the turnkey fallback SVG in B.2 verbatim — it is already final   |
| B.3 | Routes graphic  | `public/assets/delivery-routes.png` | 1200×675 PNG, ≤250 KB                                    | Checkout Step 1, figure under the zone select (D.9b)        | Omit the `<figure>` entirely                                               |
| B.4 | Warehouse photo | `public/assets/bodega-ortuzar.jpg`  | 1600×1067 JPG, ≤400 KB — **real photo, never generated** | Footer column 1, under the address block (D.9b)             | Omit the `<figure>` entirely                                               |

### B.1 `og-preview.jpg` — generation prompt

> Static social-share banner for "PRONTO Insumos Odontológicos", a Chilean dental-supplies
> distributor. 1200×630 px, flat editorial B2B catalog style — premium, restrained, clinical.
> BACKGROUND: solid deep navy #102748 with a very subtle darker vignette at the edges.
> LEFT 65%: the word "PRONTO" in a large elegant bracketed-serif typeface (Fraunces-style),
> off-white #FFFFFF; directly beneath it one short hand-drawn underline stroke in cyan #67E8F9;
> below that "INSUMOS ODONTOLÓGICOS" in small uppercase letter-spaced clean sans-serif,
> muted blue-grey #C9D2DB; below that, smaller, "Depósito dental · Melipilla y San Antonio"
> in the same muted sans-serif.
> RIGHT 35%: photorealistic sterile dental hand instruments (turbine handpiece, mouth mirror,
> periodontal explorer) neatly arranged on a clean stainless tray, cool soft lighting,
> shallow depth of field, clinical and trustworthy.
> No people, no smiles, no teeth clipart, no neon, no glow, no gradients other than the edge
> vignette, no watermark, no words or letters other than the three specified text lines.

**Composition fallback** (if the tool mangles text): generate the same layout with **no text**, then a human overlays it in Figma/Canva — `PRONTO` Fraunces SemiBold ≈110 px `#FFFFFF`; hand-drawn stroke 6 px `#67E8F9`; `INSUMOS ODONTOLÓGICOS` Inter Medium 28 px, letter-spacing 8%, `#C9D2DB`; tagline Inter Regular 30 px `#C9D2DB`; 72 px outer padding; export 1200×630 JPEG ≤300 KB.

> **As-built amendment — container format (B.1):** the shipped asset is **`public/og-preview.jpg` (1200×630 JPEG, ~128 KB)**, not PNG. PNG is lossless, so a photorealistic banner of this size lands at ~1 MB — measured on the existing hero photo, the same 1200×630 crop is **219 KB as JPEG vs 1.0 MB as PNG**. Composition, dimensions and the palette above are exactly as specified; only the container format changed. `index.html`'s three references (`og:image`, `twitter:image`, JSON-LD `image`) use the `.jpg` filename.

### B.2 `favicon.svg` — generation prompt + turnkey fallback

> Flat vector app icon: a bold bracketed-serif capital letter "P" (editorial serif,
> Fraunces-style) in off-white, centered on a deep navy #102748 rounded-square tile with
> ~16% corner radius; beneath the "P", one short hand-drawn underline stroke in cyan
> #67E8F9. Minimal, geometric, no gradients, no shadows, no other elements.

If the tool cannot emit usable SVG, the agent writes `public/favicon.svg` with this exact content:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="10" fill="#102748"/>
  <text x="32" y="41" font-family="Fraunces, Georgia, serif" font-size="34" font-weight="600" fill="#ffffff" text-anchor="middle">P</text>
  <path d="M18 50 Q 32 54 46 50" stroke="#67E8F9" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>
```

`index.html` gets `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`.

### B.3 `delivery-routes.png` — generation prompt

> Minimal flat cartographic illustration, 16:9. Stylized map of Chile's central coast:
> calm off-white background #F5F7F9; landmass in deep navy #102748 at ~10% opacity; the
> Pacific coastline running down the left edge. Exactly two map pins — "Melipilla" inland
> (deep navy #102748 pin) and "San Antonio" on the coast (cyan #0E7490 pin) — connected by
> a dashed route line in cyan #0E7490. Small uppercase sans-serif city labels in #44536A.
> Flat vector style, generous whitespace, no terrain realism, no icons other than the two
> pins, no other text, no watermark.

### B.4 `bodega-ortuzar.jpg` — owner photo brief (NOT generated)

A real photograph taken by the owner at the Av. Ortúzar 750 warehouse: the packing counter
or stocked shelving with PRONTO product boxes visible, natural daylight, landscape 3:2,
tidy clinical feel. An AI-faked photo of a real location is a credibility leak — worse than
no photo. If not delivered, the figure is omitted.

---

## 📎 Appendix C — Final Copy Deck (`es-CL`)

All customer-facing strings, final. Implement verbatim — do not draft, translate, or "improve" copy. `{...}` marks a dynamic value. Canonical naming: wordmark `PRONTO` + descriptor `INSUMOS ODONTOLÓGICOS`; `<title>`/meta `PRONTO Insumos Odontológicos`; legal line `PRONTO INSUMOS ODONTOLÓGICOS SPA`.

### C.1 `index.html`

| Element                                                        | Final value                                                                                                                                                                              |
| :------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<title>`                                                      | `PRONTO Insumos Odontológicos — Depósito Dental en Melipilla`                                                                                                                            |
| meta `description` (+ `og:description`, `twitter:description`) | `Distribuidor de insumos odontológicos para clínicas y profesionales. Despacho a Melipilla y San Antonio · Boleta Electrónica · IVA 19%.`                                                |
| JSON-LD `name`                                                 | `PRONTO Insumos Odontológicos`                                                                                                                                                           |
| JSON-LD `areaServed`                                           | `["Melipilla", "San Antonio"]`                                                                                                                                                           |
| JSON-LD `description`                                          | same as meta description                                                                                                                                                                 |
| Google Fonts `href`                                            | `https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap` |
| Favicon                                                        | `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`                                                                                                                           |

### C.2 `Navbar.tsx`

| Location                      | Final string                                                                                  |
| :---------------------------- | :-------------------------------------------------------------------------------------------- |
| Utility bar left (line 33)    | `Despacho a clínicas en Melipilla y San Antonio`                                              |
| Utility bar right             | `Seguimiento de Pedido` · `Boleta Electrónica · IVA 19%` · `Mesa Clínica: {WHATSAPP_DISPLAY}` |
| Brand lockup (lines 69–77)    | `PRONTO` + `INSUMOS ODONTOLÓGICOS` per §10.3 — replaces icon + `ODONTOLOGÍA` badge            |
| Desktop trust badge (line 95) | `Melipilla · San Antonio`                                                                     |
| Mobile utility row (new, D.9) | `Mesa Clínica` · `Seguimiento`                                                                |
| Search placeholders           | unchanged                                                                                     |

### C.3 `Hero.tsx`

| Element                      | Final string                                                                                                                                                                                                                            |
| :--------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pill tag (line 24)           | `Depósito Dental · Melipilla`                                                                                                                                                                                                           |
| H1 (line 28)                 | `El depósito dental que despacha <span>el mismo día</span>` (span gets the §10.5.4 underline)                                                                                                                                           |
| Description (line 32)        | `Turbina, resinas restauradoras, instrumental de diagnóstico y bioseguridad para clínicas y gabinetes. Pedidos confirmados antes de las 16:00 salen de nuestra bodega en Melipilla ese mismo día — despacho a Melipilla y San Antonio.` |
| Primary CTA                  | `Explorar Catálogo de Insumos` (unchanged)                                                                                                                                                                                              |
| Secondary CTA                | `Cotización Directa para Clínicas` (unchanged text; href → `whatsappLink('Hola, solicito cotización de insumos para clínica dental')`)                                                                                                  |
| Trust item 1 (FileCheck)     | `Boleta Electrónica · IVA 19%` / `Emitida automáticamente con cada compra`                                                                                                                                                              |
| Trust item 2 (Truck)         | `Despacho el mismo día` / `Pedidos antes de las 16:00 · Melipilla y San Antonio`                                                                                                                                                        |
| Trust item 3 (ShieldCheck)   | `Insumos Certificados ISP` / `Trazabilidad de lote conforme a normativa sanitaria`                                                                                                                                                      |
| Trust item 4 (MessageSquare) | `Mesa Técnica WhatsApp` / `Factura para clínicas y cotizaciones directas`                                                                                                                                                               |
| Image caption pill           | `Calidad Quirúrgica · Estándar Clínico ISP` (unchanged)                                                                                                                                                                                 |

Trust items absorb PromoStrip's unique messages — its Factura claim becomes item 1's Boleta line plus item 4's routing note.

### C.4 `Cart.tsx`

| Location                                          | Final string                                                                |
| :------------------------------------------------ | :-------------------------------------------------------------------------- |
| Free-shipping progress (line 100)                 | `Agrega {formatCLP(remainingForFreeShipping)} más para Despacho GRATIS`     |
| Free-shipping reached (line 101)                  | `✓ Despacho sin costo — superaste los {formatCLP(FREE_SHIPPING_THRESHOLD)}` |
| Zone note (new muted line under the progress bar) | `Despacho a Melipilla y San Antonio · Compra mínima San Antonio: $60.000`   |

### C.5 `CheckoutModal.tsx`

| Element                                                                     | Final string                                                                                                                                                       |
| :-------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zone select (replaces `Ciudad / Comuna Fiscal` input, line 561)             | label `Comuna de Despacho *`; options `Melipilla` (default) / `San Antonio`; selection writes `formData.city`                                                      |
| San Antonio hint (muted, under select, visible when `San Antonio` selected) | `Compra mínima para despacho a San Antonio: $60.000`                                                                                                               |
| Min-order block error                                                       | `La compra mínima para despacho a San Antonio es de $60.000`                                                                                                       |
| Document type card                                                          | `📄 Boleta Electrónica` (single card; factura card removed behind `FACTURA_ENABLED = false`)                                                                       |
| Factura note (under document type)                                          | `¿Necesitas Factura Electrónica para tu clínica? Cotízala por WhatsApp.` → `whatsappLink('Hola, necesito cotización con Factura Electrónica para clínica dental')` |
| `Total Facturado` labels                                                    | `Total a Pagar`                                                                                                                                                    |

### C.6 `ProductQuickView.tsx`

| Location                  | Final string                                                                            |
| :------------------------ | :-------------------------------------------------------------------------------------- |
| Stock line (line 309)     | `Disponible para despacho en Melipilla y San Antonio` / `Sin stock inmediato en bodega` |
| Guarantee note (line 386) | `Boleta Electrónica · IVA 19%`                                                          |

### C.7 `PaymentReturnModal.tsx`

| Location                    | Final string                                                                                                                     |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| Fulfillment line (line 103) | `Despacho desde Bodega Melipilla (Av. Ortúzar)`                                                                                  |
| Comprobante box (line 118)  | `📄 Comprobante: Tu Boleta Electrónica (IVA 19%) será emitida por nuestro equipo y remitida a tu correo electrónico registrado.` |

### C.8 `Footer.tsx`

| Location                        | Final string                                                                                                                                                                                                                   |
| :------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Value card 2 sub (line 31)      | `Despacho local directo a clínicas`                                                                                                                                                                                            |
| Value card 3 (lines 40–41)      | `Despacho San Antonio` / `Ruta programada a clínicas de la zona`                                                                                                                                                               |
| Lockup (lines 60–65)            | `PRONTO` + `INSUMOS ODONTOLÓGICOS` (same lockup as nav, `--text-inverse` variant)                                                                                                                                              |
| Col-1 description (line 67)     | `Distribuidor especializado en insumos y equipamiento odontológico para gabinetes, clínicas dentales y laboratorios en Melipilla y San Antonio.`                                                                               |
| `Distribución local` (line 72)  | `Melipilla y San Antonio`                                                                                                                                                                                                      |
| Logistics list (lines 81–85)    | `• Despacho Express Clínicas Melipilla` / `• Despacho Programado San Antonio` / `• Compra mínima San Antonio: $60.000` / `• Despacho Gratuito sobre $150.000` / `• Seguimiento de Pedido en Línea` (button, unchanged)         |
| Compliance list (lines 104–108) | `• Boleta Electrónica Inmediata (19% IVA)` / `• Factura para Clínicas — Cotización por WhatsApp` / `• Dispositivos Homologados Registro ISP` / `• Fichas de Seguridad de Materiales` / `• Términos y Condiciones de Venta B2B` |
| Trust badges (lines 144–156)    | `Mercado Pago Chile · Pago 100% Seguro` / `Boleta Electrónica SII · 19% IVA` / `Despacho Melipilla y San Antonio` / `Dispositivos Médicos · Registro ISP Chile`                                                                |
| Bottom bar (line 165)           | `Boleta Electrónica SII`                                                                                                                                                                                                       |

### C.9b `OrderTrackingModal.tsx`

| Location                           | Final string                                                                                                                                                   |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Total Facturado` label (line 420) | `Total a Pagar`                                                                                                                                                |
| `Documento:` line (line 413)       | **unchanged** — it renders the order's stored `documentType`; legacy factura orders must keep displaying `Factura ({razonSocial})`. Do not "fix" it to boleta. |

### C.9 `ProductCard.tsx` / `ProductList.tsx` states

| Element                                  | Final string                                                                   |
| :--------------------------------------- | :----------------------------------------------------------------------------- |
| Low stock (replaces `Últimas {n} unid.`) | `Últimas unidades`                                                             |
| Out of stock                             | `Sin stock` (was `Sin Stock`)                                                  |
| Add button                               | `Agregar` / disabled `Agotado`                                                 |
| Transient added state                    | `Agregado ✓` (900 ms, then the stepper renders — D.6)                          |
| Stepper aria-labels                      | `Disminuir cantidad de {product.name}` / `Aumentar cantidad de {product.name}` |
| Loading state                            | skeleton cards (D.8); accessible label `Cargando catálogo`                     |
| Empty state                              | unchanged                                                                      |

---

## 📎 Appendix D — Turnkey Code & Data Specs

Implement verbatim. `src/hooks/` is a **new directory** — `src/utils/AGENTS.md` requires utils to be pure (no React hooks, no DOM side effects), so hooks cannot live there.

### D.1 `src/config/delivery.ts` (new file)

```ts
/**
 * Delivery zones & commercial thresholds — single source of truth.
 * Consumed by Cart, CheckoutModal, and any surface showing shipping rules.
 */
export const DELIVERY_ZONES = ["Melipilla", "San Antonio"] as const;
export type DeliveryZone = (typeof DELIVERY_ZONES)[number];
export const DEFAULT_DELIVERY_ZONE: DeliveryZone = "Melipilla";

/** Free shipping — BOTH zones — once the product subtotal reaches this amount (CLP). */
export const FREE_SHIPPING_THRESHOLD = 150000;

/** The ONLY minimum-sale amount in the system: delivery eligibility outside Melipilla. */
export const MIN_ORDER_OUTSIDE_MELIPILLA = 60000;
export const MIN_ORDER_ZONE: DeliveryZone = "San Antonio";

export function isBelowMinimumOrder(
  zone: DeliveryZone,
  subtotal: number,
): boolean {
  return zone === MIN_ORDER_ZONE && subtotal < MIN_ORDER_OUTSIDE_MELIPILLA;
}
```

`Cart.tsx:14`'s local `FREE_SHIPPING_THRESHOLD` is deleted and imported from here.

### D.2 `src/config/contact.ts` (new file)

```ts
/**
 * Centralized commercial contact data — no component may hardcode phone
 * numbers or wa.me URLs again (§7.3).
 */
export const WHATSAPP_NUMBER: string =
  import.meta.env.VITE_WHATSAPP_NUMBER || "56912345678";

/** "+56 9 XXXX XXXX" — derived from the digits-only env var. */
export const WHATSAPP_DISPLAY = `+${WHATSAPP_NUMBER.slice(0, 2)} ${WHATSAPP_NUMBER.slice(2, 3)} ${WHATSAPP_NUMBER.slice(3, 7)} ${WHATSAPP_NUMBER.slice(7)}`;

export function whatsappLink(text?: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
```

Consumers to migrate: `Navbar.tsx:57`, `Hero.tsx:42`, `Footer.tsx:121,129`, `ProductQuickView` WhatsApp CTA, `ErrorBoundary.tsx:99`, and `whatsapp.ts:15` (import `WHATSAPP_NUMBER`, drop its own env read).

### D.3 `src/hooks/useScrollLock.ts` (new file)

```ts
import { useEffect } from "react";

/** Locks body scroll while `locked` is true; restores on unmount/unlock. */
export function useScrollLock(locked: boolean = true) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}
```

Applied to `ProductQuickView`, `CheckoutModal`, `OrderTrackingModal`, `PaymentReturnModal`, and the `Cart` drawer — all five render only while open, so mount-scoped locking is correct.

### D.4 `src/hooks/useFocusTrap.ts` (new file)

```ts
import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab/Shift+Tab inside the referenced element while `active`.
 * Moves initial focus to the first focusable element and restores
 * focus to the previously focused element on release.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    const root = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));

    focusables()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    };

    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [active]);

  return ref;
}
```

Attach to the element carrying `role="dialog"` in each of the 4 modals, plus the `Cart` drawer (5 surfaces total).

### D.5 `unitOfSale` — full field spec

**Type** — `src/types/index.ts`, `Product`, insert after `mediaBadge`:

```ts
  unitOfSale?: string // Human-readable sales unit, e.g. 'Caja 100 un' — optional; absent on legacy docs
```

**Validator** — `src/utils/schemaValidation.ts`, inside `validateProductSchema`, after the `specs` check:

```ts
if (
  doc.unitOfSale !== undefined &&
  (typeof doc.unitOfSale !== "string" ||
    doc.unitOfSale.trim() === "" ||
    doc.unitOfSale.length > 60)
) {
  errors.push(
    'Campo "unitOfSale" debe ser un string no vacío de hasta 60 caracteres si está presente',
  );
}
```

Optional → all existing `pronto-*` and `odon-*` documents remain valid; **no migration needed**.

**CSV import** — `scripts/import-catalog-csv.ts`: optional column `unit_of_sale`; add `unitOfSale: item.unitOfSale?.trim() || undefined` to `productDoc`. When the column is absent, the field is omitted.

**Card UI** — `ProductCard.tsx`: render `{product.unitOfSale && <span className="product-unit-sale">{product.unitOfSale}</span>}` directly below `.product-title`. Style: `font-size: var(--fs-small)`, `font-weight: 600`, `color: var(--text-secondary)`. Same line in `ProductQuickView` under the title. Value renders raw — no `Venta:` prefix.

**Fixture values** — add to all 11 `odon-*` entries in `products.ts`:

| id       | `unitOfSale`           |
| :------- | :--------------------- |
| odon-101 | `1 unidad`             |
| odon-102 | `1 unidad`             |
| odon-103 | `1 unidad`             |
| odon-104 | `Kit 8 jeringas × 4 g` |
| odon-201 | `1 unidad`             |
| odon-202 | `Bolsa 500 g`          |
| odon-301 | `1 unidad`             |
| odon-302 | `Set 10 piezas`        |
| odon-401 | `Caja 100 un`          |
| odon-402 | `1 unidad`             |
| odon-501 | `Caja 50 carpules`     |

**Tests:** `schemaValidation.test.ts` +2 cases (accepts a valid `unitOfSale`; rejects non-string / >60 chars / empty); `ProductCard.test.tsx` asserts `Caja 100 un` renders; `products.test.ts` fixtures updated. Admin portal create/edit is **not** touched — the field is optional; an editable admin field is a later task.

### D.6 Cart-aware stepper — prop threading & render spec

```text
ProductCardProps additions:
  cartQuantity?: number                                       // default 0
  onUpdateQuantity?: (productId: string, qty: number) => void // matches App's handleUpdateQuantity(productId, newQty)

.product-card-footer render rules:
  !isAvailable         → disabled `Agotado` button (unchanged)
  cartQuantity === 0   → `Agregar` button → onAddToCart(product)
  cartQuantity > 0     → `.quantity-controls` stepper [−] {cartQuantity} [+]
    `+` → onUpdateQuantity(product.id, cartQuantity + 1); disabled when cartQuantity >= stockCount
    `−` → onUpdateQuantity(product.id, cartQuantity - 1); reaching 0 reverts to `Agregar`
    e.stopPropagation() on both buttons (card click opens QuickView)
    Reuses `.quantity-controls` / `.qty-btn` classes from Cart/QuickView.

`Agregado ✓`: transient 900 ms label on the button right after the first add,
before the stepper renders (uses the motion spec's 150–250 ms transition).

Threading — App derives:
  const cartQuantityById = useMemo(
    () => Object.fromEntries(cart.map(i => [i.product.id, i.quantity])),
    [cart]
  )
and passes `cartQuantity={cartQuantityById[product.id] ?? 0}` through
ProductList → ProductCard, plus `onUpdateQuantity` = the same quantity-change
handler App already passes to `Cart`.
ProductQuickView receives the same two props; its local `quantity` seeds from
`cartQuantity` (min 1).
```

### D.7 Featured strip

`.product-card--featured` (`index.css:1215`): change `border-top: 3px solid var(--accent-warm)` → `border-top: 3px solid var(--signal)`. Nothing else changes.

### D.8 Skeleton loader (replaces `⏳`/`spin` block in `ProductList.tsx:16-21`)

```css
.skeleton-card {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.skeleton-block {
  background: linear-gradient(
    90deg,
    var(--surface-muted) 25%,
    var(--surface-card) 50%,
    var(--surface-muted) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.2s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-block {
    animation: none;
  }
}
```

Render 8 `.skeleton-card` (one 180px media block + three text bars) inside `.products-grid` with `aria-busy="true"` and a visually-hidden `Cargando catálogo` label.

### D.9 Mobile utilities

`.nav-mobile-utility` — inside `<header className="navbar">`, after `.nav-search-mobile`:

```tsx
<div className="nav-mobile-utility">
  <a
    href={whatsappLink()}
    className="nav-mobile-utility-link"
    target="_blank"
    rel="noopener noreferrer"
  >
    <Phone size={14} />
    <span>Mesa Clínica</span>
  </a>
  {onOpenTracking && (
    <button
      type="button"
      onClick={onOpenTracking}
      className="nav-mobile-utility-link"
    >
      <Truck size={14} />
      <span>Seguimiento</span>
    </button>
  )}
</div>
```

```css
.nav-mobile-utility {
  display: none;
}
@media (max-width: 768px) {
  .nav-mobile-utility {
    display: flex;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid var(--border-subtle);
  }
  .nav-mobile-utility-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-secondary);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: none;
  }
  .nav-mobile-utility-link svg {
    color: var(--accent);
  }
}
```

Pill scrollbar (`.category-pills`, `CategoryFilter.tsx:90`):

```css
.category-pills {
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}
.category-pills::-webkit-scrollbar {
  height: 4px;
}
.category-pills::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: var(--radius-full);
}
```

### D.9b Optional asset figures (B.3/B.4 — render only when the file was delivered)

- `delivery-routes.png` → `<figure className="checkout-zone-figure">` directly under the `Comuna de Despacho` select in Checkout Step 1; `alt="Zona de despacho: Melipilla y San Antonio"`.
- `bodega-ortuzar.jpg` → `<figure className="footer-bodega-figure">` at the bottom of Footer column 1; `alt="Bodega PRONTO — Av. Ortúzar 750, Melipilla"`; `<figcaption>Bodega y despacho: Av. Ortúzar 750, Melipilla</figcaption>`.

Both use the `Hero`-style `imgError` pattern (`onError` → hide the figure). If the asset was never delivered, the figure is omitted from the JSX — never a placeholder.

---

## 📎 Appendix E — AGENTS.md As-Built Sync Checklist

`AGENTS.md` files are **as-built documentation**, not implementation orientation. During implementation, where an AGENTS.md file conflicts with this proposal, **the proposal wins**. The phase that lands a change updates the relevant sections **in the same commit** — the docs must always describe what is built, never what is planned.

| File                       | Sections to update                                                                                     | As-built change to document                                                                                                                                                                                                                                                                                                                                                                                     |
| :------------------------- | :----------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` (root)         | §1 geography; §3.3 tax invoicing; §3.4 delivery logistics                                              | Geography: Melipilla + San Antonio (no RM routes, no pickup). Invoicing: storefront issues **Boleta only**; Factura path flag-gated (`FACTURA_ENABLED`) and routed via WhatsApp quotation. Logistics: urban delivery Melipilla + scheduled San Antonio route; San Antonio min order `$60.000`; free shipping ≥`$150.000` both zones.                                                                            |
| `src/components/AGENTS.md` | §2 palette & typography; §2.1 composition; §3 checkout field table & flow; footer/cart copy references | New token set (`--ink-*`, `--accent`, `--accent-on-dark`, `--signal`, `--surface-*`, `--space-*`, radius scale); Fraunces + Inter + JetBrains Mono; PromoStrip deleted from composition; Step 1 has `Comuna de Despacho` select (2 zones) + min-order gate; boleta-only document card; `useScrollLock` + `useFocusTrap` on all overlays; cart-aware stepper on `ProductCard`; `Últimas unidades` stock strings. |
| `src/data/AGENTS.md`       | §3.2 confidentiality; catalog field inventory                                                          | Low-stock renders `Últimas unidades` (integer never displayed — rule now enforced); `unitOfSale` optional field; fixtures carry `rating: 0`/`reviewsCount: 0`.                                                                                                                                                                                                                                                  |
| `src/types/AGENTS.md`      | §2.5 `Product` contract                                                                                | Add `unitOfSale?: string` line.                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/utils/AGENTS.md`      | §2.4 `validateProductSchema`; §1 purity note                                                           | `unitOfSale` optional-string rule (≤60 chars); note that React hooks live in `src/hooks/` (utils stay pure).                                                                                                                                                                                                                                                                                                    |
| `src/services/AGENTS.md`   | `whatsapp.ts` row; §4.1 env rules                                                                      | Phone/display/links centralized in `src/config/contact.ts`; `whatsapp.ts` imports `WHATSAPP_NUMBER` from there.                                                                                                                                                                                                                                                                                                 |
| `src/tests/AGENTS.md`      | suite inventory (if enumerated)                                                                        | Reflect updated suites: `PromoStrip.test.tsx` removed, `CheckoutModal` zone/boleta tests, `ProductCard` stepper tests, copy-dependent suite updates.                                                                                                                                                                                                                                                            |

**Rule for future agents:** never document a pending task in AGENTS.md — pending work lives in `PRODUCTION_READINESS_TODO.md` or the proposal of record.
