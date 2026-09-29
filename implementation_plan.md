# Tasks 0.12 + 0.13: Order-Document Binding & Admin Voucher-URL Hardening

**Branch:** `fix/task-0.12-0.13-order-binding-and-voucher-xss` (cut from `main` @ `7a927f1`, in sync with `origin/main`; executing in the primary working tree — no worktrees)
**Status:** **IMPLEMENTED, VERIFIED, REVIEWED — awaiting the owner's wrap-up command.** 688/688 tests (75 suites, +25) · `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit` and the `api/` strict type-check all clean · adversarial read-only review returned **APPROVE WITH FINDINGS**; all five findings (F1–F5) remediated — see §7.
**Owner decisions already taken:** the whole of **Phase 3 is suspended — 3.1, 3.2 and 3.3** (owner decision 2026-09-29, extended to 3.1 the same day). The owner asked for 0.12 and 0.13 to be worked together.

> [!NOTE]
> **Deliberate deviation from the one-task-per-cycle rule.** `production-readiness-workflow` §Step 1 mandates one roadmap item per run. The owner explicitly asked for both here, and the two items are one attack with two ends: 0.12 closes the *write* side (anyone can inject an arbitrary `voucherUrl` into a new order), 0.13 closes the *render* side (the admin panel turns that string into code in the admin origin). Proposal: **one branch, two commits** (`fix(security): … (Task 0.12)` then `… (Task 0.13)`), one review, one PR. If you prefer two branches/PRs, say so before I start — it is a 2-minute restructure.

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **0.12** (P1, launch blocker) and **0.13** (P1, launch blocker), both from the 2026-09-29 audit.

### 0.12 — the public `orders` create is under-specified

`firestore.rules` grants `allow create: if isValidOrderCreate();` to **anyone** holding the public web API key (by design — checkout runs client-side), but the guard does not pin the document to its own identity:

| # | Defect (as built) | Consequence |
| :-- | :--- | :--- |
| D1 | No `data.orderId == orderId` binding (`firestore.rules:26-53`) | A decoy doc `orders/<anything>` carrying `orderId: "PRONTO-<victim>"` can be written. The webhook, `/api/track-order` and `/api/order-confirmation` resolve orders with `where('orderId','==',…).limit(1)` **only** (`api/webhooks/mercadopago.ts:150-154`, `api/track-order.ts:75-79`, `api/order-confirmation.ts:69-73`) and can pick the decoy instead of the real order. |
| D2 | Only `mercadopagoPaymentId` / `paidAt` are blocked (`:51-52`) | Every other admin-only field (`voucherUrl`, `voucherStoragePath`, `approvedAt`, `approvedBy`, `dispatch`, `courier`, `trackingNumber`, `deliveredAt`, `confirmationEmailSentAt`, `discountAmount`, `promoCode`, …) can be **pre-injected at create time** — this is what makes 0.13 reachable with nothing but the public API key. |
| D3 | No key allowlist, no length caps | One public `create` can store ~1 MiB of junk; string fields are unbounded. |
| D4 | `paymentMethod` and `status` are independent | `{ paymentMethod: 'transferencia', status: 'PENDIENTE_PAGO_MERCADOPAGO' }` is accepted; the admin UI and the webhook both branch on these two fields. |

Verified in code: `submitOrder()` (`src/services/api.ts:144-215`) is the **only** rules-governed writer of `orders` — every other writer (webhook, admin handlers, CLI scripts) runs through the Admin SDK, which bypasses rules. The payload shape is therefore fully knowable and can be pinned exactly. `src/tests/security/firestore-rules.test.ts` today only asserts the *presence* of fragments; nothing pins the shape.

### 0.13 — stored XSS in the admin origin

`OrderDetailPanel.tsx` renders `<a href={order.voucherUrl} target="_blank">` for whatever string is stored (`:305-320`), and `handleOpenVoucher` (`:129-142`) `fetch`es **any** `data:` URL into a `Blob` and opens it as an object URL. Because a `blob:` URL inherits the **creator's origin**, a `data:text/html,<script>…</script>` value stored by any anonymous visitor becomes script running on the admin origin — it can read the Firebase Auth session and call every `/api/admin/*` action (approve transfers, dispatch, adjust stock). Two paths follow:

- `javascript:` → default anchor navigation (browser-dependent under `target=_blank`).
- `data:` → **reliable** today thanks to 2.9's Blob handler, which never inspects `blob.type`.

The 2.9 upload path only ever writes server-built `https://firebasestorage.googleapis.com/…` URLs, so the *write* side is safe for honest clients — but 0.12/D2 leaves the field open to everyone else. 0.13 is the defense-in-depth at the render sink; 0.12 removes the injection.

**Scope check performed:** `OrderDetailPanel.tsx` is the **only** place in `src/` that links a stored URL. `/api/track-order` already refuses to echo legacy `data:` values, and `OrderTrackingModal` renders no voucher link (it only offers upload) — so no storefront change is required; the new validator is exported for reuse if that ever changes.

---

## 2. Human Action Items & Placeholders (TODO for Human)

| # | Action | Where / command |
| :-- | :--- | :--- |
| H1 | **Deploy the tightened rules** (already an open human item in the TODO, now blocking) | `pnpm run deploy:rules` (needs `pnpm dlx firebase-tools login` once per machine) |
| H2 | Smoke-test one real checkout on a **preview** deploy after the rules land (the allowlist must not reject the production payload) | Preview URL → one transfer order + one Mercado Pago order |
| H3 | Optional but recommended: after H1, confirm in the console that the deployed ruleset is the new revision | Firebase Console → Firestore → Rules |

**No new environment variables, no new dependencies, no placeholders to fill.** The rules are validated by the Firebase backend at deploy time (syntax) — the new unit test in §4.6 exists precisely because a *semantically* wrong allowlist would otherwise only be discovered by a customer.

> [!IMPORTANT]
> Until H1 runs, the code-side fixes (doc-id-first resolution + URL allowlist) are already live-protective, but the database still accepts decoy documents and pre-injected fields. The rules deploy is what closes the write side.

---

## 3. Proposed Changes

### 3.A `[MODIFY] firestore.rules` — bind the document, allowlist the shape

