# UI/UX Critical Re-Evaluation & Enhancement Proposal (Phase 2)

## PRONTO Insumos Odontológicos — Post-Overhaul Professional Audit

**Evaluator Context:** This is a **second-pass, adversarial** evaluation of the storefront UI/UX following the initial Phase 1 overhaul. The Phase 1 overhaul correctly diagnosed and removed the worst "AI-generated SaaS template" symptoms (neon glows, 9999px pills, glassmorphism, fake SaaS telemetry, decimal USD pricing). However, the resulting design, while structurally improved, has introduced a new set of problems that prevent the storefront from feeling like a **real, credible dental supply distributor**.

**Target Market:** Dental clinics, independent practitioners, and dental technicians in Melipilla & Región Metropolitana, Chile.  
**Design Philosophy:** The storefront must convey **established commercial authority, clinical trustworthiness, and local accessibility** — not "a developer's portfolio project that follows good design principles."

---

## 🔴 1. Executive Re-Diagnosis: The "Well-Designed Template" Problem

The Phase 1 overhaul solved the *technical* design issues but introduced a subtler, harder-to-diagnose problem: **the site now looks like a competently-built but soulless design system demo**. It follows all the rules (proper tokens, clean radii, neutral shadows, no neon), but it lacks the *texture, weight, and character* that differentiate a real business from a template.

A dental clinic manager visiting this site today would think: *"This looks clean, but something feels off. It doesn't feel like an established supplier. It feels like a prototype."*

### Root Causes

| Symptom | What's Actually Wrong |
| :--- | :--- |
| **"Weak" fonts** | Plus Jakarta Sans is a perfectly fine geometric sans-serif, but it's used uniformly at every weight for every purpose. There's no typographic differentiation between commercial text, technical data, and editorial content. Everything looks the same. |
| **Flat visual hierarchy** | Every element uses the same visual weight: 1px borders, same shadow depth, same padding ratios. Product cards, the hero, the category bar, and the footer all feel like siblings rather than a structured hierarchy. |
| **Unsplash stock photos** | Product images are irrelevant Unsplash dental-clinic photos (dentists in masks, lab equipment). They are not product shots. A customer seeing a smiling dentist when expecting a turbine image feels deceived, not informed. |
| **Monochrome monotony** | The Navy/Teal palette is appropriate but deployed too uniformly. Every accent is the same `#088395` teal. There's no warm accent, no secondary color, no visual rhythm across the page. |
| **Missing commercial gravity** | No pricing emphasis. No urgency cues. No social proof integration. No visible inventory scarcity. The page presents information but doesn't *sell*. |
| **Invisible brand identity** | The "PRONTO" brand mark (Activity icon in a navy square + text) is generic. It could be any company in any industry. |

---

## 🔍 2. Detailed Findings: 12 Weak Spots

### WS-01: Typography — Single-Font Monotony

**Current State:**  
The entire site uses `Plus Jakarta Sans` at weights 400–800. While Jakarta is a competent geometric sans-serif, it creates a **geometric monotony** when used as the only typeface across editorial headlines, technical data (REF codes, specs), body copy, and UI controls.

The brand name "PRONTO" is rendered in Jakarta Sans 800 at 1.35rem. This is too small and too soft for a brand wordmark that needs to anchor the page.

**Why It Feels Amateur:**
- Real dental distributors (Henry Schein, Patterson Dental, Mondial Dent Chile) use **a minimum of 2 typefaces**: a display/serif for editorial impact and a clean sans for UI.
- Monospace REF codes (`.product-ref-badge { font-family: monospace }`) use the browser's default monospace (likely Courier New), creating an unintended visual clash.
- Body text at `0.85rem` and `0.825rem` is too small for comfortable catalog browsing on desktop monitors.

**Proposed Fix:**
- **Primary brand & headlines:** Switch to **`DM Sans`** or **`Instrument Sans`** — sharper, more authoritative geometric faces with better optical weight at bold. Alternatively, pair Jakarta with a **condensed display face** like `DM Serif Text` for the hero headline and section headers only.
- **Technical / catalog data:** Use **`JetBrains Mono`** for REF codes, SKU badges, and pricing (numeric tabular). This signals engineering precision in a way that `monospace` fallback never will.
- **Minimum body size:** Raise all body text minimums from 0.825rem → **0.875rem**, and description text from 0.85rem → **0.9rem**. Catalog text must be scannable at arm's length.
- **Brand wordmark:** Increase "PRONTO" to **1.6rem** minimum. Consider letter-spacing at `0.08em` and weight 900 for industrial authority.

```css
/* Proposed typography tokens */
:root {
  --font-display: 'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-body: 'DM Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Mono', monospace;
}
```

---

### WS-02: Color — Teal Fatigue & Missing Warmth

