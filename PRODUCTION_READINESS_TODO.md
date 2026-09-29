# PRONTO INSUMOS ODONTOLÓGICOS — Production Readiness TODO

A working task list, not a changelog. Finished work is one line in §2; its as-built detail lives in the `AGENTS.md` of the directory it touches. Open tasks keep their IDs (they are referenced from code comments and `AGENTS.md` files) — do not renumber.

**Last updated:** 2026-09-29 (Task 2.10 — WhatsApp single source; **Phase 3 — 3.1, 3.2, 3.3 — suspended** by owner decision) · **Market:** Melipilla & San Antonio, Chile · **Stack:** Vercel (React 18 + Serverless Node) · Firebase (Firestore + Cloud Storage, Blaze plan since 2.9) · Mercado Pago Chile · Resend
**Baseline (verified 2026-09-29, after the Task 2.10 work):** `pnpm test` 755/755 (79 suites) · `pnpm lint`, `pnpm build`, `pnpm format:check` and `pnpm exec tsc --noEmit` all clean · `api/` type-checks clean under `--strict --target es2022`.

**Priorities:** **P1** = fix before real traffic · **P2** = fix soon after / before a marketed launch · **P3** = polish & DevOps.

---

## 1. Open Work at a Glance

| ID | Task | Pri | Launch blocker |
| :-- | :-- | :-: | :-: |
| 3.1 | Per-zone shipping rates below the free-shipping threshold — **suspended (Phase 3)** | P1 | **Yes** |
| 7.2 | Custom `.cl` domain + SSL | P1 | **Yes** |
| 8.8 | Enumeration & abuse throttling on public endpoints | P1 | **Yes** |
| 2.12 | Payment-return modal claims "Pago Confirmado" from URL params alone | P2 | No |
| 2.13 | Internal dispatch reference for courier-less deliveries (auto-generated tracking id) | P2 | No |
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
| 6.4 | Decision: fate of the `odon-*` prototype fixtures (seed source + fallback consumers) | P3 | No |
| 8.1 · 8.2 · 8.5 | Bundle chunks · `api/` in `tsc` · Sentry & GA4 | P3 | No |
| 8.9 · 8.10 · 8.11 | `.env.example` gaps · lint scope · resilient Firebase init | P3 | No |
| 8.14 · 8.15 | Dependency hygiene · operator-script guardrails | P3 | No |

> **SUSPENDED until further notice (owner decision, 2026-09-29; extended to 3.1 the same day):** the whole of **Phase 3 — Logistics & Copy** — **3.1** (per-zone shipping rates), **3.2** (estimated delivery windows) and **3.3** (stale localization copy sweep) — is out of the active priority queue. Do not select, plan or implement these items.
>
> **Launch consequence, kept visible on purpose:** 3.1 is the only P1 launch blocker inside the suspension, so while it is suspended the storefront charges **no freight** below `FREE_SHIPPING_THRESHOLD` and PRONTO absorbs the courier cost on those orders.

**Human action items (no agent can close these):**

