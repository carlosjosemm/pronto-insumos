# Task 7.1: Mandatory Legal Pages (Chilean Consumer Law N° 19.496)

**Branch:** `fix/task-7.1-legal-pages` (cut from `main` @ `b081b72`, which already includes the merged Tasks 1.4, 0.11 and 2.8; executing in the primary worktree — no separate worktree, per the retired worktree protocol)
**Status:** Awaiting user approval — no source code changes until approved.
**RequestFeedback:** true
**UserFacing:** true

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **7.1. Mandatory Legal Pages (Chilean Consumer Law N° 19.496)** (P1 · Legal · required).

The TODO's stated symptom — "all policy links point to `href="#"`" — is **stale**: today's `Footer.tsx` renders **no links at all** in its policy column. The "Cumplimiento Clínico" list is plain-text bullets, and `Términos y Condiciones de Venta B2B` is a dead `<li>` a shopper cannot open. Net effect: the storefront sells to Chilean clinics with **no reachable** Terms of Sale, no SERNAC warranty statement, and no privacy policy — a legal-compliance gap (Ley 19.496 consumer law, Ley 19.628 data protection) and a trust failure for the B2B audience.

**Required Action (from TODO):** publish dedicated policy pages covering (1) Terms and Conditions of Sale, (2) 6-Month Legal Warranty & Return Policy (SERNAC — technical equipment vs hygiene-sealed consumables), (3) Privacy and Data Protection (Ley 19.628), (4) Company Legal Identification (legal name, RUT, Melipilla address, support channels).

**As-built interpretation (deviation flagged for approval):** the app is a router-less Vite SPA (no react-router, and the anti-overshooting guardrails forbid adding one). The lean, idiomatic implementation is a single **`LegalModal`** following the established modal pattern (`modal-overlay` + `useScrollLock` + `useFocusTrap` + Escape handling, as in `PaymentReturnModal`), containing the four policy sections; the footer's policy items become buttons that open the modal directly on the respective section. This satisfies SERNAC's requirement (terms available before purchase, one click from the footer, printable) with zero new dependencies and zero design-token duplication — the alternative (standalone `public/*.html` pages) would require duplicating the design tokens into a separate stylesheet, the exact drift class this repo's guardrails exist to prevent. If the owner prefers literal separate pages, the plan pivots at review.

---

## 2. Human Action Items & Placeholders (TODO for Human)

- **No new credentials, secrets, env vars, or dependencies.**
- **⚠️ Legal copy is a DRAFT for owner review:** the policy texts are drafted by the agent from the TODO's required-action outline and the storefront's as-built commercial behavior (boleta-only, IVA 19%, delivery zones, payment methods). They are **not legal advice** — the owner (or their lawyer) must review and approve the wording before production, in particular the SERNAC warranty clauses and the hygiene-sealed-goods return exclusions. The modal renders the draft verbatim; owner edits are text-only changes.
- **Human check after merge:** confirm the company legal identification section matches the SII registration (legal name, RUT) — the values render from `BANK_DETAILS` / `WHATSAPP_*` config, never literals, so a correction is a config edit, not a component hunt.

---

## 3. Proposed Changes

### 3.A `[NEW] src/components/LegalModal.tsx` — the four policy sections

- Props: `{ section: LegalSection; onClose: () => void }` where `LegalSection = 'terminos' | 'garantia' | 'privacidad' | 'identificacion'`.
- Follows the established modal skeleton exactly: `.modal-overlay` (click-to-close) → `.modal-card` → `useScrollLock(true)` + `useFocusTrap<HTMLDivElement>(true)` + `Escape` → `onClose()`, close button with `aria-label="Cerrar ventana"`.
- Header + a section nav (4 anchor buttons, `aria-current` on the active one) switching the rendered policy; content in es-CL, drafted per §2.
- **Config-sourced values only:** company name / RUT / email from `BANK_DETAILS`, support phone from `WHATSAPP_DISPLAY`, WhatsApp links via `whatsappLink()` — no new fiscal or contact literals anywhere in the component (the §1 divergence rule).
- Commercial behavior stated in the copy matches the as-built system exactly: Boleta Electrónica · IVA 19% (Factura via WhatsApp quotation), payment via Mercado Pago Chile or bank transfer, delivery zones `Melipilla` (same day before 16:00) / `San Antonio` (scheduled route, $60.000 minimum), free shipping over $150.000 — sourced from `src/config/delivery.ts` / `src/config/promos.ts` wording where the copy needs it.

