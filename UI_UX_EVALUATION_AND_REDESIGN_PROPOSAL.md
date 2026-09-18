# UI/UX Brand Manual Overhaul Proposal — Pronto Insumos Storefront

## PRONTO Insumos Odontológicos — Brand Identity Alignment & Visual Enrichment

**Date:** September 2026  
**Scope:** Customer-facing storefront only (Admin site excluded)  
**Branch:** `feat/ui-ux-storefront-overhaul`  
**Status:** Implemented — palette, typography, hero lifestyle panel, promo strip, category showcase hub, and footer trust bar are live in the branch. Delivered photography is deployed under `public/assets/` (optimized for web delivery); this document is the design rationale of record.

---

## 🎯 1. Objective & Executive Summary

This proposal addresses two distinct but complementary goals:

1. **Brand Manual Compliance:** Migrate the storefront's color palette and typography from the current DM Sans + Navy/Teal system to the official brand identity: **Baloo Da 2 + Syne** typography and the **Intense Blue / Cayenne Red-Orange / Almond Cream / Limonade-Accent Green** color palette.

2. **Visual Enrichment ("De-Soulless-ification"):** Strategically insert brand assets, contextual imagery, and layout enhancements to transform the storefront from a "clean but empty template" into a credible, alive, commercially confident dental supply distributor.

> **IMPORTANT:** All changes respect the project's guardrails: **No external CSS frameworks. Vanilla CSS only. React 18 state. Zero test regressions.** No Tailwind, no Bootstrap, no Shadcn. The existing handcrafted CSS architecture in `src/index.css` is preserved and extended.

---

## 📊 2. Current State vs. Brand Manual — Gap Analysis

### 2.1 Color Palette Gap

| Role | Current Codebase | Brand Manual Target | Gap Severity |
| :--- | :--- | :--- | :--- |
| **Primary Brand Dark** | `--navy-900: #0b192c` / `--navy-950: #07101d` | **Intense Blue `#102748`** | Medium — close hue but different value |
| **Primary Action CTA** | `--teal-600: #088395` (teal) | **Limonade Cream `#ECEFBE` bg + Accent Green `#CAE400`** for CTAs | High — completely different hue family |
| **Warm Accent** | `--accent-warm: #b45309` (amber-700) | **Cayenne Red / Orange** (energetic warm accent) | Medium — similar intent, needs hue shift toward red-orange |
| **Background / Negative Space** | `--surface-bg: #f8fafb` (cool gray) | **Almond Cream / Frozen Water** (warm off-white) | Medium — needs warm shift |
| **Secondary Accent** | `--teal-50: #f0fdfa` | **Limonade Cream `#ECEFBE`** | Medium — teal tint to warm yellow-green tint |
| **Utility Bar / Footer Dark** | `--navy-950: #07101d` | **Intense Blue `#102748`** for dark anchors | Medium |

### 2.2 Typography Gap

| Role | Current Codebase | Brand Manual Target | Gap Severity |
| :--- | :--- | :--- | :--- |
| **Display / Headings** | `DM Sans` 800-900 | **Baloo Da 2** (rounded, bold, friendly geometric) | High — completely different typeface |
| **Body / Secondary Copy** | `DM Sans` 400-600 | **Syne Regular** (contemporary clean sans-serif) | High — completely different typeface |
| **Technical / Mono** | `JetBrains Mono` | JetBrains Mono *(keep — no brand guidance on mono)* | OK |

### 2.3 Visual Content Gap

| Area | Current State | Issue |
| :--- | :--- | :--- |
| **Hero Section** | Text + icon guarantee card on gradient white | No imagery, no product showcase, no brand personality |
| **Product Cards** | Dot-grid placeholders with Lucide icons | Sterile and repetitive — no texture differentiation |
| **Between-sections** | Nothing — hero to categories to grid to footer | No visual breaks, promotional banners, or lifestyle context |
| **Footer** | Pure text with icon value-props | No trust badges, no payment logos, no brand imagery |

---

## 🎨 3. Color Palette Overhaul — New Design Tokens

### 3.1 New Brand Token Map

The following replaces the current Navy/Teal tokens with the brand manual palette. Backward compatibility aliases are preserved during transition.

```css
:root {
  /* =====================================================
     BRAND MANUAL — PRIMARY COLOR PALETTE
     ===================================================== */

  /* Intense Blue — Primary brand foundation (structure, trust, reliability) */
  --brand-blue: #102748;
  --brand-blue-light: #1a3a6a;     /* Hover/interactive variant */
  --brand-blue-dark: #0b1a33;      /* Deepest anchor (utility bar, footer bg) */
  --brand-blue-muted: #1e3f70;     /* Secondary buttons, borders on dark */

  /* Cayenne Red-Orange — Energetic warm accent (high contrast, urgency, CTAs) */
  --brand-cayenne: #C84B31;        /* Primary warm accent */
  --brand-cayenne-light: #E06B50;  /* Hover state */
  --brand-cayenne-dark: #A33D28;   /* Active/pressed state */
  --brand-cayenne-bg: #FFF0EC;     /* Light warm background tint */
  --brand-cayenne-border: #F5C6B8; /* Warm badge border */

  /* Almond Cream / Frozen Water — Clean backgrounds and negative space */
  --brand-cream: #FDF8F3;          /* Page background (warm off-white) */
  --brand-frozen: #F0F4F8;         /* Card/input backgrounds (cool pale tint) */
  --brand-almond: #F5EDE4;         /* Slightly warmer card highlights */

  /* Limonade Cream and Accent Green/Yellow — CTA buttons, highlights */
  --brand-limonade: #ECEFBE;       /* CTA button backgrounds, pill highlights */
  --brand-accent-green: #CAE400;   /* Primary CTA accent, active indicators */
  --brand-accent-green-dark: #A8BF00; /* CTA hover state */
  --brand-accent-green-text: #3D4A00; /* Text on accent-green backgrounds */

  /* =====================================================
     BACKWARD COMPATIBILITY ALIASES (Transition period)
     ===================================================== */
  --navy-950: var(--brand-blue-dark);
  --navy-900: var(--brand-blue);
  --navy-800: var(--brand-blue-light);
  --navy-700: var(--brand-blue-muted);
  --teal-600: var(--brand-blue);
  --teal-700: var(--brand-blue-light);
  --teal-800: var(--brand-blue-dark);
  --teal-50:  var(--brand-limonade);
  --teal-100: #DDE1A0;

  /* Surface overrides */
  --surface-bg:    var(--brand-cream);
  --surface-card:  #ffffff;
  --surface-muted: var(--brand-frozen);

  /* Status and Accents — preserved */
  --success: #059669;
  --warning: #d97706;
  --danger:  #dc2626;
  --accent-warm: var(--brand-cayenne);
  --accent-warm-bg: var(--brand-cayenne-bg);
  --accent-warm-border: var(--brand-cayenne-border);
  --accent-info: #3b82f6;

  /* Border overrides */
  --border-subtle: #E5DDD4;
  --border-strong: #D4C9BB;
  --border-focus:  var(--brand-blue); /* WCAG 1.4.11 compliant focus contrast */
}
```

