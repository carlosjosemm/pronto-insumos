# Task 1.7: Server-Authoritative Tax Breakdown in Customer Communications and Boleta

**Branch:** `fix/task-1.7-server-authoritative-tax-breakdown` · **Status:** awaiting approval
**RequestFeedback:** true · **UserFacing:** true

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` **1.7 (P1)** — the client-written `billing.taxBreakdown`
is trusted on every customer-facing fiscal surface:

- `firestore.rules` `isValidTaxBreakdown` only checks `neto`/`iva`/`total` are ints —
  no `neto + iva == total`, no binding to `data.totalAmount`, no binding of
  `billing.rut` to `customer.rut`.
- `src/services/api.ts` `submitOrder()` accepts `orderData.billing` wholesale, so a
  crafted checkout payload can persist `totalAmount=189990` with
  `taxBreakdown={ total:1, iva:0 }`.
- `api/_lib/emailTemplates.ts` `totalsBlock()` prefers `billing.taxBreakdown.*` over
  `totalAmount` — so the MP charge can be correct while the customer email presents a
  forged fiscal figure. Same flaw in every text body and in `track-order`'s payload.
- The transfer "order received" email is sent **before** `approve-transfer` verifies
  the catalog total, so its amount must be presented as provisional.

## 2. Human Action Items & Placeholders (TODO for Human)

- No new credentials or env vars.
- `firestore.rules` changes require the owner to re-run `pnpm run deploy:rules`
  (folds into the existing 0.12 owner gate — rules deployment is still unverified).

## 3. Proposed Changes

- [MODIFY] `src/utils/tax.ts` — `import type { TaxBreakdown }` + `./rut.js` runtime
  specifier so the module resolves under Node ESM when traced into an `api/` bundle
  (same convention `schemaValidation.ts` already follows).
- [MODIFY] `src/services/api.ts` — `submitOrder()` spreads caller billing (fiscal
  identity fields stay caller inputs) but **always** overwrites
  `taxBreakdown: calculateTaxBreakdown(totalAmount)` and
  `status: 'PENDIENTE_EMISION_SII'` from the recomputed total.
- [MODIFY] `firestore.rules` —
  - `isValidTaxBreakdown`: add `t.neto + t.iva == t.total`.
  - `isValidBilling(b, orderTotal, customerRut)`: bind
    `b.taxBreakdown.total == orderTotal` and `b.rut == customerRut` (the only writer
    always stores the purchaser's RUT; kills the mismatched-tax-identity vector).
  - Rewrite the comments on touched functions self-contained (drop `Task …` pointers).
- [MODIFY] `api/_lib/emailTemplates.ts` —
  - `OrderEmailData.billing`: drop `taxBreakdown` (keep `documentType` for the
    factura display line); `toOrderEmailData` stops copying it.
  - `totalsBlock(data, provisional?)`: always `calculateTaxBreakdown(data.totalAmount)`;
    provisional variant renders `Total referencial (IVA incluido)` + a muted
    "monto sujeto a confirmación" note.
  - `buildOrderConfirmationEmail` (transfer/WhatsApp quote — pre-verification) uses
    the provisional block + provisional wording in `text`.
  - Post-verification templates (`buildPaymentConfirmedEmail`,
    `buildTransferApprovedEmail`, `buildPaymentReviewResolvedEmail`,
    `buildWarehouseAlertEmail`) keep `Total (IVA incluido)` — now derived.
- [MODIFY] `api/track-order.ts` — `billing.taxBreakdown` in the tracking payload is
  derived via `calculateTaxBreakdown(totalAmount)` instead of echoing the stored map.
- [MODIFY] `scripts/send-test-comms.ts` — align `TEST_ORDER` with the trimmed
  `OrderEmailData.billing` shape.
- Tests below; as-built docs in §5.

## 4. Robust Unit Testing Plan (MANDATORY)

- `src/tests/api/email.test.ts` — keep the fixture's deliberately wrong breakdown
  (`159656/30334`, correct is `159655/30335`) as the **forgery regression**: every
  template must render the derived `$159.655`/`$30.335`/`$189.990` and none of the
  forged figures; plus a `taxBreakdown.total = 1` forged-total case → still
  `$189.990`; provisional label present in order-confirmation (transfer + quote),
  absent in post-verification emails; `toOrderEmailData` no longer surfaces
  `billing.taxBreakdown`.
- `src/tests/services/api.test.ts` — caller-injected `billing.taxBreakdown` and
  `status: 'EMITIDO'` are overwritten in the captured `setDoc` payload by the
  recomputed breakdown + `PENDIENTE_EMISION_SII`.
- `src/tests/api/track-order.test.ts` — stored forged breakdown → payload carries
  the breakdown derived from `totalAmount`.
- `src/tests/security/orderCreateContract.test.ts` + `firestore-rules.test.ts` —
  content assertions for `neto + iva == total`, `taxBreakdown.total == data.totalAmount`,
  and `billing.rut == customer.rut`; the real `submitOrder()` payload still satisfies
  every (now stricter) binding.
- No live Firebase/Resend/MP — all boundaries mocked as usual.
- Full suite must stay green (911+), `pnpm build` clean.

## 5. As-Built Documentation & Roadmap Sync Plan

- `api/AGENTS.md` §4.3 — server-authoritative totals: stored `billing.taxBreakdown`
  never reaches a rendered figure; provisional label on the pre-verification send.
- `src/services/AGENTS.md` — `submitOrder` derives `taxBreakdown` + SII `status`.
- `src/types/AGENTS.md` §2.4b — `taxBreakdown` is a server-derived artifact.
- Root `AGENTS.md` §4 — extend the rules bullet with the new bindings.
- `src/tests/AGENTS.md` — updated suite descriptions.
- Mark `1.7` `[x]` in `PRODUCTION_READINESS_TODO.md` at wrap-up (after review).
