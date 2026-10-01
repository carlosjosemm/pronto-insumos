# PRONTO INSUMOS ODONTOLÓGICOS — Production Readiness TODO

A working task list, not a changelog. Finished work is one line in [§4 Resolved History](#4-resolved-history); its as-built detail lives in the `AGENTS.md` of the directory it touches. Open tasks keep their IDs (they are referenced from code comments and `AGENTS.md` files) — do not renumber.

**Last updated:** 2026-09-30 · **Audit provenance:** static source audit only; no live infrastructure or production behavior verified. · **Market:** Melipilla & San Antonio, Chile · **Stack:** Vercel (React 18 + Serverless Node) · Firebase (Firestore + Cloud Storage, Blaze plan since 2.9) · Mercado Pago Chile · Resend
**Previously recorded baseline (not rerun for this update):** `pnpm test` 860/860 (82 suites) · `pnpm lint`, `pnpm build`, `pnpm format:check` and `pnpm exec tsc --noEmit` recorded clean · `api/` type-check recorded clean under `--strict --target es2022`.

**Priorities:** **P1** = close before real traffic · **P2** = next release / before a marketed launch · **P3** = optional polish or DevOps. Code complete is not deployment verification: source-level acceptance does not prove deployed production configuration, live provider behavior, or owner operational readiness.

[Active board](#1-active-action-board) · [Go-live gates](#2-go-live-evidence-and-gates) · [Open tasks](#3-open-tasks) · [Resolved history](#4-resolved-history)

---

## 1. Active Action Board

Work P1 first, then P2, then P3. Rows link to detail in [§3 Open Tasks](#3-open-tasks). This is the execution summary; evidence and implementation detail live in each task entry. Deployment and operator gates are distinct from code completion.

### P1 — Before real traffic

| ID | Outcome / risk | Gate |
| :-- | :-- | :-- |
| [Owner gate — 0.12](#owner-only-checklist) | Production Firestore rules deployment is not verified; until deployed, decoy documents and admin-only field pre-injection may still be accepted | Owner deploys and independently verifies rules before traffic; this is not a new source task |
| [x] [0.17](#task-0-17) | Reconcile approved/reversal payments when order data is missing | Idempotent incident persists; missing-order manual reconciliation and failure tests pass |
| [x] [1.7](#task-1-7) | Make tax breakdowns and customer tax communications server-authoritative | Forged MP/transfer billing is rejected or shown provisional; issuance uses verified total |
| [x] [2.17](#task-2-17) | Bind MP preference creation/success to a valid pending order | Order, total, zone, host and retry checks pass |
| [x] [4.3](#task-4-3) | Harden admin state, amount and inventory mutations | Guard/race tests pass; `PAGO_EN_REVISION` reconciliations have evidence and operator note |
| [x] [4.4](#task-4-4) | Prevent inventory admin hook-order crash | Null-to-product rerender test passes |
| [x] [4.6](#task-4-6) | Define an auditable handoff for WhatsApp quote orders | Owner-approved operational route is ready before exposure, or WhatsApp is not a checkout payment method |
| [x] [8.17](#task-8-17) | Make catalog imports/seeds non-destructive and identity-stable | Repeat/reorder tests and read-only operator rehearsal preserve live-like data |

### P2 — Next release / before marketed launch

| ID | Outcome / risk | Gate |
| :-- | :-- | :-- |
| [x] [0.18](#task-0-18) | Detect partial MP refunds for manual review | Partial/full/replay tests create one deduplicated incident; no auto-refund |
| [x] [2.15](#task-2-15) | Bound orphan voucher uploads and legacy payloads | Housekeeping/cap or detail-fetch path verified without weakening access controls |
| [x] [2.18](#task-2-18) | Prevent unsafe payment retry after ambiguous return | Failed/pending/delayed/cross-tab cases reconcile prior order before retry |
| [x] [4.2](#task-4-2) | Close backoffice tests, pagination, refresh and KPI gaps | Deep-link, stale selection, read failure, KPI and bounded-read checks pass |
| [x] [4.5](#task-4-5) | Define manual cancellation/refund/return/chargeback operations | Owner walkthrough leaves an auditable order-history trail; restock controlled |
| [5.3](#task-5-3) | Make transactional-mail failures visible and resend safe | Admin-down, concurrent-confirm and provider-failure cases are recoverable |
| [8.4](#task-8-4) | Add a lean pre-release gate beyond Vite compilation | Preview API/admin/order-flow smoke uses TEST credentials and non-customer data only; never mutate production |
| [8.12](#task-8-12) | Add and stage security headers | Preview policy checked before enforcement |
| [8.13](#task-8-13) | Close stale pending orders without losing late payments | MP ledger checked before close; late approvals go to manual review |
| [8.16](#task-8-16) | Add App Check abuse friction for public order creation | Preview order creation works with enforcement; not auth/price validation |
| [9.1](#task-9-1) | Keep promo policy lean unless campaigns require controls | Owner confirms active codes intentional/margin-safe or disables unused codes before traffic; future policy remains conditional |

### P3 — Optional

| ID | Outcome / risk | Gate |
| :-- | :-- | :-- |
| [2.14](#task-2-14) | Decide public `stockCount` vs. stock-free view | Owner decision; no opportunistic schema change |
| [2.16](#task-2-16) | Show customer-friendly local courier label | Legacy carrier keys render through shared labels |
| [6.2](#task-6-2) / [6.3](#task-6-3) | Add datasheets / expand catalog by specialty | Owner prioritizes content and source assets |
| [6.4](#task-6-4) | Decide fixture retention and seed role | Choose maintained seed source or document fixture boundary |
| [8.1](#task-8-1) | Reduce bundle cost | Admin/Firebase graph changes show measured reduction |
| [8.2](#task-8-2) | Type-check serverless functions consistently | Lean server check matches documented passing flags |
| [8.5](#task-8-5) | Add monitoring / analytics if useful | Owner chooses minimal signals and alert path |
| [8.9](#task-8-9) | Document variables / URL default | Production URL and environment verification is a separate owner pre-traffic gate in §2 |
| [8.10](#task-8-10) | Widen lint/format coverage | Findings fixed before ignores are removed |
| [8.11](#task-8-11) | Make Firebase init resilient | Invalid config cannot blank storefront; admin auth remains isolated |
| [8.14](#task-8-14) | Revisit dependency hygiene | Recheck on relevant updates; remove override only when condition met |
| [8.15](#task-8-15) | Remaining operator smoke-script UX | WhatsApp smoke fixture runs; production data-write safety is the P1 gate in 8.17 |

### Suspended — owner decision; not in the active queue

| ID | Status | Accepted consequence while suspended |
| :-- | :-- | :-- |
| [1.5](#task-1-5) | **SUSPENDED** — Phase 1 (owner decision, 2026-09-30) | No verified Boleta issuance path: `billing.status` stays `PENDIENTE_EMISION_SII` and no storefront/email copy may claim a Boleta is issued or emailed. Do not unsuspend or implement. |
| [1.6](#task-1-6) | **SUSPENDED** — Phase 1 (owner decision, 2026-09-30) | Verification stays a client-typed SIS number with no dispatch gate; the owner must not list regulated (`prescriptionRequired`) SKUs. Do not unsuspend or implement. |
| [3.1](#task-3-1) | **SUSPENDED** — Phase 3 | No freight below `$150.000`; PRONTO absorbs courier cost. Do not unsuspend or implement. |
| [3.2](#task-3-2) | **SUSPENDED** — Phase 3 | No estimated delivery windows. Do not unsuspend or implement. |
| [3.3](#task-3-3) | **SUSPENDED** — Phase 3 | Existing stale localization copy remains. Do not unsuspend or implement. |
| [7.1](#task-7-1) | **SUSPENDED** — Phase 7 | Published legal copy remains an owner-reviewed draft without lawyer sign-off; do not chase review. |
| [7.2](#task-7-2) | **SUSPENDED** — Phase 7 | Storefront stays on `https://pronto-insumos.vercel.app`; do not register/configure `.cl`. |

### Owner-only checklist

These production and operating checks cannot be closed by static source review. **No live state was verified in this audit.** Never include secret values in notes or commits.

- **P1 owner gate — 0.12 Firestore rules:** code-side hardening is recorded, but the production rules deployment remains pending. Run `pnpm run deploy:rules` and independently verify deployment; until then, rules may still accept decoy documents and pre-injected admin-only fields.
- **8.6 production deployment:** human operator runs `pnpm dlx vercel@latest deploy --prod` and verifies the result; this agent must not run it.
- **2.9 production storage:** verify Blaze/bucket provisioning, then run `pnpm run storage:cors -- --apply` and `pnpm run deploy:storage-rules`. Set `FIREBASE_STORAGE_BUCKET` in Vercel Production if the actual bucket is not the default `<project>.firebasestorage.app`.
- **8.8 TTL record:** prior documentation recorded production `abuse_counters.expiresAt` as ACTIVE on 2026-09-29; this audit did not re-verify live state. Optional dev twin: `gcloud firestore fields ttls update expiresAt --collection-group=dev_abuse_counters --enable-ttl --project=pronto-insumos`.
- **P1 owner gate — 8.9 production environment:** verify `SITE_URL=https://pronto-insumos.vercel.app`, `ALLOW_SIMULATED_PAYMENTS=false`, `VITE_ALLOW_SIMULATED_PAYMENTS=false`, and intended Firestore/Vercel production alignment. Do not expose secrets.
- **P1 owner gate — 9.1 current promotions:** confirm public `PRONTO10` / `DENT20` codes are intentional and margin-safe, or disable unused codes before traffic. This is an owner business decision; no promo backend is implied.
- **P1 owner gate — 4.6 quote/Factura handoff:** the code route is now built (`resolve-quote`: operator-attested conversion with one stock deduction, or decline without stock movement — see the task entry), and checkout keeps exposing WhatsApp per the owner decision. Before real traffic, run the operator walkthrough on a preview/staging order: accepted quote → verified payment + one stock deduction, declined quote, late reply, no duplicate fulfillment on re-click, and correct customer tracking. If the walkthrough is not done before traffic, hide the WhatsApp checkout method and retain WhatsApp contact for Factura requests. This is operational, separate from suspended 7.1 legal sign-off and 7.2 domain work.
- For 8.4, preview checks use TEST credentials and non-customer test data only; do not mutate production. See the runtime/operator acceptance gate in 8.4.
- Optional: configure 5.2 WhatsApp Business greeting/away/quick replies; supply owner-produced Appendix B.3/B.4 assets if desired.

---

## 2. Go-live evidence and gates

This section separates source-level capability from independently verified production and owner operations; it is **not** launch approval.

- **Code present, not proof of production deployment:** orders start pending; Mercado Pago payment settlement and its stock deduction run only through the verified webhook; bank transfers are approved server-side by admin (4.3); clients never approve payment or deduct stock. Server-side amount checks exist; transactional messages are implemented fail-safe. Historical task detail is at [§4 Resolved History](#4-resolved-history).
- **Boleta status:** checkout writes `billing.status = PENDIENTE_EMISION_SII`; no SII issuance handler or portal action transitions it to `EMITIDO`. Do not claim checkout issues or emails a Boleta until the suspended 1.5 procedure is unsuspended, completed and issuance recorded. `LegalModal` / `PaymentReturnModal` copy is not issuance evidence.
- **Independent production/owner gates:** deployed Firestore/storage rules, production environment/provider configuration, preview API smoke/manual MP test, and operator walkthroughs remain unverified; see the [owner-only checklist](#owner-only-checklist). Boleta issuance (1.5) and regulated-product controls (1.6) are suspended owner decisions; their accepted consequences are recorded in §1.
- **Accepted exceptions:** while 3.1 and 7.2 remain suspended, orders below `$150.000` carry no freight charge and the storefront uses `https://pronto-insumos.vercel.app`. These are owner decisions, not a recommendation to unsuspend.

---

## 3. Open Tasks

[Back to active board](#1-active-action-board) · [Go-live gates](#2-go-live-evidence-and-gates) · [Resolved history](#4-resolved-history)

### Phase 0 — Security & Payment Integrity (static source audit, 2026-09-29)

<a id="task-0-17"></a>

- [x] **0.17. Reconcile Approved/Reversal Payments with Missing Order Data** _(P1; coordinate with 0.11)_
  - **Evidence:** `api/webhooks/mercadopago.ts:175-205,715-725` acknowledges `200` when an approved/reversal payment has no usable `external_reference`/`description` or no matching Firestore order; `src/tests/api/mercadopago-webhook.test.ts:484-514` pins the current behavior. Mercado Pago `404` is correctly acknowledged and is not this gap.
  - **Risk:** a real settlement can be acknowledged without durable reconciliation.
  - **Fix:** persist a small Firestore incident keyed idempotently by `paymentId` for warehouse/manual reconciliation; no new function. Retry transient conditions; for an irrecoverably missing order, acknowledge only after the incident is durable (avoid endless `5xx`); return `5xx` if incident persistence fails.
  - **Accept:** tests cover unusable reference/description or missing order, duplicate delivery, transient recovery and incident-store failure. On preview/test, verify Mercado Pago event semantics; owner ledger reconciliation remains fallback for absent/unreliable events.

<a id="task-0-18"></a>

- [x] **0.18. Detect Partial Mercado Pago Refunds** _(P2; coordinate with 4.5)_
  - **Evidence:** `api/AGENTS.md` records known R9; webhook only handles `refunded` / `charged_back` status, and the approved-payment fast path skips same-payment notifications even when `transaction_amount_refunded > 0`. Whether Mercado Pago delivers a distinct partial-refund event is unverified by this static scan.
  - **Risk:** partial refunds may leave a settled order without an operator incident.
  - **Fix:** detect partial refund and create one deduplicated manual incident/alert; no automatic refund pipeline.
  - **As built (2026-09-30):** the webhook detects an `approved` payment whose cumulative `transaction_amount_refunded > 0` (verified against Mercado Pago's official docs: a partial refund keeps `status: 'approved'` + `status_detail: 'partially_refunded'` with the original `transaction_amount`, and the `payment` topic fires on every payment update through the already-configured subscription). Two detection surfaces — the duplicate fast path (the named R9 gap) and a settlement whose approval delivery was retried after the refund landed. Each detection stamps the `partialRefundPaymentId`/`partialRefundAmount`/`partialRefundAt` marker fields on the order document and writes one `PAGO_REEMBOLSO_PARCIAL` history event + Spanish warehouse alert — **no status flip, no stock movement, no customer email, no automatic gateway refund**. The dedup is monotonic (lower-or-equal cumulative amount under the same payment id ⇒ stale replay, nothing written; a higher amount ⇒ new incident), so successive partial refunds are never swallowed and replay ping-pong cannot manufacture spurious alerts; a positive non-integer amount is logged loudly and treated as absent. Full refunds keep flowing through the `refunded`/`charged_back` reversal branch, which takes precedence over the partial path.
  - **Accept:** met at source level — 9 new webhook cases cover the partial path (one incident, no flip/no stock/no customer email), replay dedup, successive higher amounts, plain-duplicate unchanged, different-payment → `PAGO_DUPLICADO`, full-refund precedence, delayed-approval settlement + incident in one transaction, review-parked order and the refund-independent amount assertion. **Remaining human step:** the optional recommended smoke test — trigger a partial refund on a preview/test Mercado Pago payment and confirm the incident appears exactly once; owner ledger reconciliation remains the fallback authority.

### Phase 1 — Billing & Regulated Products

> 1.5 and 1.6 are suspended by owner decision (2026-09-30) — not in the active priority queue; see the suspended board for their accepted consequences. 1.7 is resolved (2026-09-30).

<a id="task-1-5"></a>

- [ ] **1.5. Boleta Issuance Operations** _(P1 — suspended, owner decision 2026-09-30; separate from suspended 7.1 legal review)_
  - **Evidence:** `src/components/CheckoutModal.tsx:342` writes `billing.status = PENDIENTE_EMISION_SII`; no API/admin handler or portal action transitions it to `EMITIDO`. `LegalModal` promises every sale issues a Boleta and `PaymentReturnModal` says it will email it.
  - **Risk:** checkout appears to promise a tax document without an implemented/verified issuance path.
  - **Fix:** define a manual authorized SII issuance procedure before paid-order dispatch: operator queue; record folio/date/issuer; deliver to customer and keep an audit link to the order. Do not claim actual issuance until recorded. No paid SaaS/SII automation required.
  - **Accept:** owner confirms authorized issuer/access and dry-runs representative paid/refunded sale; dispatch waits for issuance record; customer delivery and audit trail demonstrated.

<a id="task-1-6"></a>

- [ ] **1.6. Regulated Product Verification Before Dispatch** _(P1 — suspended, owner decision 2026-09-30; accepted consequence: no regulated SKUs are listed)_
  - **Evidence:** `src/components/CheckoutModal.tsx:310-316` writes `verified: true` from typed SIS number; `firestore.rules:isValidSanitaryVerification` checks only the boolean; `src/admin/components/OrderDetailPanel.tsx:262-272` displays the number; `api/_lib/admin/dispatch-order.ts` has no verification gate.
  - **Risk:** a client-entered number alone is treated as verified, without independent check or dispatch hold. This is a safety/compliance sign-off, not a claim about a specific legal interpretation.
  - **Fix:** make verification server-owned; manually check RNPI/SIS and record audited admin confirmation; block dispatch of `prescriptionRequired` lines until confirmed, failing safely for missing product data. If not ready before launch, do not list regulated SKUs. No new registry integration.
  - **Accept:** tests cover forged client `verified: true`, wrong/missing registration, accepted admin verification and unaffected non-regulated order; owner completes verification/dispatch walkthrough.

<a id="task-1-7"></a>

- [x] **1.7. Server-Authoritative Tax Breakdown in Customer Communications and Boleta** _(P1; coordinate with 1.5, 4.3 and 8.16)_
  - **Evidence:** `firestore.rules:42-45` (`isValidTaxBreakdown`) checks integer fields only; `isValidBilling` at `firestore.rules:78-93` accepts the client-written breakdown without math/total cross-check. `src/services/api.ts:257-283` accepts caller billing data. `api/_lib/emailTemplates.ts:150-158` selects `billing.taxBreakdown` total/neto/iva over `order.totalAmount` (also used at `:228,251,274`). MP webhook compares payment against `order.totalAmount`, but email can still present a forged fiscal figure; transfer confirmation is sent before admin verifies catalog total.
  - **Risk:** crafted `totalAmount=189990` with tax breakdown `total=1` / `iva=0` can result in a correct MP charge but incorrect customer email; unverified transfer amount can also mislead.
  - **Fix:** derive email neto/IVA using `src/utils/tax.ts:calculateTaxBreakdown` from a trusted amount, never client-written billing. Before catalog verification, recompute/validate transfer or quote total before stating an exact amount, or clearly mark it provisional and block DTE issuance. Bind billing breakdown math to totals in rules as defense in depth if within rules budget. Manual SII issuance (1.5) must use only the verified total and human corroboration. No SII API integration.
  - **Accept:** tests cover forged breakdowns in MP and transfer communications, correct integer-CLP tax math, and provisional/awaiting-validation copy; mismatched RUT/tax identity is routed to review as appropriate. Manual issuance walkthrough confirms the verified total and human corroboration.
  - **As built (2026-09-30):** `submitOrder` derives `billing.rut`/`taxBreakdown`/`status` from the recomputed total (caller billing contributes fiscal identity fields only). `firestore.rules` binds `neto == math.round(total/1.19)` + `neto+iva==total` + `taxBreakdown.total==totalAmount` + `billing.rut==customer.rut`, so a forged breakdown or tax identity cannot persist even bypassing the client — **rules redeploy pending under the 0.12 owner gate**. Emails: `OrderEmailData` no longer carries the stored breakdown; `totalsBlock` derives via `calculateTaxBreakdown(totalAmount)`, the pre-verification "order received" send is labelled `Total referencial`, and `track-order` derives instead of echoing. Verified: `pnpm test` 938/938 (86 suites), build/lint/format/tsc clean.

### Phase 2 — Checkout, Payment Return & Storefront

<a id="task-2-14"></a>

- [ ] **2.14. Decision: Public `stockCount` Read vs. the "Confidential Stock" Rule** _(P3)_
  - `firestore.rules` grants public `read` on `products`, so exact `stockCount` is fetchable by anyone even though `src/data/AGENTS.md` §3.2 declares it confidential (the UI only hides it). Either accept and amend that rule, or publish a stock-free projection (e.g. `stockBucket`/`inStock` only) and keep exact counts admin/server-side. Low urgency; do not change opportunistically — it touches `cartStorage` clamping and `create-preference`.

<a id="task-2-15"></a>

- [x] **2.15. Voucher Storage Follow-Ups (post-2.9)** _(P2)_
  - **Unconfirmed uploads are never cleaned up.** There is no durable per-order lifetime cap; 8.8 adds a 15-minute attempt budget, so signed-URL minting is bounded per window but remains repeatable. An upload never `confirm`ed leaves an orphan object of up to 5 MiB under `vouchers/…` (Blaze bills storage). Add durable per-order bounding and housekeeping for objects not referenced by an order (bucket lifecycle rule on a `pending/` prefix that `confirm` moves out of, or admin sweep on the existing dispatcher — no new function slot).
  - **Legacy base64 vouchers still live in pre-2.9 order docs.** `track-order` now hides `data:` URLs, but `api/_lib/admin/orders.ts:48-59` still returns every order document — including any `voucherUrl` base64 (up to ~1 MiB each) — and Vercel caps responses at 4.5 MB, so the admin list breaks once a few legacy vouchers accumulate. Either migrate them to Storage with a one-off operator script (dev by default, `--confirm-production-…` for prod, per 8.17) or have `orders.ts` return `hasVoucher` instead of the URL and fetch the URL only on the detail request. Also see 0.13 for the `data:` handling.
  - **`voucherUrl` is a permanent capability URL** (Firebase download token; never expires unless the token is rotated). Acceptable today — it is only exposed to the RUT-authenticated customer and admins — but note it if vouchers ever need revocation.
  - **Platform facts (verified 2026-09-28) that shaped the design:** Firestore 1 MiB doc cap and 1 GiB free tier; Vercel 4.5 MB request/response body cap (hence client-direct upload and no bytes through functions); Cloud Storage for Firebase needs Blaze. Sources: [Firestore limits](https://firebase.google.com/docs/firestore/quotas) · [Vercel limits](https://vercel.com/docs/functions/limitations) · [Storage billing change](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
  - **As built (2026-09-30):** the orphan half is bounded **and** reclaimable in code — no GCS lifecycle rule and no new function slot. `sign` now reserves a lifetime slot in `voucherSignCount` on the order document inside a Firestore transaction (cap `VOUCHER_MAX_SIGNS_PER_ORDER = 10`; reserved before minting; `429` + WhatsApp fallback at the cap; `500` fail-closed if the reservation cannot be written), which survives every throttle window the way the 15-minute attempt budget cannot. The new `voucher-housekeeping` action on the existing `api/admin/[action]` dispatcher deletes only the objects an order does not reference and that are older than a 60-minute grace window (the signed PUT URL lives 10 minutes, so it can never race an in-flight upload); it lists **per order**, so an unscanned order can never be mistaken for an orphan, supports `dryRun`, records listing/delete failures without aborting, and is reachable from the `#settings` "Mantenimiento de Comprobantes" card with a per-run order limit. The legacy half took the lean `hasVoucher` route: `api/_lib/admin/orders.ts` drops `voucherUrl` from the **list** projection and adds `hasVoucher: Boolean(voucherUrl || voucherStoragePath)` (the same predicate `/api/track-order` uses), while the `?orderId=` **detail** request still returns the full document; the backoffice fetches the detail on select (and after each action), and `OrderDetailPanel` renders a neutral note when `hasVoucher` is set but the URL has not loaded. No data migration was needed. The capability-URL note is recorded in `api/AGENTS.md` §3.2 (rotate the download token or delete the object if revocation is ever required).
  - **Accept:** met at source level — 4 new suites (93/1064 total) cover the sign cap (one slot per call, `429` + no URL at the cap, `500` fail-closed on a failed reservation), the sweep (deletes only stale unreferenced objects, keeps the referenced path, skips recent/unknown-age objects, `dryRun`, `orderId` scoping, outside-prefix guard, non-fatal failures), the list/detail projection, and the admin detail-fetch + settings card. **Remaining human step:** run the `#settings` sweep (dry run first) once against the real bucket to confirm the reported counts before deleting.

<a id="task-2-16"></a>

- [ ] **2.16. Courier Display Label for the Local Fleet** *(P3 — found by the Task 2.13 review, 2026-09-29)*
  - **Gap:** `dispatch-order` stores the admin select's raw `CarrierType` key in `courier` (`despacho_local_melipilla`), so the customer reads *"En tránsito con despacho_local_melipilla (Ref. Despacho: MEL-260929-07)"* in `track-order` and *"Courier / Medio: despacho_local_melipilla"* in `OrderTrackingModal`. Pre-existing (the write predates 2.13), and the `track-order` fallback label (*"Despacho Local Express Melipilla"*) shows the field was meant to hold display-ready text.
  - **Why it is not a one-liner:** the label map (`CARRIER_LABELS`) lives in `src/admin/types.ts`, and the storefront must not import the admin bundle — so the fix is to move it to a shared `src/config/` module and render labels in `track-order` + the modal, mapping the keys already stored on legacy documents rather than rewriting them.
  - **Not a launch blocker.** Copy quality only — no data, payment or fulfillment impact.

<a id="task-2-17"></a>

- [x] **2.17. Mercado Pago Preference Lifecycle and Success Semantics** _(P1)_
  - **Evidence:** `api/create-preference.ts:41-49,74-104,127-235` reads any order and accepts caller payer plus `Host`, without ensuring MP method/pending state, stored-total agreement, delivery zone/minimum or repeat budget. `src/services/mercadopago.ts:49-53,98-113` treats missing `initPoint` as success and manufactures an approved result.
  - **Risk:** invalid/settled/transfer/quote orders, forged success, unsafe origins and unlimited preference retries.
  - **Fix:** allow MP-only pending orders; reject settled, cancelled, transfer and quote orders; recompute and compare total to stored total; derive payer from stored order; use canonical configured return/webhook origin (`SITE_URL` in production, safe preview origin); bound repeated preference creation with existing throttle/compact per-order control. Preserve suspended 3.1 (no freight change). Enforce the existing San Antonio `$60.000` minimum against the same original product subtotal used by checkout (`src/components/CheckoutModal.tsx:230-238`), before promo discount—not against discounted payable total. Production success requires a valid MP redirect; never fabricate paid client state.
  - **Accept:** tests cover total mismatch, invalid method/status, repeat attempts, invalid MP success response and bad host. No freight behavior change.

<a id="task-2-18"></a>

- [x] **2.18. Failed Payment Return and Retry Workflow** _(P2; coordinate with 8.13, not UI polish alone)_
  - **Evidence:** `src/components/PaymentReturnModal.tsx:218-257` claims *"No se ha realizado ningún cobro"* from a forgeable failure query and Retry reopens checkout; `src/components/CheckoutModal.tsx:307-355` creates a new order. A late approval of the first order can cause separate order IDs/charges; the webhook's per-order duplicate guard cannot join them.
  - **Risk:** duplicate order/charge or false assurance that no payment occurred.
  - **Fix:** remove categorical no-charge language; verify tracking/payment ledger before retry. Reuse pending order where safe, or direct the operator to reconcile the prior order before a new attempt. Do not clear cart from a forged return.
  - **Accept:** failed/pending returns never claim the failure URL proves no charge; protected retry reuses a pending order where safe, otherwise explicit manual reconciliation is required before a new attempt. Test delayed webhook, cross-tab and forged-return behavior; do not clear cart from a forged return or claim gateway-level cross-order idempotency.
  - **As built (2026-09-30):** the categorical no-charge copy is gone from `PaymentReturnModal` — a failed/pending return now states only what the return URL can actually prove. The retry path is order-bound instead of a fresh checkout: `OrderTrackingModal` offers `Reintentar pago de este pedido` **only** for a `PENDIENTE_PAGO_MERCADOPAGO` order whose `paymentMethod` is `mercadopago`, calling `resumeMercadoPagoPayment(orderId)` (`src/services/mercadopago.ts`) which re-requests the Checkout Pro preference for the **same** order id — `/api/create-preference` rebuilds the lines from the order document and re-asserts the same lifecycle guard server-side (`409` for a settled/in-review/transfer/quote/cancelled order), so a stale tracking read can never double-bill, and a genuine second payment on that order is joined by the webhook's per-order duplicate guard. `CheckoutModal` gained an **advisory** pre-checkout notice (§3.1.1 of the components guide): when this tab already created an order that may still be awaiting payment it surfaces the session id and routes to the dual-factor tracking flow before a second order can be minted. Cart clearing still requires the matching session marker (2.12), so a forged return cannot wipe a cart. **Recorded residual (owner-accepted):** the notice is per-tab and advisory rather than a hard gate (the client cannot query pending orders, and the marker goes stale), so a second order can still be minted while the first is pending — the server-side stale-pending-order close (8.13) is the backstop. Verified at the time: `pnpm test` 1064/1064 (93 suites), build/lint/format/tsc clean; the negative status/method matrix is pinned by `OrderTrackingModal.test.tsx`.

### Phase 3 — Logistics & Copy — SUSPENDED until further notice (owner decision, 2026-09-29)

> Not in the active priority queue: do not select, plan or implement these three items. IDs and wording are retained for when the suspension is lifted.

<a id="task-3-1"></a>

- [ ] **3.1. Dynamic Shipping Rates by Delivery Zone** _(P1 — blocker, suspended)_
  - **State:** the zone selector is built (`DELIVERY_ZONES`: `Melipilla` default same-day before 16:00; `San Antonio` scheduled route, `MIN_ORDER_OUTSIDE_MELIPILLA = 60000`, San Antonio only). `FREE_SHIPPING_THRESHOLD = 150000` applies to both. No pickup, no RM (root `AGENTS.md` §3.4).
  - **Required:** define per-zone freight for orders **below** the threshold as constants in `src/config/delivery.ts` (never redeclared); add freight to the payable total **server-side** (`orderTotal.ts` → `submitOrder`, `create-preference` line, webhook assertion — the four amounts must stay identical, the 0.9 invariant); include it in the tax/billing breakdown; show a freight line in Cart, Checkout and the pro-forma voucher.

<a id="task-3-2"></a>

- [ ] **3.2. Estimated Delivery Time Windows** _(P2 — suspended)_
  - Show fulfillment estimates in Cart and Checkout: same-day Melipilla for orders confirmed before 16:00; scheduled route for San Antonio. Copy must come from `DELIVERY_ZONES` and add a config constant for the 16:00 cutoff (today it is a literal duplicated in Footer/LegalModal) — never "RM".

<a id="task-3-3"></a>

- [ ] **3.3. Stale Localization Copy Sweep** _(P2 — suspended)_ — wording still references the removed logistics model:
  - `api/_lib/emailTemplates.ts:114` "Melipilla & Región Metropolitana" (every transactional email header).
  - `api/track-order.ts:183` "…o retirado en Av. Ortúzar 750" (no pickup) and `:235` regional courier fallback `Starken / Chilexpress Regional`; `PENDIENTE_PAGO_MERCADOPAGO` / `PAGO_EN_REVISION` fall into the generic "Pedido Registrado" copy.
  - `src/services/whatsapp.ts:13,37` "(Melipilla & RM)" and a fixed "despacho para Melipilla" note even for San Antonio buyers.
  - `src/admin/components/AdminOrders.tsx:42` "…depósitos dentales en Melipilla y RM"; also check `AdminSettings.tsx`.
  - Storefront strings catalogued in `src/components/AGENTS.md` §2.5 (Cart "Factura Electrónica B2B" strip, CheckoutModal transfer-card "…emisión de Factura", pro-forma letterhead "Melipilla, Región Metropolitana") — these need an Appendix C–sanctioned replacement before editing; the API/service/admin strings can be fixed directly.

### Phase 4 — Backoffice

<a id="task-4-2"></a>

- [x] **4.2. Backoffice Readiness Sweep** _(P2)_ — routing is recorded healthy (all 12 `/api/admin/<action>` calls map to dispatch; `vercel.json` rewrites exclude `api/`).
  - Add dedicated handler suites for `orders`, `products`, `mark-delivered`, `toggle-visibility` (happy path, auth rejection, method gate, `OPTIONS`, malformed payload; mirror `approve-transfer.test.ts`).
  - **Bound reads:** `orders.ts:48` loads all orders and slices to 50; `dashboard-stats.ts:49-50` loads all orders/products. `fetchAdminOrders({ cursor })` sends a cursor the server ignores. Add `orderBy('createdAt','desc').limit(n).startAfter(cursor)` and server-side status filtering; keep search on the loaded page or indexed field. Use `count()` aggregations or bounded stats, keeping read/per-page cost in scope without heavy infrastructure.
  - **Deep links/state:** `AdminOrders` searches only the first 50 although `fetchAdminOrder` exists; refresh selected order after `onOrderUpdated`. Distinguish read failure from an empty list.
  - **Dashboard definition:** KPI excludes dispatched/delivered paid sales and transfer `approvedAt`, while subtitle says pending preparation; align the KPI and copy.
  - Relabel placeholder cards in `src/admin/AGENTS.md` §6.1 to 8.5 / suspended 3.1; use `--teal-600` instead of undefined token references in `OrderDetailPanel.tsx:396,409`. Fix `ProductEditModal` prop→state sync effect (`:56-61`, `react-hooks/set-state-in-effect`) with lazy initialization/`key` remount. Stale `AdminOrders.tsx:42` copy remains suspended under 3.3.
  - **Accept:** handler tests; deep-link fetch and selected-order refresh; failure-vs-empty state; KPI definition; cursor pagination/bounded-read checks.
  - **As built (2026-09-30, PR #44):** `orders.ts` now does a **bounded page read** — `orderBy('createdAt','desc')` + server-side status filtering (equality, with the transfer-approved chip keeping dual-status semantics via `in`) + `startAfter(cursor)` + `limit` (default 50, capped 200); `total` comes from a `count()` aggregation and `nextCursor` from the last page document (2.15's `hasVoucher` projection preserved through the rebase). `dashboard-stats.ts` computes `pendingOrders` as a status-`in` `count()` aggregation, `lowStockProducts` from a bounded `stockCount <= 5` read and sales/monthly volume from one bounded recent-orders page; the **KPI definition was fixed** — the settlement timestamp (`paidAt`/`approvedAt`) decides the sales date and a marked order counts regardless of its current status, with a reversal exception (review + `paidAt` ≡ refunded money, never counted). `AdminOrders.tsx` gained the deep-link `fetchAdminOrder` fallback beyond the first page, a refresh re-find that wins over deep-link re-assertion, and a retryable `role="alert"` banner that distinguishes a failed load from an empty queue. Also: the `products` handler suite was added, `AdminDashboard` copy aligned, `var(--primary)` → `var(--teal-600)` at both `OrderDetailPanel` sites, `ProductEditModal`'s prop→state sync effect replaced with lazy `useState` initializers + keyed remount, and the placeholder cards relabeled to roadmap 8.5 / suspended 3.1. ⚠️ **Owner action required:** the bounded query needs the new composite index (`orders`: `status` ASC + `createdAt` DESC, registered in `firebase.json`/`firestore.indexes.json`) deployed to Firestore before the ordered+filtered list works in production — `pnpm dlx firebase-tools deploy --only firestore:indexes` (there is no `deploy:indexes` npm script yet; Firestore returns an index-creation link in the error otherwise). Verified at the time: `pnpm test` 1111/1111 (94 suites), build/lint/format/tsc clean.

<a id="task-4-3"></a>

- [x] **4.3. Admin Handler Hardening** _(P1)_ — under `api/_lib/admin/`.
  - Enforce server-side source states: `approve-transfer` only for `PENDIENTE_TRANSFERENCIA` / `TRANSFERENCIA_COMPROBANTE_SUBIDO`; explicitly reject quote statuses such as `COTIZACION_SOLICITADA_WHATSAPP`. Dispatch only paid/approved/`EN_PREPARACION`; `mark-delivered` only `DESPACHADO`; return `409` for invalid transitions.
  - **Prevent repeat settlement/deduction:** `approve-transfer` can deduct stock again after dispatch because only three paid states currently short-circuit. State guards must reject dispatched/delivered orders and existing `approvedAt`/settlement markers; do not rely on the narrow already-paid short-circuit.
  - Recompute a transfer-order total from current catalog (promo-aware) before stock deduction; reject mismatch/underpriced orders and validate promo first. A missing catalog product/line must fail closed, never silently approve. Quote orders are not transfer-eligible. Preserve the MP webhook flow.
  - **Bank-funds reconciliation is an operator decision:** `OrderDetailPanel.handleApproveTransfer` sends only `orderId` (`src/admin/components/OrderDetailPanel.tsx:61-74`), and `api/_lib/admin/approve-transfer.ts:33-38` accepts it; a voucher is not evidence that funds settled. Require the operator to verify the actual Banco de Chile deposit before approval and record a safe reconciliation reference, actor and date in order history—never bank credentials. The system cannot infer bank settlement automatically.
  - `update-stock` values are units: reject non-finite, fractional, negative or out-of-range stock counts and use a transaction to avoid overwriting concurrent webhook deductions. CLP price/total inputs must be finite integers within permitted bounds; `update-product` must reject invalid/fractional/out-of-range price, never silently `Math.round`. Fix `toggle-visibility` stale read/update race, normalize category and audit price changes.
  - Revoke-aware admin-token validation and remove unnecessary wildcard CORS. For `PAGO_EN_REVISION`, display the actual incident/reason (the UI currently always says amount mismatch), require receipt/ledger reconciliation and an operator note without secrets before resolution. A review badge is not authority to approve a refund.
  - **Accept:** tests cover unauthorized/invalid state, quote rejection, already-dispatched repeat approval and `approvedAt` marker, underpriced promo-aware transfer, missing product, invalid units, non-finite/fractional/out-of-range CLP price/total, parallel webhook/stock mutation, visibility race and incident-specific review evidence. Tests/owner walkthrough reject transfer approval without verified settled funds; operator checks Banco de Chile and records a secret-free reconciliation reference, actor and date. Owner walkthrough also checks receipt/ledger for review cases; refunds are not approved solely from the review badge.
  - **As built (2026-09-30):** source-state guards on `approve-transfer` (only pending-transfer may approve; quote/dispatched/delivered/cancelled/MP-paid/review and any `approvedAt`/`paidAt` order → `409`, no writes; `TRANSFERENCIA_APROBADA` → idempotent duplicate), `dispatch-order` and `mark-delivered` (the latter moved into a transaction so concurrent confirmations cannot duplicate history). `approve-transfer` now rebuilds the payable total from the current catalog (promo-aware) and fails closed on mismatch / missing product / invalid price before any write, and requires an operator `reconciliationReference` (recorded in order history). `resolve-payment-review` requires an operator note to approve and normalizes line quantities through the shared `normalizeQuantity` (a malformed quantity can no longer write a `NaN`/fractional `stockCount`). `update-stock`/`toggle-visibility` moved into transactions and validate whole-unit/CLP bounds; `update-product` rejects invalid/fractional/out-of-range prices, normalizes the category and audits price changes. `verifyAdminToken` is now revoke-aware (`checkRevoked = true`). All 12 handlers share `api/_lib/admin/adminHttp.ts`, which drops the wildcard `Access-Control-Allow-Origin` (same-origin console). UI: transfer approval requires the bank reference; the `PAGO_EN_REVISION` panel renders the incident-specific reason. Verified: `pnpm test` 910/910 (86 suites), build/lint/format/tsc clean. The bank-deposit and receipt/ledger verification remain manual operator steps (no bank API); owner walkthrough is the remaining gate.
  - **Follow-up (2026-09-30) — create-path parity:** 4.3 hardened the price/stock bounds on `update-product`/`update-stock` but left `create-product` coercing with `parseInt(String(...))`, which silently truncated `189.99` → `189`, accepted `'12abc'`/`'1e3'` and enforced no ceiling — so a typo at creation could persist a catalog price or stock level the edit handlers would refuse. `create-product` now validates price and `stockCount` through the new shared `api/_lib/admin/adminLimits.ts` guards (`MAX_CLP = 999_999_999`, `MAX_STOCK_UNITS = 1_000_000`, number-only; `stockCount` still defaults to 10 when omitted), and the two edit handlers import those bounds instead of re-declaring them (behaviour and messages unchanged). Deliberate tightening: numeric **strings** are no longer accepted on create — the only consumer (`ProductEditModal`) already sends `Math.round(...)` numbers. +20 tests (93 suites / 1084), all gates clean.

<a id="task-4-4"></a>

- [x] **4.4. Admin Inventory Hook-Order Crash** _(P1)_
  - **Evidence:** `src/admin/components/StockAdjustModal.tsx` returned before its four `useState` hooks when `product` was absent, while `src/admin/components/AdminInventory.tsx` mounted it unconditionally — a `react-hooks/rules-of-hooks` violation (4 lint errors under the react-hooks rule set). Existing suite mounted with a product immediately and missed the null→product rerender. **As built (2026-09-30):** React 18.3.1 does not actually throw on the zero-hook→four-hook transition — a render whose previous committed state is `memoizedState === null` is dispatched to the mount path, so no hook-count comparison runs — meaning the crash was latent, not observed. The violation and a stale-draft edge on product switch are nonetheless real.
  - **Fix (as built):** `StockAdjustModal` returns from a hook-free guard and renders a keyed stateful `StockAdjustForm` only while a product exists; `AdminInventory` also mounts it conditionally. `src/tests/admin/StockAdjustModal.test.tsx` covers the null→product rerender and the A→B draft re-seed; `src/tests/admin/AdminInventory.test.tsx` covers the row→modal→submit path.
  - **Accept:** met — the null→product rerender raises no hook-order violation and adjustment remains functional; `pnpm test` 870/870 (83 suites), `pnpm build` / `pnpm lint` / `pnpm format:check` / `pnpm exec tsc --noEmit` all clean.

<a id="task-4-5"></a>

- [x] **4.5. Manual Cancellation, Refund, Return & Chargeback Operations** _(P2; coordinate with 0.18)_
  - **Evidence:** admin offers cancel only for `PAGO_EN_REVISION`; no general return/cancel workflow exists. Order type lacks a refunded state and webhook preserves fulfilled status by design.
  - **Fix:** define owner SOP to verify funds, perform manual MP/bank refund or credit note if needed, contact customer, and record incident/history note linked to order. Restock only physically received, usable units through existing audited stock adjustment. Add only a minimal admin note/action if needed; no automatic gateway refunds and no invented `CANCELADO` for delivered orders.
  - **Accept:** manual walkthrough/order-history trace covers cancellation/refund/return/chargeback; restock is limited to received, usable goods and is auditable.
  - **As built (2026-09-30):** the runbook is [`MANUAL_ORDER_OPERATIONS.md`](./MANUAL_ORDER_OPERATIONS.md) (verify funds first; never store credentials; cancellation only for never-settled orders; manual MP/bank refund or credit note then a `REEMBOLSO` incident; return/chargeback incidents; restock only physically received usable units, with the order id in the new "Nota de trazabilidad"). Two minimal actions carry the audit trail. `cancel-order` closes **only** `PENDIENTE_PAGO_MERCADOPAGO` / `PENDIENTE_PAGO` / `PENDIENTE_TRANSFERENCIA` / `TRANSFERENCIA_COMPROBANTE_SUBIDO` as `CANCELADO` with a required operator reason, **no stock movement**, no refund, an idempotent duplicate, the guard re-asserted inside the transaction, and a cancel-specific warehouse alert (`CANCELACION_MANUAL`, whose hint says no payment was collected so there is no refund to chase) — a paid/approved/preparation/dispatched/delivered order, `PAGO_EN_REVISION` (its own audited cancel) and the WhatsApp quote (its own decline) are refused with `409`. `record-order-incident` appends a **same-status** `order_status_history` event (`metadata.event: 'INCIDENTE_MANUAL'` + `incidentKind` ∈ `CANCELACION`/`REEMBOLSO`/`DEVOLUCION`/`CONTRACARGO`, canonical tuple shared with the console in `src/utils/orderIncidents.ts`) with a required evidence note — no status change, no stock, no email, valid for any status including `ENTREGADO`, repeatable. UI: the panel's "Operaciones Manuales" block (cancel gated to eligible statuses and reason-gated; incident kind + note always available) and an incident-kind badge in the audit timeline; `StockAdjustModal` gained the optional traceability note the SOP asks for. **No refunded status, no automatic gateway refund, no second restock path.** Verified: `pnpm test` 1157/1157 (96 suites), build/lint/format/tsc clean. **Owner walkthrough remains the acceptance step** (follow the SOP once against a real cancellation/refund/return/chargeback and confirm the history trace reads correctly).

<a id="task-4-6"></a>

- [x] **4.6. Operational Handoff for WhatsApp Quote Orders** _(P1; coordinate with 4.3)_
  - **Evidence:** `src/services/api.ts:243-247` creates `COTIZACION_SOLICITADA_WHATSAPP`; `src/components/CheckoutModal.tsx:372-405` confirms the request and sends the customer to WhatsApp. `src/admin/components/OrderDetailPanel.tsx:163-177,483-545` offers no approve/dispatch/close action for quote status; no API handler transitions it (only tracking/email use it).
  - **Risk:** a quote is a lead, not paid; it remains stranded, and off-platform fulfillment risks inaccurate stock and tracking.
  - **Fix:** define an owner-approved manual quote/Factura handoff. If accepted, create/link a separately verifiable legitimate sale via supported payment or manually reconciled transfer and stock audit; preserve the original quote ID and close/resolve it with an audit trail via a minimal action on the existing dispatcher or explicit operator procedure. Never use `approve-transfer` on a quote or manually mark MP paid. Declined/timeout quotes close without stock movement. If this route is not ready before real traffic, do not expose WhatsApp as a checkout payment method; retain simple WhatsApp contact for Factura requests. No CRM or new function. This operational handoff is separate from suspended 7.1 legal sign-off and 7.2 domain work.
  - **As built (2026-09-30, owner chose the code action + keeping WhatsApp exposed):** new admin action `resolve-quote` (`api/_lib/admin/resolve-quote.ts`, 13th entry of the existing `api/admin/[action].ts` dispatch table — no new Hobby slot). `convert` requires an operator reconciliation reference (Banco de Chile cartola line / payment receipt, never bank credentials), re-derives the payable total from the current catalog (promo-aware) and requires it to equal `order.totalAmount` (`409` on divergence — the operator declines and registers the negotiated sale as a new order instead), fails closed on missing product/invalid price, deducts stock at most once (settlement-marker guard; shortfalls recorded) and stamps `PAGADO_TRANSFERENCIA` + `approvedAt`/`approvedBy` + `quoteResolvedAt`/`quoteResolution: 'CONVERTIDA'` — the quote document itself becomes the sale record, so the original quote ID is preserved and customer tracking flows through "Pago Acreditado" → dispatch as normal. `decline` closes the lead `CANCELADO` with zero product reads, no stock movement and the operator's note as the history reason (timeout/declined/negotiated-elsewhere). Only a pending quote is resolvable (`409` otherwise), re-resolution is a `duplicate` no-op, cross-resolution is refused, and no Mercado Pago payment id is ever fabricated (`approve-transfer` keeps refusing quotes). Panel block in `OrderDetailPanel.tsx` (reference input required for convert, optional closing note for decline, duplicate-aware success banner); `Order` schema gains `quoteResolvedAt`/`quoteResolution`/`quoteResolvedBy`.
  - **Accept:** met at source level — `src/tests/api/admin/resolve-quote.test.ts` (27 cases) covers accepted quote → verified payment + one stock deduction (idempotent re-resolution = zero writes), declined quote, cross-resolution conflicts, fail-closed guards, shortfall recording, promo-aware pricing and the email fail-safe; `OrderDetailPanel.test.tsx` pins the UI gating/contract. The **owner walkthrough** (accepted → verified payment, declined, late reply, no duplicate fulfillment, correct tracking) remains the P1 owner gate below before real traffic.

### Phase 5 — Transactional Communications

<a id="task-5-3"></a>

- [ ] **5.3. Transactional-Mail Delivery Reliability** _(P2)_
  - **Evidence:** `api/order-confirmation.ts:61-72` returns `200 success:true` when Admin is unavailable; lines `107-145` read/send/stamp non-atomically, allowing concurrent duplicate sends. `CheckoutModal.tsx:370-374` is fire-and-forget; webhook sends after commit and email failure is fail-safe, so failed notices are not retried.
  - **Fix:** provide lightweight failed-send visibility and recoverable manual resend, with concurrency idempotency via transaction reservation or Resend idempotency only if verified. No new queue/service; never roll back paid state when mail fails.
  - **Accept:** Admin-down is not reported sent; concurrent confirmation sends at most once; Resend failure after checkout/approval is visible and manually recoverable without changing paid state.

### Phase 6 — Catalog

<a id="task-6-2"></a>

- [ ] **6.2. Downloadable Technical Documentation** _(P3)_ — "Descargar ficha técnica (PDF)" on product details (datasheets and ISP registration codes for clinic sanitary audits).
<a id="task-6-3"></a>

- [ ] **6.3. Expand Catalog SKUs by Specialty** _(P3)_ — Endodontics, Periodontics & Prophylaxis, Restorative & Esthetics, Orthodontics, Surgery & Implants, Sterilization & Infection Control (categories are open strings; use admin `+ Nuevo Insumo` / CSV import).

<a id="task-6-4"></a>

- [ ] **6.4. Decision: the Fate of the `odon-*` Prototype Fixtures** _(P3 — owner question, 2026-09-29)_
  - **Question (owner):** "would it be better to remove the fixtures/mocks from the code?" Raised while fixing 2.11, which stops them reaching the production storefront.
  - **Audit — six consumers, so this is not a deletion but a migration:** `src/services/api.ts` (dev/offline fallback), `src/components/CategoryFilter.tsx` (pill counts, fixed by 2.11), `src/admin/services/adminApi.ts` (admin inventory fallback), `scripts/manage-firestore-schema.ts` (`schema:seed` / `schema:seed:dev` seed the catalog from `canonicalProducts`), `src/services/firebase.ts` (`seedProductsToFirestore()`, retained but uncalled) and four test suites (`data/products.test.ts` exists solely to validate them; `api.test.ts`, `useIncrementalReveal.test.tsx`, `orderCreateContract.test.ts` use them as data).
  - **Decision required first:** what replaces them as the **seed source** for the documented `schema:seed*` commands (the CSV import is the production path, but the seed commands have no other catalog). Then choose: delete `PRODUCTS` and repoint the test suites to inline fixtures, or keep them as the dev/test artifact and document the boundary (status quo after 2.11).
  - **Not urgent:** after 2.11 they cannot reach the production storefront and cannot mutate a cart. Coordinate catalog preservation with [8.17](#task-8-17).

### Phase 7 — Legal & Domain — SUSPENDED until further notice (owner decision, 2026-09-29)

> These items are out of the active priority queue. Do not chase 7.1 or implement 7.2 until the owner lifts the suspension. The manual SII operating procedure (1.5) is itself suspended; neither suspension lifts the other.

<a id="task-7-1"></a>

- [ ] **7.1. Legal Review of SERNAC / Ley 19.628 Draft Copy** _(P1 — suspended)_
  - The published legal copy remains an owner-reviewed draft without lawyer sign-off. Do not schedule or chase review.

<a id="task-7-2"></a>

- [ ] **7.2. Custom `.cl` Domain and SSL** _(P1 — suspended)_
  - Do not register the domain, configure DNS, replace the accepted `pronto-insumos.vercel.app` host, or re-check Resend/Mercado Pago URLs until the owner lifts the suspension. Retained future scope: NIC Chile registration, Vercel DNS/TLS, URL and `SITE_URL` sweep, and provider URL re-check.

### Phase 8 — Infrastructure, DevOps & Telemetry

<a id="task-8-4"></a>

- [ ] **8.4. Pre-Flight Checks & Minimal CI** _(P2)_
  - Make `pnpm test && pnpm exec tsc --noEmit && pnpm build` the mandatory local pre-release gate and record it in the workflow. Optional: minimal `.github/workflows/ci.yml` running test + build on pull requests; remain lean.
  - **Runtime/operator gate:** on preview, smoke API runtime ESM, admin authentication and read, stock/transfer flow, and public checkout/payment/tracking using TEST credentials and non-customer test data only. Never use real customer data or mutate production. A green Vite build does not exercise runtime ESM or provider configuration; add no heavy infrastructure.

<a id="task-8-12"></a>

- [ ] **8.12. Security Headers in `vercel.json`** _(P2)_
  - `vercel.json` only defines rewrites — no `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy`. The admin portal can be framed (clickjacking on approve/dispatch buttons). Add headers via `headers` in `vercel.json` (no new function): `frame-ancestors 'none'` on `/admin*`, `nosniff`, `strict-origin-when-cross-origin`, and a CSP that allows only the origins actually used (self, Google Fonts, Firebase/Google APIs, Mercado Pago, `wa.me` links). Start `Content-Security-Policy-Report-Only`, verify on a preview deploy, then enforce.

<a id="task-8-13"></a>

- [ ] **8.13. Stale Pending-Order Accumulation** _(P2; coordinate with 2.18)_
  - Every checkout attempt creates a fresh order (`CheckoutModal.tsx:306-307`); failed preferences and abandoned MP sessions leave pending ghosts. Before closing one, check the MP ledger. Late paid notifications go to manual review and must never reopen a cancelled order. Choose the leanest safe close/reuse path on the existing dispatcher; no new function slot. Coordinate retry semantics with 2.18.

<a id="task-8-5"></a>

- [ ] **8.5. Real-Time Error Monitoring & Analytics (Sentry & GA4)** _(P3)_
  - Sentry for React (unhandled client errors) and GA4 e-commerce events (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`). Also the missing production alert path: fail-closed 500s (0.10) and 0.14's new alerts currently rely on someone reading Vercel logs.

<a id="task-8-1"></a>

- [ ] **8.1. Bundle Optimization** _(P3 — refreshed; the old "781 kB main chunk" no longer exists)_
  - `manualChunks` already split the build: `main` 137 kB, `vendor-react` 141 kB, **`vendor-firebase` 672 kB** (the remaining >500 kB warning). The storefront imports `getAuth` (`src/services/firebase.ts:25`) but only the admin needs Firebase Auth — dropping it from the storefront graph (see 8.11) is the biggest win; then `React.lazy()` for `CheckoutModal` / `ProductQuickView`.

<a id="task-8-2"></a>

- [ ] **8.2. Type-Check the Serverless Functions** _(P3)_
  - `tsconfig.json` includes only `src/**/*`. Verified 2026-09-29 (on the 0.12 + 0.13 branch): `api/**` passes `pnpm exec tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --types node --skipLibCheck api/*.ts api/_lib/*.ts api/_lib/admin/*.ts api/webhooks/*.ts`. ⚠️ `--target es2022` and `--skipLibCheck` are **required** — without them the invocation fails (`TS2802` on the `MapIterator` loops, `TS18028` in `node_modules`) on the default ES5 target, which is why the earlier "verified" note was misleading. Adding a `tsconfig.server.json` (Node context) that carries those flags and running it in the 8.4 gate is nearly free and will keep it green. ⚠️ **Evidence from the first `vercel deploy --prod` (2026-09-29, Task 8.8):** Vercel's own per-function type-check logs `TS7006` (`Parameter 'transaction' implicitly has an 'any' type`) and `TS2503` (`Cannot find namespace 'FirebaseFirestore'`) for `api/**` — 13 pre-existing occurrences plus the 4 in the new throttle module — because its check does not resolve the Admin SDK typings the way the command above does. The build still completes and the deploy is `Ready`, but the log noise is a hard failure waiting to happen if Vercel tightens the check; annotating the `runTransaction`/`map` callbacks explicitly is the cheap fix when this item is picked up.

<a id="task-8-9"></a>

- [ ] **8.9. `.env.example` Completeness & URL Default** _(P3 documentation; owner environment gate is P1 in §2)_
  - `SITE_URL` is missing from `.env.example`; `api/_lib/emailTemplates.ts:98-104` defaults it to `https://prontoinsumos.com`, not the accepted Vercel launch host. Document the variable and `VITE_VERCEL_ENV` as a build-time `define` (not a dashboard variable), and inventory other `api/` and `src/` variables. Production `SITE_URL=https://pronto-insumos.vercel.app`, simulation flags, and Firestore/Vercel environment alignment are a separate mandatory owner pre-traffic check in §1/§2; do not expose secret values. The `.cl` change remains suspended under 7.2.

<a id="task-8-10"></a>

- [ ] **8.10. Widen Lint/Format Scope to `api/` and `src/admin/`** _(P3)_
  - No longer wholly ignored: the self-contained-comments pointer rule (2026-09-29) already parses and lints both trees. What remains here is applying the **full TypeScript rule set**: measured 2026-09-29 by lifting the ignore: 65 problems (63 errors, 2 warnings) — `StockAdjustModal` `rules-of-hooks` errors (4.4), `ProductEditModal` `set-state-in-effect`, 12× `no-explicit-any` in `adminApi.ts`, unused imports in `src/admin/types.ts`, plus `any` in handlers. Fix in a dedicated pass, then delete the carve-out (root `AGENTS.md` §8.3).

<a id="task-8-11"></a>

- [ ] **8.11. Resilient Firebase Init** _(P3)_
  - `src/services/firebase.ts:25` calls `getAuth(app)` unguarded at module scope: a missing/invalid `VITE_FIREBASE_API_KEY` throws `auth/invalid-api-key` at import and blanks the whole page. Making `auth` nullable (or moving it to an admin-only module) touches `adminApi.ts` / `AdminApp.tsx` / `AdminLogin.tsx` — its own reviewed task (`src/services/AGENTS.md` §4.5), and it doubles as the storefront bundle win in 8.1.

<a id="task-8-14"></a>

- [ ] **8.14. Dependency Hygiene** _(P3)_
  - `pnpm audit --prod` (2026-09-29): 1 moderate — `uuid <11.1.1` via `firebase-admin > @google-cloud/storage > gaxios` (GHSA-w5hq-g745-h8pq, only reachable when a caller passes `buf`; not used here). Re-check after each `firebase-admin` bump. The `jose@^5` override is EOL upstream — remove per the 8.6 condition.

<a id="task-8-15"></a>

- [ ] **8.15. Operator Smoke-Script UX** _(P3; remaining scope after 8.17)_
  - Production seed/import safety is the P1 gate in 8.17. **Do not re-run production seed or catalog import until the 8.17 safety pass is complete.**
  - **`scripts/send-test-comms.ts` WhatsApp smoke path throws (found during Task 2.10, 2026-09-29 — pre-existing, reproduced on the pre-2.10 revision).** `TEST_ORDER.items` is shaped `{ name, quantity, price }` but is passed as `items as unknown as CartItem[]` (`:142-151`), while `generateWhatsAppQuoteUrl` reads `i.product.name` / `i.product.price` (`src/services/whatsapp.ts:17`) — so `pnpm dlx tsx scripts/send-test-comms.ts --only=whatsapp` dies with `TypeError: Cannot read properties of undefined (reading 'name')` before printing anything. Shape the fixture as `{ product: { name, price }, quantity }` (or map it) and drop the unsafe cast; email paths and the `--phone=` override are unaffected. This is also the documented smoke test for `whatsappLink()`/`contact.ts` importability under plain Node/tsx (`src/services/AGENTS.md` §4.4). Other non-destructive script UX may be handled here.

<a id="task-8-16"></a>

- [ ] **8.16. Firebase App Check for the Public `orders` Create Path** _(P2 — abuse friction, not authentication or order validation)_
  - **Residual:** public order creation can be abused for billed writes/email. App Check adds abuse friction; it does not authenticate the customer or validate catalog prices/totals (transfer price validation remains in 4.3).
  - **Rule shape gap:** `firestore.rules:132-142` checks only the first 10 of 25 item lines and accepts arbitrary RUT/city/document type/`createdAt`, plus a boolean sanitary `verified`. App Check does not close these validation gaps.
  - **Fix / owner steps:** initialize App Check before Firestore and enforce per environment; document site-key/debug-token setup without exposing values. Within rules evaluation limits, constrain order shape, allowed delivery zone, Boleta-only `documentType`, valid timestamp bounds, and all item lines; if rules budget cannot support it, use a lean server-side create path. Do not claim rules validate catalog prices. Verify preview order creation with enforcement enabled.
  - **Accept:** initialization order is tested; rules emulator tests (if practical) cover rejected arbitrary fields/zone/document type/timestamp and all lines; owner console checklist confirms enforcement and working preview checkout.

<a id="task-8-17"></a>

- [x] **8.17. Destructive / Repeat Catalog Import and Seed Risk** _(P1; cross-link 8.15 and 6.4)_
  - **Evidence:** `scripts/import-catalog-csv.ts:155-180` deletes `odon-*`; `:189-234` derives IDs from CSV row index and merges `stockCount: 10`, `inStock: true`, `isActive: true`, `prescriptionRequired: false`, `images: []` into existing products. Re-runs can reset sold stock, erase regulatory/visibility/image metadata, change identities when rows reorder, and create bogus initial audit entries. `scripts/manage-firestore-schema.ts:130-158` similarly resets existing stock. `schema:seed` has no production confirmation and inserts fake paid `PRONTO-SAMPLE-001`; CSV import treats plain `--force` as production confirmation (`scripts/import-catalog-csv.ts:90`).
  - **Risk:** production scripts can destructively alter live catalog/order data even if currently unused. **Do not re-run production seed/import until this P1 safety pass is complete.**
  - **Fix:** production scripts must be create-only or explicitly reviewed metadata-only updates; preserve stock, visibility, regulated fields and images; use stable IDs; detect reordering/collisions; never delete products referenced by orders. Audit real price changes. Add preview/dry-run and explicit production confirmation: require `--confirm-production-seed`, never create sample paid orders in production, require `--confirm-production-import`, and do not accept plain `--force` as fallback. Coordinate with 8.15 and 6.4.
  - **Accept:** tests cover repeat/reordered input against existing live-like inventory and reject missing/weak production confirmations/sample-order writes; operator performs a read-only rehearsal confirming no destructive changes before any write.
  - **As built (2026-09-30):** both scripts refactored to pure exported planners (`buildImportPlan`/`buildSeedPlan`) + direct-invocation-guarded `main()` (the `sync-env-to-vercel` convention). Import: identity is bound to the normalized product name (row reorder is a noop, `odon-*` excluded from matching), new ids allocate above the existing max (freed indexes never reused), updates are metadata-allowlist-only, `odon-*` referenced by orders is deactivated never deleted, audits write only on create (`CATALOG_SEED`) or real price change (`METADATA_UPDATE`), CSV/existing-name collisions abort, `--dry-run` plans read-only (gate-exempt), and prod accepts only `--confirm-production-import` (`--force` refused). Seed: same metadata-only/noop/price-audit semantics, `PRONTO-SAMPLE-001` is dev-only, prod requires `--confirm-production-seed`; purge keeps `--force` + `--confirm-production-wipe`. Verified: `pnpm test` 1004/1004 (89 suites), build/lint/format/tsc clean. Operator rehearsal pending: `pnpm run catalog:import -- --dry-run` / `schema:seed -- --dry-run`.

### Phase 9 — Commercial Promotions

<a id="task-9-1"></a>

- [ ] **9.1. Promo Controls Only When Campaigns Need Them** _(P2 — conditional on limited/private campaigns)_
  - `PRONTO10` and `DENT20` are bundled public codes; `DENT20` is an unlimited 20% discount, with no expiry, redemption audit or eligibility restrictions. Before traffic, owner must confirm these codes are intentional and margin-safe or disable unused codes (see owner gate in §1). No static audit establishes business approval.
  - Static public codes remain adequate only while there is no real need for private/limited campaigns. Do not preemptively add an admin collection or feature. If that need arises, design expiry, exhaustion, eligibility, redemption audit and controls as a bounded scope, preserving `resolvePromo` as shared policy authority and transactional exhaustion.
  - **Accept when selected:** owner signs off active codes before traffic; future campaign policy tests are scoped to actual requirements, including concurrent final redemption only when limits exist.

---

## 4. Resolved History

Resolved outcomes are retained as recorded; detailed as-built context remains in the relevant directory `AGENTS.md`. This historical table is last so active work stays first.

| ID | Outcome |
| :-- | :-- |
| 0.1 | Orders start `PENDIENTE_*`; client never approves payment or touches stock. |
| 0.2 | Webhook runs on `firebase-admin` (service account) with transactions. |
| 0.3 | One canonical `PRONTO-XXXXXXXX` id across order doc, preference and `external_reference` (six-digit `PRONTO-NNNNNN` was the pre-8.8 format; legacy ids still resolve). |
| 0.4 | Webhook idempotent (fast path + in-transaction guard). |
| 0.5 | HMAC-SHA256 `x-signature` verification, timing-safe. |
| 0.6 | `firestore.rules` deployed: public catalog read, admin-only writes, pending-only order create, client order read/update/delete denied. |
| 0.7 | Public "seed Firebase" footer button removed. |
| 0.8 | Mock customer data and card fields purged (PCI-DSS: no card data in state). |
| 0.9 | Server-side price rebuild in `create-preference` + webhook amount assertion (`PAGO_EN_REVISION` on mismatch) + admin `resolve-payment-review`. |
| 0.10 | Simulated payment paths gated by `api/_lib/simulationPolicy.ts` (fail closed in production). |
| 0.11 | `submitOrder` fails closed; `ignoreUndefinedProperties: true` on the client Firestore instance. |
| 0.12 | Order documents bound to their own id + `keys().hasOnly` create-shape allowlist (nested maps, `paymentMethod` ↔ `status`, length caps, `PENDIENTE_EMISION_SII`); canonical doc-key-first resolver `api/_lib/orderLookup.ts` wired into the webhook, `track-order`, `order-confirmation` and `upload-voucher`; payload↔rules drift guard. **Rules still need `pnpm run deploy:rules`.** |
| 0.13 | Voucher URLs allowlisted at the render sink: `src/utils/voucherUrl.ts` (storage host / legacy `data:` MIME / unsafe) + `OrderDetailPanel` opens a re-typed Blob or plain text — closes the admin-origin XSS that 0.12's write-side hole made reachable. |
| 0.14 | Webhook reconciliation closed: MP verification failures return `502` (only a `404` is acked), one signed payment id drives signature + fetch, the status guard parks non-payable orders in `PAGO_EN_REVISION` and records settled ones as double-payment incidents (at-most-once stock deduction, never a tracking regression), refunds/chargebacks park the order for manual review, oversell shortfalls are recorded + alerted, and `create-preference` prices the order document's lines (the request body contributes only the order id). |
| 0.15 | Dispatch accepts a blank tracking code: `dispatch-order` omits absent keys instead of writing `undefined` (which the Admin SDK rejects), and the Admin Firestore instance is now created with `ignoreUndefinedProperties: true` too. The audit confirmed it was the only handler writing `undefined`. |
| 0.16 | `track-order` fails closed: `500` + loud log in a production runtime when Firestore Admin is unavailable, instead of returning the fabricated "Dra. Andrea Morales" order. The simulated payload is reachable only through `isSimulatedPaymentAllowed()` (dev/preview, or the explicit `ALLOW_SIMULATED_PAYMENTS='true'` opt-in). |
| 2.11 | `fetchProducts()` returns a source-aware `CatalogResult`: production never serves the `odon-*` fixtures (rejection/empty/timeout → `unavailable` + retryable card, 10 s bound), the persisted cart is revalidated **only** from `source: 'firestore'`, and `CategoryFilter` counts the live unfiltered catalog instead of the prototype fixtures. **Owner decision (A):** the `isActive` filter is *not* applied to the dev-only fixture fallback — fixtures are unreachable in production after this change, so the filter's purpose is already met. |
| 2.10 | WhatsApp single source completed: `PaymentReturnModal` (stale `56912345678` fallback) and `src/services/whatsapp.ts` (second env read) now resolve through `whatsappLink()`; `contact.ts` is the only env reader and normalizes a formatted `VITE_WHATSAPP_NUMBER` to digits (digit-free ⇒ canonical fallback); `index.html`'s JSON-LD `telephone` carries `+56929831595`; and the `WhatsApp single-source guard` in `src/tests/config/contact.test.ts` fails on any reintroduced `wa.me` URL, `569…` literal or `VITE_WHATSAPP_NUMBER` read across `src/components/`, `src/services/` and `src/admin/`. |
| 8.8 | Public dual-factor endpoints no longer enumerate and are throttled: `track-order`/`upload-voucher`/`order-confirmation` return one identical `404` for "not found" and "RUT mismatch" (`respondOrderLookupFailed`), per-IP + per-orderId attempt/failure budgets live in `api/_lib/abuseThrottle.ts` (15-min window, 15-min lock, `429` + `Retry-After`, `abuse_counters` Firestore docs, SHA-256 pseudonymized IPs, fail-open with a loud log), the canonical id is now `PRONTO-` + 8 Crockford base32 chars from `crypto.getRandomValues` (40 bits; legacy ids still resolve), and the warehouse "voucher received" alert is budgeted per order (5-min cooldown, 5 max, reserved inside the confirm transaction, released on a failed send). **Owner decision (D1):** the residual public `orders`-create cost exposure needs Firebase App Check — recorded as Task 8.16. |
| 2.13 | Courier-less dispatches now carry an internal dispatch reference: `dispatch-order` mints `<ZONE>-<YYMMDD>-<NN>` (`MEL-260929-07`) inside the dispatch transaction from a per-zone/day `dispatch_counters` document (Chilean local day, zero-padded sequence), records `dispatch.reference` + `dispatch.referenceSource` (`generated` route code vs `manual` courier guía — never downgraded, stable across re-dispatches, and a pre-2.13 guía is promoted so it can never be masked), surfaces it in `track-order` + `OrderTrackingModal` labeled *(código interno)*, and reports it in the admin *Despacho Registrado* block. No `firestore.rules` change (the fields are nested in `dispatch`, which the create allowlist already excludes). |
| 2.12 | Payment-return trust gap closed: the modal no longer claims an accredited payment from the URL (`Recibimos tu Retorno de Pago` / `● Verificando acreditación`; `¡Pago Confirmado Exitosamente!` and `Pago Acreditado (PAGADO)` are pinned absent by test), `Ver estado del pedido` on **all three** states opens the dual-factor tracking flow with the order id prefilled (RUT stays a typed second factor — no PII stored), and the cart is reset **only** when the return names the order this tab created (`src/services/orderSession.ts`, `pronto_session_order_v1` in `sessionStorage`, written by `CheckoutModal` before payment initiation and consumed after use). Cross-context return residual accepted and documented in `src/services/AGENTS.md` §3.1; deck copy registered in `UI_UX_EVALUATION_AND_REDESIGN_PROPOSAL.md` C.7. |
| 2.15 | Voucher leftovers bounded and reclaimable: `sign` reserves a lifetime per-order slot in `voucherSignCount` inside a transaction (cap 10; `429` + WhatsApp fallback at the cap; `500` fail-closed if the reservation cannot be written), the new `voucher-housekeeping` admin action on the existing dispatcher deletes only objects an order does not reference and that are older than a 60-minute grace window (per-order listing, `dryRun`, non-fatal failures, `#settings` card with a per-run order limit), and the admin order **list** drops the legacy ~1 MiB Base64 `voucherUrl` (reporting `hasVoucher` instead) while the `?orderId=` detail request still returns it — the backoffice fetches the detail on select. No GCS lifecycle rule, no new function slot, no data migration. |
| 4.3 | Admin handlers hardened: source-state guards on `approve-transfer`/`dispatch-order`/`mark-delivered` (`409` for invalid transitions, idempotent duplicates, `approvedAt`/`paidAt` settlement markers block a second deduction), promo-aware catalog total recomputed before any stock write (fail-closed on mismatch/missing product/invalid price), operator `reconciliationReference` required and recorded, `update-stock`/`toggle-visibility` moved into transactions with whole-unit/CLP bounds, `update-product` rejects fractional/out-of-range prices, `verifyAdminToken` revoke-aware, and no wildcard CORS. Follow-up closed the create-path gap: `create-product` now validates price and stock through the shared `api/_lib/admin/adminLimits.ts` bounds (number-only, `MAX_CLP`/`MAX_STOCK_UNITS`) instead of silently truncating via `parseInt`. |
| 4.4 | Inventory-admin hook-order crash closed: `StockAdjustModal` returns from a hook-free guard and renders a `key`-ed stateful `StockAdjustForm` only while a product exists, and `AdminInventory` mounts it conditionally; the null→product rerender and the A→B draft re-seed are pinned by `StockAdjustModal.test.tsx`. |
| 4.5 | Manual order operations defined and auditable: the `MANUAL_ORDER_OPERATIONS.md` runbook (verify funds first, manual MP/bank refund, restock only received usable units with a traceability note) plus two minimal actions — `cancel-order` (never-settled statuses only, required reason, no stock, transaction-re-asserted guard, cancel-specific warehouse alert) and `record-order-incident` (same-status `INCIDENTE_MANUAL` history entry with a shared kind tuple, valid for any status, no status/stock/email). No refunded status, no automatic gateway refund, no second restock path. |
| 4.2 | Backoffice readiness sweep: `orders.ts` reads one bounded page (`orderBy createdAt desc` + server-side status filter + `startAfter(cursor)` + `limit`, `count()` for `total`), `dashboard-stats` uses `count()` aggregations and a bounded low-stock read with the KPI now keyed on the settlement timestamp, `AdminOrders` resolves a deep link beyond the first page and distinguishes a failed load from an empty queue, the `products` suite was added, and the placeholder/token/`ProductEditModal` cleanups landed. **Owner action: deploy the new composite index (`status` + `createdAt`) to Firestore.** |
| 2.18 | Failed-return retry made order-bound and honest: the categorical "no se ha realizado ningún cobro" copy is gone, the retry reuses the **same** pending order via `resumeMercadoPagoPayment` (server re-asserts the lifecycle guard, so a stale read cannot double-bill), and checkout shows an advisory pending-payment notice. Residual accepted: the notice is per-tab/advisory; the stale-pending-order close (8.13) is the server-side backstop. |
| 1.1 | Integer-CLP catalog, `formatCLP`, `Math.round` IVA. |
| 1.2 | Billing block with tax breakdown, Factura field validation (gated by `FACTURA_ENABLED = false`), printable pro-forma voucher. |
| 1.3 | ISP/SIS validation for regulated items (`prescriptionRequired`). |
| 1.4 | Distributor RUT sourced from `BANK_DETAILS.rut` (single-source guard test). |
| 1.7 | Fiscal breakdown is server-authoritative: `submitOrder` derives `billing.rut`/`taxBreakdown`/`status` from the recomputed total, `firestore.rules` binds the exact decomposition + `totalAmount` + billing RUT, and rendered surfaces (emails, `track-order`) derive via `calculateTaxBreakdown` — the stored map is never trusted; the pre-verification "order received" email is labelled `Total referencial`. |
| 2.1 | Mercado Pago return URLs handled (`PaymentReturnModal`) — see 2.12 for the remaining trust gap. |
| 2.2 | Cart persistence in `localStorage` (`pronto_cart_v1`, 7-day TTL, catalog revalidation). The data-loss edge where fallback data emptied the cart was closed by 2.11 (revalidation is `source: 'firestore'` only). |
| 2.3 | Stock guards in cart, checkout and `create-preference`. |
| 2.4 | Bank-transfer workflow with voucher upload (storage since reworked by 2.9). |
| 2.5 | Customer tracking (`/api/track-order`, `OrderTrackingModal`). |
| 2.6 | 5-step checkout (Contacto → Despacho → Documento → Pago → Confirmación). |
| 2.7 | Search bars are real forms (Enter, submit, clear). |
| 2.8 | Simulated client fallbacks only outside production; real HTTP errors surface. |
| 2.9 | Vouchers go to private Cloud Storage via a two-phase `sign` → direct PUT → `confirm` flow (V4 signed URL with signed 5 MiB cap, server-side MIME/size re-check, lifecycle guard re-asserted in a transaction, deny-all `storage.rules`, `pnpm run storage:cors`); base64 payloads rejected; `upload-voucher` fails closed in production. |
| 4.0 | Admin portal (`admin.html`, Firebase custom claim `admin: true`, `api/admin/[action].ts` dispatcher). |
| 4.1 | Schema freeze, `order_status_history` / `inventory_audit_logs`, migration CLI. |
| 5.1 | Resend transactional email (fail-safe, plain `fetch`), domain `prontoinsumos.com` verified. |
| 5.2 | Production WhatsApp number `56929831595`. |
| 6.1 | Real catalog photography and gallery. |
| 7.1 | Terms, SERNAC warranty, privacy (Ley 19.628) and legal ID via `LegalModal` (copy = draft; the owner/lawyer sign-off is **suspended** — see Phase 7). |
| 7.3 | `og-preview.jpg` (1200×630 JPEG) and `favicon.svg` delivered. |
| 8.3 | Integration tests for the serverless endpoints. |
| 8.6 | `api/` consolidated to 6 functions (Hobby cap 12); ESM `.js` import rule and `jose@^5` override (removal condition: `jwks-rsa` > 4.1.0 ships the lazy-`jose` fix — then re-verify `firebase-admin/auth` on a preview deploy). |
| 8.7 | Catalog progressive reveal (16 per page, button only). |
| 8.17 | Catalog imports/seeds are non-destructive and identity-stable: `import-catalog-csv.ts` binds product identity to the normalized name (reorder-proof), allocates new ids above the existing max, updates metadata-only, soft-retires (never deletes) `odon-*` docs referenced by orders, and audits real changes only; `manage-firestore-schema.ts --seed` shares the metadata/noop/price-audit semantics, keeps the fake paid sample order dev-only, and both prod paths require explicit `--confirm-production-import`/`--confirm-production-seed` (no `--force` substitute) with a gate-exempt `--dry-run` rehearsal. |