### 3.B `[MODIFY] src/components/Footer.tsx` — wire the policy entries

- The "Cumplimiento Clínico" column's dead `Términos y Condiciones de Venta B2B` `<li>` becomes a button opening `LegalModal` on `terminos`; sibling entries `Garantía Legal 6 Meses (SERNAC)` and `Privacidad y Protección de Datos (Ley 19.628)` are added as buttons for `garantia` / `privacidad` (the TODO requires all policies be reachable).
- `Footer` owns the `LegalModal` state internally (self-contained, like `CheckoutModal`'s own state) — **no `App.tsx` wiring changes**.
- Styling: the policy buttons reuse the existing footer link look (`var(--text-on-dark-body)` / `--accent-on-dark` on the navy surface — never `var(--accent)` on dark, per §2's contrast rule).

### 3.C `[NEW] src/tests/components/LegalModal.test.tsx`

- Renders each of the four sections (heading + a SERNAC/Ley-specific marker per section).
- Opens from the Footer: clicking each policy entry opens the modal on that section (wiring contract).
- A11y: `role="dialog"` + `aria-modal`, Escape closes, focus is trapped and restored (the `useFocusTrap` contract).

### 3.D `[MODIFY] src/tests/components/ClinicalStorefront.test.tsx`

- Extend the existing Footer coverage: the policy entries render as buttons (not dead text), and no `href="#"` placeholder links exist anywhere in the Footer (the regression this task exists to prevent).

### Explicitly NOT done (scope guardrails)

- **No router, no new dependencies, no standalone HTML pages** (unless the owner pivots at plan review).
- **No changes to the other footer columns** — the stale `Boleta Electrónica Inmediata` wording in the same column is Task **3.3**'s copy sweep, deliberately untouched here.
- No `App.tsx` changes; no design-token additions to `src/index.css` (the modal reuses the existing modal + footer classes).

---

## 4. Robust Unit Testing Plan (MANDATORY)

1. **`LegalModal.test.tsx`** (new suite, ~6 tests): four section-render tests (each policy's heading + a law-specific marker: `19.496` / SERNAC in garantía, `19.628` in privacidad, RUT + Av. Ortúzar in identificación); open-on-section from the Footer for each entry; Escape closes; `role="dialog"`/`aria-modal` present.
2. **`ClinicalStorefront.test.tsx`** (+1–2 tests): policy entries are buttons wired to the modal; the Footer contains no `href="#"` links.
3. **Mocking:** none required beyond the suites' existing patterns — no network, Firebase, or payment boundaries are touched (pure render + interaction tests).
4. **Zero-regression target:** `pnpm test` (577 → ~584 tests, 68 → 69 suites), `pnpm build`, `pnpm lint`, `pnpm format:check` — all green.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- **`src/components/AGENTS.md`:** new `LegalModal` subsection under §7 (Navigation, Layout & Utility Components) + the `Footer.tsx` §7.2 entry updated (policy buttons, modal wiring, no dead links).
- **`src/tests/AGENTS.md`:** refresh counts (68 → 69 suites, 577 → final test count) and the `components/` list (+ `LegalModal`).
- **`PRODUCTION_READINESS_TODO.md`:** mark **7.1** `[x]` with an as-built summary, recording the modal-vs-pages deviation and the legal-copy-is-a-draft human action item.
- **Root `AGENTS.md`:** no change needed (no new invariants — the modal follows the existing pattern; config-sourced values only).

---

## 6. Verification Sequence (workflow steps 6 → 8)

1. `pnpm test` — full suite green, no regressions.
2. `pnpm build` — production bundle compiles.
3. `pnpm lint` + `pnpm format:check`.
4. Adversarial read-only self-review of the diff (defensive programming, runtime separation, observability, negative assertions), remediate findings, re-run 1–3.
