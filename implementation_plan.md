# Task 1.4: Hardcoded Distributor RUT Fails Modulo-11

**Branch:** `fix/task-1.4-distributor-rut-modulo11` (cut from `main` @ `9166396`, synced with `origin/main`; executing in the primary worktree — no separate worktree, per explicit user instruction)
**Status:** Awaiting user approval — no source code changes until approved.
**RequestFeedback:** true
**UserFacing:** true

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **1.4. Hardcoded Distributor RUT Fails Modulo-11** (P1 · Legal · production blocker · ~1h; audit finding 2026-09).

Two storefront surfaces hardcode the distributor RUT with an **invalid Modulo-11 check digit**:

1. **`src/components/Footer.tsx` l.112** — `<strong>RUT Empresa:</strong> 77.892.410-K` (public legal-identity block in the footer).
2. **`src/components/CheckoutModal.tsx` l.1270** — `RUT Distribuidor: 77.892.410-K` (letterhead of the pro-forma "Ver Comprobante de Compra" receipt customers print/save).

Modulo-11 verification of body `77892410`: weighted sum `0·2+1·3+4·4+2·5+9·6+8·7+7·2+7·3 = 174` → `174 mod 11 = 9` → DV = `11 − 9 = 2`. The correct RUT is **`77.892.410-2`**; `-K` (DV 10) fails the check digit, so any legal/bank document carrying it is invalid.

The correct value is already the single source of truth: **`BANK_DETAILS.rut`** in [`src/config/bankDetails.ts`](src/config/bankDetails.ts) (env-backed via `VITE_BANK_RUT`), asserted by `src/tests/config/bankDetails.test.ts`, and already rendered by `CheckoutModal` in its four other transfer-copy spots (l.1060–1072, l.1490–1505). `Footer.tsx` does not yet import `bankDetails`.

**Test debt:** `src/tests/components/CheckoutModal.test.tsx` l.354 asserts the wrong `-K` string — it must be updated in the same change or `pnpm test` breaks.

---

## 2. Human Action Items & Placeholders (TODO for Human)

- **No new credentials, secrets, env vars, dependencies, or external configuration.**
- **Human legal confirmation:** verify that `77.892.410-2` matches the SII-registered company RUT. The fix renders config, so if the real RUT ever differs, update `VITE_BANK_RUT` in Vercel env (or the fallback in `bankDetails.ts`) — never a component literal.

---

## 3. Proposed Changes

### 3.A `[MODIFY] src/components/Footer.tsx`

- Add `import { BANK_DETAILS } from '../config/bankDetails'` (alongside the existing `contact` import).
- Replace the literal:
  ```tsx
  <strong>RUT Empresa:</strong> 77.892.410-K
  ```
  with:
  ```tsx
  <strong>RUT Empresa:</strong> {BANK_DETAILS.rut}
  ```

### 3.B `[MODIFY] src/components/CheckoutModal.tsx`

- `BANK_DETAILS` is already imported (l.34). Replace the pro-forma letterhead literal:
  ```tsx
  RUT Distribuidor: 77.892.410-K
  ```
  with:
  ```tsx
  RUT Distribuidor: {BANK_DETAILS.rut}
  ```

### 3.C `[MODIFY] src/tests/components/CheckoutModal.test.tsx`

- Import `BANK_DETAILS` from `../../config/bankDetails`.
- Update the l.354 assertion from the wrong literal to the config-derived value, encoding the "render from config" contract:
  ```tsx
  expect(screen.getByText(`RUT Distribuidor: ${BANK_DETAILS.rut}`)).toBeInTheDocument()
  ```
  (If text-normalization quirks arise, fall back to the escaped regex `/RUT Distribuidor: 77\.892\.410-2/i`.)

### 3.D `[MODIFY] src/tests/config/bankDetails.test.ts` — small regression guard

Add a `describe('Fiscal RUT single-source guard')` block using the `readFileSync` source-content pattern already established by `storefrontCss.test.ts` / `firestore-rules.test.ts`:

- `src/components/Footer.tsx` contains **no** `77.892.410` literal (one test).
- `src/components/CheckoutModal.tsx` contains **no** `77.892.410` literal (one test).

Rationale: `src/config/AGENTS.md` §1 documents exactly this divergence class (delivery thresholds, `wa.me`, RUT). The guard makes the roadmap's "never hardcode fiscal literals" required action machine-checked. ~10 lines total; struck from scope at plan review if considered over-engineering.

### Explicitly NOT done (scope guardrails)

- **No changes to `api/_lib/emailTemplates.ts`** — its server-side `VITE_BANK_*` fallback already carries the correct `-2`.
- No new files, no deletions, no dependency changes, no copy rewrites beyond the RUT value itself.

---

## 4. Robust Unit Testing Plan (MANDATORY)

1. **Updated assertion** (CheckoutModal boleta-comprobante flow): the printed comprobante renders `RUT Distribuidor: 77.892.410-2` sourced from `BANK_DETAILS.rut` — proves the legal document no longer carries the invalid check digit.
2. **New guard tests** (bankDetails suite, 2 tests): neither component source file contains a `77.892.410` literal — negative regression guard against reintroduction.
3. **Existing authority test stays green:** `bankDetails.test.ts` already asserts `validateRut(BANK_DETAILS.rut) === true` and `BANK_DETAILS.rut === '77.892.410-2'` — the Modulo-11 correctness anchor.
4. **No new mocking** required: no network, Firebase, or payment boundaries are touched; the CheckoutModal suite's existing service mocks are reused as-is.

**Zero-regression target:** `pnpm test` (555 → **557** tests, 66 suites), `pnpm build`, `pnpm lint`, `pnpm format:check` — all green.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- **`src/components/AGENTS.md` §2.5:** rewrite the "wrong distributor RUT literals" paragraph as **resolved** — both surfaces render `BANK_DETAILS.rut`; guard test in place.
- **`src/config/AGENTS.md` §1:** mark the `Footer.tsx` / `CheckoutModal.tsx` `-K` failure-mode bullet as **fixed by Task 1.4** (remove "Still open").
- **`src/tests/AGENTS.md`:** refresh counts (555 → 557) and note the fiscal-RUT source guard under `config/`.
- **`PRODUCTION_READINESS_TODO.md`:** mark **1.4** `[x]` with a short as-built summary.

---

## 6. Verification Sequence (workflow steps 6 → 8)

1. `pnpm test` — full suite green, no regressions.
2. `pnpm build` — production bundle compiles.
3. `pnpm lint` + `pnpm format:check`.
4. Adversarial read-only self-review of the diff (defensive programming, runtime separation, observability, negative assertions), remediate findings, re-run 1–3.
