# UI/UX Evaluation & Redesign Proposal — PRONTO Insumos Storefront

## Second-Pass Design Audit: Why the Storefront Still Reads as Amateur

**Date:** September 21, 2026 — **revised** after an independent second audit; all incorporated claims were re-verified against code.
**Scope:** Customer-facing storefront only (Admin portal excluded — it ships its own `admin.css`).
**Language rule:** all workflow documents, plans, and agent communication in **English**; storefront UI copy stays **`es-CL`** for the Chilean market.
**Explicitly out of scope:** _Acquisition_ of product photography — the absence of product images is a known data-quality issue owned by the catalog/inventory track. What remains in scope here is the **UI contract** for media: placeholder design, art-direction rules, and loading behavior for when images land.
**Branch:** `feat/ui-ux-premium-redesign`
**Status:** Evaluation of record. Supersedes the previous overhaul proposal — that effort delivered layout scaffolding and section photography (kept), but its palette/typography decisions are the root cause of the "AI-generated, soul-less" look.
**Guardrails respected:** Vanilla CSS only. No Tailwind/Bootstrap/UI kits. No new runtime dependencies beyond Google Fonts. React 18 state untouched.

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
- **Copy/logic contradiction (new finding, missed by both audits):** `Footer.tsx:85` advertises _"Despacho Gratuito sobre $100.000"_ while `Cart.tsx:14` computes against `FREE_SHIPPING_THRESHOLD = 150000` and `components/AGENTS.md` documents $150.000. One number must win.

### 7.4 Stock-Count Confidentiality Violation ⚠️

`ProductCard.tsx:96` renders `Últimas {product.stockCount} unid.` — displaying the **exact raw stock count**, which `src/data/AGENTS.md` §3 defines as _"strictly confidential internal data … must never be displayed as raw numbers to public users."_ The design fix is also the compliance fix: show `Bajo stock` / `Últimas unidades` with no integer.

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

2. **Modal scroll-lock (bug).** When `ProductQuickView` (or any overlay) opens, the main page keeps scrolling behind it. Fix: lock `document.body.style.overflow = 'hidden'` on mount, restore on unmount — applied uniformly to `ProductQuickView`, `CheckoutModal`, `OrderTrackingModal`, `PaymentReturnModal`, and the `Cart` drawer. A tiny shared hook (`useScrollLock`) keeps it consistent.

3. **Cart-aware product cards.** A card currently shows a dumb "Agregar" button even when the product is already in the cart. Standard e-commerce behavior: once qty > 0, the card swaps the button for a quantity stepper `[−] n [+]` (reusing `.quantity-controls` styles, clamped to `stockCount`). Implementation: `App` → `ProductList` → `ProductCard` pass a `cartQuantity` per product (also surfaced in `ProductQuickView` footer). `AppCartPersistence`/`ProductCard` tests updated.

4. **Minimum order for delivery outside Melipilla: $60.000** (display `$60.000` — `formatCLP` already emits no "CLP" suffix).
   - Checkout Step 1 gets a delivery-zone control: `Comuna de despacho` select with `Melipilla` / `San Antonio` (replaces the free-text `Ciudad / Comuna` input — two zones only).
   - Rule: `zone === 'San Antonio' && subtotal < 60000` → block progression with `La compra mínima para despacho a San Antonio es de $60.000`.
   - Constant in shared config (`src/config/delivery.ts`: `DELIVERY_ZONES`, `MIN_ORDER_OUTSIDE_MELIPILLA = 60000`) so the `Cart` drawer can surface the same rule proactively.

5. **Factura disabled — Boleta only (future feature).**
   - `CheckoutModal` Step 1: remove the `🏢 Factura Electrónica` option card; `documentType` stays `'boleta'`; skip `validateFacturaFields`; hide the RUT-empresa/razón-social/giro block. Gate behind a flag (`const FACTURA_ENABLED = false`) so the path re-enables cleanly later — order schema keeps `documentType` + optional factura fields.
   - _Copy consequence:_ storefront can no longer advertise "Factura Electrónica Inmediata (19% IVA)" — sweep `Navbar:54`, `Footer:104,148`, `PaymentReturnModal`, promo copy → `Boleta Electrónica · IVA 19%`. "Total Facturado" labels → `Total a Pagar`. If clinics still need factura, they route through the WhatsApp cotización path (optional note: `Factura para clínicas — cotízala por WhatsApp`).

---

## ✅ 9. What Works — Do Not Touch

- **The 6 delivered photos** (`hero`, 4 category banners, promo bg) — genuinely good assets. (Correction to first pass: this approval covered _section_ imagery; it does not extend to product media, which has none — see §7.1. Note: `promo-strip-bg` becomes orphaned once PromoStrip is deleted — repurpose or drop it in Phase 4.)
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

