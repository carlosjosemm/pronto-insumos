# Task 0.22 Walkthrough — Delivery Zone Is a Free-Text Claim; Out-of-Zone Buyers Go to WhatsApp

**Branch:** `feat/task-0.22-delivery-zone-whatsapp` (stack bottom; base `main` @ 39ba971)
**Status:** implemented, reviewed, gates green, wrapped up under `--YOLO` (owner authorization 2026-10-01).
**PR:** created at wrap-up (see the final YOLO report for the URL).

## What changed

- **`src/config/delivery.ts`** — new `normalizeDeliveryZone(value)`: the single commune matcher
  (case/accent/whitespace-insensitive; canonical zone or `null`). `isBelowMinimumOrder` now
  normalizes its input, so a crafted `"san antonio"` can no longer dodge the `$60.000` minimum and
  an out-of-zone commune is never silently pinned to a zone.
- **`firestore.rules`** — `isValidCustomer` accepts a free-text `customer.city` (non-empty, ≤ 80)
  **only** when `request.resource.data.paymentMethod == 'whatsapp'`; online-payment orders are
  pinned to the two canonical zones.
- **`api/create-preference.ts`** — the order's stored commune is resolved through the normalizer;
  `null` ⇒ `400` ("Despachamos solo a Melipilla y San Antonio…"). Defense in depth: Admin SDK
  writes bypass rules and legacy documents exist.
- **`api/_lib/admin/approve-transfer.ts`** — out-of-zone commune ⇒ `409` conflict (a transfer order
  is never WhatsApp, so such a document is legacy or crafted); San Antonio minimum enforced inside
  the transaction against the catalog list-price subtotal (pre-discount), `409` below it.
- **`api/_lib/admin/resolve-quote.ts`** — San Antonio minimum enforced on `convert` (`409` with an
  operator message). Out-of-zone communes are **not** rejected here: a WhatsApp quote is exactly
  the sanctioned path for those buyers.
- **`api/_lib/dispatchReference.ts`** — delegates to the shared normalizer (behavior unchanged).
- **`src/components/CheckoutModal.tsx`** — the Despacho select gains "Otra comuna (coordinar por
  WhatsApp)" (`OTHER_COMMUNE_VALUE` sentinel, exported for tests). Picking it clears `formData.city`,
  reveals a required free-text commune input (cap 80, mirrored in `FIELD_MAX_LENGTH.city`), locks
  `paymentMethod` to `'whatsapp'`; the Pago step then renders a notice instead of the online
  methods. A zone name typed into the free-text field is canonicalized on the fly and the method
  reverts to the checkout default — the payload can never carry a spelling the rules would refuse.
- **`src/admin/components/OrderDetailPanel.tsx`** — the stored commune renders verbatim and
  prominently ("Comuna de Despacho") in the delivery block.
- **Docs** — root `AGENTS.md` §3.4, `src/config/AGENTS.md`, `src/components/AGENTS.md` §3.1/§3.2.1/§3.3,
  `src/admin/AGENTS.md` §4.3 + component table, `api/AGENTS.md` §1.1/§2.1.

## Verification

- `pnpm test` — **104 files / 1298 tests passed** (was 103/1277; +1 suite, +21 tests).
- `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit`, `pnpm run typecheck:server` — all clean.

## Review findings and disposition (code-review skill, fresh-context)

| # | Severity | Finding | Disposition |
| :-- | :-- | :-- | :-- |
| F1 | MAJOR | Free-text commune kept the raw typed string; a canonical zone typed into it produced an order the rules refuse (reproduced). | **Fixed** — canonicalize on the fly in the free-text `onChange` (`normalizeDeliveryZone(typed) ?? typed`), reset the forced WhatsApp method when the text becomes a canonical zone, regression test added (`canonicalizes a zone name typed into the free-text field…`). |
| F2 | MAJOR | As-built docs not synced; `src/components/AGENTS.md` contradicted the code; roadmap still showed 0.22 open. | **Fixed** — all four directory guides updated, roadmap synced (board row + Open Tasks entry removed, Resolved History row added, owner bullets added), this walkthrough written. |
| F3 | MINOR | The `b.documentType == 'boleta'` rules pin assertion was removed by an over-broad edit while the rule still exists. | **Fixed** — pin restored. |
| F4 | MINOR | Legacy free-text communes become permanently unapprovable transfer orders (no commune-edit path). | **Accepted residual** — fail-closed by design; recorded in the roadmap's owner checklist (cancel + re-register remediation) for owner confirmation alongside the rules redeploy. |
| F5 | NIT | Stale `paymentMethod` after back-navigation; exact-match minimum hint. | **Fixed** — the select's `onChange` now sets the method with the delivery choice (`'whatsapp'` for "Otra comuna", `'transferencia'` for a zone) and the hint derives from `normalizeDeliveryZone`. |
| F6 | NIT | Test duplicated the `OTHER_COMMUNE_VALUE` sentinel literal. | **Fixed** — the sentinel is exported from `CheckoutModal.tsx` and imported by the test. |

## Human action items (not suspended by YOLO)

1. **Rules redeploy (shared with 0.19's gate):** `pnpm run deploy:rules`, then verify a
   `mercadopago`/`transferencia` order with a non-zone `city` is denied and a `whatsapp` order with
   one is accepted.
2. **Owner confirmation (F4 residual):** legacy pre-select orders with a free-text commune sit
   unapprovable as transfers (`409`); remediation is cancel + re-register.
3. Preview walkthrough of the new "Otra comuna" flow (rides the 8.4 preview gate).