New helpers + rewritten `isValidOrderCreate(orderId)`. The path wildcard must be passed as an argument (rules functions cannot see a caller's capture variables), so both match blocks change to `allow create: if isValidOrderCreate(orderId);`.

```firestore
function isBoundedString(value, maxLength) {
  return value is string && value.size() <= maxLength;
}

function isValidTaxBreakdown(t) {
  return t.keys().hasOnly(['neto', 'iva', 'total'])
    && t.neto is int && t.iva is int && t.total is int;
}

function isValidSanitaryVerification(s) {
  return s.keys().hasOnly(['sisRegistryNumber', 'credentialFileName', 'verified', 'regulatoryNote'])
    && isBoundedString(s.sisRegistryNumber, 40)
    && s.verified is bool
    && isBoundedString(s.regulatoryNote, 300)
    && (!('credentialFileName' in s) || isBoundedString(s.credentialFileName, 200));
}

function isValidCustomer(c) {
  return c.keys().hasOnly([
      'fullName', 'email', 'phone', 'rut', 'documentType',
      'razonSocial', 'giroComercial', 'address', 'city', 'zip',
      'sanitaryVerification'
    ])
    && isBoundedString(c.fullName, 120)
    && isBoundedString(c.email, 160)
    && isBoundedString(c.phone, 32)
    && isBoundedString(c.rut, 16)
    && c.documentType in ['boleta', 'factura']
    && isBoundedString(c.address, 200)
    && isBoundedString(c.city, 80)
    && isBoundedString(c.zip, 16)
    && (!('razonSocial' in c) || isBoundedString(c.razonSocial, 160))
    && (!('giroComercial' in c) || isBoundedString(c.giroComercial, 160))
    && (!('sanitaryVerification' in c)
        || (c.sanitaryVerification is map && isValidSanitaryVerification(c.sanitaryVerification)));
}

function isValidBilling(b) {
  return b.keys().hasOnly([
      'documentType', 'rut', 'razonSocial', 'giroComercial',
      'direccionFiscal', 'comunaFiscal', 'taxBreakdown', 'status'
    ])
    && b.documentType in ['boleta', 'factura']
    && isBoundedString(b.rut, 16)
    && isBoundedString(b.direccionFiscal, 200)
    && isBoundedString(b.comunaFiscal, 80)
    && b.taxBreakdown is map && isValidTaxBreakdown(b.taxBreakdown)
    // The SII emission state is server-owned: a client may only open a document
    // as PENDIENTE_EMISION_SII — never as EMITIDO.
    && b.status == 'PENDIENTE_EMISION_SII'
    && (!('razonSocial' in b) || isBoundedString(b.razonSocial, 160))
    && (!('giroComercial' in b) || isBoundedString(b.giroComercial, 160));
}

function isValidOrderItem(item) {
  return item is map
    && item.keys().hasOnly(['productId', 'name', 'quantity', 'price'])
    && item.productId is string && item.productId.size() > 0 && item.productId.size() <= 64
    && isBoundedString(item.name, 200)
    && item.quantity is int && item.quantity >= 1
    && item.price is number && item.price >= 0;
}

function isValidOrderCreate(orderId) {
  let data = request.resource.data;
  return data.keys().hasOnly([
      'orderId', 'createdAt', 'paymentMethod', 'status', 'totalAmount',
      'customer', 'billing', 'sanitaryVerification', 'items',
      'promoCode', 'discountAmount'
    ])
    // The document id IS the canonical order id (see api/_lib/orderLookup.ts):
    // binding the field to the path kills the decoy-document shadowing vector.
    && data.orderId is string && data.orderId.size() > 0 && data.orderId.size() <= 32
    && data.orderId == orderId
    && 'createdAt' in data
    && data.totalAmount is int && data.totalAmount > 0
    && data.paymentMethod in ['mercadopago', 'transferencia', 'whatsapp']
    && data.status in [
      'PENDIENTE_PAGO_MERCADOPAGO',
      'PENDIENTE_TRANSFERENCIA',
      'COTIZACION_SOLICITADA_WHATSAPP'
    ]
    // submitOrder() derives the status from the method — the two must agree.
    && (
      (data.paymentMethod == 'mercadopago' && data.status == 'PENDIENTE_PAGO_MERCADOPAGO')
      || (data.paymentMethod == 'transferencia' && data.status == 'PENDIENTE_TRANSFERENCIA')
      || (data.paymentMethod == 'whatsapp' && data.status == 'COTIZACION_SOLICITADA_WHATSAPP')
    )
    && data.customer is map && isValidCustomer(data.customer)
    && (!('billing' in data) || (data.billing is map && isValidBilling(data.billing)))
    && (!('sanitaryVerification' in data)
        || (data.sanitaryVerification is map && isValidSanitaryVerification(data.sanitaryVerification)))
    && (!('promoCode' in data) || isBoundedString(data.promoCode, 32))
    && (!('discountAmount' in data) || (data.discountAmount is int && data.discountAmount >= 0))
    && data.items is list
    && data.items.size() > 0
    && data.items.size() <= 25
    // … the existing index-guarded isValidOrderItem(data.items[0..9]) chain …
    && !('mercadopagoPaymentId' in data)
    && !('paidAt' in data);
}
```

Design notes (checked against the official limits page — function depth 20, ≤7 args, 1,000 expressions/request, 256 KB ruleset; this file stays ~1/20th of every bound):

- **`createdAt` is only required to exist**, not type-checked: the write uses a `serverTimestamp()` sentinel, and a type assertion there is the one thing that could silently deny every real checkout. The key is always written by `submitOrder`.
- **Optional keys stay optional** (`razonSocial`, `giroComercial`, `billing`, `sanitaryVerification`, `promoCode`, `discountAmount`) because the client Firestore instance runs `ignoreUndefinedProperties: true` — absent keys are the normal case, not the exception.
- **Items 11–25 keep the existing treatment** (shape-checked for the first 10, catalog-recomputed server-side for all): the webhook already fails closed (`PAGO_EN_REVISION`, no stock) when any line cannot be priced, so the residual is noise, not money. Extending the chain to 25 lines is possible but is 15 more near-identical expressions for no security gain — deliberately not done.
- **Applied to `dev_orders` automatically** (shared helper; each block passes its own path variable).

### 3.B `[NEW] api/_lib/orderLookup.ts` — one canonical resolver

```ts
export interface ResolvedOrder { ref: DocumentReference; data: Record<string, unknown> }

/** Document key first (the canonical id IS the key), field query only as a legacy fallback. */
export async function resolveOrderByCanonicalId(db: Firestore, cleanOrderId: string): Promise<ResolvedOrder | null>
```

- Doc-id hit → return it. Miss → `where('orderId','==',cleanOrderId).limit(1)` fallback **with a `console.warn`** so a legacy/decoy resolution is visible in the logs (observability requirement of the workflow's review step). Both miss → `null`.
- `[MODIFY] api/webhooks/mercadopago.ts` — replace the inline `where(…)` lookup (`:150-158`) with the helper.
- `[MODIFY] api/track-order.ts` — same (`:75-85`).
- `[MODIFY] api/order-confirmation.ts` — same (`:69-84`).
- `[MODIFY] api/upload-voucher.ts` — delete the local `findOrder` duplicate (`:44-61`) and import the shared helper (identical semantics; its tests already cover doc-first + fallback).
- **Not touched:** `create-preference.ts` and the `api/_lib/admin/*` order handlers already prefer the document key (verified site-by-site — note `api/_lib/admin/order-history.ts` resolves **no order document** at all; it queries `order_status_history` by `orderId`, which is correct for its purpose). Consolidating their inline copies onto the helper is a mechanical follow-up with zero security delta — deliberately out of scope here (anti-overshooting).

### 3.C `[NEW] src/utils/voucherUrl.ts` + `[MODIFY] src/admin/components/OrderDetailPanel.tsx`

Pure validator (fits the `src/utils/` "no DOM, no side effects" contract, unit-testable without rendering):

```ts
export type VoucherLinkKind = 'storage' | 'legacy-data' | 'unsafe'
export const ALLOWED_VOUCHER_DATA_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const

/** 'storage'  → https://firebasestorage.googleapis.com/…  (the only URL shape we ever write)
 *  'legacy-data' → data:<allowed mime>;base64,… (pre-2.9 vouchers, declared type must be allowlisted)
 *  'unsafe'   → everything else: javascript:, data:text/html, foreign https hosts, relative, non-string */
export function classifyVoucherUrl(raw: unknown): VoucherLinkKind
export function normalizeAllowedVoucherMime(type: string): string | null   // 'image/jpg' → 'image/jpeg'
```

Component changes:
- `classifyVoucherUrl` decides the render: `storage` → real `<a href>` (unchanged UX); `legacy-data` → **`<button>`** that runs the Blob path; `unsafe` → plain non-interactive text (`Comprobante no verificable — revisar el documento en Firestore`), no anchor, no click handler.
- `handleOpenVoucher` keeps the Blob conversion but adds the post-fetch gate the audit asks for: `blob.type` must normalize to an allowed MIME, otherwise refuse with the existing error slot; the object URL is always built from a **re-wrapped** `new Blob([blob], { type: forcedType })`, so the browser can never treat the bytes as HTML. `window.open` keeps `noopener,noreferrer`; the 60 s revoke stays.
- No CSS/design-system change; the "Ver Comprobante" affordance keeps its existing classes.

---

## 4. Robust Unit Testing Plan (MANDATORY)

All new/updated suites are hermetic (Firestore, Storage, `fetch` and `window.open` mocked at the boundary; no network, no emulator, no new dependency).

**4.1 `[MODIFY] src/tests/security/firestore-rules.test.ts`** — content assertions for the new contract:
- `isValidOrderCreate(orderId)` is called with the path variable in **both** `orders` and `dev_orders` (the existing `dev_orders` assertion `allow create: if isValidOrderCreate();` must be updated — expected, the signature changed).
- `data.orderId == orderId` present; top-level `keys().hasOnly([...])` parsed and asserted to contain exactly the 11 documented keys.
- **Negative assertions:** the allowlist must **not** contain `voucherUrl`, `voucherStoragePath`, `approvedAt`, `approvedBy`, `dispatch`, `courier`, `trackingNumber`, `deliveredAt`, `confirmationEmailSentAt`, `mercadopagoPaymentId`, `paidAt`.
- `paymentMethod`/`status` consistency block present; `billing.status == 'PENDIENTE_EMISION_SII'` present; nested `hasOnly` for customer / billing / taxBreakdown / sanitaryVerification / item keys; caps present for the representative fields.

**4.2 `[NEW] src/tests/security/orderCreateContract.test.ts`** — the drift guard (the most valuable test here, because there is no rules emulator):
- Drive the **real** `submitOrder()` with mocked `firebase/firestore` (`setDoc` capture, the pattern already used in `src/tests/services/api.test.ts`), for three payload variants: boleta + no promo, factura + sanitary verification, and promo applied.
- Parse the four `hasOnly([...])` lists out of `firestore.rules` and assert, for every variant, `Object.keys(payload) ⊆ allowed` at each level (root, `customer`, `billing`, `taxBreakdown`, `items[]`).
- Failure mode this prevents: someone adds a field to the order payload (or renames one) and the rules silently start denying **every** checkout in production — the one regression class this task could otherwise introduce.

**4.3 `[MODIFY] src/tests/api/mercadopago-webhook.test.ts`** — decoy-document test:
- `collection('orders').doc('PRONTO-123456').get()` → the real order; `where('orderId','==',…)` → a decoy with a different ref.
- Assert the transaction reads/writes the **real** ref (status → `PAGADO_MERCADOPAGO`, stock deducted once) and the decoy is never touched. Plus the existing suites' mocks updated to the doc-first contract.

**4.4 `[MODIFY] src/tests/api/track-order.test.ts` + `order-confirmation.test.ts`** — mocks gain `.doc()`; new cases: doc-id hit wins over a decoy field match; legacy doc (no id match) still resolves through the fallback.

**4.5 `[NEW] src/tests/api/orderLookup.test.ts`** — helper contract: doc hit → returns `{ref,data}`; miss + field hit → returns the fallback **and warns**; both miss → `null`.

**4.6 `[NEW] src/tests/utils/voucherUrl.test.ts`** — `classifyVoucherUrl`: real storage URL → `storage`; `https://firebasestorage.googleapis.com.evil.com/…`, `https://evil.com/x.pdf`, `http://…` (not https), `javascript:alert(1)`, `data:text/html,…`, `data:application/pdf;base64,…` → correct buckets; relative/garbage/`null`/number → `unsafe`; MIME normalization (`image/jpg` → `image/jpeg`, `APPLICATION/PDF` → allowed, `text/html` → rejected).

**4.7 `[MODIFY] src/tests/admin/OrderDetailPanel.test.tsx`** —
- storage URL → anchor with `href`/`target` (existing test kept);
- legacy `data:image/png` → Blob path, and the Blob handed to `createObjectURL` carries the **forced** MIME (existing test extended);
- `javascript:alert(1)` → no anchor, `window.open` never called, non-interactive text rendered;
- `data:text/html,<script>…</script>` → `fetch` never called, nothing opened;
- `https://evil.com/comprobante.pdf` → no anchor, nothing opened;
- post-fetch mismatch (`data:application/pdf` whose body reports `text/html`) → refused, nothing opened;
- the `mockOrder` fixture's `voucherUrl: 'https://example.com/receipt.pdf'` is replaced by a real storage URL (it was never a shape the app writes) — the first test's `Ver Comprobante` assertion is updated accordingly.

**Gates (all five, per `parallel-worktree-workflow`):** `pnpm test` · `pnpm build` · `pnpm lint` · `pnpm format:check` · `pnpm exec tsc --noEmit`, plus the `api/` strict type-check (`pnpm exec tsc --noEmit --strict --module esnext --moduleResolution bundler --types node` over `api/**`, the invocation recorded in TODO 8.2). Zero-regression policy: the 663 existing tests stay green; expected new total ≈ 690 (real counts recorded at wrap-up).

---

## 5. As-Built Documentation & Roadmap Sync Plan

| File | Update |
| :--- | :--- |
| `api/AGENTS.md` | §8.1 order lookup: the canonical `resolveOrderByCanonicalId` rule (document key first, field query only for legacy docs) + the decoy rationale; note the rules now bind `orderId` to the path. |
| `src/admin/AGENTS.md` | Voucher display contract: URL allowlist (storage host only) + the legacy `data:` MIME gate and why the Blob re-wrap exists. |
| `src/utils/AGENTS.md` | Add `voucherUrl.ts` to the module map (pure validator). |
| `src/tests/AGENTS.md` | Suite counts + one line per new suite; remove the stale conflict marker at line 30 (approved by the owner for this branch — see the note below). |
| root `AGENTS.md` §4 | Extend the `firestore.rules` bullet: order docs bound to their id, field allowlist, `paymentMethod`/`status` consistency, length caps. |
| `PRODUCTION_READINESS_TODO.md` | Move 0.12 and 0.13 to §2 as one-line resolved rows; drop them from §1; refresh the baseline test counts; keep the `pnpm run deploy:rules` human item (now the last step for 0.12). |
| `implementation_plan.md` / `walkthrough.md` | Status → implemented/verified; walkthrough written at wrap-up (gitignored). |

**Unrelated defect folded into this branch (owner-approved 2026-09-29):** `src/tests/AGENTS.md:30` carries a committed merge-conflict marker (`<<<<<<< HEAD`) left behind by an earlier merge — the surrounding text is otherwise resolved and the marker is the only one in the repository (verified by a repo-wide search). Fix = delete the single line, in the same doc pass as the suite-count update. It rides in its own commit (`docs(tests): remove a stray merge-conflict marker from the test guide`) so the security commits stay clean.

---

## 6. Execution Order (after approval)

1. Commit A — 0.12: `firestore.rules` + `api/_lib/orderLookup.ts` + the 4 API consumers + §4.1–4.5 tests.
2. Commit B — 0.13: `src/utils/voucherUrl.ts` + `OrderDetailPanel.tsx` + §4.6–4.7 tests.
3. Gates → adversarial read-only code review (`/code-review`) → remediate → as-built docs → roadmap sync.
4. **Stop.** Commit/push/PR only on your explicit "wrap up and proceed" (then H1 `pnpm run deploy:rules` remains the human close-out).

---

## 7. Adversarial Review Disposition (fresh-context read-only reviewer, 2026-09-29)

Verdict: **APPROVE WITH FINDINGS** — "no blocker: the two fixes are real, correctly targeted and the checkout payload provably fits the new rules allowlists". Every finding was introduced by this change and every one is now remediated:

| # | Sev | Finding | Remediation |
| :-- | :-- | :--- | :--- |
| F1 | MINOR | The new doc-key-first lookup made `CollectionReference.doc()` throw for ids containing `/`, turning malformed public input into a `500` echoing SDK internals | `resolveOrderByCanonicalId` skips the document-key attempt when the id is empty or contains `/` (the field query can never throw) → clean `404`; pinned by a new `orderLookup` case |
| F2 | MINOR | The new rules length caps had no client-side counterpart, so an over-long field would dead-end checkout with "reintenta" | `FIELD_MAX_LENGTH` in `CheckoutModal` mirrors every cap (`maxLength` on the inputs, file-name clamp for `credentialFileName`); the drift guard asserts the rules↔client pairing |
| F3 | MINOR | `CustomerInfo.transferReceipt` is a documented field that the new customer allowlist would have rejected wholesale | Allowlisted (bounded at 120) with a comment; asserted in the rules content test |
| F4 | MAJOR | As-built docs still described the pre-fix lookup (`api/AGENTS.md` §8.1 said the webhook/track-order/order-confirmation use the field query *only*) | Executed plan §5: `api/AGENTS.md` §3.1/§3.2/§8.1, `src/admin/AGENTS.md`, `src/utils/AGENTS.md` (+ new §2.7), `src/tests/AGENTS.md`, root `AGENTS.md` §1/§4/§6, roadmap §1/§2/baseline, this plan |
| F5 | MINOR | The post-fetch `blob.type` re-check is vacuous for `data:` URLs (the fetched type *is* the declared one) and the test did not fail if the load-bearing re-wrap were deleted | Comments corrected in `voucherUrl.ts` + `OrderDetailPanel` (the re-wrap is the control, the check is belt-and-braces); the legacy test now opens an `image/jpg` Blob and asserts the forced `image/jpeg`, so deleting the re-wrap fails it; the mismatch case is marked defensive-only |

Pre-existing items the reviewer surfaced were **not** fixed here (out of scope, tracked): the raw-error echo in `track-order`/`order-confirmation`/`create-preference` (P4), the arbitrary legacy-doc choice under duplicate `orderId` fields (P5, NIT), and `upload-voucher`'s identical `/`-in-id exposure (P1) — that last one is **closed as a side effect**, because `upload-voucher` now shares the guarded resolver. The reviewer's P2 (the TODO 8.2 `api/` tsc invocation missing `--target es2022`) and P3 (the `src/tests/AGENTS.md` conflict marker) are both fixed in this branch.

Two additional pre-existing doc defects were repaired while in the files: the committed merge-conflict marker in `src/tests/AGENTS.md` and a broken code fence in root `AGENTS.md` §4 that had swallowed the `deploy:*` command block into the rules bullet.