- Deploy Firestore rules — **0.12's last open step**: the code-side hardening (doc-key-first resolution + the URL allowlist) is live-protective, but until this runs the database still accepts decoy documents and pre-injected admin fields. Run `pnpm run deploy:rules`.
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
| 0.12 | Order documents bound to their own id + `keys().hasOnly` create-shape allowlist (nested maps, `paymentMethod` ↔ `status`, length caps, `PENDIENTE_EMISION_SII`); canonical doc-key-first resolver `api/_lib/orderLookup.ts` wired into the webhook, `track-order`, `order-confirmation` and `upload-voucher`; payload↔rules drift guard. **Rules still need `pnpm run deploy:rules`.** |
| 0.13 | Voucher URLs allowlisted at the render sink: `src/utils/voucherUrl.ts` (storage host / legacy `data:` MIME / unsafe) + `OrderDetailPanel` opens a re-typed Blob or plain text — closes the admin-origin XSS that 0.12's write-side hole made reachable. |
| 0.14 | Webhook reconciliation closed: MP verification failures return `502` (only a `404` is acked), one signed payment id drives signature + fetch, the status guard parks non-payable orders in `PAGO_EN_REVISION` and records settled ones as double-payment incidents (at-most-once stock deduction, never a tracking regression), refunds/chargebacks park the order for manual review, oversell shortfalls are recorded + alerted, and `create-preference` prices the order document's lines (the request body contributes only the order id). |
| 0.15 | Dispatch accepts a blank tracking code: `dispatch-order` omits absent keys instead of writing `undefined` (which the Admin SDK rejects), and the Admin Firestore instance is now created with `ignoreUndefinedProperties: true` too. The audit confirmed it was the only handler writing `undefined`. |
| 0.16 | `track-order` fails closed: `500` + loud log in a production runtime when Firestore Admin is unavailable, instead of returning the fabricated "Dra. Andrea Morales" order. The simulated payload is reachable only through `isSimulatedPaymentAllowed()` (dev/preview, or the explicit `ALLOW_SIMULATED_PAYMENTS='true'` opt-in). |
| 2.11 | `fetchProducts()` returns a source-aware `CatalogResult`: production never serves the `odon-*` fixtures (rejection/empty/timeout → `unavailable` + retryable card, 10 s bound), the persisted cart is revalidated **only** from `source: 'firestore'`, and `CategoryFilter` counts the live unfiltered catalog instead of the prototype fixtures. **Owner decision (A):** the `isActive` filter is _not_ applied to the dev-only fixture fallback — fixtures are unreachable in production after this change, so the filter's purpose is already met. |
| 2.10 | WhatsApp single source completed: `PaymentReturnModal` (stale `56912345678` fallback) and `src/services/whatsapp.ts` (second env read) now resolve through `whatsappLink()`; `contact.ts` is the only env reader and normalizes a formatted `VITE_WHATSAPP_NUMBER` to digits (digit-free ⇒ canonical fallback); `index.html`'s JSON-LD `telephone` carries `+56929831595`; and the `WhatsApp single-source guard` in `src/tests/config/contact.test.ts` fails on any reintroduced `wa.me` URL, `569…` literal or `VITE_WHATSAPP_NUMBER` read across `src/components/`, `src/services/` and `src/admin/`. |
| 1.1 | Integer-CLP catalog, `formatCLP`, `Math.round` IVA. |
| 1.2 | Billing block with tax breakdown, Factura field validation (gated by `FACTURA_ENABLED = false`), printable pro-forma voucher. |
| 1.3 | ISP/SIS validation for regulated items (`prescriptionRequired`). |
| 1.4 | Distributor RUT sourced from `BANK_DETAILS.rut` (single-source guard test). |
| 2.1 | Mercado Pago return URLs handled (`PaymentReturnModal`) — see 2.12 for the remaining trust gap. |
| 2.2 | Cart persistence in `localStorage` (`pronto_cart_v1`, 7-day TTL, catalog revalidation). The data-loss edge where fallback data emptied the cart was closed by 2.11 (revalidation is `source: 'firestore'` only). |
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