**Current State:**  
The entire accent palette is a single hue: `#088395` (teal-600) for primary actions, badges, icons, focus rings, and active states. There's no secondary accent, no warm color, and no visual rhythm.

**Why It Feels Template-Like:**
- Real e-commerce sites use **at least 2 accent colors** to create visual variety: a primary action color and a promotional/urgency color.
- The Navy + Teal palette is cold and clinical, which is directionally correct but applied without variation. The page feels tonally monotone.
- The `#38bdf8` sky-blue used in the footer and utility bar hovers is close to the teal but not harmonious with it, creating a muddy mid-range.

**Proposed Fix:**
- Keep `#088395` teal as the **primary CTA** color.
- Introduce a **warm accent** for pricing, promotions, and urgency cues: **`#c2410c`** (a deep burnt orange) or **`#b45309`** (amber-700). This creates visual warmth in the pricing block and badge area.
- Replace the `#38bdf8` sky-blue in the footer with a lighter teal (`#67e8f9`, teal-300) for cohesion.
- Add a **soft clinical accent** for informational highlights: `#3b82f6` (blue-500) for links and secondary informational badges.

```css
:root {
  /* Extended accent palette */
  --accent-warm: #b45309;   /* Pricing emphasis, promo tags, urgency */
  --accent-warm-bg: #fffbeb; /* Warm highlight backgrounds */
  --accent-info: #3b82f6;   /* Informational links, secondary badges */
}
```

---

### WS-03: Hero Section — Correct Content, Wrong Presentation

**Current State:**  
The hero correctly replaced the fake telemetry card with a "Garantías Comerciales B2B" card. The headline is authoritative. However:
- The white card on white background creates **zero visual weight**. The hero has no visual anchor and no emotional pull.
- The guarantee card's 4 items all use the same `CheckCircle2` icon, making the list look like a checkbox form rather than a set of distinct commercial strengths.
- No visual backdrop, no subtle pattern, no photo. The hero is just text on white.

**Proposed Fix:**
- Add a **subtle navy-tinted gradient band** behind the hero (not the neon glows of Phase 0, but a muted linear gradient from `#f7f9fa` to `#e8f0fe` giving the hero a slight blue tint that distinguishes it from the product grid below).
- Give the guarantee card a **left teal accent border** (4px solid `--teal-600`) instead of the neutral border, making it visually distinct.
- Use **distinct icons** for each guarantee item: `FileCheck` for factura, `Truck` for delivery, `ShieldCheck` for certification, `MessageSquare` for WhatsApp.
- Add a small **hero photograph** — a clean, desaturated image of dental instruments on a sterile tray — as a CSS background with low opacity on the right side of the hero, giving depth without overwhelming text.

---

### WS-04: Product Cards — All Equal, Nothing Stands Out

**Current State:**  
All product cards share identical visual treatment. The best-selling turbine at $189,990 and an $18,500 alginato bag look exactly the same. There's no visual hierarchy to guide the eye.

The technical header strip (REF code + stock status) is present but visually recessive at `0.725rem` — it doesn't register at scanning speed.

The "Agregar" button in solid teal is the most prominent element, but it competes visually with the teal category tag, teal badge icons, and teal brand elements on the page.

**Proposed Fix:**
- **Featured product cards:** For products tagged as "Más Vendido" or "Recomendado", add a top accent strip (3px solid `var(--accent-warm)` or a small "Más Vendido" ribbon badge in warm amber) to break the visual uniformity.
- **Price emphasis:** Use `--font-mono` for pricing numerals. Make the primary price **1.35rem, weight 800** (currently 1.25rem). Add the warm accent color to the "IVA incluido" label when a product is on sale.
- **Stock urgency:** When `stockCount <= 5`, display in `--warning` color (`#d97706`) with text like "Últimas 4 unidades" instead of the generic green dot.
- **Brand/manufacturer line:** Add a subdued manufacturer attribution line (e.g., "NSK · Pieza de Mano") above the product title in `0.75rem` uppercase, giving clinical buyers the brand signal they scan for first.

---

### WS-05: Product Images — Unsplash Stock Photos Are Harmful

**Current State:**  
Products use Unsplash images that show dental offices, dentists, and lab settings — not the actual product. A customer clicking "Turbina LED MasterTorque" and seeing a stock photo of a dentist in a blue mask feels **actively misleading**, worse than showing no image at all.

The fallback placeholder (a large 42px Lucide icon on gray `#f1f5f9` background) is clean but looks like an unfinished wireframe.

**Proposed Fix:**
- **Remove all Unsplash stock photos.** Replace `images: [...]` arrays with empty arrays or remove the property entirely. It is better to show a well-designed placeholder than a misleading stock photo.
- **Upgrade the placeholder design:** Instead of a single oversized icon on flat gray:
  - Use the category-specific icon at 36px with a subtle **circular background frame** (`width: 72px; height: 72px; border-radius: 50%; background: #e2e8f0;`).
  - Below the icon, render the product name in `0.75rem` semi-bold as secondary text.
  - Add a subtle repeating diagonal **hatch pattern** or grid dots (CSS-only) to the placeholder background to give it texture and differentiate it from "not loaded yet."