### 3.2 Specific Component Color Changes

| Component | Current Color | New Brand Color | Rationale |
| :--- | :--- | :--- | :--- |
| **Utility Bar bg** | `--navy-950: #07101d` | `--brand-blue-dark: #0b1a33` | Align to Intense Blue family |
| **Navbar brand icon bg** | `--navy-900: #0b192c` | `--brand-blue: #102748` | Exact brand-manual primary |
| **Navbar brand name** | `--navy-900` color | `--brand-blue: #102748` | Exact brand-manual primary |
| **Hero title accent span** | `--teal-600` (teal) | `--brand-cayenne: #C84B31` | Warm, energetic brand accent |
| **Hero pill tag bg** | `--teal-50` (light teal) | `--brand-limonade: #ECEFBE` | Limonade cream per manual |
| **Hero pill tag text** | `--teal-700` | `--brand-accent-green-text: #3D4A00` | Green-text on limonade bg |
| **`.btn-primary` (CTA buttons)** | `--teal-600` bg | `--brand-accent-green: #CAE400` bg with dark text | Brand manual: Accent Green/Yellow for CTAs |
| **`.btn-primary:hover`** | `--teal-700` | `--brand-accent-green-dark: #A8BF00` | Darker accent on hover |
| **`.btn-add-cart`** | `--teal-600` bg | `--brand-blue: #102748` bg | Solid, trustworthy add-to-cart |
| **Cart count badge** | `--teal-600` | `--brand-cayenne: #C84B31` | Warm urgency for cart count |
| **Category pill active** | White bg, navy text | White bg, `--brand-blue` text, accent-green indicator | Accent-green active indicator |
| **Category pill count chip active** | `--teal-50` bg | `--brand-limonade` bg | Limonade highlight |
| **Product tag chip "Mas Vendido"** | `--surface-muted` bg | `--brand-cayenne-bg` bg, `--brand-cayenne` text | Warm accent for featured tags |
| **Guarantee icons** | `--teal-600` | `--brand-blue: #102748` | Brand-aligned icon colors |
| **Footer value-prop icons** | `--teal-600` bg | `--brand-blue: #102748` bg | Intense Blue foundation |
| **Footer link hover** | `#38bdf8` (sky blue) | `--brand-accent-green: #CAE400` | On-brand accent hover |
| **Focus rings** | `--teal-600` | `--brand-blue: #102748` | Keeps ≥3:1 non-text contrast on light surfaces (WCAG 1.4.11); accent-green is reserved for fills |
| **Toast left border** | `--teal-600` | `--brand-accent-green: #CAE400` | Brand consistency |
| **Page background-color** | `#f8fafb` (cool gray) | `--brand-cream: #FDF8F3` (warm off-white) | Almond Cream per manual |
| **Card borders** | `#e2e8f0` (cool slate) | `#E5DDD4` (warm almond) | Warmer, brand-aligned |
| **meta theme-color** | `#088395` | `#102748` | Intense Blue in mobile chrome |

> **NOTE:** The shift from teal CTAs to accent-green CTAs is the most visually dramatic change. The brand manual explicitly specifies Limonade Cream/Accent Green-Yellow for CTA elements. The Cayenne Red-Orange takes over the "energy and urgency" role (discount badges, featured product accents, cart badge, promotional highlights).

---

## 🔤 4. Typography Overhaul — Baloo Da 2 + Syne

### 4.1 Google Fonts Import

Replace the current DM Sans + JetBrains Mono import in both `index.html` and `src/index.css`:

```html
<!-- New Google Fonts: Baloo Da 2 (display), Syne (body), JetBrains Mono (technical) -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Baloo+Da+2:wght@400;500;600;700;800&family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

### 4.2 CSS Token Updates

```css
:root {
  /* Typography — Brand Manual alignment */
  --font-display: 'Baloo Da 2', 'DM Sans', system-ui, sans-serif;
  --font-sans: 'Syne', 'DM Sans', system-ui, -apple-system, sans-serif;
  --font-body: 'Syne', 'DM Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

### 4.3 Font Application Map

| Element | Font Family | Weight | Size | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Brand wordmark "PRONTO"** | `--font-display` (Baloo Da 2) | 800 | 1.6rem | Rounded, bold, friendly geometry per manual |
| **Brand sub-badge "ODONTOLOGIA"** | `--font-display` (Baloo Da 2) | 700 | 0.65rem | Uppercase, letter-spacing 0.05em |
| **Hero headline h1** | `--font-display` (Baloo Da 2) | 800 | 2.6rem | Display face for maximum impact |
| **Hero description** | `--font-body` (Syne) | 400 | 1rem | Clean, legible secondary text |
| **Section headings** | `--font-display` (Baloo Da 2) | 700 | Various | Category headers, footer headings |
| **Product card title** | `--font-display` (Baloo Da 2) | 700 | 1.05rem | Product names get display face |
| **Product description** | `--font-body` (Syne) | 400 | 0.875rem | Body copy for descriptions |
| **Button text** | `--font-body` (Syne) | 600-700 | 0.925rem | Clean, readable CTA text |
| **All body text** | `--font-body` (Syne) | 400 | 0.875 to 1rem | Base body font-family |
| **REF codes, prices** | `--font-mono` (JetBrains Mono) | 700 | Various | Technical precision (unchanged) |
| **Brand slogan text** (if used) | `--font-body` (Syne) | 400 | 0.9rem | Per manual: Syne for slogan |

> **NOTE:** Baloo Da 2 is a rounded sans-serif with friendly, approachable geometry — very different from the geometric, sharp DM Sans. It gives "PRONTO" and headlines a distinctive, warm, branded character while Syne provides clean readability for body text. This dual-face system is exactly what the brand manual prescribes.

---

## 🖼️ 5. Visual Enrichment — Surgical Asset Insertion Strategy

This section proposes specific, practical image/asset placements to bring the storefront to life. Each proposal includes the asset description, the insertion point in the layout, and the design rationale.

> **IMPORTANT:** The goal is not to overload the page with imagery. It is to place assets at the approximately 5 key moments where a visitor's attention naturally rests, creating a rhythm of text, visual, text, visual that prevents the "wall of white cards" monotony.

### 5.1 Hero Section — Brand Lifestyle Image (Right Column)

**Current State:** The hero right column shows a text-only "Garantias Comerciales B2B" card.  
**Problem:** No visual anchor. The hero is pure text + icons. It feels like reading a document, not landing on a commercial site.

**Proposed Change:**

Replace the guarantee card with a **split layout**: a brand lifestyle image on the right half of the hero grid, with the guarantee items collapsed into a compact horizontal trust strip below the CTA buttons (on the left column).

**Asset Role & Placement:** Primary visual anchor of the storefront. Sits in the right column of the hero grid (`.hero-image-panel`, 540x405px on desktop, scaling down responsively on mobile), framed by a 12px border-radius, soft elevation shadow, and a subtle brand vignette.

**Detailed Photographic Specification:**
- **Layout & Composition:** 35° elevated oblique flatlay (isometric product perspective) with an asymmetric triangular dynamic balance. The dominant visual axis runs from bottom-left (foreground turbine head) to top-right (mouth mirror and instruments). Ample negative space is preserved in the top-right quadrant for visual calm and balance.
- **Subject Matter & Props:**
  - **Main Hero Subject:** High-speed dental air-turbine handpiece crafted from satin-brushed titanium and surgical-grade AISI 420 stainless steel. The miniature turbine head holds a precision diamond flame friction-grip bur. A visible optical glass fiber rod in the handpiece head emits a faint, cool white beam (simulating clinical readiness).
  - **Diagnostic Instruments:** Front-surface rhodium-coated mouth mirror (#5) angled slightly upward, reflecting a clean studio softbox highlight with zero ghosting; double-ended explorer (#23 shepherd's hook); graduated CPITN periodontal probe with laser-etched black millimeter rings (1-2-3-5-7-8-9-11mm); and College cotton pliers with serrated tips holding a sterile micro-cotton pellet.
  - **Background & Secondary Props:** Instruments arranged on a pristine medical-grade surgical drape in deep Intense Blue (`#102748`), showing delicate micro-woven textile fibers. In the distant, soft-focus background, a frosted dappen dish with translucent blue etching gel and a sterile blister pack with a Cayenne Red-Orange indicator tab.
- **Camera & Optical Mechanics:**
  - **Camera Emulation:** Medium-format digital camera (Hasselblad H6D-100c / Phase One IQ4 150MP aesthetic) for extreme resolving power, zero digital artifacts, and natural highlight rolloff.
  - **Lens:** 90mm f/2.8 Macro prime lens.
  - **Aperture & Depth of Field:** f/3.5 to f/4.0. Pin-sharp, razor-clean focus on the turbine head, bur facets, and mirror bevel, decaying smoothly into a buttery, creamy optical bokeh across the rear tubing connector and background drape.
  - **Exposure Settings:** ISO 64 (ultra-clean, noise-free), 1/160s, shutter sync with studio strobes.
- **Lighting Rig & Photometric Architecture:**
  - **Key Light:** 120cm overhead parabolic octabox fitted with double-diffusion silk and a 40° honeycomb grid at 45° camera-left, delivering soft, wraparound daylight (5600K) that sculpts the cylindrical curves of the metallic handpiece.
  - **Kicker / Rim Light:** Narrow 1x4 ft stripbox with 6000K clinical white light positioned low behind the instruments at camera-right, skimming the polished bevels with a hairline-thin, luminous chrome edge highlight.
  - **Fill Light:** Large matte white foam-core bounce card camera-right, generating a gentle 4:1 fill ratio that keeps metal knurling visible without murky shadows.
  - **Specular Reflection Control:** Polarized anti-glare filters used to eliminate blinding hotspots on polished chrome, creating long, elegant, unbroken linear highlights.
- **Color Grading & Brand Manual Alignment:**
  - **Primary Foundation:** Deep Intense Blue (`#102748`) drape and shadows with dark navy undertones (`#0B1A33`).
  - **Surface Tones:** Brushed titanium silver, surgical steel chrome, and neutral white daylight highlights (5400K).
  - **Accents:** Delicate Limonade Cream (`#ECEFBE`) reflected in secondary glass highlights; warm Cayenne Red-Orange (`#C84B31`) micro-accent on an indicator ring.
  - **Grading Profile:** Clean commercial medical editorial LUT, neutral skin-safe balance, deep true blacks without crushing, zero chromatic aberration or artificial HDR halos.
- **Negative Constraints (AI Model Guardrails):**
  - No human faces, no open mouths, no teeth, no gums, no bloody surgical instruments, no medical gore.
  - No floating or distorted tools, no warped impossible geometry, no 6-fingered glove hands.
  - No watermarks, no illegible brand typography, no cartoonish rendering, no cheap plastic toy sheen.

**Turnkey Generative AI Model Prompt (Midjourney v6.1 / Flux.1 Pro / Imagen 3):**
```text
Ultra-realistic commercial product photography of an organized dental instrument layout, elevated 35-degree oblique flatlay. A high-speed titanium dental turbine handpiece with diamond bur and subtle fiber-optic light, alongside a front-surface rhodium mouth mirror, stainless steel dental explorer, and precision College tweezers arranged neatly on a dark intense blue medical-grade fabric surface (#102748). Shot on Hasselblad H6D-100c, 90mm f/3.2 macro lens, shallow depth of field with razor-sharp focus on the turbine head and smooth bokeh falloff. Studio lighting: large diffused overhead octabox creating soft linear reflections on metallic cylindrical surfaces, subtle cool rim lighting on chrome edges. Clean editorial clinical aesthetic, immaculate textures, brushed surgical steel AISI 420, Chilean dental distributor style, no humans, no teeth, no blood, 8k resolution, hyper-detailed, photorealistic --ar 4:3 --v 6.1 --style raw
```

**Deployed Asset:** `public/assets/hero-dental-instruments.jpg` (1200×896, optimized for web delivery).

**Layout Change in `Hero.tsx`:**
- The right column (`.hero-card-preview`) becomes a contained image panel with `border-radius: var(--radius-md)`, subtle shadow, and `overflow: hidden`
- The 4 guarantee items move to a compact inline trust strip beneath the CTA buttons in the left column, rendered as small icon + short text pairs
- The image gets a subtle CSS gradient overlay from transparent to `rgba(16, 39, 72, 0.20)` at the bottom, giving it a brand-tinted finish

**CSS Additions:**
```css
.hero-image-panel {
  width: 100%;
  height: 100%;
  min-height: 320px;
  border-radius: var(--radius-md);
  overflow: hidden;
  position: relative;
  box-shadow: var(--shadow-md);
}

.hero-image-panel img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hero-image-panel::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 40%;
  background: linear-gradient(to top, rgba(16, 39, 72, 0.20), transparent);
  pointer-events: none;
}
```

---

### 5.2 Promotional Banner Strip — Between Hero and Category Filter

**Current State:** The hero ends and the category filter begins immediately. No visual break, no promotional messaging.

**Proposed Change:** Insert a horizontal promotional strip between the Hero and the Category Filter. This is a narrow full-width band with the brand slogan and key value propositions.

**Content (3 items displayed horizontally):**
1. **"Insumos a un click de distancia"** (Official brand slogan per the manual)
2. **"Despacho Express Melipilla y RM"**
3. **"Factura Electronica SII - 19% IVA"**

**Visual Treatment & Graphic Asset (`promo-strip-bg.webp`):**
- **Base Background:** `--brand-blue: #102748` (Intense Blue).
- **Text & Accents:** High-contrast crisp white typography with `--brand-limonade: #ECEFBE` chips and `--brand-accent-green: #CAE400` Lucide SVG icons.
- **Typography:** Syne 600, 0.85rem.
- **Atmospheric Background Asset Specification:**
  - **Asset Role:** Ultra-wide panoramic graphic texture (`promo-strip-bg.webp`) layered behind the strip with `background-size: cover; background-position: center; mix-blend-mode: overlay; opacity: 0.22`.
  - **Composition & Layout:** 21:9 panoramic ratio. Deep Intense Blue (`#102748`) to Midnight Obsidian (`#0B1A33`) horizontal gradient, traversed by micro-thin, organic optical fiber light lines and a faint, sterile hexagonal medical lattice.
  - **Optics & Lighting:** Anamorphic cinematic bokeh (Cooke Anamorphic 35mm simulation), horizontal lens flares in soft chartreuse green (`#CAE400`) and cool cyan, delicate out-of-focus crystalline particles floating in volumetric depth. Zero high-contrast hotspots to preserve WCAG AAA text legibility (>7:1 contrast).
  - **Turnkey Generative AI Model Prompt:**
    ```text
    Panoramic abstract luxury medical background texture, ultra-wide 21:9 ratio. Deep intense navy blue (#102748) and midnight blue (#0B1A33) gradient with subtle, elegant volumetric optical fiber light waves and faint geometric micro-mesh. Whisper-soft glowing accents in subtle chartreuse green (#CAE400) and soft cyan, smooth horizontal light streaks, out-of-focus crystalline particles with deep creamy bokeh. Premium commercial technology texture, clean minimalist clinical design, high-end sterile dental equipment ambiance, no text, no logos, no objects, seamless dark backdrop for UI text overlay, 8k --ar 21:9 --v 6.1 --style raw
    ```
  - **Deployed Asset:** `public/assets/promo-strip-bg.jpg` (1000×558, optimized for web delivery).

**Layout:** A new `<div className="promo-strip">` inserted in `App.tsx` between `<Hero>` and `<CategoryFilter>`, or alternatively as the last child inside the Hero section.

**CSS:**
```css
.promo-strip {
  background: var(--brand-blue);
  color: #ffffff;
  padding: 0.85rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2.5rem;
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: var(--radius-sm);
  margin-bottom: 2rem;
}

.promo-strip-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
}

.promo-strip-item svg {
  color: var(--brand-accent-green);
}
```

---

### 5.3 Category Contextual Accent — Slogan in Filter Area

**Current State:** The category pills sit inside a muted gray container with no visual context.

**Proposed Change:** A lighter touch — display the brand slogan "Insumos a un click de distancia" as a small italicized tagline in `--brand-cayenne` color, positioned to the right of the results count in the filter controls row.

Alternatively, if the promo strip (5.2) already conveys this, skip this insertion to avoid redundancy.

---

### 5.4 Product Grid — Category Section Dividers with Contextual Headers

**Current State:** All products render in a flat grid regardless of category. When browsing "Todos los Insumos", there is no visual break between instruments, diagnostics, materials, and sterilization products.

**Proposed Change:** When showing "Todos los Insumos" (category = 'all') or when browsing category hubs, insert lightweight category section headers with contextual, high-end photography assets. These visual assets provide instant recognition and tactile credibility.

> **Chilean Category Taxonomy Alignment (reconciled with PR #6):**  
> The catalog uses standardized Chilean distributor categories (`src/types/index.ts`):
> 1. `INSTRUMENTAL Y ACCESORIOS` (Scissors)
> 2. `DESECHABLES, ESTERILIZACION Y DESINFECCION` (ShieldCheck)
> 3. `OPERATORIA` (Wrench)
> 4. `ENDODONCIA` (Activity)
> 5. `HIGIENE BUCAL` (Sparkles)
> 6. `IMPRESION` (Layers)

**Category Asset Photographic Dossiers & Delivered Staged Assets:**

#### 5.4.1 Categoría: Instrumental y Accesorios (`INSTRUMENTAL Y ACCESORIOS`)
- **UI Layout & Role:** 16:9 banner or 120x80px card thumbnail. Anchors turbine, micromotor, contra-angle, forceps, and scalpel product listings.
- **Deployed Asset:** `public/assets/cat-instrumental.jpg` (800×447, optimized for web delivery)
- **Composition & Camera:** 20° low-angle dynamic hero macro perspective. The titanium handpiece rests diagonally across a warm Almond Cream (`#F5EDE4`) architectural plinth.
- **Subject & Mechanical Details:** High-speed air-turbine handpiece in satin-matte titanium and surgical stainless steel, quadruple water-spray ports at the head clamping a micro-fluted diamond fissure bur. Precision push-button chuck mechanism with crisp machined chamfers. Beside it, a double-ended stainless steel Bein root elevator with knurled ergonomic handle.
- **Optics & Lighting:** 90mm f/4 Macro lens, focus-stacked for pin-sharp edge-to-edge metallic knurling. Automotive studio strip lighting (dual 1x4 ft diffused softboxes) creating crisp, continuous white highlight ribbons along the titanium body. Dark Intense Blue (`#102748`) shadow falloff.
- **Turnkey Generative AI Prompt:**
  ```text
  High-end commercial macro product photograph of a titanium dental high-speed turbine handpiece and surgical stainless steel elevator. Low-angle 20-degree hero perspective, resting on a matte off-white architectural pedestal. Intricate knurled metal handle texture, precision tungsten carbide dental bur clamped in the push-button turbine head, satin brushed finish. Shot on Sony A7R V with 90mm f/4 Macro G Master lens. Studio rim lighting with long softbox reflection strips, dark intense blue shadows, sterile warm clinical palette (#102748 and #FDF8F3). Industrial design catalog aesthetic, hyper-detailed, clean reflection, no fingerprints, no dust, 8k resolution --ar 16:9 --v 6.1 --style raw
  ```

#### 5.4.2 Categoría: Endodoncia y Diagnóstico Clínico (`ENDODONCIA`)
- **UI Layout & Role:** 16:9 banner or 120x80px card thumbnail. Anchors apex locators, endodontic files, intraoral mirrors, probes, and diagnostics.
- **Deployed Asset:** `public/assets/cat-diagnostico-endodoncia.jpg` (800×447, optimized for web delivery)
- **Composition & Camera:** 45° clinical tabletop oblique perspective. Golden ratio composition centering on a front-surface rhodium mouth mirror reflecting an operating lamp beam.
- **Subject & Mechanical Details:** Rhodium front-surface mirror (#5) showing true reflection with zero ghosting. The circular mirror face reflects an overhead ring of surgical LED daylight. Adjacent: Shepherd's hook dental explorer (#23) and a periodontal Williams probe with crisp, laser-etched black millimeter depth markings (1-2-3-5-7-8-9-10mm).
- **Optics & Lighting:** 85mm f/2.8 Prime, shallow depth of field focusing sharply on the mirror edge and probe markings. High-key clinical lighting: 90cm overhead beauty dish producing a clean circular catchlight, filled with a cool white reflector for an immaculate, sterile ambiance.
- **Turnkey Generative AI Prompt:**
  ```text
  Editorial product photograph of diagnostic dental examination instruments on a frosted tempered glass clinical surface. Center focus on a circular front-surface rhodium dental mouth mirror reflecting a clean ring of LED surgical light, paired with a stainless steel shepherd hook explorer and a graduated periodontal probe with laser-etched black millimeter markings. 45-degree angle, Canon EOS R5, 85mm f/2.8 lens, delicate depth of field, high-key clinical studio lighting, crisp specular reflections, warm almond and sterile white palette with intense blue undertones (#102748), immaculate cleanliness, Swiss watchmaker precision, 8k, photorealistic --ar 16:9 --v 6.1 --style raw
  ```

#### 5.4.3 Categoría: Operatoria y Materiales Restauradores (`OPERATORIA`)
- **UI Layout & Role:** 16:9 banner or 120x80px card thumbnail. Anchors composites, adhesives, etching gels, curing lights, and glass ionomers.
- **Deployed Asset:** `public/assets/cat-operatoria-estetica.jpg` (800×447, optimized for web delivery)
- **Composition & Camera:** 30° close-up beauty macro shot. Diagonal flow showing the precision dispensing of aesthetic restorative nano-hybrid composite.
- **Subject & Mechanical Details:** Matte charcoal-black light-shielded composite syringe with screw dial. A tiny, immaculate bead of translucent tooth-colored aesthetic resin (shade A2) is extruded from the curved metal dispensing cannula, demonstrating natural optical opalescence. Beside it: 3 ceramic tooth tabs from a VITA classical shade guide (A1, A2, B1) mounted on a chrome holder, and an amber glass bonding bottle with a micro-applicator brush.
- **Optics & Lighting:** 105mm Macro f/3.5, 1:1 reproduction. Backlit transillumination through the resin droplet highlighting true enamel translucency. Warm Almond Cream (`#FDF8F3`) background with Cayenne Red (`#C84B31`) label accents.
- **Turnkey Generative AI Prompt:**
  ```text
  Cinematic macro product photograph of aesthetic dental restorative materials. An ergonomic black composite syringe dispenses a tiny translucent droplet of A2 enamel-shade resin on a glass slab, illuminated with backlighting that reveals natural tooth-like opalescence and translucency. Nearby are ceramic dental shade guide tabs (A1, A2, B1) on a chrome holder and a miniature amber bonding bottle with a micro-applicator brush. 105mm f/3.5 macro lens, Nikon Z9, extreme micro-detail, clinical editorial lighting with warm almond cream (#FDF8F3) and subtle cayenne red accents, high-end restorative dentistry aesthetic, pristine, no dust, photorealistic 8k --ar 16:9 --v 6.1 --style raw
  ```

#### 5.4.4 Categoría: Desechables, Esterilización y Desinfección (`DESECHABLES, ESTERILIZACION Y DESINFECCION`)
- **UI Layout & Role:** 16:9 banner or 120x80px card thumbnail. Anchors autoclave pouches, chemical indicators, cassettes, barrier films, and clinical PPE.
- **Deployed Asset:** `public/assets/cat-esterilizacion-bioseguridad.jpg` (800×447, optimized for web delivery)
- **Composition & Camera:** 40° overhead clinical flatlay. Emphasizes sealed hygiene, ISO compliance, and medical security.
- **Subject & Mechanical Details:** Transparent medical-grade self-seal autoclave pouch (Tyvek paper and multi-layer clinical film) with chevron heat-seal, enclosing sterilized surgical steel instruments. Clearly visible multi-parameter chemical process indicator strip displaying successful sterilization change (pink to brown). A pair of textured cobalt-blue nitrile examination gloves folded alongside a perforated stainless steel DIN sterilization cassette with medical silicone instrument racks.
- **Optics & Lighting:** 50mm f/4 on full frame for deep focus. 5600K diffuse daylight softbox with polarizing screen to eliminate glare on the plastic pouch film, preserving crystal-clear visibility of the tools inside.
- **Turnkey Generative AI Prompt:**
  ```text
  High-end commercial flatlay photograph of dental sterilization and infection control supplies. A transparent medical-grade autoclave sterilization pouch sealed with chevron edge containing surgical steel instruments, showing a color-changing chemical indicator strip. Adjacent to a perforated stainless steel sterilization cassette with medical silicone racks, and a pair of textured medical nitrile gloves in rich cobalt blue. Shot on Hasselblad, 50mm f/4 lens, overhead 40-degree angle, balanced diffuse daylight clinical illumination, zero glare on transparent film, immaculate hygienic atmosphere, pure colors (#102748, #F0F4F8), high-resolution commercial medical catalog --ar 16:9 --v 6.1 --style raw
  ```

> **NOTE:** In the storefront layout, these visual assets can be integrated into the product grid category headers, category pill hover previews, or the category showcase cards. Additional categories (`HIGIENE BUCAL` and `IMPRESION`) share the same clinical visual design tokens and background gradient cards.

---

### 5.5 Footer — Trust Badge Visual Bar

**Current State:** The footer has text-based value-prop cards and pure text columns. No visual trust assets.

**Proposed Change:** Add a horizontal trust badge row at the bottom of the footer, just above the copyright bar. This row shows recognizable visual assets:

**Asset Role & Layout:** Displayed as a horizontal row of 4 visual trust chips above the copyright bar (`.footer-trust-badges`). Built with responsive wrapping, dark glassmorphism styling, and glowing SVG or rendered 3D asset integration.

**Detailed Asset Specifications & Generative Prompts:**

1. **Mercado Pago Chile Verified Gateway Seal (`badge-mercadopago.webp`):**
   - **Visual Design:** Sleek modern security shield rendered in brushed titanium with a glowing Accent Green (`#CAE400`) verified checkmark at the center, framed by an ultra-clean circular lock motif. Crisp, professional micro-typography reading "Pagos Seguros • Mercado Pago Chile".
   - **Lighting & Texture:** Subtle 3D volumetric glassmorphism, soft cyan/green rim glow, transparent PNG or dark navy backdrop (`#0B1A33`).
   - **Turnkey Prompt:**
     ```text
     3D commercial render of a security payment trust badge, dark intense blue glassmorphism style. A modern metallic shield icon with brushed silver bevels and a vibrant neon chartreuse green (#CAE400) checkmark at the center, surrounded by clean minimalist typography reading "MERCADO PAGO CHILE - PAGO SEGURO". Soft studio rim lighting, pristine dark background (#0B1A33), high-end fintech e-commerce seal, 8k render, octane render style --ar 3:1 --v 6.1
     ```

2. **SII Factura Electrónica 19% IVA Tax Seal (`badge-sii-chile.webp`):**
   - **Visual Design:** Formal legal document compliance seal. Stylized legal invoice icon embossed with a certified digital tax ribbon stamp, subtle Chilean red and blue accent threads, and crisp typography: "Facturación Electrónica SII • 19% IVA Crédito Fiscal".
   - **Turnkey Prompt:**
     ```text
     3D modern institutional certification seal for Chilean tax compliance (SII). A crisp digital document icon with a gold and deep blue embossed wax seal emblem, subtle Chilean flag color accents (red, white, blue), clean typography reading "FACTURA ELECTRONICA SII - 19% IVA CHILE". Premium corporate trust badge, dark frosted glass background, octane render, pristine precision, 8k --ar 3:1 --v 6.1
     ```

3. **Logística Express RM y Melipilla Badge (`badge-despacho-express.webp`):**
   - **Visual Design:** Courier delivery badge featuring a streamlined logistics delivery van silhouette with energetic motion rays and regional destination pin: "Despacho Express • Melipilla & Región Metropolitana (Starken / Chilexpress)".
   - **Turnkey Prompt:**
     ```text
     Modern minimalist 3D logistics trust badge. A stylized white and metallic express delivery van with dynamic speed lines and a green location pin, sleek dark blue frosted glass card, typography reading "DESPACHO EXPRESS MELIPILLA Y RM - STARKEN CHILEXPRESS". Clean e-commerce fulfillment badge, soft volumetric lighting, 8k --ar 3:1 --v 6.1
     ```

4. **Registro Sanitario ISP Dispositivos Médicos (`badge-isp-chile.webp`):**
   - **Visual Design:** Medical regulatory authority badge with a medical cross and caduceus shield in chrome and Accent Green, inscribed: "Dispositivos Médicos • Registro Sanitario ISP Chile".
   - **Turnkey Prompt:**
     ```text
     High-end 3D medical regulatory compliance badge. A polished chrome medical cross inside a protective shield with subtle emerald green highlights, set on a dark navy glassmorphic card (#102748), typography reading "REGISTRO SANITARIO ISP CHILE - DISPOSITIVOS MEDICOS". Clean clinical certification seal, pristine studio lighting, 8k --ar 3:1 --v 6.1
     ```

**CSS:**
```css
.footer-trust-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  padding: 1.5rem 0;
  margin-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.footer-trust-badge {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0.4rem 0.85rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 600;
}

.footer-trust-badge svg {
  color: var(--brand-accent-green);
  flex-shrink: 0;
}
```

---

### 5.6 Product Card Placeholder Enhancement — Brand-Tinted Backgrounds

**Current State:** All product card placeholders use the same dot-grid pattern on `#f8fafc` gray, regardless of category.

**Proposed Change:** Apply category-specific subtle color tints to the placeholder backgrounds:

| Reconciled Category (PR #6 Taxonomy) | Lucide Icon | Current Bg | New Brand Bg Tint | Clinical Mood |
| :--- | :--- | :--- | :--- | :--- |
| `INSTRUMENTAL Y ACCESORIOS` | `Scissors` | Gray dot-grid | Light Intense Blue tint: `#E8EDF5` | Cool, surgical precision |
| `OPERATORIA` | `Wrench` | Gray dot-grid | Light Almond Cream: `#F9F3EC` | Warm, restorative aesthetics |
| `DESECHABLES, ESTERILIZACION Y DESINFECCION` | `ShieldCheck` | Gray dot-grid | Light Frozen Water: `#EDF1F5` | Sterile, clinical hygiene |
| `ENDODONCIA` | `Activity` | Gray dot-grid | Light Limonade tint: `#F5F7E8` | Analytical, specialized care |
| `HIGIENE BUCAL` | `Sparkles` | Gray dot-grid | Light Fresh Mint: `#E6F4F1` | Fresh, prophylactic care |
| `IMPRESION` | `Layers` | Gray dot-grid | Light Warm Sand: `#FAF0E6` | Molds, models and prosthetics |

**CSS Implementation:** Update the `.media-placeholder-box.gradient-*` selectors to use brand-aligned tints:

```css
.media-placeholder-box.gradient-teal {
  background: radial-gradient(circle, #B8C6D9 1.2px, transparent 1.2px), #E8EDF5;
  background-size: 16px 16px;
}

.media-placeholder-box.gradient-blue {
  background: radial-gradient(circle, #D5D9B0 1.2px, transparent 1.2px), #F5F7E8;
  background-size: 16px 16px;
}

.media-placeholder-box.gradient-amber {
  background: radial-gradient(circle, #D9CDBE 1.2px, transparent 1.2px), #F9F3EC;
  background-size: 16px 16px;
}

.media-placeholder-box.gradient-slate,
.media-placeholder-box.gradient-cyan {
  background: radial-gradient(circle, #C5CDD8 1.2px, transparent 1.2px), #EDF1F5;
  background-size: 16px 16px;
}
```

**Placeholder Icon & Taxonomy Reconciliation in `ProductCard.tsx`:**
The legacy `ICON_BY_CATEGORY` dictionary in `src/components/ProductCard.tsx` mapped only the legacy English categories (`Diagnostics`, `Instruments`, `Materials`, `Sterilization`). In Phase 1/2, reconcile this dictionary to support the official Chilean categories (`Scissors`, `ShieldCheck`, `Wrench`, `Activity`, `Sparkles`, `Layers`) matching `CategoryFilter.tsx`, preventing card icons from falling back to generic `Activity`.

```css
.placeholder-icon-frame {
  background: var(--brand-frozen);
}
.placeholder-icon-frame svg {
  color: var(--brand-blue);
}
```

#### 5.6.2 Master E-Commerce Product Packshot Template (`product-packshot-template.webp`)

For real product imagery or AI-generated storefront packshots, all product cards must follow a rigorous, uniform photographic template to maintain catalog consistency.

- **UI Role & Constraints:** 1:1 square aspect ratio (1200x1200px rendered down to 280x280px retina). Subject must fit within an 80% inner safe-zone bounding box to avoid collision with top-left discount badges (`-15%`) and bottom-right quick-add buttons.
- **Composition & Angle:** 15° low-angle eye-level hero perspective. The product (e.g. contra-angle handpiece or composite syringe kit) is centered, accompanied by its branded retail packaging box standing upright slightly behind it.
- **Optics & Mechanics:** 85mm or 100mm Macro lens stopped down to f/8.0 for full front-to-back focal sharpness (deep commercial depth of field, zero blurry edges). Medium format digital back emulation for pristine micro-contrast.
- **Lighting Setup:** Dual vertical strip softboxes flanking the product at 45°, creating balanced linear specular highlights on curved surfaces. Large overhead diffusion panel for soft top-fill. Ground plane features a delicate, realistic contact ambient shadow fading out softly.
- **Backdrop & Grading:** Clean infinity cyclorama background with an ultra-subtle radial gradient from warm Almond Cream (`#FDF8F3`) at the center to pale Frozen Water (`#F0F4F8`) at the outer edges. Clean neutral white balance (5500K).
- **Turnkey Generative AI Prompt:**
  ```text
  Commercial e-commerce studio product packshot of dental clinic equipment, 1:1 square ratio. Centered composition with balanced negative space: an unboxed precision contra-angle dental handpiece in satin surgical stainless steel, standing next to its minimalist medical retail product packaging box in intense navy blue (#102748) and clean white typography. Shot on Hasselblad H6D, 85mm f/8 lens for complete edge-to-edge sharpness, professional catalog lighting with diffused softboxes, clean contact shadow underneath, subtle radial gradient backdrop from warm almond cream (#FDF8F3) to pale frozen water tint (#F0F4F8). Sterile, immaculate retail dental supply quality, 8k, photorealistic --ar 1:1 --v 6.1 --style raw
  ```

---

### 5.7 Navbar Brand Identity Reinforcement

**Current State:** The brand uses a generic Activity Lucide icon in a navy square + "PRONTO" text + "ODONTOLOGIA" badge.

**Proposed Changes:**

- **Brand name typography:** Switch `.brand-name` to `--font-display` (Baloo Da 2) at weight 800, size 1.6rem. The rounded, friendly geometry of Baloo Da 2 will immediately give "PRONTO" a distinctive branded character instead of the generic geometric DM Sans.

- **Brand icon wrapper:** Change background from `--navy-900` to `--brand-blue: #102748`. The icon inside should use the `--brand-accent-green: #CAE400` color instead of white, creating a vibrant brand mark.

- **Brand sub-badge "ODONTOLOGIA":** Change background from teal-50 to `--brand-limonade: #ECEFBE`, text color to `--brand-accent-green-text: #3D4A00`, border to `#DDE1A0`.

- **Brand slogan addition (optional):** Below the brand badge, add a small "Insumos a un click de distancia" in Syne 400 italic at 0.65rem in `--text-muted`. This reinforces the brand tagline. Only include on desktop (hide below 992px).

---

## 📐 6. Component-Level Change Specifications

### 6.1 Files Modified

| File | Changes | Phase |
| :--- | :--- | :--- |
| `index.html` | Google Fonts import (Baloo Da 2 + Syne). Update theme-color to `#102748`. | P1 |
| `src/index.css` | New color tokens. Font family overrides. All component color updates. New CSS classes for promo strip, hero image panel, footer trust badges, placeholder tints. | P1-P3 |
| `src/components/ProductCard.tsx` | Reconcile `ICON_BY_CATEGORY` to support the 6 Chilean dental categories from PR #6; update typography and badge colors. | P1-P2 |
| `src/components/Hero.tsx` | Restructure to image panel layout. Move guarantee items to trust strip. | P2 |
| `src/components/Navbar.tsx` | Brand slogan line (optional). Icon color update (handled via CSS). | P1 |
| `src/components/Footer.tsx` | Add trust badge row. Update footer link hover color reference. | P3 |
| `src/App.tsx` | Insert promo strip component between Hero and CategoryFilter. | P2 |

> **Multi-Page CSS Isolation Guardrail (reconciled with PR #6):**  
> Storefront CSS changes in `src/index.css` apply exclusively to `index.html`. The admin portal introduced in PR #6 lives on `/admin` (`admin.html`) with its own scoped styles in `src/admin/admin.css`. Storefront styling changes must never bleed into or alter `src/admin/admin.css`.

### 6.2 New Component: PromoStrip

A lightweight stateless component for the promotional strip:

```tsx
// src/components/PromoStrip.tsx
import { Package, Truck, FileCheck } from 'lucide-react'

export default function PromoStrip() {
  return (
    <div className="promo-strip">
      <div className="promo-strip-item">
        <Package size={16} />
        <span>Insumos a un click de distancia</span>
      </div>
      <div className="promo-strip-item">
        <Truck size={16} />
        <span>Despacho Express Melipilla y RM</span>
      </div>
      <div className="promo-strip-item">
        <FileCheck size={16} />
        <span>Factura Electronica SII - 19% IVA</span>
      </div>
    </div>
  )
}
```

---

## 🛠️ 7. Implementation Phases

All phases respect the project guardrails: Vanilla CSS only, React 18 state, zero test regressions.

| Phase | Target | Key Actions | Risk | Test Impact |
| :--- | :--- | :--- | :--- | :--- |
| **P1** | **Typography + Colors (Foundation)** | Replace Google Fonts import with Baloo Da 2 + Syne. Update all CSS tokens (colors, fonts). Update theme-color meta tag. This is the "big bang" that touches index.html and index.css only. | Low | Zero — CSS-only changes |
| **P2** | **Hero + Promo Strip** | Restructure Hero.tsx (image panel + trust strip). Create PromoStrip.tsx. Add to App.tsx. Add hero image CSS. | Medium | Hero test may need mock update for new structure |
| **P3** | **Footer Trust Badges + Placeholder Tints** | Add trust badge row to Footer.tsx. Update placeholder CSS tints. | Low | Footer test may need update for new DOM elements |
| **P4** | **Polish + Mobile Responsive QA** | Verify all responsive breakpoints with new fonts/colors. Adjust sizes as needed for Baloo Da 2 metrics (it runs wider than DM Sans). Test category scroll, hero image scaling. | Low-Med | Zero — CSS adjustments |

---

## ❓ 8. Open Questions and Decisions Required

### Q1: Hero Image — Source Strategy
The hero requires a brand lifestyle photograph. Options:
- **A)** You provide or commission a real product photo
- **B)** I generate a representative hero image using the image generation tool during implementation
- **C)** Use a high-quality placeholder image initially and replace with real photography later

Recommendation: Option B for the initial implementation, with a plan to replace with real photography (Option A) for production launch.

### Q2: CTA Button Color — Accent Green or Cayenne?
The brand manual specifies Limonade/Accent Green for CTAs (like "Contactanos"). However, the bright `#CAE400` green-yellow may feel unusual for "Agregar al Carro" (add-to-cart) buttons. Options:
- **A)** Use `#CAE400` accent-green for ALL CTAs (strict brand compliance)
- **B)** Use `#CAE400` for primary hero/contact CTAs, but use `--brand-blue: #102748` (Intense Blue) for add-to-cart buttons
- **C)** Use `--brand-cayenne: #C84B31` (warm red-orange) for add-to-cart, `#CAE400` for hero CTAs