- [ ] **2.15. Voucher Storage Follow-Ups (post-2.9)** _(P2)_
  - **Unconfirmed uploads are never cleaned up.** `sign` hands out signed PUT URLs with no per-order limit and no throttle; an upload that is never `confirm`ed leaves an orphan object of up to 5 MiB under `vouchers/…` (Blaze bills storage). Cap signs per order (e.g. a small counter on the order doc / 8.8 throttling) and add a housekeeping path for objects the order document does not reference (bucket lifecycle rule on a `pending/` prefix that `confirm` moves out of, or an admin sweep action on the existing dispatcher — no new function slot).
  - **Legacy base64 vouchers still live in pre-2.9 order docs.** `track-order` now hides `data:` URLs, but `api/_lib/admin/orders.ts:48-59` still returns every order document — including any `voucherUrl` base64 (up to ~1 MiB each) — and Vercel caps responses at 4.5 MB, so the admin list breaks once a few legacy vouchers accumulate. Either migrate them to Storage with a one-off operator script (dev by default, `--confirm-production-…` for prod, per 8.15) or have `orders.ts` return `hasVoucher` instead of the URL and fetch the URL only on the detail request. Also see 0.13 for the `data:` handling.
  - **`voucherUrl` is a permanent capability URL** (Firebase download token; never expires unless the token is rotated). Acceptable today — it is only exposed to the RUT-authenticated customer and admins — but note it if vouchers ever need revocation.
  - **Platform facts (verified 2026-09-28) that shaped the design:** Firestore 1 MiB doc cap and 1 GiB free tier; Vercel 4.5 MB request/response body cap (hence client-direct upload and no bytes through functions); Cloud Storage for Firebase needs Blaze. Sources: [Firestore limits](https://firebase.google.com/docs/firestore/quotas) · [Vercel limits](https://vercel.com/docs/functions/limitations) · [Storage billing change](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)

- [ ] **8.8. Enumeration & Abuse Throttling on Public Endpoints** _(P1 — was P2; audit raised it)_
  - **Enumeration oracle:** `track-order` / `upload-voucher` / `order-confirmation` return `404` for an unknown id but `401` for a wrong RUT (`track-order.ts:94-107`, `upload-voucher.ts:393-410`), so order ids can be enumerated without any RUT; `generateOrderId()` is `Math.random()` over only 900 000 values (`src/services/api.ts:42-44`). A company RUT is public information, so an attacker can walk the id space against a known clinic RUT and harvest its orders' PII (name, email, address, items). There is also no attempt throttling at all. (Random 6-digit ids also collide as volume grows — a collision surfaces as a generic rules-denied checkout error.)
  - **Open write/email abuse:** `orders` create is public and unthrottled (each write counts against the free 20k/day and is billed beyond it now that the project is on Blaze — abuse costs money instead of just failing); `order-confirmation` emails whatever `customer.email` the creator typed; every successful voucher `confirm` (re-upload is allowed while `TRANSFERENCIA_COMPROBANTE_SUBIDO`) emails the warehouse, and a fresh own order costs nothing — Resend's free tier (3 000/month) can be exhausted, silencing legitimate mail. (The 2.9 lifecycle guard already stops uploads on paid/dispatched orders.)
  - **Required (lean, no new infra):** return one identical response for "not found" and "RUT mismatch"; per-IP and per-orderId attempt counters with a lockout window (Firestore counter doc or Vercel Edge config); widen the id space with `crypto.getRandomValues` (e.g. `PRONTO-` + 8 base32 chars — check `schemaValidation`/docs that assume 6 digits); dedupe/throttle warehouse emails per order.
  - **Verify:** tests for uniform errors, lockout after N failures, and id format/entropy.

- [ ] **7.2. Custom `.cl` Domain and SSL** _(P1)_
  - Register via NIC Chile (e.g. `prontoinsumos.cl`), configure DNS on Vercel (automatic TLS), replace every `pronto-insumos.vercel.app` (`index.html` `og:url`, `og:image`, `twitter:*`, JSON-LD `url`/`image`; `SITE_URL` in Vercel env for email tracking links). Re-check the Resend sender domain and Mercado Pago `notification_url`/back URLs after the switch.

### Phase 2 — Checkout, Payment Return & Storefront

- [ ] **2.12. Payment-Return Modal Claims Success From URL Parameters Alone** _(P2)_
  - `/?status=approved&orderId=…` (trivially forgeable, and also set by Mercado Pago before the webhook runs) opens "¡Pago Confirmado Exitosamente! — Tu transacción ha sido acreditada" (`PaymentReturnModal.tsx:85-88`) and clears the cart (`App.tsx:78,215`). It is harmless to the backend but misleads customers/staff and can clear a cart with no order.
  - **Fix:** soften the copy to what is actually known ("Recibimos tu retorno de pago; confirmaremos por correo cuando se acredite") and add the `Ver estado del pedido` action (tracking needs the RUT the customer already typed); clear the cart only when a matching order was just created in this session.

- [ ] **2.13. Internal Dispatch Reference for Courier-less Deliveries** _(P2 — owner idea, 2026-09-29)_
  - **Gap:** the order tracking number is a **manual, free-text field typed by the warehouse at dispatch time** — nothing in the system generates one, and there is no courier API integration. For the default "Despacho Local Melipilla (Flota Directa)" route the parcel normally has no guía, so the customer-facing tracking step (`fulfillment.statusDescription`) shows the courier with no reference at all.
  - **Idea (owner):** mint a human-readable internal dispatch reference when the order enters the delivery flow, so the manual dispatch → delivered transitions emulate a courier system until one is integrated.
  - **Design decisions required before implementing** (why it is not a one-liner): (a) **semantics** — a reference generated before the parcel leaves the warehouse is an internal dispatch code, not a courier guía; (b) **override** — a real Starken/Chilexpress guía must be able to replace it, so the model needs "generated default + admin override" and a way to tell them apart; (c) **generation point** — the payment transition (webhook / `approve-transfer`) vs. the dispatch action (`dispatch-order`, where `dispatch.dispatchedAt` already exists); (d) **customer value** — the tracking modal already shows the order id, courier and timeline, so the reference must add something the order id does not (e.g. a driver route sheet). **Touches:** `api/webhooks/mercadopago.ts` or `api/_lib/admin/approve-transfer.ts`, `api/_lib/admin/dispatch-order.ts`, `Order.trackingNumber`/`dispatch` (`src/types/`), `track-order` copy, admin panel.
  - **Not a launch blocker.** 0.15 made a blank tracking number a supported state, so the fulfillment flow is complete without it.

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
  - `api/track-order.ts:146` "…o retirado en Av. Ortúzar 750" (no pickup) and `:198` regional courier fallback `Starken / Chilexpress Regional`; `PENDIENTE_PAGO_MERCADOPAGO` / `PAGO_EN_REVISION` fall into the generic "Pedido Registrado" copy.
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

- [ ] **6.4. Decision: the Fate of the `odon-*` Prototype Fixtures** _(P3 — owner question, 2026-09-29)_
  - **Question (owner):** "would it be better to remove the fixtures/mocks from the code?" Raised while fixing 2.11, which stops them reaching the production storefront.
  - **Audit — six consumers, so this is not a deletion but a migration:** `src/services/api.ts` (dev/offline fallback), `src/components/CategoryFilter.tsx` (pill counts, fixed by 2.11), `src/admin/services/adminApi.ts` (admin inventory fallback), `scripts/manage-firestore-schema.ts` (`schema:seed` / `schema:seed:dev` seed the catalog from `canonicalProducts`), `src/services/firebase.ts` (`seedProductsToFirestore()`, retained but uncalled) and four test suites (`data/products.test.ts` exists solely to validate them; `api.test.ts`, `useIncrementalReveal.test.tsx`, `orderCreateContract.test.ts` use them as data).
  - **Decision required first:** what replaces them as the **seed source** for the documented `schema:seed*` commands (the CSV import is the production path, but the seed commands have no other catalog). Then choose: delete `PRODUCTS` and repoint the test suites to inline fixtures, or keep them as the dev/test artifact and document the boundary (status quo after 2.11).
  - **Not urgent:** after 2.11 they cannot reach the production storefront and cannot mutate a cart.

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
  - `tsconfig.json` includes only `src/**/*`. Verified 2026-09-29 (on the 0.12 + 0.13 branch): `api/**` passes `pnpm exec tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --types node --skipLibCheck api/*.ts api/_lib/*.ts api/_lib/admin/*.ts api/webhooks/*.ts`. ⚠️ `--target es2022` and `--skipLibCheck` are **required** — without them the invocation fails (`TS2802` on the `MapIterator` loops, `TS18028` in `node_modules`) on the default ES5 target, which is why the earlier "verified" note was misleading. Adding a `tsconfig.server.json` (Node context) that carries those flags and running it in the 8.4 gate is nearly free and will keep it green.

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
  - **`scripts/send-test-comms.ts` WhatsApp smoke path throws (found during Task 2.10, 2026-09-29 — pre-existing, reproduced on the pre-2.10 revision).** `TEST_ORDER.items` is shaped `{ name, quantity, price }` but is passed as `items as unknown as CartItem[]` (`:142-151`), while `generateWhatsAppQuoteUrl` reads `i.product.name` / `i.product.price` (`src/services/whatsapp.ts:17`) — so `pnpm dlx tsx scripts/send-test-comms.ts --only=whatsapp` dies with `TypeError: Cannot read properties of undefined (reading 'name')` before printing anything. Shape the fixture as `{ product: { name, price }, quantity }` (or map it) before the call and drop the `as unknown as` cast; the email paths and the `--phone=` override are unaffected. Note the script is also the documented smoke test for `whatsappLink()`/`contact.ts` importability under plain Node/tsx (`src/services/AGENTS.md` §4.4), so it should not be left broken.

### Phase 9 — Commercial Promotions

- [ ] **9.1. Complete the Promo Code Data Model** _(P2 — promo table is now payment authority)_
  - **Gap:** `PromoCode` is `{ code, discountPercent, label }` and `MOCK_PROMOS` has two public entries (`PRONTO10`, `DENT20`). `resolvePromoPercent` can only answer "does this code exist?" — no validity window (yet `Cart.tsx` promises `inválido o vencido`), no usage limits (`DENT20` is unlimited and, being in the browser bundle, public), no redemption audit (`Order.promoCode`/`discountAmount` are persisted but read by nothing; rules don't constrain them), basket-wide discount only (no per-product/REF eligibility — note order lines persist only `productId`; a REF rule must resolve `Product.sku` from the catalog at verification time), no `minSubtotal` / `discountType` / channel restriction.
  - **Required:** extend `PromoCode` with the policy fields and keep `src/config/promos.ts` the pure resolver every surface derives through (cart, `submitOrder`, `create-preference`, webhook — they must never drift). Static module is fine **only if** codes are genuinely public; private clinic codes need a Firestore `promo_codes` collection (admin-write, public-read denied). Resolve eligibility per line (`computeOrderTotal` takes per-line discounts; update all four consumers together). Make exhaustion authoritative **inside the webhook transaction** (`usageCount` increment + `promo_redemptions` record with code, orderId, customer, discountAmount, paymentId, timestamp in the same atomic block as the stock deduction — never a pre-check); exhausted/expired ⇒ `PAGO_EN_REVISION` with a distinct reason; `CANCELADO` releases a use. Add the collections to `scripts/manage-firestore-schema.ts` and `firestore.rules`, plus an admin read surface for redemptions.
  - **Verify:** expired / inactive / exhausted ⇒ full price, per-line eligibility (included, excluded, REF-keyed), concurrent redemptions consuming the last use exactly once, audit writes, and the Task 0.9 forged-code assertions still green.
