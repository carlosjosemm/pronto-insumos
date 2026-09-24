# Tasks 2.6 & 2.7: Checkout Modal UX Overhaul + Storefront Search Submit Fix

**Branch:** `feat/task-2.6-2.7-checkout-search-ux` (cut from `main` @ `56265ba`, up to date with `origin/main`)
**Status:** Awaiting user approval — no source code changes until approved.

> ⚠️ **Workflow note:** `production-readiness-workflow` prescribes one task per cycle, but the user explicitly requested both 2.6 and 2.7 in a single branch. They are bundled here with clearly separated change sets, tests, and roadmap checkboxes.

---

## 1. Context & Problem Statement

References: `PRODUCTION_READINESS_TODO.md` → **2.6. Checkout Modal UX Overhaul** and **2.7. Fix Storefront Search Input**.

### 2.6 — CheckoutModal (1,774 lines, one dense wall of form)

`CheckoutModal.tsx` presents all customer data capture as a single long form inside Step 1: document card, name, RUT, email, phone, address, comuna select, zip, plus the conditional ISP/SIS block — roughly 600 lines of JSX in one scrollable column, every element carrying a 6–10-property inline style object. The owner's assessment (per the TODO): clumsy, verbose, not modern.

### 2.7 — Search inputs

`Navbar.tsx` renders two bare controlled `<input type="text">` elements (`.nav-search` desktop, `.nav-search-mobile`). No `<form>`, no submit path, no button, no clear affordance — Enter visibly does nothing and mobile keyboards show a generic "return" key. Filtering only happens live while typing (`search` → `catalogRequestKey` → `fetchProducts`), so the submit affordance looks broken.

---

## 2. Human Action Items & Placeholders (TODO for Human)

**None.** Both tasks are pure presentation-layer work:

- No new credentials, secrets, env vars, or `.env.example` changes.
- No new dependencies (icons come from `lucide-react`, already in use).
- No human-produced assets. (`delivery-routes.png` — Appendix B.3's optional figure under the zone select — was never delivered to `public/assets/`, so per the proposal rule the `<figure>` is omitted entirely.)

---

## 3. Proposed Changes

### 3.A Task 2.6 — CheckoutModal redesign

**New guided flow — 4 focused steps + confirmation** (executor's chosen breakdown, per the TODO's delegation):

| Step | Label | Contents | Gate on "Continuar" |
| :--- | :--- | :--- | :--- |
| 1 | **Contacto** | Nombre completo, Email, Teléfono | native `required` only |
| 2 | **Despacho** | Dirección, Comuna (select), Código postal, **+ SIS block when `hasRegulatedItems`** | stock check → San Antonio min-order → SIS (today's stock → min-order order preserved; SIS now precedes RUT — see gate-order note below) |
| 3 | **Documento** | Boleta card (single, `FACTURA_ENABLED = false` gating untouched) + RUT + WhatsApp-factura note (+ dormant factura block) | RUT Modulo 11 (+ `validateFacturaFields` if ever re-enabled) |
| 4 | **Pago** | Compact order summary (item lines in a scrollable region + Neto/IVA/Total), 3 payment option cards, method detail callout | final stock re-check → `submitOrder` (unchanged) |
| 5 | **Confirmación** | existing Step-3 content verbatim: success header, order summary box, pro-forma voucher, transfer instructions + upload, tracking button, WhatsApp quote button, `Volver a la Tienda` | — |

This keeps the hard constraints satisfied: the San Antonio minimum and stock guards still fire when leaving the delivery-data step, RUT/SII checks still fire before payment, and the pre-submit stock re-check is untouched. Two deliberate deviations, both to be recorded in the as-built docs:

- **Gate-order reorder:** today the single Step-1 exit validates stock → min-order → **RUT → SIS**. The new flow validates SIS at Despacho→Documento and RUT at Documento→Pago, so **SIS now precedes RUT** — a user with both an invalid RUT and a missing SIS number sees the SIS error first. Both still block progression; this is a deliberate UX simplification, not a preserved order.
- **TODO 2.6 wording deviation:** the TODO's hard constraint says the San Antonio minimum fires "at Step 1 → Step 2"; as built it fires at the Step 2 → 3 boundary (leaving the delivery-data step). Same intent, different step numbers under the new 5-step machine — recorded as an explicit deviation, not silently.

**Presentation work (`[MODIFY] src/components/CheckoutModal.tsx`):**

- `step` state becomes 1–5; `handleNextStep` gains per-step gates (`step===2` → stock/min-order/SIS; `step===3` → RUT/factura; `step===4` → `handleCompleteOrder`). `handleUploadVoucher`, `resetForm`, all payload assembly (`sanitizedCustomer`, `billing`, `sanitaryVerification`), and the `PENDIENTE_*` contract are **unchanged** — with two mandatory retargets under the new numbering:
  - `handleCompleteOrder`'s terminal `setStep(3)` (l.340) becomes `setStep(5)`, or the confirmation step never renders.
  - `handleClose` (l.138) — not previously mentioned in this plan — gates `if (step === 3) resetForm()`; that gate becomes `step === 5`, so closing after a completed order still resets the form.
- **Stepper:** numbered circles + connectors + labels (`Contacto → Despacho → Documento → Pago`), states active/done/upcoming (check icon on done), `aria-current="step"`; hidden on step 5 (mirrors today). Header title becomes `Finalizar Pedido` (steps 1–4) / `Pedido Registrado` (step 5).
  - 📌 **Deliberate:** this retires the stale `Despacho & Facturación` step label flagged in `src/components/AGENTS.md` §2.5 — the mandated stepper redesign replaces the label set wholesale rather than inventing a one-off string.
- **Back navigation:** `Volver` secondary button on steps 2–4 (clears `submitError`, steps down). No click-to-jump stepper navigation (anti-overshooting).
- **Shorter labels:** `Nombre completo`, `Email`, `Teléfono`, `Dirección de despacho`, `Comuna` (select keeps `aria-label="Comuna de Despacho"` — test/a11y contract), `Código postal`, `Documento tributario`, `Método de pago`. Placeholders unchanged (`Dra. Camila Fuentes`, `12.345.678-K`, `contacto@clinica.cl`, `+56 9 1234 5678`, `Av. Ortúzar`, `Ej: 9500000`) — tests query them. Compliance strings kept verbatim (`Validación Sanitaria Requerida`, `N° Registro SIS`, `La compra mínima para despacho a San Antonio es de $60.000`, RUT error text) — only surrounding prose is trimmed.
- **Step transitions:** each step renders as a `key={step}` panel with a subtle fade/slide-in; an effect scrolls the `.modal-card` to top on step change (DOM side effect only — `react-hooks/set-state-in-effect` safe).
- **Pago step order summary:** scrollable item list (`qty × name — subtotal`) + Neto/IVA/Total rows via `calculateTaxBreakdown`, plus the existing method cards/detail callouts (labels kept: `Transferencia Bancaria Directa`, `Cotización Formal Asistida por WhatsApp`, `Pago Inmediato Mercado Pago Chile` — queried by `getByLabelText`).

**Styles (`[MODIFY] src/index.css`):** new `.checkout-*` block next to the modal section — `.checkout-stepper`, `.checkout-step{,--active,--done}`, `.checkout-step-connector`, `.checkout-panel` (animation + `prefers-reduced-motion` entry), `.checkout-fields` (responsive 2-col grid collapsing ≤560px), `.checkout-label`, `.checkout-input{,--error}`, `.checkout-error`, `.checkout-doc-card`, `.checkout-pay-option{,--selected}` (enables `:hover`/`:focus-within` — impossible with today's inline styles), `.checkout-summary`, `.checkout-note`, `.checkout-actions`. Canonical tokens only; zero hex literals (the §2 inline-style migration rule is honored — new markup is styled by classes, not new `style={{…}}` blocks; step-5 voucher keeps its existing inline styles untouched to minimize churn).

**Explicitly NOT done:** no new step libraries, no form libraries (react-hook-form et al.), no schema/payload changes, no `FACTURA_ENABLED` flip, no changes to `submitOrder`/MP/whatsapp services, no pickup/RM copy, `delivery-routes.png` figure omitted (asset absent).

### 3.B Task 2.7 — Search submit fix

**`[MODIFY] src/components/Navbar.tsx`:**

- Both search containers become `<form role="search" onSubmit={handleSearchSubmit}>` (keeping `.nav-search` / `.nav-search-mobile` classes and inner markup order).
- New optional prop `onSearchSubmit?: () => void`.
- `handleSearchSubmit(e)`: `preventDefault` → blur the input (dismisses the mobile keyboard) → `onSearchSubmit?.()`. No state write — `search` is already synced by `onChange`, so nothing can double-fetch or fight `catalogRequestKey`.
- Inside each bar, a right-side `.nav-search-actions` cluster: **clear ✕ button** (`type="button"`, `aria-label="Limpiar búsqueda"`, rendered only when `search !== ''`, calls `setSearch('')` and refocuses the input via a per-form ref — desktop and mobile each hold their own) and **submit button** (`type="submit"`, `aria-label="Buscar"`, `Search` lucide icon). Left decorative `Search` icon stays. ⚠️ New tests must query the submit button with **exact-string** `getByLabelText('Buscar')` — a regex like `/Buscar/i` would also match the inputs' `Buscar en el catálogo` / `Buscar insumos y equipos dentales` labels.
- Inputs gain `enterKeyHint="search"` (mobile keyboard shows "Buscar"); `type="text"` stays (deterministic clear — native `type="search"` decorations vary by browser).

**`[MODIFY] src/App.tsx`:** one line — `onSearchSubmit={scrollToCatalog}` (reuses the existing `#catalog-section` smooth-scroll helper; guarded by `getElementById`, safe when catalog is absent).

**`[MODIFY] src/index.css`:** `.nav-search-actions` (absolute right cluster), `.nav-search-clear`, `.nav-search-submit` (30px icon buttons, `--text-muted` → `--ink-800` hover, `:focus-visible` ring), input `padding-right` widened for the cluster, same rules applied to `.nav-search-mobile input`. Existing tokens only.

---

## 4. Robust Unit Testing Plan (MANDATORY)

**`[MODIFY] src/tests/components/CheckoutModal.test.tsx`** — adapt to the new step machine; **all 26 existing `it` blocks preserved**, re-targeted:

- New helpers: `fillContactStep()`, `fillDespatchStep()` (+`selectZone`), `fillDocumentStep()`, `advance()` (clicks `Continuar`), `completeDataEntry()` (walks steps 1→4). Same placeholder queries, so field fills are unchanged.
- Re-targeted: RUT-invalid blocks at Documento→Pago; min-order/SIS/stock errors block at Despacho→Documento; boleta-only assertions on the Documento step; `Volver` walks back one step at a time; all `submitOrder` payload, MP delegation, billing, voucher, tracking, and email assertions identical (driven through the new step path).
- **Anchor changes (old strings no longer exist):** the reset test's `Gestión de Pedido y Pago` assertion (l.271) becomes `Pedido Registrado` (the new step-5 header), and the stock-block tests' `Seleccionar Método de Pago / Cotización` "still on step 1" anchor (l.185) becomes a stepper/`Continuar`-visible assertion.
- **New tests:** stepper renders the 4 labels with correct active/done states; back-navigation preserves entered field values; Pago step shows the order summary (item line + `Total`); Enter submits each step's form (each step is a real `<form>`); confirmation header swaps stepper for success state.

**`[MODIFY] src/tests/components/Navbar.test.tsx`** — new describe block (~7 tests):

1. Desktop input lives inside a `form[role="search"]`; `fireEvent.submit` calls `onSearchSubmit` once and blurs the input.
2. Submit button click (`aria-label="Buscar"`) does the same.
3. Clear button absent when `search === ''`; present when non-empty.
4. Clear click calls `setSearch('')` and returns focus to the input.
5. Mobile form submits identically.
6. Typing still calls `setSearch` (live filter preserved — no double path).
7. Submit with empty search still calls `onSearchSubmit` (scroll-to-catalog is harmless).

**Mocking:** no network/Firebase — `CheckoutModal` service mocks stay exactly as they are; `Navbar` gets plain props. `scrollIntoView` isn't reached in jsdom (Navbar only calls the prop; App's guard is untested DOM plumbing).

**Zero regressions:** `pnpm test` (448 tests / 61 suites on main + new), `pnpm build`, `pnpm lint`, `pnpm format:check` all green.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- **`src/components/AGENTS.md`** — rewrite §3 (checkout deep dive): 4-step state machine diagram, per-step gate table, stepper/panel/CSS-class contracts; update §7.1 Navbar (form-wrapped search, `onSearchSubmit`, clear/submit affordances); resolve the §2.5 `Despacho & Facturación` stale-copy entry (superseded by the redesign).
- **`src/tests/AGENTS.md`** — note the adapted `CheckoutModal` helpers and new Navbar search-suite coverage.
- **`PRODUCTION_READINESS_TODO.md`** — mark **2.6** and **2.7** `[x]` with as-built summaries after verification passes. The summaries must explicitly record the two deliberate deviations from §3.A (SIS-before-RUT gate reorder; San Antonio minimum firing at the Step 2 → 3 boundary instead of the TODO's literal "Step 1 → Step 2") and the §2.5 `Despacho & Facturación` supersession.

---

## 6. Known Accepted Behaviors (from pre-execution audit)

- **SIS credential file input clears on back-navigation.** The `key={step}` panel remounts mean navigating back to Despacho clears the chosen file from the DOM input while the `✓ Adjunto: …` chip (driven by `credentialFileName` state) persists. This is **new behavior introduced by the panel remounts** (today the file survives back-navigation because nothing remounts). Accepted as cosmetic: only the *name* (`credentialFileName`) ever reaches the order payload; the raw file is never uploaded. If it proves confusing in practice, a follow-up can gate the chip on a live file reference.
- **Step-5 voucher keeps its existing inline styles** (per §3.A) to minimize churn; the class-based styling rule applies only to new markup.
- **`ClinicalStorefront.test.tsx` needs no changes** — its Navbar test only asserts utility-bar copy, and no other suite references the checkout strings being renamed (verified: only `CheckoutModal.test.tsx` matches).
