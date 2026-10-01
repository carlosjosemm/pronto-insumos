# Task 0.22: Delivery Zone Is a Free-Text Claim; Out-of-Zone Buyers Go to WhatsApp

**Branch:** `feat/task-0.22-delivery-zone-whatsapp` (stack bottom, cut from `main` @ 39ba971)
**Status:** implemented under `--YOLO` (owner authorization 2026-10-01; no approval gate)

## 1. Context & Problem Statement

PRODUCTION_READINESS_TODO.md §3 task 0.22 (P2 · NEW; owner decision 2026-09-30):
deliveries outside Melipilla / San Antonio are **not rejected** — for those buyers only
the WhatsApp payment path is available, and the delivery is settled in a direct chat.

Today the checkout commune control is a two-option select, so an out-of-zone buyer has
no honest option, and three server-side gaps let a crafted order dodge the commercial
rules:

- `src/config/delivery.ts:25-27` compares `zone === 'San Antonio'` exactly — a crafted
  `city: "san antonio"` (lowercase) skips the `$60.000` minimum.
- `api/_lib/dispatchReference.ts:45-63` normalizes case/accents for dispatch labels but
  silently labels unknown communes as Melipilla.
- `firestore.rules:74` accepts any `customer.city` string ≤ 80 for every payment method.
- The San Antonio minimum is enforced client-side and in `create-preference` only —
  `approve-transfer` and `resolve-quote` never check it.

## 2. Human Action Items & Placeholders (TODO for Human)

None. No new credentials, env vars or `.env.example` entries. The rules change deploys
with `pnpm run deploy:rules` — recorded as an owner action item in the roadmap's
Owner-only checklist (the owner already owes a redeployment for 0.19; this task's zone
exception rides the same redeploy).

## 3. Proposed Changes

### Shared zone authority — `src/config/delivery.ts` [MODIFY]

- New `normalizeDeliveryZone(value: unknown): DeliveryZone | null` — strips accents,
  trims, collapses whitespace, lowercases, matches against `DELIVERY_ZONES`; returns the
  canonical zone or `null` for anything that is not a configured zone (non-strings,
  empty, unknown communes).
- `isBelowMinimumOrder(zone: unknown, subtotal)` now normalizes internally and takes the
  raw stored commune — only a canonical `San Antonio` order can be below minimum;
  out-of-zone communes return `false` (no minimum; the WhatsApp quote settles the terms).

### Dispatch reference — `api/_lib/dispatchReference.ts` [MODIFY]

- `resolveDispatchReferencePrefix` delegates to `normalizeDeliveryZone` (removes the
  duplicated local normalizer). Unknown communes keep the Melipilla fallback prefix —
  the counter is per zone and the parcel still leaves the Melipilla warehouse.

### Firestore rules — `firestore.rules` [MODIFY]

- `isValidCustomer`: `c.city in ['Melipilla','San Antonio']` **unless**
  `paymentMethod == 'whatsapp'`, in which case a non-empty bounded string (≤ 80) is
  accepted. A crafted non-WhatsApp order can no longer carry an out-of-zone commune.

### Preference endpoint — `api/create-preference.ts` [MODIFY]

- Zone from the order document goes through `normalizeDeliveryZone`; `null` ⇒ `400`
  ("comuna fuera de zona") — a crafted non-WhatsApp order cannot be paid even though
  the rules already deny it (Admin SDK bypasses rules; legacy documents exist).
- San Antonio minimum unchanged (now accent/case-proof via the shared normalizer).

### Transfer approval — `api/_lib/admin/approve-transfer.ts` [MODIFY]

- Out-of-zone stored commune ⇒ `409` conflict, no stock movement.
- San Antonio minimum enforced inside the transaction against the catalog-recomputed
  original subtotal (list prices × consolidated quantities, pre-discount — the same
  basis `create-preference` gates on) ⇒ `409` with an operator message.

### Quote resolution — `api/_lib/admin/resolve-quote.ts` [MODIFY]