- **Long-term:** When real product photography becomes available, integrate it. Until then, honest placeholders are better than dishonest stock photos.

---

### WS-06: Spacing & Rhythm — Uniform Padding Creates Flatness

**Current State:**  
Nearly every component uses padding in the `0.75rem–1.25rem` range. Product card body: `1.15rem`. Hero: `3rem 2.5rem`. Category pills: `0.55rem 1rem`. Cart drawer: `1.25rem 1.5rem`. This narrow range creates a visual monotone — nothing breathes more than anything else.

**Proposed Fix:**
- Increase hero padding to `3.5rem 3rem` on desktop.
- Increase product card body padding to `1.25rem 1.35rem`.
- Add `margin-top: 1rem` between the category filter bar and the results count bar to create a visible pause.
- Add a `2rem` top margin to the product grid (`.products-grid`) after the controls bar.
- In the footer, increase the gap between the 4-column grid and the bottom bar to `3.5rem`.

---

### WS-07: Micro-Interactions — Safe But Lifeless

**Current State:**  
Hover interactions are limited to:
- Product card: `translateY(-2px)` + border color shift + shadow upgrade (good, keep this).
- Buttons: background color darkens (adequate but generic).
- No feedback on "Agregar al Carro" click beyond the button state.
- No entrance animations on product cards.

**Proposed Fix:**
- **Cart add feedback:** On successful add-to-cart, briefly flash the cart badge count with a scale animation (`scale(1.15)` for 200ms) and apply a subtle ripple effect on the "Agregar" button.
- **Card entrance:** Use `IntersectionObserver` to add a stagger-delayed `fadeIn + slideUp(12px)` animation on product cards as they enter the viewport. Duration: 300ms, stagger: 50ms per card.
- **Category tab switch:** Add an active indicator transition — an underline that slides to the active tab rather than an instant color swap. CSS `transition: background 150ms ease, color 150ms ease` is already present but the visual change is too subtle.
- **Toast enhancement:** Add a progress bar inside the toast that depletes over the toast's lifespan (3s), giving users a sense of when it will disappear.

---

### WS-08: Category Filter Bar — Segmented Control Feels Disconnected

**Current State:**  
Category buttons are individually bordered rectangles with `gap: 0.5rem`. The active state uses `background: var(--navy-900)` which is a hard snap between white and near-black. The inactive buttons have `border: 1px solid var(--border-subtle)` which blends into the page background.

**Proposed Fix:**
- Wrap all category buttons in a **single unified container** with a shared background (`var(--surface-muted)`) and a shared outer border, creating a true **segmented control** rather than independent floating buttons.
- Soften the active state contrast: instead of navy-900 background (near-black), use `--navy-800` (`#1e3e62`) or even `--teal-700` (`#0a6371`) to keep it dark but not maximum contrast.
- Add item counts to each category tab: `Materiales (4)` in a small lighter chip next to the label.

```css
.category-pills {
  background: var(--surface-muted);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 4px;
  gap: 4px;
}

.category-pill-btn {
  border: none; /* Remove individual borders inside the container */
  background: transparent;
  border-radius: var(--radius-sm);
}

.category-pill-btn.active {
  background: #ffffff;
  color: var(--navy-900);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-subtle);
}
```

---

### WS-09: Footer — Informative But Visually Heavy

**Current State:**  
The footer correctly presents corporate identity, logistics, compliance, and contact. However:
- The footer-value-props icons use `background: rgba(8, 131, 149, 0.15)` with `color: #38bdf8` — the icon color doesn't match the teal accent and creates a cold, clinical feel in what should be a warm, trust-building section.
- The 4-column grid becomes very text-heavy with no visual breaks.
- All text is at similar sizes (0.8–0.925rem), making it hard to scan.

**Proposed Fix:**
- Add subtle **divider lines** between the 4 footer columns (visible on desktop only).
- Make footer headings slightly larger: `0.95rem` with more `margin-bottom: 1.25rem`.
- Replace the value-props icon styling with a white icon on a teal-600 solid background (rather than transparent teal bg with sky-blue icon). This is more assertive and readable.
- Add a small, understated **"Proudly serving Melipilla since [year]"** line near the brand identity for local authenticity.

---

### WS-10: Cart Drawer — Functional But Visually Sparse

**Current State:**  
Cart items use a generic `ShoppingBag` icon as the thumbnail for every product. The pricing breakdown (Subtotal, IVA, Total) is clear. The promo code input is present.

