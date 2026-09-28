# Task 0.11: `submitOrder` Must Propagate Firestore Write Failure

**Branch:** `fix/task-0.11-submit-order-write-failure` (cut from `main` @ `9166396`, synced with `origin/main`; executing in the primary worktree — same pattern as Task 0.10, per owner preference)
**Status:** Approved & implemented — awaiting wrap-up (commit/PR).

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **0.11. `submitOrder` Must Propagate Firestore Write Failure** (P0 · High · production blocker · 1–2h).

`submitOrder()` in `src/services/api.ts` (l. 195–200) wraps the `setDoc` call in a `try/catch` that logs a `console.warn` and then **falls through to `return { success: true, … }`** — the caller can never learn that the order was not persisted.

Consequence chain (the "paid ghost order"):

1. `CheckoutModal.handleCompleteOrder()` **already contains the correct guard** (l. 335–340):

   ```ts
   if (!result.success) {
     console.error('Failed to register initial pending order in database')
     setSubmitError('No fue posible registrar el pedido en el sistema. Por favor reintenta o comunícate vía WhatsApp.')
     setIsSubmitting(false)
     return
   }
   ```

   It is **dead code** today — `success` is always `true`.
2. So checkout proceeds: `mercadopago` → `processMercadoPagoPayment()` creates a preference and redirects (payment collected for an order that does not exist); `transferencia`/`whatsapp` → confirmation email fires and the confirmation step renders.
3. The webhook later logs `Order "…" not found in Firestore` and deducts no stock (recorded as `api/AGENTS.md` §8.5 gap #6 → this task is its root-cause fix).

**TODO verification requirement:** "Unit test: rules denial → no preference created, error shown to the customer."

**Nuance to record (not a fix):** the Firestore Web SDK resolves locally-queued writes while offline (they sync on reconnect) — this task covers **rejected** writes (rules denial, malformed payload, permission errors), which is exactly the ghost-order vector.

---

## 2. Human Action Items & Placeholders (TODO for Human)

**None.** No credentials, secrets, env vars, `.env.example` entries, human-produced assets, or new dependencies.

Optional post-merge smoke check: with the storefront open, a rejected order write now blocks at the Pago step with the Spanish error banner instead of advancing to payment.

---

## 3. Proposed Changes

### 3.A `[MODIFY] src/services/api.ts` — the fix (the only functional change)

Replace the swallow with a fail-closed return:

```ts
  try {
    const orderDocRef = doc(db, getCollectionName('orders'), orderId)
    await setDoc(orderDocRef, payload)
  } catch (err: unknown) {
    // FAIL-CLOSED (Task 0.11): a rejected write must never look like a persisted
    // order — checkout would otherwise initiate payment for a "ghost order".
    console.error('Firestore order submit failed:', err instanceof Error ? err.message : err)
    return {
      success: false,
      orderId,
      timestamp: new Date().toISOString(),
      total: totalAmount,
      itemsCount: orderData.items.reduce((acc, i) => acc + i.quantity, 0)
    }
  }

  return { success: true, orderId, timestamp: new Date().toISOString(), total: totalAmount, itemsCount: … }
```

- **Deliberately no new fields** on `SubmitOrderResult`: the raw cause stays in the log and the UI already owns the customer-facing copy. (An `error?: string` field was considered and rejected as unused surface — nothing would consume it.)
- `console.warn` → `console.error`: this is now a hard failure that blocks checkout, and it matches the `console.error` `CheckoutModal` already logs on this path.
- The failure result keeps the computed `orderId` / `total` / `itemsCount` (accurate — only persistence failed) so the flat result contract is unchanged.

### 3.B `[MODIFY] src/services/api.ts` — remove the duplicate `SubmitOrderResult` (small consolidation)

`SubmitOrderResult` is declared **twice**, structurally identical: `src/types/index.ts` (l. 167) and `src/services/api.ts` (l. 45). `src/types/AGENTS.md` names it as a types-module export and mandates a single location for domain interfaces; no consumer imports it from `../services/api` (verified: only `CheckoutModal` imports it, from `../types`). The local copy is deleted and imported from `../types` so the contract cannot diverge. *(Say the word if you'd rather leave the duplicate untouched — it is hygiene, not required by the fix.)*

### 3.C `[MODIFY] src/components/CheckoutModal.tsx` — **no change required**

The `!result.success` guard (l. 335–340) already blocks payment initiation, surfaces the Spanish error, and re-enables the submit button (`setIsSubmitting(false)`) for retry. It simply becomes reachable. Recorded here explicitly so the reviewer knows the UI path is pre-existing, not new.

### 3.D `[MODIFY]` tests — see §4

### Explicitly NOT done (scope guardrails)

- No `api/` changes: the webhook's permissive ack for a missing order document (gap #6) stays — retries cannot help, and the root cause is fixed here.
- No offline-queue handling (SDK semantics, documented above).
- No changes to `processMercadoPagoPayment()`'s own simulated-success masking — that is Task **2.8**.

---

## 4. Robust Unit Testing Plan (MANDATORY)

**`[MODIFY] src/tests/services/api.test.ts`** (existing harness mocks `firebase/firestore` entirely — `setDoc: vi.fn()`):

- **UPDATE** `should handle Firestore save error gracefully without throwing` → `should surface Firestore write failures instead of reporting success (Task 0.11)`:
  `setDoc` rejects with a rules-denial error (`new Error('Missing or insufficient permissions.')`) ⇒ `result.success === false`, `result.orderId` matches `/^PRONTO-\d{6}$/`, `result.total`/`result.itemsCount` still carry the computed values, `console.error` called, **no throw**.
- Existing success-path tests stay green **unchanged** (they assert `success: true`).

**`[MODIFY] src/tests/components/CheckoutModal.test.tsx`** (reuses the established helpers `completeDataEntry`, `fireEvent`; services are already mocked):

- **ADD** `should block Mercado Pago payment initiation and show an error when order registration fails (Task 0.11)`:
  `submitOrder` resolves `{ success: false, … }` ⇒ walk to Pago, select `Pago Inmediato Mercado Pago Chile`, click `Confirmar Pedido`; assert: the Spanish error is visible (`No fue posible registrar el pedido en el sistema…`), **`processMercadoPagoPayment` was NOT called** (no preference created), the `Pedido Registrado` confirmation header is absent, and `Confirmar Pedido` is still rendered (retry possible).
- **EXTEND** the existing `should NOT fire sendOrderConfirmationEmail when order registration fails` with the visible-error assertion (the email half is already covered there).

**Mocking:** existing boundary doubles only — `vi.mock('firebase/firestore')` (services suite) and `vi.mock('../../services/api')` (component suite); no real network/Firebase.

**Zero-regression target:** `pnpm test` (555 → 557 tests; 66 → 67 suites), `pnpm build`, `pnpm lint`, `pnpm format:check`, scoped `tsc` — all green.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- **`src/services/AGENTS.md`:** §2.4 ⚠️ "The Firestore write is swallowed" bullet → as-built fail-closed description; §6 table row for `submitOrder()` → updated (no longer a simulated-success contract); the §6 closing "direction" sentence → marked done for this adapter.
- **`src/components/AGENTS.md`:** §3 checkout mermaid — add the failure branch (`submitOrder` rejected → registration-error banner & block) and note the guard is now reachable.
- **`api/AGENTS.md`:** §8.5 gap #6 → annotated **RESOLVED (Task 0.11)** (root cause fixed; webhook behavior deliberately unchanged).
- **Root `AGENTS.md` §4:** new iron-rule bullet — checkout must never initiate payment for an order that was not persisted.
- **`PRODUCTION_READINESS_TODO.md`:** mark **0.11** `[x]` with the as-built record; refresh the repository-state header line.
- **`src/tests/AGENTS.md`:** suite/test counts + coverage note.

---

## 6. Verification Sequence (workflow steps 6 → 8)

1. `pnpm test` — full suite green (no regressions; new/updated tests passing).
2. `pnpm build` — production bundle compiles.
3. `pnpm lint` + `pnpm format:check` + scoped strict `tsc` on the touched service.
4. Adversarial read-only self-review of the diff (defensive programming, contract shape, observability, negative assertions), remediate findings, re-run 1–3.

---

## 7. Independent Review Follow-ups (fresh-context subagent, read-only)

An independent reviewer with no prior context returned **BLOCK** on one blocker. Disposition of every finding:

| # | Severity | Finding | Disposition |
| :-- | :--- | :--- | :--- |
| B1 | **Blocker** | Every real checkout payload carries `undefined` optional fields, and the Firestore Web SDK **rejects `undefined` by default** (`Unsupported field value: undefined`) — the order write had **never** persisted (the true ghost-order root cause). Propagating the failure alone would therefore hard-block *all* checkouts. | **Fixed** — `src/services/firebase.ts` now uses `initializeFirestore(app, { ignoreUndefinedProperties: true })` (SDK-sanctioned, one line, also protects `seedProductsToFirestore`). Independently reproduced: serialization throw before the fix, network write attempt after it. Pinned by the new `src/tests/services/firebase.test.ts`. |
| M2 | Minor | Root `AGENTS.md` test counts stale (555 vs 556) | **Fixed** — counts are now 557/67 everywhere (the review fix also added a suite). |
| M3 | Minor | Docs marked the task resolved on claims only true with a mocked Firestore | **Fixed** — the docs now describe the root cause and the initialization setting; every as-built claim re-verified against the code. |
| N4 | Nit | Test-quality gaps: no `setDoc`-call assertion, spy not restored on assertion failure, "retry" asserted by text presence only, no WhatsApp failure case | **Partially fixed** — write-attempt + canonical doc-id assertion added; spy wrapped in `try/finally`; retry asserted via `toBeEnabled()`. The WhatsApp failure path shares the same single guard (deliberate skip — no extra test). |
| N5 | Nit | Stale plan status line | **Fixed** — status updated above. |

**Post-rebase note (before the PR):** `origin/main` had moved (Task 1.4 merged, PR #18) and the branch was rebased onto it. Conflicts were confined to four documentation files (root `AGENTS.md`, `PRODUCTION_READINESS_TODO.md`, `src/tests/AGENTS.md`, this plan artifact) and were resolved by combining both tasks' content; the merged state verifies at **559 tests / 67 suites** (1.4 added 2 tests in an existing suite, this task added 2 tests + 1 suite). All code auto-merged cleanly.
