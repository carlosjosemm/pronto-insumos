# Task 2.10: Replace the Last Literal `wa.me` and Stale Phone Placeholders

**Branch:** `fix/task-2.10-whatsapp-link-single-source` (cut from `main` @ `4065bda` — merged PR #26; `git fetch` confirmed `origin/main` in sync)
**RequestFeedback:** true · **UserFacing:** true
**Status:** Implemented, verified (79 suites / 755 tests + all five gates green) and adversarially reviewed — findings F1–F8 triaged, F3/F4/F5/F7/F8 remediated in the working tree (see §7); awaiting the explicit **"wrap up and proceed"** command.

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **2.10** (P2 — "Last literal `wa.me` / stale phone placeholders", first item of the non-suspended P2 queue).

`src/config/contact.ts` is the documented single source for the business WhatsApp line (`WHATSAPP_NUMBER` → `VITE_WHATSAPP_NUMBER`, fallback `56929831595`; `WHATSAPP_DISPLAY`; `whatsappLink(text?)`). `src/config/AGENTS.md` states the invariant: **"No component may hardcode a phone number or a `wa.me` URL — all customer-facing links go through `whatsappLink()`."** Three surfaces still violate it:

| # | Surface (as built) | Defect | Consequence |
| :-- | :--- | :--- | :--- |
| D1 | `src/components/PaymentReturnModal.tsx:38-42` | Builds its own URL: `import.meta.env.VITE_WHATSAPP_NUMBER \|\| '56912345678'`, strips non-digits, hand-builds `https://wa.me/${phone}?text=…` | With the env var unset/misnamed, the **approved-payment** "Coordinar Despacho por WhatsApp" button opens a chat with the **stale prototype placeholder** `56912345678` — a different line than every other surface. It is also the **last literal `wa.me` in the storefront** (recorded in `src/components/AGENTS.md` §4.1.2 and §7.3). |
| D2 | `src/services/whatsapp.ts:15` | Keeps a **second** `import.meta.env?.VITE_WHATSAPP_NUMBER \|\| '56929831595'` read ("deliberate exception", `src/services/AGENTS.md` §4.4) | Two readers with two fallback literals can drift (the failure mode that once pointed `OrderTrackingModal` at `56987654321`). Both fallbacks are correct today — latent risk, not a live bug. |
| D3 | `index.html:61` | JSON-LD `"telephone": "+56912345678"` | The local-business structured data (link previews, search surfaces) advertises a **phone line that does not exist**. |

**Scope guardrails (what must NOT change):**
- **No copy edits.** The WhatsApp message strings (PaymentReturnModal's coordination text, `whatsapp.ts`'s quote template) stay byte-identical — storefront copy requires an Appendix C entry first (`src/components/AGENTS.md` §2.5). The `(Melipilla & RM)` wording in `whatsapp.ts:12,38` is **Task 3.3 — suspended**; it is explicitly out of scope here.
- **No new numbers.** The canonical number is `56929831595` / `+56929831595` (`WHATSAPP_NUMBER`'s own fallback and `.env.example:19`).
- **No 2.12 scope creep.** The "¡Pago Confirmado!" trust gap (URL-parameter-driven success) is Task 2.12, not this task.

---

## 2. Human Action Items & Placeholders (TODO for Human)

**None required.** No new credentials, no new env vars, no `.env.example` change — `VITE_WHATSAPP_NUMBER` is already documented at `.env.example:19` (digits-only, `56929831595`) and this task removes readers, not adds them.

| # | Optional verification | Command / where |
| :-- | :--- | :--- |
| H1 | Confirm `VITE_WHATSAPP_NUMBER` is set on the Vercel **Production** target (after this task the code fallback is also correct, so a missing var is no longer a stale-line risk) | `pnpm dlx vercel@latest env ls` |
| H2 | Re-run the ops smoke test — it exercises the **consolidated** import graph under plain Node/tsx (`scripts/send-test-comms.ts:95` dynamic-imports `src/services/whatsapp`). **As executed:** the importability half is verified (a `pnpm dlx tsx` probe imports `contact.ts` + `whatsapp.ts` with no env and prints `wa.me/56929831595`); the script's `--only=whatsapp` path itself throws on a **pre-existing** fixture-shape bug (`TEST_ORDER.items` lacks `product`), recorded as P1 in §7 — not introduced here, not fixed here | `pnpm dlx tsx scripts/send-test-comms.ts --only=whatsapp` |

---

## 3. Proposed Changes

### 3.A `[MODIFY] src/components/PaymentReturnModal.tsx` — route through `whatsappLink()`

- Add `import { whatsappLink } from '../config/contact'`.
- Replace lines 38-42 (env read + `.replace(/[^0-9]/g, '')` + manual template) with a single call:

```ts
const whatsappUrl = whatsappLink(
  `🏥 *COORDINACIÓN DE PEDIDO PAGADO - PRONTO INSUMOS*\n\nHola, acabo de pagar mi pedido *${orderId || 'PRONTO'}* vía Mercado Pago. Quisiera consultar los tiempos y condiciones de entrega para mi clínica.`
)
```

Output is byte-identical to today's URL whenever the env var is a digits-only number (`whatsappLink` = `https://wa.me/<digits>?text=<encodeURIComponent(text)>`).
**Post-review amendment (F5):** the removed `.replace(/[^0-9]/g, '')` **was** re-homed into `contact.ts` after the adversarial review flagged the regression risk — the single source now strips non-digits itself and falls back to `56929831595` when nothing digit-like remains, so a formatted `VITE_WHATSAPP_NUMBER` (`+56 9 2983 1595`, exactly the format the UI displays) can no longer produce a dead link on any surface.

### 3.B `[MODIFY] src/services/whatsapp.ts` — drop the second env read

- Add `import { whatsappLink } from '../config/contact'`; delete `const phone = import.meta.env?.VITE_WHATSAPP_NUMBER || '56929831595'`; `return whatsappLink(message)`.
- The message template (including the 3.3-owned copy) is untouched.
- **Node/tsx importability is preserved and was verified today:** `contact.ts` uses the same `import.meta.env?.` optional-chain as `whatsapp.ts` did; a live smoke test (`pnpm dlx tsx`, ESM, inside the repo) imported `contact.ts` + `whatsapp.ts` with no env and printed `NUMBER=56929831595 · LINK=https://wa.me/56929831595?text=hola`. After consolidation the ops-script path (`scripts/send-test-comms.ts:95`) resolves the identical fallback.

### 3.C `[MODIFY] index.html` — JSON-LD `telephone`

`"telephone": "+56912345678"` → `"telephone": "+56929831595"`. Nothing else in `index.html` is touched (the `pronto-insumos.vercel.app` URLs are Task 7.2, not this task).

### 3.D `[NEW] src/tests/config/contact.test.ts` — the single-source guard

Behavior tests + a `readFileSync` content guard, mirroring the `Fiscal RUT single-source guard` in `src/tests/config/bankDetails.test.ts` and the stylesheet guard in `src/tests/styles/storefrontCss.test.ts` (the repo's established pattern for invariants a jsdom render cannot prove).

### 3.E `[MODIFY] src/tests/services/whatsapp.test.ts` — env cases move to the resolver

The two `vi.stubEnv` cases currently pass *because* `whatsapp.ts` reads env at call time; after consolidation the module-level `WHATSAPP_NUMBER` const is fixed at import, so those cases are rewritten (see §4) — the env-resolution semantics move to `contact.test.ts` (tested with `vi.resetModules()` + dynamic import, the pattern already used in `src/tests/api/firebaseAdmin.test.ts`).

### 3.F `[MODIFY] src/tests/components/PaymentReturnModal.test.tsx` — discriminating wiring test

Add a case that `vi.mock`s `../../config/contact` with a sentinel `whatsappLink` and asserts the approved-state anchor href uses the sentinel number. This **fails on the current inline build** (which ignores the mocked module) and passes only when the component actually routes through the shared helper.

### Explicitly NOT done (scope guardrails)

- No change to `src/config/contact.ts` (it already exports everything needed).
- No change to message copy, no `(Melipilla & RM)` sweep (Task 3.3 — suspended), no `PaymentReturnModal` trust-copy change (Task 2.12), no `og:`/`twitter:` URL work (Task 7.2).
- No new dependencies, no new components, no new config files.

---

## 4. Robust Unit Testing Plan (MANDATORY)

| Suite | Cases |
| :--- | :--- |
| **`src/tests/config/contact.test.ts`** *(new — 9 cases as built)* | **1.** `WHATSAPP_NUMBER`/`WHATSAPP_DISPLAY` derive from the pinned test number. **2.** `whatsappLink('Hola clínica')` → exact encoded URL (`?text=Hola%20cl%C3%ADnica`); `whatsappLink()` → no `?text=`. **3.** Env resolution: `vi.stubEnv('VITE_WHATSAPP_NUMBER','56999887766')` + `vi.resetModules()` + dynamic `import()` → `WHATSAPP_NUMBER === '56999887766'`. **4.** Canonical fallback: `vi.stubEnv(…, '')` (the empty value exercises the `\|\|` branch; a `delete` would be equivalent) + `vi.resetModules()` + dynamic import → `56929831595`. **5.** Formatted env (`+56 9 2983 1595`) → normalized `56929831595` and a valid `whatsappLink`. **6.** Digit-free env → canonical fallback. **7.** Scan sanity check. **8.** *Single-source guard:* recursive scan of `src/components/**`, `src/services/**` **and `src/admin/**`** → zero matches for `/wa\.me/`, `/\b569\d{7,8}\b/`, `VITE_WHATSAPP_NUMBER` (the regex was widened post-review, F3). **9.** `index.html` contains `"telephone": "+<canonical>"` **derived** from `contact.ts` (F8) and no `+56912345678`. Env restored in `afterEach` (`vi.unstubAllEnvs`). |
| **`src/tests/services/whatsapp.test.ts`** *(modify)* | The two `vi.stubEnv` cases are replaced by **"builds the link through the shared whatsappLink helper"** — a sentinel `vi.mock('../../config/contact')` (`wa.me/56900000000`) that the pre-consolidation code fails (F4). Every message-content case (order id, itemized names, CLP totals, SIS line, Melipilla reference) is kept. |
| **`src/tests/components/PaymentReturnModal.test.tsx`** *(modify)* | New: sentinel-mock case proving the approved link is produced by `whatsappLink()` (verified to fail on the pre-change code); plus a decoded-message assertion (order id preserved). All existing cases (open/close, Escape, failure, pending) stay green. |

**Mocking strategy:** no network, no Firebase, no real `wa.me` navigation — `vi.stubEnv` + `vi.resetModules()` for module-level env semantics, `vi.mock` for the helper wiring, `readFileSync` for the source guard.
**Regression policy:** full suite `pnpm test` (746 tests / 78 suites baseline) must pass 100% plus the new cases; gates: `pnpm test && pnpm build && pnpm lint && pnpm format:check && pnpm exec tsc --noEmit`. **As built: 755 tests / 79 suites, all five gates green; a revert probe (all four source files restored to `HEAD`) fails exactly the 6 new/changed assertions.**

---

## 5. As-Built Documentation & Roadmap Sync Plan

| File | Update |
| :--- | :--- |
| `src/components/AGENTS.md` | §4.1.2 "Last remaining `wa.me` literal" → **resolved (Task 2.10)**: `PaymentReturnModal` now calls `whatsappLink()`; §7.3 bullet "Its WhatsApp URL is the last literal…" → resolved; §2.5 line 153 note updated. |
| `src/services/AGENTS.md` | File-map row for `whatsapp.ts` (no longer "reads `import.meta.env` with its own fallback" → resolves through `config/contact.ts`); §4.4 "deliberate exception" bullet → consolidated, `contact.ts` is the only reader; note the verified Node/tsx importability. |
| `src/config/AGENTS.md` | §1 invariant example parenthetical ("`PaymentReturnModal` still carries the last literal…") → resolved; §2 `contact.ts` consumers list gains `PaymentReturnModal`. |
| `src/tests/AGENTS.md` | `config/` suite entry gains `contact` (2 → 3 suites) with its case list; `services/` entry note; §4.4 note on module-level env reads requiring `vi.resetModules()` + dynamic import; refreshed test/suite counts. |
| `PRODUCTION_READINESS_TODO.md` | Mark **2.10** `[x]`, move its one-liner to §2 Resolved, drop the row from §1 "Open Work at a Glance", refresh the baseline counts + "Last updated" line. |
| Root `AGENTS.md` | Test-count baseline refreshed to **755 tests / 79 suites** in **all three** places the number appears: §1 (line 14), the §6 `pnpm test` comment (line 137) and the §7.1 pre-flight command (line 206). |
| `walkthrough.md` | Rewritten at wrap-up: this task's branch/commit/PR/verification/human items + the disposition of every review finding (it currently documents Task 2.11). |

---

## 6. Verification Sequence (workflow steps 5 → 8)

1. Implement 3.A–3.F; run `pnpm test` (expect ≥ 750 passing, 79 suites), `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit`. ✅ **Executed: 753/753 (pre-remediation) → 755/755 (final), all five gates green.**
2. Re-run the tsx smoke test on the **consolidated** graph to prove plain-Node importability. ✅ **Executed** — probe prints `NUMBER=56929831595 · LINK=https://wa.me/56929831595?text=hola` (the `--only=whatsapp` ops script itself is broken pre-existing, §7 P1).
3. Adversarial read-only code review (`code-review` skill) → remediate valid findings → re-run gates. ✅ **Executed** — see §7.
4. Update as-built docs + roadmap checkbox (step 9/10) and stop for the **"wrap up and proceed"** command. ✅ **Executed** — docs synced, 2.10 ticked and moved to §2 Resolved; awaiting wrap-up.

---

## 7. Adversarial Review Findings & Remediation (executed)

Independent read-only review (fresh-context reviewer, 2026-09-29): **APPROVE WITH FINDINGS** — "the three source edits are correct, minimal, and verified to work in the real runtime". The reviewer independently reproduced the revert probe (guard + modal case fail on `HEAD`) and the tsx importability claim.

| # | Severity | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| F1 | **Major** | 11 as-built doc locations + the roadmap still asserted the pre-change state | **Remediated** — §5 executed in full (components/services/config/tests AGENTS.md, root `AGENTS.md` ×3, roadmap tick + §2 row + glance table + baselines) |
| F2 | Minor | Plan artifact bookkeeping (status line, `delete` vs `stubEnv('')`, under-scoped §5, H2 unachievable) | **Remediated** — this revision (§2 H2, §3.B, §4, §5) |
| F3 | Minor | Guard regex `\b569\d{7}\b` matches only 10-digit runs — the repo's numbers are 11 digits, so it caught nothing (detection came from `/wa\.me/` + `VITE_WHATSAPP_NUMBER`) | **Remediated** — widened to `\b569\d{7,8}\b`; revert probe confirms it flags `PaymentReturnModal.tsx` + `whatsapp.ts` |
| F4 | Minor | The rewritten `whatsapp.test.ts` case passed on pre-change code (non-discriminating) | **Remediated** — sentinel `vi.mock` wiring case; revert probe now fails it |
| F5 | Minor | Consolidation dropped the modal's digits-only normalization → a formatted `VITE_WHATSAPP_NUMBER` would kill every WhatsApp link at once | **Remediated** — normalization moved into `contact.ts` (digits stripped; digit-free ⇒ canonical fallback) + 2 new tests |
| F6 | Minor | `src/tests/config/contact.test.ts` untracked (a `git commit -am` would drop the only guard) | **Deferred to wrap-up** — will be staged explicitly with `git add` (no staging before the human wrap-up command, per the protocol) |
| F7 | Nit | Guard scanned only `src/components` + `src/services` | **Remediated** — `src/admin/**` added (no current offenders) |
| F8 | Nit | `index.html` assertion re-declared the number instead of deriving it | **Remediated** — expectation derived from `contact.ts`'s canonical constant |
| P1 | Pre-existing | `scripts/send-test-comms.ts --only=whatsapp` throws: `TEST_ORDER.items` is `{name,quantity,price}` cast `as unknown as CartItem[]`, but the generator reads `i.product.name` | **Not fixed (out of 2.10 scope, reproduced on `HEAD`)** — recorded in the roadmap under **8.15** (operator-script guardrails) with the repro and the fix shape |
| P2 | Pre-existing | `src/config/AGENTS.md` consumer list omitted `LegalModal` | **Remediated** while editing that row for F1 |