- `convert` enforces the San Antonio minimum (`409` with operator message). Out-of-zone
  communes are **not** rejected here: a WhatsApp quote is exactly the legitimate path
  for out-of-zone buyers.

### Checkout UI — `src/components/CheckoutModal.tsx` [MODIFY]

- The `Comuna de Despacho` select gains a third option **"Otra comuna (coordinar por
  WhatsApp)"**; choosing it reveals a required commune text field (cap 80, mirrored in
  `FIELD_MAX_LENGTH.city` to match the rules cap).
- The select's value derives from `normalizeDeliveryZone(formData.city) ?? 'otra'`, so
  `formData.city` stays the single source of truth; typing a canonical zone name in the
  free-text field flips the select back to that zone.
- On the Despacho→Documento transition, an out-of-zone commune locks
  `paymentMethod` to `'whatsapp'`.
- The Pago step renders only the WhatsApp option for out-of-zone communes, with a
  notice explaining that delivery and payment are coordinated by WhatsApp; Mercado Pago
  and bank transfer are removed from the choice list.

### Admin visibility — `src/admin/components/OrderDetailPanel.tsx` [MODIFY]

- The delivery block gains a prominent **Comuna de Despacho** line (the stored commune,
  shown verbatim) above the address, so the operator sees out-of-zone communes at a
  glance.

### Docs — root `AGENTS.md` §3.4 [MODIFY]

- Checkout-zone description updated: the commune control offers Melipilla, San Antonio
  and "Otra comuna (coordinar por WhatsApp)"; out-of-zone buyers pay via WhatsApp only.

## 4. Robust Unit Testing Plan (MANDATORY)

New/updated Vitest suites in `src/tests/`:

- **`config/delivery.test.ts`** (new) — `normalizeDeliveryZone`: exact zones, case /
  accent / whitespace variants (`'san antonio'`, `'SÁN ANTONIO'`, `' Melipilla '`),
  unknown commune / empty / non-string ⇒ `null`. `isBelowMinimumOrder`: San Antonio
  below/at/above the minimum, Melipilla exempt, out-of-zone and garbage communes ⇒
  `false`.
- **`api/dispatchReference.test.ts`** (existing, must stay green) — zone-prefix
  resolution incl. accents/legacy free text.
- **`api/create-preference.test.ts`** (extend) — a `mercadopago` order with an
  out-of-zone commune ⇒ `400`, no MP fetch; `'san antonio'` (lowercase) now hits the
  minimum; canonical zones unchanged.
- **`api/admin/approve-transfer.test.ts`** (extend) — out-of-zone commune ⇒ `409`, zero
  stock writes; San Antonio order below the minimum ⇒ `409`; at/above ⇒ approved.
- **`api/admin/resolve-quote.test.ts`** (extend) — San Antonio quote below the minimum
  ⇒ convert `409`; an out-of-zone commune converts normally (legitimate WhatsApp path).
- **`components/CheckoutModal.test.tsx`** (extend) — selecting "Otra comuna" reveals the
  commune field; the Pago step shows only WhatsApp for an out-of-zone commune; the
  submitted order carries `paymentMethod: 'whatsapp'` and the typed commune.
- **`security/firestore-rules.test.ts` + `security/orderCreateContract.test.ts`**
  (extend) — pins the zone-or-whatsapp exception and the 80-char cap.

Mocking strategy: Firestore Admin via the existing suite doubles (`helpers/`), Mercado
Pago via mocked `fetch`; no live network. Full suite stays green (zero-regression gate).

## 5. As-Built Documentation & Roadmap Sync Plan

- As-built detail → `src/config/AGENTS.md` (delivery.ts contract), `api/AGENTS.md`
  (handler guards), `src/components/AGENTS.md` (checkout commune control),
  `src/admin/AGENTS.md` (commune prominence) — only where behaviour actually changed.
- Roadmap: remove 0.22 from the Active Action Board and Open Tasks, add one Resolved
  History row, add the rules-redeployment owner bullet (shared with 0.19's gate).
- Walkthrough narrative → `.devin/artifacts/task-0.22/walkthrough.md`.