Recommendation: Option B — Accent Green for hero and WhatsApp CTAs (the "Contactanos" type buttons), Intense Blue for commerce actions (add-to-cart, checkout). This gives the site color variety while remaining on-brand.

### Q3: Category Section Dividers (5.4)
The category section dividers in the product grid are the most complex structural change. Should we:
- **A)** Include them in this phase (requires ProductList.tsx restructure)
- **B)** Defer to a future phase and rely on the promo strip for visual rhythm
- **C)** Implement a simplified version (just a text header, no imagery)

Recommendation: Option B for now — the promo strip + placeholder tints + hero image already add significant visual variety. Section dividers can come later.

### Q4: Brand Slogan in Navbar (5.7)
Adding the slogan "Insumos a un click de distancia" below the brand badge:
- **A)** Include it (adds personality, reinforces tagline)
- **B)** Skip it (navbar already has enough elements)

Recommendation: Option A — it is very lightweight (a single span) and reinforces the brand tagline from the manual.

### Q5: Cayenne Red Exact Value
The brand manual says "Cayenne Red / Orange" but does not provide an exact hex. I have proposed `#C84B31` which is a warm cayenne-red with orange undertones. Should I:
- **A)** Use `#C84B31` as proposed
- **B)** Use a different value if you have the exact brand hex from the designer