1. **Wordmark lockup:** typographic `PRONTO` in the chosen display face + `INSUMOS ODONTOLÓGICOS` descriptor — no generic Lucide mark, no sticker badge. (Bespoke detail: a single accent ligature/underline on one letter.)
2. **Favicon** (SVG derived from the wordmark) + **real `og-preview.png`** (1200×630, navy field, wordmark, hero photo).
3. **Canonical naming rule** applied across nav/footer/title/legal.

### 10.4 Layout Restructuring

| Section                  | Change                                                                                                                                                                                                                                                                                                                                     |
| :----------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hero**                 | **Full-bleed navy band** (approved): edge-to-edge `--ink-800`, white headline in display face, single accent CTA (white or `--accent-on-dark` treatment), photo right with soft mask. Trust items = quiet inline icon row using `--accent-on-dark` icons — no pill chrome. Absorbs PromoStrip's unique messages (approved: fold & delete). |
| **PromoStrip**           | **Delete** — fold unique messages into hero trust row; update `PromoStrip.test.tsx` accordingly.                                                                                                                                                                                                                                           |
| **Category pills**       | Keep mechanics; icons → `--text-muted`; active = navy text + `--accent` underline.                                                                                                                                                                                                                                                         |
| **Filter row**           | Remove `results-slogan-tagline`.                                                                                                                                                                                                                                                                                                           |
| **Category showcase**    | Unbox hub (heading + open grid, no border card); drop `category-card-tag-pill` overlay.                                                                                                                                                                                                                                                    |
| **Product cards**        | Media: single neutral placeholder (collapse the 8 gradient themes), category icon only (drop the repeated name). Badge diet: max 1 on media (priority discount > Rx > mediaBadge). REF as muted mono line in body. **Remove raw `stockCount`** → `Bajo stock`. Featured strip → `--accent` or remove.                                      |
| **Footer**               | Icons → `--accent-on-dark`/muted-on-dark; link hover → `--accent-on-dark` (preserves ~8:1); fix the $100.000/$150.000 contradiction.                                                                                                                                                                                                       |
| **Modals/drawer/toasts** | Re-token all §3.2 inline hexes; WhatsApp button → navy (drop `#25d366`); toast edge → `--accent`. Add **focus trap** to all 4 modals.                                                                                                                                                                                                      |

### 10.5 The "Soul" Layer — Concrete Tactics (replaces aspirational §8.5)

1. ~~**A named human:** "Habla con [Nombre]…" + photo + direct WhatsApp~~ — **declined by owner (Sep 21)**; do not build this slot.
2. **Local specificity:** Av. Ortúzar counter/warehouse photo, delivery-routes graphic (Melipilla → San Antonio), concrete facts ("pedidos antes de las 16:00 despachan hoy").
3. **Real hero copy:** a specific, opinionated headline beats "Abastecimiento Odontológico de Precisión" (the most generated-sounding line on the page).
4. **1–2 bespoke details:** hand-drawn accent underline on the hero keyword, or subtle texture on one surface — enough to break template feel without noise.
5. **Asymmetry & whitespace:** hero grid 1.4fr/0.8fr; section spacing via `--space-*` scale (48–64px between majors, not uniform 2rem).

### 10.6 Mobile Pass

2-col product grid ≤768px; keep phone/tracking reachable (condensed mobile utility row or navbar action); pill scroll edge-arrow or visible scrollbar; `inputmode` on RUT (numeric), `tel`/`email` types; sticky mobile "Agregar" on quick-view.

### 10.7 Motion & State Spec

150–250ms `cubic-bezier(0.4,0,0.2,1)`; animates: add-to-cart (button → "Agregado ✓" → revert), drawer/modal entrance, image fade-in, card hover lift, badge pulse. Replace `⏳` loader with product-card skeletons (shimmer, `prefers-reduced-motion` aware); define the missing `@keyframes spin` or delete the reference.

---

## 🗺️ 11. Implementation Phases