**Proposed Fix:**
- Replace the generic `ShoppingBag` thumbnail with the **category-specific icon** (matching `ProductCard.tsx`'s `ICON_BY_CATEGORY` mapping), giving visual variety to the cart list.
- Add a subtle `background: var(--surface-bg)` stripe to alternating cart items for scanability.
- Style the "Proceder al Pago" button with slightly more padding and a **lock icon + arrow** (already present) but add a small trust line below it: `"Pago 100% seguro · Factura electrónica inmediata"` in `0.7rem` muted text, centered.

---

### WS-11: Mobile Responsiveness — Adequate but Not Optimized

**Current State:**  
Media queries at 992px, 768px, and 480px handle layout adjustments. The top utility bar hides below 768px (appropriate). Product grid goes single-column on mobile.

**Identified Gaps:**
- At 768px–992px (tablet landscape), the product grid still uses `minmax(285px, 1fr)` which can result in 2 cards that are too wide and stretched.
- The mobile hero section at `padding: 2rem 1.25rem` leaves the guarantee card directly below the CTA buttons with no visual separation.
- Category pills overflow container doesn't show any scroll affordance — on mobile, users may not realize they can scroll horizontally.

**Proposed Fix:**
- Add a fade gradient on the right edge of `.category-pills` on mobile to signal horizontal scrollability.
- At tablet sizes (768px-992px), set product grid to `minmax(240px, 1fr)` to allow 3 columns.
- Add `1.5rem` spacing between the hero CTA group and the guarantee card on mobile.

---

### WS-12: Missing Trust Signals & Commercial Polish

**Current State:**  
The storefront presents product information but lacks the commercial polish that signals "established operating business." Specific gaps:

- **No Mercado Pago / payment method badges** visible anywhere on the site. Chilean buyers expect to see Webpay Plus, Mercado Pago, and bank transfer logos, especially in the footer or checkout.
- **No visible customer service hours** in the navbar or hero area.
- **No "Nuevo" / "Oferta" badges** on product cards for products with `originalPrice` discounts — this is lost revenue.
- The `theme-color` meta tag uses `#0284c7` (sky-blue-600) instead of the brand teal `#088395`, creating a disconnect on mobile browser chrome.

**Proposed Fix:**
- Add a **discount percentage badge** on cards that have `originalPrice`: a small `"-17%"` tag in warm accent (`var(--accent-warm)` on `var(--accent-warm-bg)`) positioned at the top-right of the image area.
- Update `<meta name="theme-color">` to `#088395`.
- Add small payment method text/icons in the cart drawer footer below the checkout button.
- Consider a small `"Lun-Vie 08:30-18:30"` inline text in the navbar trust badge area.

---

## 🎨 3. Updated Design System Delta (Phase 2 Additions)

These tokens extend the Phase 1 system. No existing tokens are removed.

```css
:root {
  /* Typography — Dual-face system */
  --font-display: 'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-body: 'DM Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Mono', monospace;

  /* Extended accent palette */
  --accent-warm: #b45309;       /* Pricing emphasis, discount badges, urgency */
  --accent-warm-bg: #fffbeb;    /* Background for warm highlights */
  --accent-warm-border: #fde68a; /* Border for warm badges */
  --accent-info: #3b82f6;       /* Links, informational secondary badges */

  /* Enhanced text sizing minimums */
  --text-body: 0.9rem;     /* Up from 0.825rem */
  --text-small: 0.8rem;    /* Up from 0.725rem */
  --text-caption: 0.75rem; /* For sub-labels */

  /* Brand mark sizing */
  --brand-size: 1.6rem;
  --brand-weight: 900;
  --brand-letter-spacing: 0.08em;
}
```

### Google Fonts Import Update

```html
<!-- Replace current Plus Jakarta Sans import with dual-face system -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900;1,9..40,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

---

## 📐 4. Component-Level Enhancement Specifications

### 4.1. Typography Overhaul (Global)

| Element | Current | Proposed |
| :--- | :--- | :--- |
| Body font | Plus Jakarta Sans 400-800 | DM Sans 400-800 |
| Brand "PRONTO" | Jakarta Sans 800, 1.35rem | DM Sans 900, 1.6rem, letter-spacing 0.08em |
| Hero headline | Jakarta Sans 800, 2.4rem | DM Sans 800, 2.6rem |
| Product title | 1rem, 700 | 1.05rem, 700 |
| Product description | 0.825rem | 0.9rem |
| REF code badge | browser `monospace` | JetBrains Mono 700 |
| Price numerals | Jakarta Sans 800, 1.25rem | DM Sans 800, 1.35rem |
| Tax label | 0.7rem | 0.75rem |
| Utility bar text | 0.775rem | 0.8rem |

### 4.2. Product Card Enhancement

```
+----------------------------------------------------------+
| REF: OD-101              * 18 en Bodega   [-17%]         | <- warm accent discount badge
+----------------------------------------------------------+
|                                                           |
|              IMPROVED PLACEHOLDER AREA                    |
|         (Category icon in circular frame +                |
|          subtle texture pattern background)               |
|                                                           |
|   [Fibra Optica LED]              [Uso Profesional]       |
+----------------------------------------------------------+
| INSTRUMENTAL * NSK                 <- Manufacturer line   |
| Turbina LED MasterTorque Fibra Optica                     |
|                                                           |
| * 4.9 (86 evaluaciones)                                   |
| Pieza de mano alta velocidad con LED...                   |
|                                                           |
| $189.990          $229.990         <- JetBrains Mono      |
| IVA incluido                                              |
+----------------------------------------------------------+
| [  Agregar al Carro  <--------------------- teal  ]      |
+----------------------------------------------------------+
```

### 4.3. Category Segmented Control

```
+----------------------------------------------------------------------+
| +-------------+ +--------------------------+ +--------------------+  |
| | # Todos (8) | | # Instrumental y Piezas  | | # Materiales (3)  |  | <- unified container
| +-------------+ +--------------------------+ +--------------------+  |    with shared background
| +--------------------------+ +----------------------------------+    |
| | # Diagnostico (2)       | | # Esterilizacion e Higiene (2)  |    |
| +--------------------------+ +----------------------------------+    |
+----------------------------------------------------------------------+
```

### 4.4. Hero — Subtle Gradient Band

```css
.hero-section {
  background: linear-gradient(135deg, #ffffff 0%, #f0f5ff 50%, #e8f0fe 100%);
  /* Subtle blue-white gradient instead of flat white */
}

.hero-card-preview {
  border-left: 4px solid var(--teal-600);
  /* Accent border for visual anchor */
}
```

### 4.5. Footer Value Props — Solid Icon Treatment

```css
.footer-prop-icon {
  background: var(--teal-600);  /* Solid teal instead of transparent */
  color: #ffffff;               /* White icon instead of sky-blue */
  border-radius: var(--radius-sm);
  padding: 0.65rem;
}
```

---

## 🛠️ 5. Implementation Roadmap (Phase 2 Refinements)

All changes respect the project's guardrails: **No external CSS frameworks, Vanilla CSS only, React 18 state, zero test regressions.**

| Phase | Target | Key Actions | Risk |
| :--- | :--- | :--- | :--- |
| **P2-1** | Typography swap | Replace Plus Jakarta Sans -> DM Sans import in `index.html` + CSS. Add JetBrains Mono for technical data. Update `--font-sans`, add `--font-display` and `--font-mono`. Increase minimum body sizes. | Low |
| **P2-2** | Color accent expansion | Add `--accent-warm`, `--accent-warm-bg`, `--accent-info` tokens. Apply warm accent to discount badges, pricing on-sale indicators, and promo labels. | Low |
| **P2-3** | Product card polish | Add discount % badge. Add manufacturer line. Apply `--font-mono` to prices & REF codes. Increase price size. Add low-stock urgency text. Upgrade placeholder design. | Medium |
| **P2-4** | Remove Unsplash images | Strip misleading stock photos from `products.ts`. Improve placeholder fallback with circular icon frame + texture pattern. | Low |
| **P2-5** | Hero refinement | Apply subtle gradient background. Add accent border to guarantee card. Use distinct icons per guarantee. | Low |
| **P2-6** | Category segmented control | Wrap pills in unified container. Remove individual borders. Swap active style to elevated white card. Add item counts. | Low |
| **P2-7** | Micro-interactions | Add cart badge scale pulse on add. Add product card viewport entrance animation. Add toast progress bar. | Low-Med |
| **P2-8** | Footer & trust signals | Solid icon background. Column dividers. Payment method badges. Discount meta-tag fix. | Low |
| **P2-9** | Mobile optimizations | Category scroll affordance fade. Tablet grid adjustment. Hero mobile spacing. | Low |

---

## ✅ 6. Verification Plan

### Automated Tests
```bash
pnpm test          # All existing 84+ tests must pass without regressions
pnpm build         # TypeScript compilation and production bundle must succeed
```

### Manual Visual Verification
- Confirm DM Sans loads correctly (check Network tab for Google Fonts)
- Verify JetBrains Mono renders on REF codes and pricing
- Check discount badge appears only on products with `originalPrice`
- Confirm category segmented control feels unified
- Verify mobile category scroll fade affordance
- Confirm hero gradient is subtle (not a return to neon)
- Test all micro-interactions: cart badge pulse, card entrance, toast progress

### Cross-Browser Spot Check
- Chrome (primary), Firefox, Safari (macOS), Edge
- Mobile: Chrome Android, Safari iOS

---

## 📊 7. Before/After Summary Table

| Aspect | Phase 1 (Current) | Phase 2 (Proposed) |
| :--- | :--- | :--- |
| **Typography** | Single face (Plus Jakarta Sans) | Dual system (DM Sans + JetBrains Mono) |
| **Font feel** | Geometric, soft, uniform | Sharper optically, differentiated by context |
| **Accent palette** | Monochrome teal | Teal (CTA) + Warm amber (pricing/urgency) |
| **Product images** | Misleading Unsplash stock photos | Honest placeholders with textured design |
| **Price presentation** | Adequate but visually recessive | Prominent, monospace, warm-accented on sale |
| **Card differentiation** | All cards identical | Featured cards get accent badges |
| **Category nav** | Disconnected floating buttons | Unified segmented control |
| **Hero** | Flat white, no visual weight | Subtle gradient band, accented guarantee card |
| **Micro-interactions** | Hover only | Hover + cart pulse + card entrance + toast bar |
| **Brand presence** | Generic icon + small text | Larger, heavier wordmark with spacing |
| **Commercial trust** | Present but passive | Active (discount badges, urgency, payment logos) |

---

> **Bottom Line:** Phase 1 removed the AI-template toxicity. Phase 2 must inject the **commercial personality, typographic authority, and visual rhythm** that make a dental professional trust this site enough to place a $900,000 CLP autoclave order.

---

## 📎 Appendix A: Data Model Changes

### A.1. New `manufacturer` Field on `Product` Type

The `Product` interface in [`src/types/index.ts`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/types/index.ts) must be extended with an **optional** `manufacturer` field. This field powers the brand attribution line on product cards (WS-04).

```typescript
export interface Product {
  // ... existing fields ...
  manufacturer?: string  // Brand/manufacturer attribution (e.g., "NSK", "3M ESPE")
}
```

**Why optional?** Some generic consumables (campos quirúrgicos, alginato) may not have a meaningful manufacturer attribution in early inventory. Making it optional avoids forcing placeholder brands.

### A.2. Manufacturer Values for Current 10 Products

| Product ID | Product Name | Proposed `manufacturer` Value |
| :--- | :--- | :--- |
| `odon-101` | Turbina LED MasterTorque | `"NSK"` |
| `odon-102` | Lámpara de Fotocurado CuringPro 3000 | `"Woodpecker"` |
| `odon-103` | Escariador Ultrasónico OdonClean Pro | `"DTE / Satelec"` |
| `odon-104` | Kit de Resinas Nano-Híbridas DentFill | `"DentFill"` |
| `odon-201` | Autoclave Clase B 18L SterilMax | `"SterilMax"` |
| `odon-202` | Alginato Cromático ImpressDent (500g) | `"ImpressDent"` |
| `odon-301` | Localizador de Ápice ApexPro V | `"Woodpecker"` |
| `odon-302` | Set Instrumental de Exploración (10 pzas) | `"Hu-Friedy"` |
| `odon-401` | Campos Quirúrgicos Desechables (Caja 100) | *(omit — generic consumable)* |
| `odon-402` | Motor de Implante ImplaDrive Pro | `"W&H"` |

### A.3. Discount Badge Calculation Logic

The discount percentage badge (WS-04, WS-12) is computed and displayed only when `product.originalPrice` exists:

```typescript
// Discount calculation — render badge only if > 0%
const discountPercent = product.originalPrice
  ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
  : 0
```

**Display rules:**
- Show badge only when `discountPercent >= 5` (avoid showing trivial 1-2% discounts).
- Format: `"-17%"` in warm accent colors (`var(--accent-warm)` text on `var(--accent-warm-bg)` background, `var(--accent-warm-border)` border).
- Position: top-right corner of the product media area (same position currently used by `.rx-badge`). When both Rx and discount badges are present, stack discount above Rx.

### A.4. Low-Stock Urgency Threshold

- When `product.stockCount <= 5`: Display in `var(--warning)` color (`#d97706`) with text `"Últimas {stockCount} unid."` instead of the green dot.
- When `product.stockCount <= 0` or `!product.inStock`: Display `"Sin Stock"` in `var(--danger)` color (`#dc2626`), already present.
- When `product.stockCount > 5`: Display `"● {stockCount} en Bodega"` in `var(--success)` color, as currently implemented.

### A.5. Images Field Cleanup

All Unsplash URLs will be stripped from `products.ts`. The `images` field will be set to an empty array `[]` for all 10 products. The `images?: string[]` type remains unchanged (no schema migration needed). Products will rely on the improved placeholder fallback design until real photography is available.

---

## 📎 Appendix B: Test Impact Analysis

### B.1. Test Suites Affected

Adding `manufacturer` as an **optional** field means no existing test will break due to the type change itself. However, the following test files contain mock `Product` objects that should be updated to include `manufacturer` for consistency and to verify the new UI element renders:

| Test File | Mock Product(s) | Required Change |
| :--- | :--- | :--- |
| [`ProductCard.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/tests/components/ProductCard.test.tsx) | `mockProduct` (line 7) | Add `manufacturer: 'SterilMax'`. Add test: "should render manufacturer line when provided". Add test: "should omit manufacturer line when not provided". |
| [`ProductDetailModal.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/tests/components/ProductDetailModal.test.tsx) | `mockProduct` (line 13) | Add `manufacturer: 'NSK'`. Add test for manufacturer display. |
| [`ClinicalStorefront.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/tests/components/ClinicalStorefront.test.tsx) | inline product (line 18) | Add `manufacturer: 'Woodpecker'`. |
| [`Cart.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/tests/components/Cart.test.tsx) | `mockProduct1`, `mockProduct2` (lines 18, 35) | Add `manufacturer` to both. |
| [`CheckoutModal.test.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/tests/components/CheckoutModal.test.tsx) | `mockCartItem` (line 35) | Add `manufacturer: 'NSK'`. |
| [`whatsapp.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/tests/services/whatsapp.test.ts) | inline products (lines 23, 42) | Add `manufacturer` to both. |
| [`mercadopago.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/tests/services/mercadopago.test.ts) | inline product (line 23) | Add `manufacturer: 'NSK'`. |
| [`products.test.ts`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/tests/data/products.test.ts) | Field validation (line 10) | No change needed — test uses `toHaveProperty` on a `requiredFields` list, and `manufacturer` is optional, so it won't break. However, add a new test: "products with manufacturer should have non-empty string value". |

### B.2. New Tests to Add

| Component | New Test Case | Purpose |
| :--- | :--- | :--- |
| `ProductCard` | "should render discount badge when originalPrice exists" | Verify `"-17%"` badge appears |
| `ProductCard` | "should NOT render discount badge when no originalPrice" | Verify badge is absent |
| `ProductCard` | "should render manufacturer line when manufacturer is provided" | Verify brand attribution renders |
| `ProductCard` | "should omit manufacturer line when manufacturer is undefined" | Verify graceful absence |
| `ProductCard` | "should render low-stock warning when stockCount <= 5" | Verify urgency text in warning color |
| `products.test.ts` | "products with manufacturer should have non-empty value" | Data integrity for new field |

### B.3. CSS-Only Changes (Zero Test Impact)

The following phases involve CSS-only changes and have **zero test impact**:
- **P2-1** (Typography swap) — Font changes are invisible to DOM-based tests.
- **P2-2** (Color accent tokens) — CSS custom property changes only.
- **P2-5** (Hero gradient) — Background CSS, no structural change.
- **P2-6** (Category segmented control) — CSS container styling. The `.category-pills` class name and button structure remain unchanged, so `CategoryFilter` tests (if any query by text) continue to pass.
- **P2-8** (Footer styling) — CSS-only changes.
- **P2-9** (Mobile optimizations) — CSS media queries only.

### B.4. JS/TSX Changes with Test Risk

- **P2-3** (Product card polish) — Adds new DOM elements (discount badge, manufacturer line). Existing tests pass because they don't assert on DOM structure exhaustively, but new test coverage is required for the new elements.
- **P2-4** (Remove Unsplash images) — Stripping `images` arrays from `products.ts` will cause the `ProductDetailModal.test.tsx` test on line 27 (`images: [...]`) to remain valid since it uses its own mock. The real `PRODUCTS` data will simply have empty `images` arrays, which the existing "renders graceful fallback if no images are provided" test (line 172) already covers.
- **P2-7** (Micro-interactions) — Cart badge pulse is CSS animation triggered by a transient class toggle. Toast progress bar adds a visual `<div>` inside `toast-item`. No existing tests assert on toast internal structure.

---

## 📎 Appendix C: Detailed CSS Specifications

### C.1. Improved Placeholder Design (WS-05)

```css
/* Textured placeholder background with subtle dot grid */
.media-placeholder-box {
  background:
    radial-gradient(circle, #d1d5db 1px, transparent 1px),
    #f1f5f9;
  background-size: 16px 16px;
  background-position: 0 0;
}

/* Circular icon frame inside placeholder */
.placeholder-icon-frame {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.placeholder-icon-frame svg {
  color: var(--teal-600);
  opacity: 0.7;
}

.placeholder-product-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-align: center;
  max-width: 80%;
  line-height: 1.3;
}
```

### C.2. Discount Badge Styling (WS-04 / WS-12)

```css
.discount-badge {
  position: absolute;
  top: 0.65rem;
  right: 0.65rem;
  background: var(--accent-warm-bg);
  color: var(--accent-warm);
  border: 1px solid var(--accent-warm-border);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: var(--radius-xs);
  z-index: 2;
}

/* When both Rx badge and discount badge exist, offset Rx below */
.discount-badge + .rx-badge {
  top: 2.25rem;
}
```

### C.3. Featured Product Accent Strip (WS-04)

```css
/* Cards tagged "Más Vendido" or "Recomendado" get a warm top accent */
.product-card--featured {
  border-top: 3px solid var(--accent-warm);
}
```

Applied conditionally in `ProductCard.tsx` when `product.tag` is one of the featured tags.

### C.4. Mobile Category Scroll Affordance (WS-11)

```css
@media (max-width: 768px) {
  .category-pills {
    position: relative;
    -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
    mask-image: linear-gradient(to right, black 85%, transparent 100%);
  }
}
```

This creates a fade-out gradient on the right edge, signaling scrollability without adding any DOM elements.

### C.5. Footer Column Dividers (WS-09)

```css
@media (min-width: 993px) {
  .footer-grid-4col > div:not(:last-child) {
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    padding-right: 2rem;
  }
}
```

### C.6. Cart Badge Pulse Animation (WS-07)

```css
@keyframes badgePulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.cart-count-badge--pulse {
  animation: badgePulse 300ms ease-out;
}
```

Triggered in `Navbar.tsx` by toggling the `--pulse` class on the badge element when `cartCount` increases. Use a `useEffect` watching `cartCount` with a 300ms timeout to remove the class.

### C.7. Product Card Entrance Animation (WS-07)

```css
@keyframes cardEntrance {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.product-card--entering {
  animation: cardEntrance 300ms ease-out forwards;
}
```

Implementation approach: A lightweight `useIntersectionObserver` hook applied in `ProductList.tsx`. Each `.product-card` wrapper gets `opacity: 0` by default and receives the `--entering` class when it enters the viewport. Stagger is achieved via `animation-delay` computed from the card's index within its row: `style={{ animationDelay: `${(index % columnsPerRow) * 50}ms` }}`.

### C.8. Toast Progress Bar (WS-07)

```css
.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: var(--teal-600);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  animation: toastDrain 3s linear forwards;
}

@keyframes toastDrain {
  from { width: 100%; }
  to { width: 0%; }
}
```

Added as a child `<div className="toast-progress" />` inside each `.toast-item`. The 3s duration matches the existing toast auto-dismiss timeout.

### C.9. Manufacturer Line Styling (WS-04)

```css
.product-manufacturer-line {
  font-size: 0.725rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.2rem;
}
```

Rendered in `ProductCard.tsx` immediately above the product title `<h3>`:

```tsx
{product.manufacturer && (
  <span className="product-manufacturer-line">
    {product.category} · {product.manufacturer}
  </span>
)}
```

---

## 📎 Appendix D: Files Modified Summary

Complete list of files that will be touched during Phase 2 implementation:

| File | Change Type | Phase(s) |
| :--- | :--- | :--- |
| [`index.html`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/index.html) | Modify Google Fonts import (DM Sans + JetBrains Mono). Fix `theme-color` meta tag. | P2-1, P2-8 |
| [`src/index.css`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/index.css) | Add new tokens. Update font-family references. Add new CSS classes (discount badge, manufacturer line, placeholder texture, segmented control, entrance animation, toast progress, footer dividers, scroll affordance). Adjust font sizes. | P2-1 through P2-9 |
| [`src/types/index.ts`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/types/index.ts) | Add optional `manufacturer?: string` to `Product` interface. | P2-3 |
| [`src/data/products.ts`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/data/products.ts) | Add `manufacturer` values for 9 of 10 products. Strip all `images` arrays to `[]`. | P2-3, P2-4 |
| [`src/components/ProductCard.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/components/ProductCard.tsx) | Add discount badge. Add manufacturer line. Apply `--featured` class conditionally. Update low-stock logic. Improve placeholder with circular frame. | P2-3, P2-4 |
| [`src/components/ProductQuickView.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/components/ProductQuickView.tsx) | Add manufacturer line. Add discount badge. Improve placeholder fallback. | P2-3, P2-4 |
| [`src/components/Hero.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/components/Hero.tsx) | Replace repeated `CheckCircle2` with distinct icons per guarantee item. | P2-5 |
| [`src/components/Navbar.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/components/Navbar.tsx) | Add cart badge pulse class toggle. Add business hours text to trust badge area. | P2-7, P2-12 |
| [`src/components/Cart.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/components/Cart.tsx) | Replace generic `ShoppingBag` thumbnail with category-specific icons. Add trust line below checkout CTA. | P2-10 |
| [`src/components/Footer.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/components/Footer.tsx) | Update inline icon styles (solid teal bg, white icon). Add serving-since line. | P2-8 |
| [`src/components/ProductList.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/components/ProductList.tsx) | Add `IntersectionObserver` for card entrance animations. | P2-7 |
| [`src/components/CategoryFilter.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO-ui-ux-improvements/src/components/CategoryFilter.tsx) | Add item count chips to category labels. (CSS container changes are handled in `index.css`.) | P2-6 |
| **Test fixtures** (8 files listed in Appendix B) | Add `manufacturer` to mock Product objects. Add new test cases for discount badge, manufacturer line, and low-stock urgency. | P2-3 |