---

## ✅ 9. Verification Plan

### Automated Tests
```bash
pnpm test          # All 330 unit and integration tests must pass without regressions
pnpm build         # Multi-page bundle build validation (dist/index.html & dist/admin.html)
```

### Visual Verification Checklist
- Baloo Da 2 loads correctly for headings/brand (check Network tab for Google Fonts)
- Syne loads correctly for body text
- Intense Blue (`#102748`) is the dominant dark color (navbar, utility bar, footer)
- Accent Green (`#CAE400`) appears on CTA buttons
- Cayenne Red-Orange appears on discount badges, featured card strips, cart badge
- Page background is warm cream (`#FDF8F3`) not cool gray
- Borders are warm-toned, not cool slate
- Hero section shows lifestyle image panel (or placeholder)
- Promo strip shows slogan and 3 value propositions
- Footer trust badges appear above copyright bar
- Product placeholders have category-specific tints
- Mobile responsive: fonts render at appropriate sizes
- Mobile responsive: promo strip wraps or scrolls gracefully

### Cross-Browser Spot Check
- Chrome (primary), Firefox, Safari (macOS), Edge
- Mobile: Chrome Android, Safari iOS

---

## 📊 10. Before/After Summary Table

| Aspect | Current State | After Brand Overhaul |
| :--- | :--- | :--- |
| **Primary dark** | Navy `#0b192c` / `#07101d` | Intense Blue `#102748` / `#0b1a33` |
| **CTA buttons** | Teal `#088395` | Accent Green `#CAE400` (hero) / Intense Blue `#102748` (cart) |
| **Warm accent** | Amber `#b45309` | Cayenne Red-Orange `#C84B31` |
| **Page background** | Cool gray `#f8fafb` | Warm cream `#FDF8F3` |
| **Display font** | DM Sans 800 | **Baloo Da 2** 800 (rounded, friendly) |
| **Body font** | DM Sans 400-600 | **Syne** 400-600 (contemporary, clean) |
| **Hero section** | Text + icon card, no imagery | Lifestyle image panel + compact trust strip |
| **Between hero and grid** | Nothing | Brand slogan promo strip |
| **Product placeholders** | Uniform gray dot-grid | Category-specific brand-tinted backgrounds |
| **Footer** | Text only, no trust assets | Visual trust badge row (Mercado Pago, SII, carriers) |
| **Brand personality** | "Competent template" | "Established dental supplier with warm, branded identity" |

---

> **Bottom Line:** This overhaul brings the storefront into compliance with the professional brand manual while surgically inserting visual assets at the 5 key dead zones that make the site feel "soulless." The result should be a warm, commercially confident, distinctively branded dental supply storefront that a clinic manager in Melipilla recognizes as an established, trustworthy supplier — not a template.