| Phase                            | Content                                                                                                                                                                                                              | Files                                                                                                                                                      | Priority                           |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------- |
| **1 — Token & font surgery**     | New `:root` (incl. `--accent-on-dark`, spacing scale, radius fix), font swap, type scale; retire lime/olive                                                                                                          | `index.css`, `index.html`                                                                                                                                  | **P0**                             |
| **2 — Credibility fixes**        | Remove raw `stockCount`, unify WhatsApp number behind `VITE_WHATSAPP_NUMBER`, fix $100.000/$150.000 contradiction, collapse placeholder themes, clean fabricated ratings/discount fixture values (star UI code kept) | `ProductCard`, `Navbar`, `Hero`, `Footer`, `ProductQuickView`, `ErrorBoundary`, `products.ts`                                                              | **P0**                             |
| **3 — Brand surface**            | Wordmark lockup, favicon, real `og-preview.png`, canonical naming                                                                                                                                                    | `Navbar`, `Footer`, `index.html`, `public/`                                                                                                                | **P0**                             |
| **4 — Hero & chrome cleanup**    | Full-bleed navy hero, delete PromoStrip, badge diet, slogan removal, unbox showcase                                                                                                                                  | `Hero`, `PromoStrip`, `CategoryFilter`, `CategoryShowcase`, `index.css`, `App.tsx`                                                                         | **P1**                             |
| **5 — Functional UX additions**  | `useScrollLock` on all overlays, cart-aware card stepper, delivery-zone select + $60.000 min order, factura disabled (flag), pickup-wording removal + zone copy sweep (Melipilla + San Antonio)                      | `CheckoutModal`, `Cart`, `ProductCard`, `ProductList`, `App.tsx`, `src/config/delivery.ts`, `Navbar`, `Hero`, `Footer`, `PaymentReturnModal`, `index.html` | **P1**                             |
| **6 — Inline-style migration**   | ~60 hexes → tokens                                                                                                                                                                                                   | `Footer`, `Navbar`, `OrderTrackingModal`, `PaymentReturnModal`, `CheckoutModal`, `ProductQuickView`, `ErrorBoundary`                                       | **P1**                             |
| **7 — Mobile pass**              | 2-col grid, reachable phone/tracking, pill affordance, `inputmode`                                                                                                                                                   | `index.css`, `Navbar`, `CheckoutModal`, `ProductQuickView`                                                                                                 | **P1**                             |
| **8 — Motion & a11y**            | Motion spec, add-to-cart state, skeletons, focus traps, `aria-live` cart                                                                                                                                             | `index.css`, `Cart`, `ProductCard`, modal components                                                                                                       | **P2**                             |
| **9 — Media contract & card IA** | `object-fit: contain` 4:3 white media area, image fade-in, placeholder redesign; **`unitOfSale` field** (schema + types + CSV import + card UI), REF-first card hierarchy                                            | `index.css`, `ProductCard`, `ProductQuickView`, `src/types`, `schemaValidation`, `import-catalog-csv.ts`                                                   | **P2** (ready before photos exist) |
| **10 — Alias deprecation**       | Migrate `var(--teal-*)`/`var(--navy-*)` consumers → canonical                                                                                                                                                        | `App.tsx`, `OrderTrackingModal`, `index.css`                                                                                                               | **P2**                             |

**Verification:** `pnpm test` + `pnpm build` (tests assert text/roles — safe; `PromoStrip.test.tsx`, `CheckoutModal` factura/zone tests, `ProductCard` stepper tests, and copy-dependent suites like `ClinicalStorefront` get updated). Contrast targets: `--accent` on white ≥4.5:1; `--accent-on-dark` on `--ink-800` ≥4.5:1; body text ≥4.5:1; `prefers-reduced-motion` respected.

---

## 📋 12. Decisions

| #   | Decision                                                                                                                                 | Status                               |
| :-- | :--------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------- |
| 1   | **Palette:** Option A — navy + clinical cyan, **plus mandatory `--accent-on-dark` variant** (fixes the 2.8:1 flaw the first pass missed) | ✅ Approved + amended                |
| 2   | **Hero:** full-bleed navy band, white headline, photo right                                                                              | ✅ Approved                          |
| 3   | **PromoStrip:** fold unique messages into hero, delete component                                                                         | ✅ Approved                          |
| 4   | **Typeface:** T1 — Fraunces display + Inter body (over the originally proposed Space Grotesk)                                            | ✅ Approved                          |
| 5   | **Ratings policy:** keep the star UI code (production items have `reviewsCount:0` → nothing renders); clean fabricated fixture values    | ✅ Approved                          |
| 6   | **Named human contact** in hero/footer                                                                                                   | ❌ Declined — do not build this slot |
| 7   | **`unitOfSale` data field** for card IA (schema + types + card UI + CSV import)                                                          | ✅ Approved                          |
| 8   | **Product photography acquisition**                                                                                                      | 🚫 Out of scope — data-quality track |
| 9   | **Delivery zones:** Melipilla + San Antonio only; all pickup/retiro wording removed (supersedes roadmap 3.1's zone list)                 | ✅ Approved (owner)                  |
| 10  | **Modal scroll-lock:** body scroll frozen behind every overlay (QuickView, Checkout, Tracking, PaymentReturn, Cart drawer)               | ✅ Approved (owner)                  |
| 11  | **Cart-aware cards:** quantity stepper replaces "Agregar" once product is in cart                                                        | ✅ Approved (owner)                  |
| 12  | **Min order outside Melipilla:** $60.000 for San Antonio despacho, shown via `formatCLP` (no "CLP")                                      | ✅ Approved (owner)                  |
| 13  | **Factura disabled:** Boleta only; factura path flag-gated for future; "Factura" marketing copy → Boleta                                 | ✅ Approved (owner)                  |

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
