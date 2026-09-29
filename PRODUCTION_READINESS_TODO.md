# PRONTO INSUMOS ODONTOLÓGICOS — Production Readiness TODO

A working task list, not a changelog. Finished work is one line in §2; its as-built detail lives in the `AGENTS.md` of the directory it touches. Open tasks keep their IDs (they are referenced from code comments and `AGENTS.md` files) — do not renumber.

**Last updated:** 2026-09-29 (full audit pass; **Phase 3 — 3.1, 3.2, 3.3 — suspended** by owner decision) · **Market:** Melipilla & San Antonio, Chile · **Stack:** Vercel (React 18 + Serverless Node) · Firebase (Firestore + Cloud Storage, Blaze plan since 2.9) · Mercado Pago Chile · Resend
**Baseline (verified 2026-09-29, after merging PR #22 / Task 2.9):** `pnpm test` 663/663 (72 suites) · `pnpm lint`, `pnpm build`, `pnpm format:check` and `pnpm exec tsc --noEmit` all clean · `api/` type-checks clean under `--strict`.

**Priorities:** **P1** = fix before real traffic · **P2** = fix soon after / before a marketed launch · **P3** = polish & DevOps.

---

## 1. Open Work at a Glance

| ID | Task | Pri | Launch blocker |
| :-- | :-- | :-: | :-: |
| 0.12 | Firestore rules: bind order doc to its id + field allowlist | P1 | **Yes** |
| 0.13 | Stored XSS via `voucherUrl` in the admin panel (made reliable by the 2.9 Blob-URL handler) | P1 | **Yes** |
| 0.14 | Webhook reconciliation gaps (MP 5xx swallowed, double payment, cancelled/refunded orders, oversell) | P1 | **Yes** |
| 0.15 | Admin dispatch crashes without a tracking number (`undefined` in Admin SDK write) | P1 | **Yes** |
| 0.16 | `track-order` fabricates an order in production when Firebase credentials are missing | P1 | **Yes** |
| 2.11 | Catalog fallback shows prototype fixtures and wipes the persisted cart | P1 | **Yes** |
| 3.1 | Per-zone shipping rates below the free-shipping threshold — **suspended (Phase 3)** | P1 | **Yes** |
| 7.2 | Custom `.cl` domain + SSL | P1 | **Yes** |
| 8.8 | Enumeration & abuse throttling on public endpoints | P1 | **Yes** |
| 2.10 | Last literal `wa.me` / stale phone placeholders | P2 | No |
| 2.12 | Payment-return modal claims "Pago Confirmado" from URL params alone | P2 | No |
| 2.15 | Voucher storage follow-ups (unconfirmed uploads, legacy base64 docs) | P2 | No |
| 3.2 | Estimated delivery windows in cart/checkout — **suspended (Phase 3)** | P2 | No |
| 3.3 | Stale localization copy sweep (API, services, storefront, admin) — **suspended (Phase 3)** | P2 | **Yes** (wrong coverage claims) |
| 4.2 | Backoffice readiness sweep | P2 | No |
| 4.3 | Admin handler hardening (status guards, amount check, stock races) | P2 | No |
| 8.4 | Pre-flight gate / minimal CI | P2 | No |
| 8.12 | Security headers (`vercel.json`) | P2 | No |
| 8.13 | Stale pending-order accumulation | P2 | No |
| 9.1 | Promo data model (expiry, exhaustion, audit, eligibility) | P2 | Only for limited/private campaigns |
| 2.14 | Decision: public `stockCount` read vs. "confidential stock" rule | P3 | No |
| 6.2 / 6.3 | Datasheet downloads · catalog expansion by specialty | P3 | No |
| 8.1 · 8.2 · 8.5 | Bundle chunks · `api/` in `tsc` · Sentry & GA4 | P3 | No |
| 8.9 · 8.10 · 8.11 | `.env.example` gaps · lint scope · resilient Firebase init | P3 | No |
| 8.14 · 8.15 | Dependency hygiene · operator-script guardrails | P3 | No |

> **SUSPENDED until further notice (owner decision, 2026-09-29; extended to 3.1 the same day):** the whole of **Phase 3 — Logistics & Copy** — **3.1** (per-zone shipping rates), **3.2** (estimated delivery windows) and **3.3** (stale localization copy sweep) — is out of the active priority queue. Do not select, plan or implement these items.
>
> **Launch consequence, kept visible on purpose:** 3.1 is the only P1 launch blocker inside the suspension, so while it is suspended the storefront charges **no freight** below `FREE_SHIPPING_THRESHOLD` and PRONTO absorbs the courier cost on those orders.

**Human action items (no agent can close these):**

- Deploy Firestore rules after 0.12: `pnpm run deploy:rules`.
- `pnpm dlx vercel@latest deploy --prod` (8.6's last acceptance box; the `og-preview.jpg` gate is already cleared).
- Confirm the 2.9 storage provisioning is live on **production** (Blaze plan, bucket, `pnpm run storage:cors -- --apply`, `pnpm run deploy:storage-rules`, and `FIREBASE_STORAGE_BUCKET` in Vercel Production if the bucket is not the default `<project>.firebasestorage.app`). Until then uploads fail closed with a WhatsApp-fallback message.
- Register the `.cl` domain (7.2).
- Owner/lawyer sign-off on the draft legal copy in `LegalModal` (7.1: SERNAC warranty clauses and hygiene-sealed-goods exclusions are a draft, not legal advice).
- Optional human-produced assets, never agent-generated: `public/assets/delivery-routes.png` (Appendix B.3) and `public/assets/bodega-ortuzar.jpg` (Appendix B.4) in [UI_UX_EVALUATION_AND_REDESIGN_PROPOSAL.md](./UI_UX_EVALUATION_AND_REDESIGN_PROPOSAL.md); if absent the checkout `<figure>` is simply omitted.
- WhatsApp Business app greeting/away/quick-reply configuration (5.2, operational).

---

## 2. Resolved (as-built detail lives in each directory's `AGENTS.md`)

| ID | Outcome |
| :-- | :-- |
| 0.1 | Orders start `PENDIENTE_*`; client never approves payment or touches stock. |
| 0.2 | Webhook runs on `firebase-admin` (service account) with transactions. |
| 0.3 | One canonical `PRONTO-NNNNNN` id across order doc, preference and `external_reference`. |
| 0.4 | Webhook idempotent (fast path + in-transaction guard). |
| 0.5 | HMAC-SHA256 `x-signature` verification, timing-safe. |
| 0.6 | `firestore.rules` deployed: public catalog read, admin-only writes, pending-only order create, client order read/update/delete denied. |
| 0.7 | Public "seed Firebase" footer button removed. |
| 0.8 | Mock customer data and card fields purged (PCI-DSS: no card data in state). |
| 0.9 | Server-side price rebuild in `create-preference` + webhook amount assertion (`PAGO_EN_REVISION` on mismatch) + admin `resolve-payment-review`. |
| 0.10 | Simulated payment paths gated by `api/_lib/simulationPolicy.ts` (fail closed in production). |
| 0.11 | `submitOrder` fails closed; `ignoreUndefinedProperties: true` on the client Firestore instance. |
| 1.1 | Integer-CLP catalog, `formatCLP`, `Math.round` IVA. |
| 1.2 | Billing block with tax breakdown, Factura field validation (gated by `FACTURA_ENABLED = false`), printable pro-forma voucher. |
| 1.3 | ISP/SIS validation for regulated items (`prescriptionRequired`). |
| 1.4 | Distributor RUT sourced from `BANK_DETAILS.rut` (single-source guard test). |
| 2.1 | Mercado Pago return URLs handled (`PaymentReturnModal`) — see 2.12 for the remaining trust gap. |
| 2.2 | Cart persistence in `localStorage` (`pronto_cart_v1`, 7-day TTL, catalog revalidation) — see 2.11 for a data-loss edge. |
| 2.3 | Stock guards in cart, checkout and `create-preference`. |
| 2.4 | Bank-transfer workflow with voucher upload (storage since reworked by 2.9). |
| 2.9 | Vouchers go to private Cloud Storage via a two-phase `sign` → direct PUT → `confirm` flow (V4 signed URL with signed 5 MiB cap, server-side MIME/size re-check, lifecycle guard re-asserted in a transaction, deny-all `storage.rules`, `pnpm run storage:cors`); base64 payloads rejected; `upload-voucher` fails closed in production. |
| 2.5 | Customer tracking (`/api/track-order`, `OrderTrackingModal`). |
| 2.6 | 5-step checkout (Contacto → Despacho → Documento → Pago → Confirmación). |
| 2.7 | Search bars are real forms (Enter, submit, clear). |
| 2.8 | Simulated client fallbacks only outside production; real HTTP errors surface. |
| 4.0 | Admin portal (`admin.html`, Firebase custom claim `admin: true`, `api/admin/[action].ts` dispatcher). |
| 4.1 | Schema freeze, `order_status_history` / `inventory_audit_logs`, migration CLI. |
| 5.1 | Resend transactional email (fail-safe, plain `fetch`), domain `prontoinsumos.com` verified. |
| 5.2 | Production WhatsApp number `56929831595`. |
| 6.1 | Real catalog photography and gallery. |
| 7.1 | Terms, SERNAC warranty, privacy (Ley 19.628) and legal ID via `LegalModal` (copy = draft, see human items). |
| 7.3 | `og-preview.jpg` (1200×630 JPEG) and `favicon.svg` delivered. |
| 8.3 | Integration tests for the serverless endpoints. |
| 8.6 | `api/` consolidated to 6 functions (Hobby cap 12); ESM `.js` import rule and `jose@^5` override (removal condition: `jwks-rsa` > 4.1.0 ships the lazy-`jose` fix — then re-verify `firebase-admin/auth` on a preview deploy). |
| 8.7 | Catalog progressive reveal (16 per page, button only). |

Go-live criteria: [x] CLP-accurate charges · [x] payment + stock only via the verified webhook · [x] abandoned/rejected payments leave stock intact · [x] server secrets only in serverless env · [x] order confirmation email/WhatsApp · [x] Boleta + validated RUT · [x] server-verified amounts (0.9) · [x] consumer legal terms published · [ ] branded `.cl` domain with SSL (7.2) · [ ] all P1 items above closed — **standing exception: the suspended Phase 3 set (3.1 freight), which while suspended means sub-threshold orders ship without a freight charge.**

---

## 3. Open Tasks

### Phase 0 — Security & Payment Integrity (2026-09-29 audit)

- [ ] **0.12. Firestore rules: bind the order document to its id and allowlist its fields** _(P1)_
  - **Evidence:** `firestore.rules:32-59` (`isValidOrderCreate`) and `:87-95` (`orders`/`dev_orders`). The rule never asserts `data.orderId == orderId` (the path variable) and only blocks `mercadopagoPaymentId` / `paidAt` — every other key is client-writable.
  - **Impact:** (a) a decoy doc `orders/<anything>` with field `orderId: "<victim id>"` can shadow the real order, because the webhook, `track-order` and `order-confirmation` resolve orders with `where('orderId','==',…).limit(1)` only (since 2.9 `upload-voucher` tries the doc id first, but keeps the same field-query fallback) and could pick the decoy; (b) any admin-only field (`voucherUrl`, `approvedAt`, `dispatch`, `courier`, `trackingNumber`, `confirmationEmailSentAt`, …) can be pre-injected at create time (feeds 0.13); (c) no length caps — a single public `create` can be ~1 MiB.
  - **Fix:** add `data.orderId == orderId`; add `request.resource.data.keys().hasOnly([...])` for the exact shape `submitOrder` writes; require `paymentMethod` consistent with `status`; cap string lengths. Make the webhook, `track-order` and `order-confirmation` resolve by doc id first (as `create-preference` and `upload-voucher` already do), falling back to the field query. Apply to both `orders` and `dev_orders`.
  - **Verify:** extend `src/tests/security/firestore-rules.test.ts` (content assertions) + a webhook test where a decoy doc with the same `orderId` field exists. Then deploy rules (human item).

- [ ] **0.13. Stored XSS through `voucherUrl` in the admin panel** _(P1)_
  - **Evidence:** `src/admin/components/OrderDetailPanel.tsx` renders `<a href={order.voucherUrl} target="_blank">` for whatever string is stored. Since 2.9 `upload-voucher` only writes server-built `https://firebasestorage.googleapis.com/…` URLs, but **0.12 still lets anyone write an arbitrary `voucherUrl` straight into a new order through Firestore** (the public API key is enough). Two paths follow:
    - `javascript:` value → default anchor navigation (browser-dependent whether it runs under `target=_blank`).
    - **`data:` value → made reliable by 2.9's `handleOpenVoucher`** (`OrderDetailPanel.tsx:129-142`): for any `data:` URL it `fetch`es it into a Blob and opens `URL.createObjectURL(blob)`. A `data:text/html,<script>…</script>` payload becomes a same-origin `blob:` page whose script runs in the **admin origin** (blob URLs inherit the creator's origin; the handler never checks `blob.type`). That script can read the Firebase Auth session and call every `/api/admin/*` action. Not exercised in a browser here, but the logic follows from the code.
  - **Fix:** open only allowlisted URLs — `https:` to the configured Firebase Storage host; for legacy `data:` vouchers require the Blob's `type` to be `application/pdf` / `image/png` / `image/jpeg` (re-wrap it with that forced type) and refuse everything else; render plain text (no anchor) for any other scheme. Apply the same check anywhere a stored URL is linked (tracking modal). 0.12's field allowlist closes the injection side.
  - **Verify:** `OrderDetailPanel.test.tsx` — `javascript:`, `data:text/html` and non-storage `https:` values open nothing; legacy `data:image/png` still opens.

- [ ] **0.14. Webhook reconciliation gaps** _(P1)_ — `api/webhooks/mercadopago.ts`
  - **(a) MP verification failures are acknowledged `200`** (`:107-115`): a revoked/expired token, an MP 5xx or a timeout returns 200, so a genuinely paid order is never retried and never reconciled. Return `5xx` for `401/403/5xx/network`; keep `200` only for `404` (payment does not exist).
  - **(b) A second approved payment for an already-paid order is silently ack'd as `duplicate`** (`:163-176`, keyed on `status === 'PAGADO_MERCADOPAGO'`, not on the payment id). A double charge (two approved payment ids) is never flagged. If `paymentId !== order.mercadopagoPaymentId`, alert the warehouse and record it in history for manual refund.
  - **(c) No order-status guard:** an approved payment for an order that is `CANCELADO` / `DESPACHADO` / `ENTREGADO` / `TRANSFERENCIA_APROBADA` flips it to `PAGADO_MERCADOPAGO` and deducts stock again. Only `PENDIENTE_PAGO_MERCADOPAGO` and `PAGO_EN_REVISION` should be payable; anything else → review + alert, no stock movement.
  - **(d) Refunds / chargebacks are unhandled:** only `approved` is processed; a later `refunded` / `charged_back` / `cancelled` leaves the order `PAGADO`, stock deducted. Minimum: route to `PAGO_EN_REVISION` with an alert (refunds stay off-platform, `src/types/AGENTS.md` §2.1).
  - **(e) Silent oversell:** `newStock = Math.max(0, current − qty)` (`:249`) hides a shortfall (stock hit 0 between preference and payment). Approve (money is taken) but record the shortfall in history/audit metadata and alert the warehouse. Same clamp exists in `approve-transfer` and `resolve-payment-review`.
  - **(f) Signed id ≠ used id:** the signature is verified against query `data.id` first (`:53-54`) but the payment fetched is `body.data.id` first (`:42-43`). Use one value for both. Optionally pass `maxAgeSeconds` (the helper supports it).
  - **(g) `create-preference` prices the request body, not the order:** lines come from `req.body.items` (`api/create-preference.ts:117-183`) while the webhook checks `order.items`. A mismatched body yields a payable preference that later lands in `PAGO_EN_REVISION`. Build the lines from `orderData.items` instead.
  - **Verify:** webhook tests for each branch (MP 500 → 5xx; second payment id → alert; cancelled order → no transition/stock; refund → review; shortfall → alert with approval; mismatched signed id).

- [ ] **0.15. Admin "Marcar Despachado" crashes without a tracking number** _(P1)_
  - **Evidence:** `api/_lib/admin/dispatch-order.ts:53-67` writes `trackingNumber: undefined` and `dispatch.trackingCode: undefined`; the UI sends no `trackingCode` when the field is empty (`OrderDetailPanel.tsx:97`; the default carrier is the local Melipilla fleet, which usually has none). Reproduced against `firebase-admin`: `Cannot use "undefined" as a Firestore value … enable ignoreUndefinedProperties` → the request 500s. The only test (`dispatch-order.test.ts:67`) always supplies a tracking code.
  - **Fix:** build the update object with conditional spreads (omit absent keys), or set `ignoreUndefinedProperties` once in `api/_lib/firebaseAdmin.ts` (`getFirestore(app).settings({ ignoreUndefinedProperties: true })` — call before first use). Prefer omitting keys in the handler *and* audit other Admin writes for `undefined`.
  - **Verify:** dispatch test without `trackingCode` (assert no `undefined` in the update payload).

- [ ] **0.16. `track-order` fabricates an order in production when Firebase credentials are missing** _(P1)_
  - **Evidence:** when `getAdminFirestore()` is `null`, `api/track-order.ts:33-72` returns a fake order ("Dra. Andrea Morales", `$189.990`) in any runtime — a lost `FIREBASE_*` env var shows customers fake tracking data. (`upload-voucher` was fixed by 2.9: it now returns `500` in production via `isSimulatedPaymentAllowed()`; `order-confirmation` only skips the email, which is acceptable.)
  - **Fix:** if `!isSimulatedPaymentAllowed()` return `500` + `console.error`, keeping the simulated branch for dev/tests.
  - **Verify:** tests mirroring the 0.10 / 2.9 production and `ALLOW_SIMULATED_PAYMENTS` cases.

- [ ] **2.15. Voucher Storage Follow-Ups (post-2.9)** _(P2)_
  - **Unconfirmed uploads are never cleaned up.** `sign` hands out signed PUT URLs with no per-order limit and no throttle; an upload that is never `confirm`ed leaves an orphan object of up to 5 MiB under `vouchers/…` (Blaze bills storage). Cap signs per order (e.g. a small counter on the order doc / 8.8 throttling) and add a housekeeping path for objects the order document does not reference (bucket lifecycle rule on a `pending/` prefix that `confirm` moves out of, or an admin sweep action on the existing dispatcher — no new function slot).
  - **Legacy base64 vouchers still live in pre-2.9 order docs.** `track-order` now hides `data:` URLs, but `api/_lib/admin/orders.ts:48-59` still returns every order document — including any `voucherUrl` base64 (up to ~1 MiB each) — and Vercel caps responses at 4.5 MB, so the admin list breaks once a few legacy vouchers accumulate. Either migrate them to Storage with a one-off operator script (dev by default, `--confirm-production-…` for prod, per 8.15) or have `orders.ts` return `hasVoucher` instead of the URL and fetch the URL only on the detail request. Also see 0.13 for the `data:` handling.
  - **`voucherUrl` is a permanent capability URL** (Firebase download token; never expires unless the token is rotated). Acceptable today — it is only exposed to the RUT-authenticated customer and admins — but note it if vouchers ever need revocation.
  - **Platform facts (verified 2026-09-28) that shaped the design:** Firestore 1 MiB doc cap and 1 GiB free tier; Vercel 4.5 MB request/response body cap (hence client-direct upload and no bytes through functions); Cloud Storage for Firebase needs Blaze. Sources: [Firestore limits](https://firebase.google.com/docs/firestore/quotas) · [Vercel limits](https://vercel.com/docs/functions/limitations) · [Storage billing change](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)

- [ ] **2.11. Catalog fallback shows prototype fixtures and wipes the persisted cart** _(P1)_
  - **Evidence:** `src/services/api.ts:57-82` races `getDocs` against a **2.5 s timeout** and on timeout/error/empty snapshot returns `[...PRODUCTS]` (the 11 `odon-*` fixtures — all `isActive: false, inStock: false`, and the `isActive` filter is only applied to Firestore results). In `src/App.tsx:154-190` the first unfiltered fetch runs `revalidateCartAgainstCatalog(cart, res)` and sets `hasRevalidated`; against the fallback catalog every saved `pronto-*` line is "discontinued" (`cartStorage.ts:184-196`), so the cart is emptied, persisted empty, and a misleading "se actualizó el carro" toast shows. A slow 4G first load in Chile is enough; the shopper sees an 11-item all-agotado catalog with no error.
  - **Fix:** when `!isSimulatedFallbackAllowed()` (production) do not fall back to fixtures — surface a retryable "no pudimos cargar el catálogo" state; never revalidate/mutate the cart from fallback data (flag the result as `source: 'fallback'`); relax/remove the 2.5 s race (Firestore SDK already has its own timeouts); filter `isActive` on fallback data too.
  - **Verify:** `App`/`api` tests: Firestore timeout in production mode → error state, cart untouched.

- [ ] **8.8. Enumeration & Abuse Throttling on Public Endpoints** _(P1 — was P2; audit raised it)_
  - **Enumeration oracle:** `track-order` / `upload-voucher` / `order-confirmation` return `404` for an unknown id but `401` for a wrong RUT (`track-order.ts:81-94`, `upload-voucher.ts:393-410`), so order ids can be enumerated without any RUT; `generateOrderId()` is `Math.random()` over only 900 000 values (`src/services/api.ts:42-44`). A company RUT is public information, so an attacker can walk the id space against a known clinic RUT and harvest its orders' PII (name, email, address, items). There is also no attempt throttling at all. (Random 6-digit ids also collide as volume grows — a collision surfaces as a generic rules-denied checkout error.)
  - **Open write/email abuse:** `orders` create is public and unthrottled (each write counts against the free 20k/day and is billed beyond it now that the project is on Blaze — abuse costs money instead of just failing); `order-confirmation` emails whatever `customer.email` the creator typed; every successful voucher `confirm` (re-upload is allowed while `TRANSFERENCIA_COMPROBANTE_SUBIDO`) emails the warehouse, and a fresh own order costs nothing — Resend's free tier (3 000/month) can be exhausted, silencing legitimate mail. (The 2.9 lifecycle guard already stops uploads on paid/dispatched orders.)
  - **Required (lean, no new infra):** return one identical response for "not found" and "RUT mismatch"; per-IP and per-orderId attempt counters with a lockout window (Firestore counter doc or Vercel Edge config); widen the id space with `crypto.getRandomValues` (e.g. `PRONTO-` + 8 base32 chars — check `schemaValidation`/docs that assume 6 digits); dedupe/throttle warehouse emails per order.
  - **Verify:** tests for uniform errors, lockout after N failures, and id format/entropy.

- [ ] **7.2. Custom `.cl` Domain and SSL** _(P1)_
  - Register via NIC Chile (e.g. `prontoinsumos.cl`), configure DNS on Vercel (automatic TLS), replace every `pronto-insumos.vercel.app` (`index.html` `og:url`, `og:image`, `twitter:*`, JSON-LD `url`/`image`; `SITE_URL` in Vercel env for email tracking links). Re-check the Resend sender domain and Mercado Pago `notification_url`/back URLs after the switch.

### Phase 2 — Checkout, Payment Return & Storefront

- [ ] **2.10. Replace the Last Literal `wa.me` and Stale Phone Placeholders** _(P2)_
  - `PaymentReturnModal.tsx:38-42` builds its own link with a stale fallback (`56912345678`); route it through `whatsappLink()` (`src/config/contact.ts`). `src/services/whatsapp.ts:15` keeps a second env read (fallback correct, but two places can drift). `index.html:61` JSON-LD `telephone` is still `+56912345678` — use the canonical number (`+56929831595`). Do not invent numbers.

- [ ] **2.12. Payment-Return Modal Claims Success From URL Parameters Alone** _(P2)_
  - `/?status=approved&orderId=…` (trivially forgeable, and also set by Mercado Pago before the webhook runs) opens "¡Pago Confirmado Exitosamente! — Tu transacción ha sido acreditada" (`PaymentReturnModal.tsx:85-88`) and clears the cart (`App.tsx:78,215`). It is harmless to the backend but misleads customers/staff and can clear a cart with no order.
  - **Fix:** soften the copy to what is actually known ("Recibimos tu retorno de pago; confirmaremos por correo cuando se acredite") and add the `Ver estado del pedido` action (tracking needs the RUT the customer already typed); clear the cart only when a matching order was just created in this session.

- [ ] **2.14. Decision: Public `stockCount` Read vs. the "Confidential Stock" Rule** _(P3)_
  - `firestore.rules` grants public `read` on `products`, so exact `stockCount` is fetchable by anyone even though `src/data/AGENTS.md` §3.2 declares it confidential (the UI only hides it). Either accept and amend that rule, or publish a stock-free projection (e.g. `stockBucket`/`inStock` only) and keep exact counts admin/server-side. Low urgency; do not change opportunistically — it touches `cartStorage` clamping and `create-preference`.

### Phase 3 — Logistics & Copy — SUSPENDED until further notice (owner decision, 2026-09-29)

> Not in the active priority queue: do not select, plan or implement these three items. IDs and wording are retained for when the suspension is lifted.

- [ ] **3.1. Dynamic Shipping Rates by Delivery Zone** _(P1 — blocker, suspended)_
  - **State:** the zone selector is built (`DELIVERY_ZONES`: `Melipilla` default same-day before 16:00; `San Antonio` scheduled route, `MIN_ORDER_OUTSIDE_MELIPILLA = 60000`, San Antonio only). `FREE_SHIPPING_THRESHOLD = 150000` applies to both. No pickup, no RM (root `AGENTS.md` §3.4).
  - **Required:** define per-zone freight for orders **below** the threshold as constants in `src/config/delivery.ts` (never redeclared); add freight to the payable total **server-side** (`orderTotal.ts` → `submitOrder`, `create-preference` line, webhook assertion — the four amounts must stay identical, the 0.9 invariant); include it in the tax/billing breakdown; show a freight line in Cart, Checkout and the pro-forma voucher.

- [ ] **3.2. Estimated Delivery Time Windows** _(P2)_
  - Show fulfillment estimates in Cart and Checkout: same-day Melipilla for orders confirmed before 16:00; scheduled route for San Antonio. Copy must come from `DELIVERY_ZONES` and add a config constant for the 16:00 cutoff (today it is a literal duplicated in Footer/LegalModal) — never "RM".

- [ ] **3.3. Stale Localization Copy Sweep** _(P2)_ — wording still references the removed logistics model:
  - `api/_lib/emailTemplates.ts:114` "Melipilla & Región Metropolitana" (every transactional email header).
  - `api/track-order.ts:133` "…o retirado en Av. Ortúzar 750" (no pickup) and `:180` regional courier fallback `Starken / Chilexpress Regional`; `PENDIENTE_PAGO_MERCADOPAGO` / `PAGO_EN_REVISION` fall into the generic "Pedido Registrado" copy.
  - `src/services/whatsapp.ts:12,38` "(Melipilla & RM)" and a fixed "despacho para Melipilla" note even for San Antonio buyers.
  - `src/admin/components/AdminOrders.tsx:42` "…depósitos dentales en Melipilla y RM"; also check `AdminSettings.tsx`.
  - Storefront strings catalogued in `src/components/AGENTS.md` §2.5 (Cart "Factura Electrónica B2B" strip, CheckoutModal transfer-card "…emisión de Factura", pro-forma letterhead "Melipilla, Región Metropolitana") — these need an Appendix C–sanctioned replacement before editing; the API/service/admin strings can be fixed directly.

### Phase 4 — Backoffice

- [ ] **4.2. Backoffice Readiness Sweep** _(P2)_ — routing was verified healthy (all 12 `/api/admin/<action>` client calls map 1:1 to the dispatch table; `vercel.json` rewrites exclude `api/`).
  1. **Handler test gap:** `orders`, `products`, `mark-delivered`, `toggle-visibility` have no dedicated suites under `src/tests/api/admin/` (happy path, auth rejection, method gate, `OPTIONS`, malformed payload — mirror `approve-transfer.test.ts`).
  2. **Unbounded reads / dead pagination:** `orders.ts:48` loads the **entire** `orders` collection on every request (and `dashboard-stats.ts:49-50` loads all orders + all products), then slices to `limit` 50 — the free tier is 50k reads/day (billed beyond that now that the project is on Blaze), so cost scales with order count × admin page loads, and staff silently stop seeing orders older than the window. `fetchAdminOrders({ cursor })` sends a `cursor` the server ignores. Implement real `orderBy('createdAt','desc').limit(n).startAfter(cursor)` with server-side status filter (search stays client-side over the loaded page or moves to an indexed field), and compute stats with `count()` aggregations or a bounded window.
  3. **Placeholder cards** ("Fase 5" GTM/GA4 and shipping-rates cards) are documented in `src/admin/AGENTS.md` §6.1 but their labels don't match this roadmap — relabel to 8.5 / 3.1.
  4. **`StockAdjustModal` conditional-hooks crash (functional):** `if (!product) return null` precedes four `useState` calls (`StockAdjustModal.tsx:18-23`) while `AdminInventory.tsx:99` mounts it unconditionally — the first time a product is selected React throws "Rendered more hooks than during the previous render" and `#inventory` crashes. Mount it conditionally like `ProductEditModal` (or hoist the hooks).
  5. **`var(--primary)` is undefined** in `admin.css` (`OrderDetailPanel.tsx:301` and the audit-timeline border) — use `--teal-600`.
  6. **`ProductEditModal` prop→state sync effect** (`:56-61`, flagged by `react-hooks/set-state-in-effect`) — use lazy initializers/`key` remount in the same pass as item 4.
  7. Stale copy `AdminOrders.tsx:42` ("…y RM") is tracked in 3.3.
  - **Verify:** `pnpm test`, `pnpm build`, `pnpm lint` green; update the admin suite counts in `src/tests/AGENTS.md`.

- [ ] **4.3. Admin Handler Hardening** _(P2)_ — all under `api/_lib/admin/`
  - **Status guards are UI-only.** `dispatch-order` accepts any order (unpaid, `CANCELADO`, already `ENTREGADO`); `mark-delivered` accepts anything; `approve-transfer` only short-circuits already-approved/paid statuses — it will approve a `CANCELADO`, `COTIZACION_SOLICITADA_WHATSAPP` or `PENDIENTE_PAGO_MERCADOPAGO` order and deduct stock. Enforce allowed source states server-side (`approve-transfer`: `PENDIENTE_TRANSFERENCIA`/`TRANSFERENCIA_COMPROBANTE_SUBIDO`; `dispatch`: paid/approved/`EN_PREPARACION`; `mark-delivered`: `DESPACHADO`) and return `409` like `resolve-payment-review` does.
  - **Transfer/quote orders have no server amount check.** Their `totalAmount`/line prices are client-written (rules validate shape only), so a crafted order can show $1 for expensive items and `approve-transfer` still deducts stock and emails "aprobado". Recompute the total from the current catalog at approval time (reuse `computeOrderTotal`) and refuse/flag on mismatch.
  - **`update-stock`:** `newStock` accepts `NaN`/`Infinity`/non-integers (`typeof === 'number' && >= 0`), and the read-modify-write runs in a batch rather than a transaction, so a concurrent webhook deduction can be overwritten by an absolute value — validate with `Number.isInteger` + an upper bound and use `runTransaction`.
  - **`update-product`:** `category` is not upper-cased (create does), which splits category filters; changing `price` should audit old → new.
  - **Auth:** `verifyIdToken` is called without `checkRevoked`, so a revoked admin keeps access up to an hour; admin routes send `Access-Control-Allow-Origin: *` (Bearer auth, no cookies — low risk, but the admin API is same-origin only, so drop the header).
  - **Verify:** `409` tests per guard, mismatched-total approval test, NaN/decimal stock rejection.

### Phase 6 — Catalog

- [ ] **6.2. Downloadable Technical Documentation** _(P3)_ — "Descargar ficha técnica (PDF)" on product details (datasheets and ISP registration codes for clinic sanitary audits).
- [ ] **6.3. Expand Catalog SKUs by Specialty** _(P3)_ — Endodontics, Periodontics & Prophylaxis, Restorative & Esthetics, Orthodontics, Surgery & Implants, Sterilization & Infection Control (categories are open strings; use admin `+ Nuevo Insumo` / CSV import).

### Phase 8 — Infrastructure, DevOps & Telemetry

- [ ] **8.4. Pre-Flight Checks & Minimal CI** _(P2)_
  - `tsc` is green again (the `mercadopago.test.ts` error was fixed by PR #22). Make `pnpm test && pnpm exec tsc --noEmit && pnpm build` the mandatory local pre-release gate and record it where the workflow skill/AGENTS say it (today nothing enforces the `tsc` step, which is how it regressed) (lean per root `AGENTS.md` §2 guardrail 5: no containers, no multi-stage pipelines). Optional: a minimal `.github/workflows/ci.yml` running `pnpm test` + `pnpm build` on pull requests.

- [ ] **8.12. Security Headers in `vercel.json`** _(P2)_
  - `vercel.json` only defines rewrites — no `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy`. The admin portal can be framed (clickjacking on approve/dispatch buttons). Add headers via `headers` in `vercel.json` (no new function): `frame-ancestors 'none'` on `/admin*`, `nosniff`, `strict-origin-when-cross-origin`, and a CSP that allows only the origins actually used (self, Google Fonts, Firebase/Google APIs, Mercado Pago, `wa.me` links). Start `Content-Security-Policy-Report-Only`, verify on a preview deploy, then enforce.

- [ ] **8.13. Stale Pending-Order Accumulation** _(P2)_
  - Every checkout attempt writes a fresh `PRONTO-NNNNNN` doc (`CheckoutModal.tsx:286`), and a failed preference (or an abandoned Mercado Pago page) leaves `PENDIENTE_PAGO_MERCADOPAGO` forever — the admin list, "pending" KPI and the `orders` collection fill with ghosts. Options (pick the leanest): reuse the same `orderId` for a retry within the same modal session (needs a rules-permitted update path or a server-side create), and/or an admin "cerrar pedidos pendientes > N horas" action on the existing dispatcher (no new function slot). Coordinate with 0.14(c): a cancelled order must never be re-opened by a late payment.

- [ ] **8.5. Real-Time Error Monitoring & Analytics (Sentry & GA4)** _(P3)_
  - Sentry for React (unhandled client errors) and GA4 e-commerce events (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`). Also the missing production alert path: fail-closed 500s (0.10) and 0.14's new alerts currently rely on someone reading Vercel logs.

- [ ] **8.1. Bundle Optimization** _(P3 — refreshed; the old "781 kB main chunk" no longer exists)_
  - `manualChunks` already split the build: `main` 137 kB, `vendor-react` 141 kB, **`vendor-firebase` 672 kB** (the remaining >500 kB warning). The storefront imports `getAuth` (`src/services/firebase.ts:25`) but only the admin needs Firebase Auth — dropping it from the storefront graph (see 8.11) is the biggest win; then `React.lazy()` for `CheckoutModal` / `ProductQuickView`.

- [ ] **8.2. Type-Check the Serverless Functions** _(P3)_
  - `tsconfig.json` includes only `src/**/*`. Verified 2026-09-29: `api/**` already passes `tsc --noEmit --strict --module esnext --moduleResolution bundler --types node`, so adding a `tsconfig.server.json` (Node context) and running it in the 8.4 gate is nearly free and will keep it green.

- [ ] **8.9. `.env.example` Completeness** _(P3)_
  - `SITE_URL` (read by `api/_lib/emailTemplates.ts`, defaults to `https://prontoinsumos.com`) is missing; document `VITE_VERCEL_ENV` as a build-time `define` from `vite.config.ts` (not a dashboard variable); verify every var referenced in `api/` and `src/` is represented.

- [ ] **8.10. Widen Lint/Format Scope to `api/` and `src/admin/`** _(P3)_
  - Both sit in the ESLint `ignores`. Measured 2026-09-29 by lifting the ignore: **65 problems (63 errors, 2 warnings)** — the `StockAdjustModal` `rules-of-hooks` errors (4.2 item 4), `ProductEditModal` `set-state-in-effect`, 12× `no-explicit-any` in `adminApi.ts`, unused imports in `src/admin/types.ts`, plus `any` in the handlers. Fix in a dedicated pass, then delete the carve-out (root `AGENTS.md` §8.3).

- [ ] **8.11. Resilient Firebase Init** _(P3)_
  - `src/services/firebase.ts:25` calls `getAuth(app)` unguarded at module scope: a missing/invalid `VITE_FIREBASE_API_KEY` throws `auth/invalid-api-key` at import and blanks the whole page. Making `auth` nullable (or moving it to an admin-only module) touches `adminApi.ts` / `AdminApp.tsx` / `AdminLogin.tsx` — its own reviewed task (`src/services/AGENTS.md` §4.5), and it doubles as the storefront bundle win in 8.1.

- [ ] **8.14. Dependency Hygiene** _(P3)_
  - `pnpm audit --prod` (2026-09-29): 1 moderate — `uuid <11.1.1` via `firebase-admin > @google-cloud/storage > gaxios` (GHSA-w5hq-g745-h8pq, only reachable when a caller passes `buf`; not used here). Re-check after each `firebase-admin` bump. The `jose@^5` override is EOL upstream — remove per the 8.6 condition.

- [ ] **8.15. Operator-Script Guardrails** _(P3)_
  - `pnpm run schema:seed` (prod) writes with no confirmation flag and creates `PRONTO-SAMPLE-001` in the live `orders` collection (counted by dashboard KPIs); `import-catalog-csv.ts:90` treats plain `--force` as production confirmation. Require `--confirm-production-seed`, skip the sample order outside dev, and accept only `--confirm-production-import` for prod imports.

### Phase 9 — Commercial Promotions

- [ ] **9.1. Complete the Promo Code Data Model** _(P2 — promo table is now payment authority)_
  - **Gap:** `PromoCode` is `{ code, discountPercent, label }` and `MOCK_PROMOS` has two public entries (`PRONTO10`, `DENT20`). `resolvePromoPercent` can only answer "does this code exist?" — no validity window (yet `Cart.tsx` promises `inválido o vencido`), no usage limits (`DENT20` is unlimited and, being in the browser bundle, public), no redemption audit (`Order.promoCode`/`discountAmount` are persisted but read by nothing; rules don't constrain them), basket-wide discount only (no per-product/REF eligibility — note order lines persist only `productId`; a REF rule must resolve `Product.sku` from the catalog at verification time), no `minSubtotal` / `discountType` / channel restriction.
  - **Required:** extend `PromoCode` with the policy fields and keep `src/config/promos.ts` the pure resolver every surface derives through (cart, `submitOrder`, `create-preference`, webhook — they must never drift). Static module is fine **only if** codes are genuinely public; private clinic codes need a Firestore `promo_codes` collection (admin-write, public-read denied). Resolve eligibility per line (`computeOrderTotal` takes per-line discounts; update all four consumers together). Make exhaustion authoritative **inside the webhook transaction** (`usageCount` increment + `promo_redemptions` record with code, orderId, customer, discountAmount, paymentId, timestamp in the same atomic block as the stock deduction — never a pre-check); exhausted/expired ⇒ `PAGO_EN_REVISION` with a distinct reason; `CANCELADO` releases a use. Add the collections to `scripts/manage-firestore-schema.ts` and `firestore.rules`, plus an admin read surface for redemptions.
  - **Verify:** expired / inactive / exhausted ⇒ full price, per-line eligibility (included, excluded, REF-keyed), concurrent redemptions consuming the last use exactly once, audit writes, and the Task 0.9 forged-code assertions still green.
