# PRONTO INSUMOS ODONTOLÓGICOS — Production Readiness TODO

A working task list, not a changelog. Finished work is one line in [§5 Resolved History](#5-resolved-history); its as-built detail lives in the `AGENTS.md` of the directory it touches (mostly `api/AGENTS.md`, `src/admin/AGENTS.md`, `src/services/AGENTS.md`). **Open tasks keep their IDs** (they are referenced from code comments and `AGENTS.md` files) — do not renumber. New IDs are appended at the end of each phase.

**Last updated:** 2026-09-30 (condensed + full static re-audit + owner answers, rebased onto `main@3418420`) · **Audit provenance:** static source audit; no live infrastructure, Firestore data, provider dashboard or production behavior was verified. · **Market:** Melipilla & San Antonio, Chile (storefront audience: Región Metropolitana clinics) · **Stack:** Vercel (React 18 + Serverless Node) · Firebase (Firestore + Cloud Storage, Blaze) · Mercado Pago Chile · Resend

**Baseline re-run for this update:** on `main@3418420`, `pnpm run verify` (tests + `tsc --noEmit` + build) passes with 1255/1255 tests in 101 suites, and `pnpm lint` is clean. `pnpm audit --prod` reports **3 findings** (1 high, 1 moderate, 1 low — see 8.14). `pnpm run format:check` was not re-run. Counts quoted in other docs disagree with each other (the 8.13 note says 1206/99) — see 8.20.

**Priorities:** **P1** = close before real traffic · **P2** = next release / before a marketed launch · **P3** = optional polish or DevOps. Code complete is not deployment verification: source-level acceptance does not prove deployed configuration, live provider behavior, or owner operational readiness.

[Active board](#1-active-action-board) · [Go-live gates](#2-go-live-evidence-and-gates) · [Open tasks](#3-open-tasks) · [Decisions & open questions](#4-owner-decisions-and-open-questions) · [Resolved history](#5-resolved-history)

---

## 1. Active Action Board

Work P1 first, then P2, then P3. Rows link to detail in [§3](#3-open-tasks). **NEW** = found by the 2026-09-30 audit.

### P1 — Before real traffic

| ID | Outcome / risk | Gate |
| :-- | :-- | :-- |
| [Owner gate — 0.12](#owner-only-checklist) | Production Firestore rules deployment is unverified; until deployed, decoy documents, forged tax breakdowns and admin-only field pre-injection may still be accepted | Owner deploys and independently verifies rules; not a new source task |
| [0.19](#task-0-19) **NEW** | Tighten the public `orders` create rule (`createdAt`, `orderId` format, zone, bounds) — today a crafted `createdAt` can pin/poison the admin queue and break its pagination | Rules + emulator/drift tests; deploy together with the 0.12 gate |

### P2 — Next release / before marketed launch

| ID | Outcome / risk | Gate |
| :-- | :-- | :-- |
| [0.20](#task-0-20) **NEW** | Freeze the charged amount at preference time and expire the link after 24 h — a catalog edit between preference and payment parks a legitimately paid order in review | Webhook asserts against the stored snapshot; MP preference carries an expiry |
| [0.21](#task-0-21) **NEW** | Customer e-mail is unverified and attacker-composed content is sent from the verified PRONTO domain | Abuse path bounded (App Check 8.16 + catalog-sourced content + per-recipient budget) |
| [0.22](#task-0-22) **NEW** | Delivery zone is a free-text claim; owner decision: out-of-zone buyers may order but only via WhatsApp | Zone normalizer, "Otra comuna" → WhatsApp-only, server-side minimum |
| [2.14](#task-2-14) | **Owner decision:** remove exact stock from the public; only low stock (≤ 3) is visible | Stock-free `/api/catalog`, rules flip, badge at ≤ 3 |
| [2.19](#task-2-19) **NEW** | Owner design: last-moment price/stock check at the Pago step with visible feedback | Changes shown and acknowledged before the order is written |
| [2.20](#task-2-20) **NEW** | Every filter/sort/stock toggle re-reads the whole `products` collection (billed per visitor) | One catalog read per session, client-side filtering (after 2.14) |
| [5.4](#task-5-4) **NEW** | Customer e-mails are bare-bones and there is no mail at dispatch/delivery/cancel | Redesigned shared layout + lifecycle e-mails, previewable offline |
| [8.16](#task-8-16) | App Check abuse friction for public order creation | Preview checkout works with enforcement |
| [8.18](#task-8-18) **NEW** | Raw error messages and provider bodies returned to public callers; no `no-store` on PII responses | Generic public errors, `Cache-Control: no-store` |
| [8.21](#task-8-21) **NEW** | Pending bank transfers have no follow-up (reminder, stale list) | Reminder at 24 h, operator list at 72 h, never auto-cancelled |
| [9.1](#task-9-1) | Promo codes `PRONTO10` / `DENT20` are public and unlimited | Owner confirms codes are intentional/margin-safe or disables them |

### P3 — Optional

| ID | Outcome / risk | Gate |
| :-- | :-- | :-- |
| [0.23](#task-0-23) **NEW** | Quantity/stock handling differs across preference, webhook and transfer approval | One shared normalizer; consolidated stock check |
| [2.16](#task-2-16) | Customer-friendly courier label | Legacy carrier keys render through shared labels |
| [2.21](#task-2-21) **NEW** | Tracking deep link accepts the RUT (second factor) in the URL | Remove `rut` query support |
| [4.7](#task-4-7) **NEW** | Failed admin authentication is invisible; no idle sign-out (no MFA by owner decision) | Logged, generic error |
| [4.8](#task-4-8) **NEW** | Admin search covers only the loaded page | Exact id/RUT server lookup |
| [6.2](#task-6-2) / [6.3](#task-6-3) / [6.4](#task-6-4) | Datasheets · catalog by specialty · fate of `odon-*` fixtures | Owner prioritizes |
| [8.1](#task-8-1) / [8.11](#task-8-11) | Bundle cost · resilient Firebase init | Measured reduction / invalid config cannot blank the storefront |
| [8.2](#task-8-2) | Type-check serverless functions consistently | Lean server check |
| [8.5](#task-8-5) | Monitoring / analytics | Owner picks minimal signals + alert path |
| [8.9](#task-8-9) | `.env.example` `SITE_URL` default contradicts the accepted host | Document + correct |
| [8.10](#task-8-10) | Widen lint/format coverage | Findings fixed before ignores removed |
| [8.14](#task-8-14) | Dependency vulnerabilities (grpc-js high, uuid moderate) | Override + re-audit |
| [8.15](#task-8-15) | `send-test-comms.ts` WhatsApp smoke path throws | Fixture shaped correctly |
| [8.19](#task-8-19) **NEW** | No `robots.txt`/sitemap | Static files |
| [8.20](#task-8-20) **NEW** | Hard-coded test counts drift in every doc | Remove counts from docs |

### Suspended — owner decision; not in the active queue

| ID | Status | Accepted consequence while suspended |
| :-- | :-- | :-- |
| [1.5](#task-1-5) | Phase 1 (2026-09-30) | No verified Boleta issuance path; `billing.status` stays `PENDIENTE_EMISION_SII`; no copy may claim a Boleta is issued/emailed. Do not unsuspend or implement. |
| [1.6](#task-1-6) | Phase 1 (2026-09-30) | Verification is a client-typed SIS number with no dispatch gate; the owner must not list regulated (`prescriptionRequired`) SKUs. Do not unsuspend or implement. |
| [3.1](#task-3-1) | Phase 3 | No freight below `$150.000`; PRONTO absorbs courier cost. |
| [3.2](#task-3-2) | Phase 3 | No estimated delivery windows. |
| [3.3](#task-3-3) | Phase 3 | Stale localization copy remains (the e-mail header line was removed from this sweep by owner decision). |
| [7.1](#task-7-1) | Phase 7 | Legal copy remains an owner-reviewed draft; do not chase review. |
| [7.2](#task-7-2) | Phase 7 | Storefront stays on `https://pronto-insumos.vercel.app`; no `.cl` work. |

### Owner-only checklist

Production and operating checks that static review cannot close. **No live state was verified.** Never put secret values in notes or commits.

- **P1 — 0.12 / 0.19 Firestore rules:** run `pnpm run deploy:rules` and independently verify (decoy document, forged `taxBreakdown`, admin-only field pre-injection must all be rejected). Confirm the index `orders(status ASC, createdAt DESC)` is `Ready` (it was verified live during 4.2). **Not yet confirmed by the owner.**
- **8.9 production environment — owner-confirmed 2026-09-30, not independently verified:** the production variables are set in Vercel. When convenient, double-check these four, because a wrong value fails silently: `SITE_URL=https://pronto-insumos.vercel.app` (**not** the `.env.example` value `https://prontoinsumos.com`); `ALLOW_SIMULATED_PAYMENTS=false` and `VITE_ALLOW_SIMULATED_PAYMENTS=false`; `VITE_FIRESTORE_ENV` unset or `production` (a leaked `development` routes production traffic to `dev_*` collections); `VITE_BANK_*` present server-side (e-mail templates fall back to hard-coded literals otherwise).
- **P1 — 9.1 promotions:** confirm `PRONTO10` / `DENT20` are intentional and margin-safe, or disable unused codes.
- **P1 — 4.6 quote/Factura handoff:** run the operator walkthrough on a preview order (accepted quote → one stock deduction, declined quote, late reply, no duplicate fulfillment on re-click, correct tracking). If not done before traffic, hide the WhatsApp checkout method and keep WhatsApp contact for Factura requests. (Becomes more important with 0.22: out-of-zone buyers will rely on this path.)
- **8.4 preview gate (built):** deploy a preview, run `pnpm run smoke:preview -- --base=<preview-url>`, then complete the manual credential-bearing half (browser render, TEST checkout + payment, transfer voucher, admin login + read, approve-transfer / stock adjustment) with TEST credentials and non-customer data only.
- **8.12 CSP enforcement (built in Report-Only):** on a preview, confirm zero report-only violations while walking catalog load, fonts, admin login, voucher upload, product images and the Checkout Pro redirect; then rename the global header key to `Content-Security-Policy`. Add any new origin first (2.14 adds none: `/api/catalog` is same-origin).
- **8.13 stale-order sweep (built, `dryRun` defaults to true):** run it as a dry run from `/admin#settings`, read the candidates, then execute; re-run if it reports `truncated`.
- **8.6 production deployment:** a human operator runs `pnpm dlx vercel@latest deploy --prod` and verifies; the agent must not.
- **2.9 production storage:** verify Blaze/bucket, run `pnpm run storage:cors -- --apply` and `pnpm run deploy:storage-rules`; set `FIREBASE_STORAGE_BUCKET` if the bucket is not `<project>.firebasestorage.app`.
- **8.8 TTL record:** earlier notes recorded `abuse_counters.expiresAt` TTL as ACTIVE (2026-09-29); not re-verified. Dev twin: `gcloud firestore fields ttls update expiresAt --collection-group=dev_abuse_counters --enable-ttl --project=pronto-insumos`.
- **Acceptance steps still owed for resolved tasks:** run the `#settings` voucher sweep once as a dry run (2.15); one real cancellation/refund/return/chargeback walkthrough following `MANUAL_ORDER_OPERATIONS.md` (4.5); the `PAGO_EN_REVISION` receipt/ledger and bank-reference walkthrough (4.3); optional partial-refund smoke on a TEST MP payment (0.18); `pnpm run catalog:import -- --dry-run` and `pnpm run schema:seed -- --dry-run` read-only rehearsals before any production write (8.17).
- **Confirmed by the owner (2026-09-30):** the Resend sending domain is verified and a test e-mail was delivered. Optional: WhatsApp Business greeting/away/quick replies (5.2).

---

## 2. Go-live evidence and gates

Separates source-level capability from independently verified production and owner operations; it is **not** launch approval.

- **Present in code, not proven in production:** orders start pending; Mercado Pago settlement and its stock deduction run only through the verified webhook (HMAC + MP re-fetch + catalog amount assertion + at-most-once deduction); bank transfers are approved server-side by an admin with a recorded bank reference; clients never approve payment or deduct stock; transactional mail is fail-safe with visible failures and manual resend (5.3); abandoned online orders are swept with the Mercado Pago ledger as the gate (8.13); anti-framing headers are enforced on every admin URL and a full CSP runs in Report-Only (8.12).
- **Boleta status:** checkout writes `billing.status = PENDIENTE_EMISION_SII`; nothing transitions it to `EMITIDO`. Do not claim a Boleta is issued/emailed until suspended 1.5 is completed. `LegalModal` / `PaymentReturnModal` copy is not issuance evidence.
- **Independent gates still open:** deployed Firestore/Storage rules, preview smoke + manual walkthroughs (8.4), CSP promotion (8.12), operator walkthroughs — see the [owner checklist](#owner-only-checklist).
- **Accepted exceptions:** while 3.1 and 7.2 are suspended, orders below `$150.000` carry no freight charge and the storefront uses `https://pronto-insumos.vercel.app`.

---

## 3. Open Tasks

### Phase 0 — Security & Payment Integrity

<a id="task-0-19"></a>

- [ ] **0.19. Tighten the Public `orders` Create Rule** _(P1 · NEW; deploy with the 0.12 gate; coordinate with 8.16 and 0.22)_
  - **Evidence:** `firestore.rules:121` only requires `'createdAt' in data` — any type is accepted; `:119-120` bound `orderId` to length ≤ 32 and the doc id but not to the `PRONTO-XXXXXXXX` format; `:74` accepts any `customer.city` string (≤ 80); `:26-27` allow unbounded `quantity` and fractional `price`; `:148-157` shape-check only the first 10 of up to 25 lines; `email` is length-checked only.
  - **Risk:** the admin queue reads `orderBy('createdAt','desc')` (`api/_lib/admin/orders.ts:56`) and continues with `startAfter(new Date(cursor))` built from `String(createdAt)` (`:78,:143`). Firestore sorts values by type (numbers < timestamps < strings), so an order written with `createdAt: "zzz"` sorts to the **top forever**, and a page ending on it yields a cursor that is not a date — the client re-requests the first page indefinitely. Numeric `createdAt` values sink below every real order. The dashboard's bounded recent-orders read orders by the same field. Static analysis; not reproduced against a live project.
  - **Fix:** `data.createdAt == request.time` (the client already writes `serverTimestamp()`); `data.orderId.matches('^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$')` (legacy `PRONTO-NNNNNN` ids are never re-created); `customer.city in ['Melipilla','San Antonio']` **unless** `paymentMethod == 'whatsapp'` (out-of-zone buyers settle by WhatsApp quote — see 0.22); `quantity` int in `[1, 999]`, `price` int; basic e-mail shape. Lines beyond 10 stay a server-side concern (webhook/approve recompute) unless 8.16 chooses a server create path. Make the admin cursor robust regardless (a `createdAt` that is not a timestamp is skipped/flagged, not echoed).
  - **Accept:** rules/drift-guard tests cover string/number `createdAt`, malformed ids, foreign zone with each payment method, huge quantity; admin pagination test with a non-timestamp `createdAt`; rules redeployed and verified by the owner.

<a id="task-0-20"></a>

- [ ] **0.20. Freeze the Charged Amount and Expire Preferences (24 h)** _(P2 · NEW; coordinate with 2.19, 2.18 and the built 8.13 sweep)_
  - **Evidence:** `api/create-preference.ts:409-429` builds the MP preference with no `expires` / `expiration_date_to`; the webhook asserts the paid amount against the **current** catalog (`api/webhooks/mercadopago.ts:807-818`) and the preference is also priced from the current catalog at creation time.
  - **Risk:** (a) any admin price edit, product pause or stock change between preference creation and payment sends a customer who paid the correct, quoted amount to `PAGO_EN_REVISION` (manual work + a customer who was charged and told nothing). (b) An unexpired link can be paid days later against a moved catalog or a swept order. (c) The webhook never checks `currency_id === 'CLP'`.
  - **Fix:** at preference creation, write a server-only snapshot to the order (`pricedTotal`, per-line unit prices, `preferenceCreatedAt`, `preferenceExpiresAt`); set MP `expires: true` with `expiration_date_to = now + 24 h` (recommended: card/Webpay payments settle in minutes, a longer link only widens the price-drift window, and a payment already `in_process` before expiry still completes; the 8.13 sweep default of 48 h = 24 h expiry + 24 h buffer for in-review payments and delayed webhooks, so the two agree). If the Mercado Pago account has offline/cash methods enabled, the expiry must be at least their validity — check the MP dashboard. The webhook asserts `transaction_amount` against the snapshot (and still checks `totalAmount`), records a soft alert when the live catalog diverged, and requires `currency_id === 'CLP'`. Keep catalog-recompute as the fallback for orders without a snapshot.
  - **Residual (accepted):** transfer and quote orders have no preference; `approve-transfer` / `resolve-quote` still verify against the live catalog at approval time (4.3) and answer `409` on a mismatch, so the operator declines and re-registers. 2.19 keeps that rare.
  - **Accept:** tests for price edit between preference and payment (settles, one deduction), expired preference, currency mismatch, snapshot absent (fallback), snapshot not client-writable (rules `hasOnly` already excludes the key).

<a id="task-0-21"></a>

- [ ] **0.21. Unverified Customer E-mail Is a Branded Relay** _(P2 · NEW; coordinate with 8.16 and 5.4)_
  - **Evidence:** a visitor can create an order (public create) with any `customer.email`, then call `/api/order-confirmation` with the order id and **their own** RUT (`api/order-confirmation.ts:101-167`); the e-mail is sent from the verified PRONTO sender with attacker-chosen `fullName`, `address`, and item `name` text (all HTML-escaped, but free text up to 120–200 chars each).
  - **Risk:** spam/phishing delivered to arbitrary third parties from the verified PRONTO domain, plus domain-reputation and Resend-quota damage. Per-order idempotency and the IP/order throttles bound one order, but orders themselves are unthrottled (8.16).
  - **Fix (lean):** (1) land 8.16; (2) in the confirmation template render item names from the **catalog** (server lookup by `productId`) rather than the client-written `name`, and omit or hard-truncate free-text address/name echoes; (3) per-recipient-address budget in `abuseThrottle` (hashed e-mail, e.g. 3 confirmations/24 h); (4) add a `Reply-To` and an "if this wasn't you" line (5.4). No e-mail verification flow unless the abuse materializes.
  - **Accept:** tests for catalog-sourced names, per-recipient budget (`429`, no send), and unchanged happy path.

<a id="task-0-22"></a>

- [ ] **0.22. Delivery Zone Is a Free-Text Claim; Out-of-Zone Buyers Go to WhatsApp** _(P2 · NEW; no freight change, 3.1 stays suspended)_
  - **Owner decision (2026-09-30):** deliveries outside Melipilla / San Antonio are **not rejected**; for those buyers only the WhatsApp payment path is available, and the delivery is settled in a direct chat.
  - **Evidence:** `src/config/delivery.ts:25-27` compares `zone === 'San Antonio'` exactly; `api/_lib/dispatchReference.ts:45-63` normalizes case/accents for the same field; `firestore.rules:74` accepts any city; the San Antonio minimum is enforced client-side and in `create-preference` only (`:384-394`) — `approve-transfer` and `resolve-quote` never check it. The checkout commune control is a two-option select, so today an out-of-zone buyer has no honest option.
  - **Risk:** a crafted order with `city: "san antonio"` skips the `$60.000` minimum; transfer and quote orders of any size are never checked server-side; dispatch silently labels unknown communes as Melipilla.
  - **Fix:** (1) one `normalizeDeliveryZone()` in `src/config/delivery.ts` used by `isBelowMinimumOrder`, `dispatchReference` and the handlers; (2) the Despacho step gains an **"Otra comuna (coordinar por WhatsApp)"** option with a commune text field — choosing it removes Mercado Pago and bank transfer from the Pago step, locks the method to `whatsapp` and explains why; (3) `firestore.rules` (0.19): `customer.city in zones || paymentMethod == 'whatsapp'`; (4) `create-preference` answers `400` and `approve-transfer` `409` for a city outside the zones (a crafted non-WhatsApp order cannot be paid); (5) the San Antonio minimum — assumed to apply to **every** payment method, as the root guide states (confirm in §4) — is enforced in `approve-transfer` and `resolve-quote` convert (`409` with an operator message); (6) show the stored commune prominently in the admin order panel; (7) update the root guide's checkout-zone description (it currently says the commune is a fixed select).
  - **Accept:** tests for case/accent variants, the out-of-zone option locking the method to WhatsApp, rules allow/deny matrix per method, transfer/quote orders below the San Antonio minimum.

<a id="task-0-23"></a>

- [ ] **0.23. One Quantity and Stock Policy Across Handlers** _(P3 · NEW)_
  - **Evidence:** `create-preference.ts:286-331` checks stock **per order line** (a crafted order with two lines of the same product passes each line but oversells in total); the webhook consolidates with `Math.max(1, Number(item.quantity) || 1)` (`:747`) while `normalizeQuantity` rounds (`src/utils/orderTotal.ts:39`), so a fractional legacy quantity deducts stock differently than it is priced.
  - **Fix:** consolidate by `productId` before the stock check in `create-preference`; use `normalizeQuantity` everywhere (`resolve-payment-review` and `approve-transfer` already do). **Accept:** duplicate-line and fractional-quantity tests on all three paths.

### Phase 1 — Billing & Regulated Products (suspended)

<a id="task-1-5"></a>

- [ ] **1.5. Boleta Issuance Operations** _(P1 — suspended, owner decision 2026-09-30)_
  - `CheckoutModal` writes `billing.status = PENDIENTE_EMISION_SII`; nothing moves it to `EMITIDO`; `LegalModal` promises a Boleta per sale and `PaymentReturnModal` says it will be e-mailed. Needs a manual SII issuance procedure (operator queue; record folio/date/issuer; deliver to customer; audit link). Never claim issuance before it is recorded. No paid SaaS/SII automation.

<a id="task-1-6"></a>

- [ ] **1.6. Regulated Product Verification Before Dispatch** _(P1 — suspended; accepted consequence: no regulated SKUs are listed)_
  - The client writes `verified: true` from a typed SIS number; rules check only the boolean; `dispatch-order` has no gate. Needs server-owned verification, audited admin confirmation and a dispatch block for `prescriptionRequired` lines. If not ready, do not list regulated SKUs (see §4 question F).

### Phase 2 — Checkout, Payment Return & Storefront

<a id="task-2-14"></a>

- [ ] **2.14. Stock-Free Public Catalog (only low stock ≤ 3 is public)** _(P2 · owner decision 2026-09-30; supersedes the old "decide" item)_
  - **Evidence:** `firestore.rules` `products`/`dev_products` have `allow read: if true`, so anyone can read exact `stockCount` and documents with `isActive: false`; `create-preference.ts:323-330` returns `availableStock` in its `400` bodies, so exact stock can also be probed by anyone able to register an order; the UI hides counts only cosmetically. The only low-stock cue today is `ProductCard.tsx:56,120` ("Últimas unidades" at `stockCount <= 5`); `ProductQuickView` and the cart line have none; the admin low-stock KPI also uses ≤ 5.
  - **Fix:** (1) new public function `api/catalog.ts` (7th of 12 Hobby slots) reads `products` with the Admin SDK and returns only **active** products and an explicit public-field allowlist; `stockCount` is included **only when 1–3** (`LOW_STOCK_PUBLIC_THRESHOLD = 3`, a shared constant in `src/config/`), otherwise omitted, and `inStock` is the only stock signal. `GET` is CDN-cached (`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`), so Firestore reads become ~1/min regardless of visitors (this is also the cost fix behind 2.20); `POST { ids }` returns the same shape for specific products with `no-store` (used by 2.19). `503` when Admin is unavailable. (2) `firestore.rules`: `products` / `dev_products` become `allow read: if isAdmin()` (the console already reads through `/api/admin/products`). (3) `fetchProducts` calls `/api/catalog`, keeping the `CatalogResult.source` semantics and the fixtures fallback only outside production. (4) Consumers that treat an absent `stockCount` as 0 must treat it as "plenty, the server verifies": `CheckoutModal.tsx:221,226,296,301`; `Cart`/`ProductCard`/`cartStorage` already default to a 99 ceiling. (5) `create-preference` answers "stock insuficiente" without the exact `availableStock` unless it is ≤ 3. (6) One low-stock cue, driven by the shared constant, on `ProductCard` (replace `<= 5`), `ProductQuickView` and the cart line (e.g. "Últimas unidades"/"Quedan N").
  - **Deploy order matters:** ship the endpoint and the storefront change first, then deploy the rules flip — flipping the rules first blanks the live catalog.
  - **Accept:** rules test denies client reads of `products`; endpoint tests (allowlist, ≤ 3 rule, inactive filtered, cache header, `POST ids` no-store, Admin down → `503`); UI tests for the badge at ≤ 3 on card, quick view and cart; checkout preflight no longer blocks when `stockCount` is absent; `400` body has no `availableStock` above 3.

<a id="task-2-16"></a>

- [ ] **2.16. Courier Display Label for the Local Fleet** _(P3)_
  - `dispatch-order` stores the raw `CarrierType` key (`despacho_local_melipilla`) in `courier`, so customers read it verbatim in `track-order` and `OrderTrackingModal`. Move `CARRIER_LABELS` from `src/admin/types.ts` to a shared `src/config/` module (the storefront must not import the admin bundle) and render labels at read time without rewriting legacy documents. Copy only; no data/payment impact. Do with 5.4 (the dispatch e-mail needs the same label).

<a id="task-2-19"></a>

- [ ] **2.19. Last-Moment Price and Stock Check at the Pago Step** _(P2 · NEW; owner design 2026-09-30; depends on 2.14 for the uncached read; coordinate with 0.20)_
  - **Evidence:** the cart is revalidated once per page load (`src/App.tsx:189-205`, one-shot `hasRevalidated`); `submitOrder` prices from the cart's stored `product.price` (`src/services/api.ts:253`) and writes the order; only afterwards does `create-preference` compare against the live catalog and answer `409` (`api/create-preference.ts:361-374`). A long session or a price edit therefore produces a persisted pending ghost order and a confusing "total does not match" error.
  - **Design (owner):** run the check when the Pago step opens and again whenever a payment method is selected, via an **uncached** read of only the cart's product ids (`POST /api/catalog { ids }`; until 2.14 lands, a per-id Firestore read). If anything changed (price, stock below the requested quantity, product paused/removed), update the cart through an `App` callback, recompute the total, and show an inline notice listing each change ("«Producto»: $X → $Y", "sin stock suficiente", "ya no disponible"); the submit button stays disabled until the shopper acknowledges ("Continuar con el nuevo total"). No change ⇒ silent. A failed check (network) does not block checkout — `create-preference` stays the authoritative guard — but is logged. Reuse `revalidateCartAgainstCatalog`. Add a `useRef` in-flight lock around `handleCompleteOrder` (two same-tick submits can still pass the `isSubmitting` state guard).
  - **Accept:** component tests: price change between cart and Pago (notice, updated total, submit gated, no order written), stock drop, paused product, check failure (proceeds), method re-selection re-checks, double-trigger creates one order.

<a id="task-2-20"></a>

- [ ] **2.20. Stop Re-Reading the Whole Catalog on Every Filter Change** _(P2 · NEW; do after 2.14)_
  - **Evidence:** the fetch effect in `src/App.tsx:168-225` depends on `selectedCategory`, `search`, `sortBy`, `inStockOnly` and calls `fetchProducts` each time; `src/services/api.ts:136` runs `getDocs(collection('products'))` (the entire collection) per call. Firestore bills one read per document per call.
  - **Fix:** once 2.14 serves the catalog from the CDN-cached endpoint, hold it in memory for the page session (refetch on manual retry or after ~5 min of inactivity) and apply category/search/sort/stock filters client-side; keep the `source` semantics from 2.11 and the one-shot cart revalidation unchanged. Interim, if 2.14 is delayed: a module-level cache over the existing `getDocs`.
  - **Accept:** the catalog request fires once across filter/sort/stock toggles; retry and idle expiry re-read; existing 2.11 tests stay green.

<a id="task-2-21"></a>

- [ ] **2.21. Remove the RUT from the Tracking Deep Link** _(P3 · NEW)_
  - `src/App.tsx:96-102` pre-fills `rut` from the URL query. The RUT is the second authentication factor; in a URL it lands in browser history, Vercel request logs and `Referer`. E-mails only link `?track=<orderId>`, so nothing legitimate needs it. Drop the `rut` parameter (keep order id prefill) and clear it from the address bar if present.

### Phase 3 — Logistics & Copy — SUSPENDED (owner decision, 2026-09-29)

> Do not select, plan or implement. IDs and wording retained for when the suspension is lifted.

<a id="task-3-1"></a>

- [ ] **3.1. Dynamic Shipping Rates by Delivery Zone** _(P1 — suspended)_
  - Zone selector exists (`DELIVERY_ZONES`, `FREE_SHIPPING_THRESHOLD = 150000`, San Antonio minimum). Required later: per-zone freight constants in `src/config/delivery.ts`; freight added **server-side** to the payable total identically in `orderTotal.ts` → `submitOrder`, `create-preference` and the webhook assertion (the four-amounts invariant); included in tax breakdown; shown in Cart, Checkout and the pro-forma voucher.

<a id="task-3-2"></a>

- [ ] **3.2. Estimated Delivery Time Windows** _(P2 — suspended)_
  - Cart/Checkout fulfillment estimates from `DELIVERY_ZONES`, with a config constant for the 16:00 cutoff (today a literal duplicated in Footer/LegalModal). Never "RM" in logistics coverage copy (see §4 question C).

<a id="task-3-3"></a>

- [ ] **3.3. Stale Localization Copy Sweep** _(P2 — suspended)_
  - Wording still referencing the removed logistics model: `api/track-order.ts:184` "…o retirado en Av. Ortúzar 750" and `:239` regional-courier fallback, missing copy for `PENDIENTE_PAGO_MERCADOPAGO` / `PAGO_EN_REVISION`, `src/services/whatsapp.ts` "(Melipilla & RM)", `AdminOrders.tsx` "…Melipilla y RM", and storefront strings catalogued in `src/components/AGENTS.md` §2.5 (need an Appendix C–sanctioned replacement before editing).
  - **Removed from this sweep by owner decision (2026-09-30):** the e-mail header "Melipilla & Región Metropolitana" (`api/_lib/emailTemplates.ts:119`) stays — the storefront targets Región Metropolitana clients.

### Phase 4 — Backoffice

<a id="task-4-7"></a>

- [ ] **4.7. Admin Authentication Visibility** _(P3 · NEW; reduced by owner decision: no MFA)_
  - **Evidence:** failed admin authentication is not logged and `api/_lib/adminAuth.ts:50-52` returns the SDK error text to the caller; there is no idle-session limit in `src/admin/AdminApp.tsx`.
  - **Fix (minimal):** log failed admin auth with a pseudonymized IP (reuse `hashThrottleKey`), return a fixed generic message (shared with 8.18), optional idle sign-out in `AdminApp`. No MFA, no role system unless non-owner staff are added later. **Accept:** tests for the generic error and the logged failure.

<a id="task-4-8"></a>

- [ ] **4.8. Admin Search Beyond the Loaded Page** _(P3 · NEW)_
  - `orders.ts` filters `search` only inside the loaded page (≤ 200). Support an exact order-id or exact-RUT lookup server-side (`doc()` read / `customer.rut ==` equality, which needs a single-field index) and keep fuzzy name search page-local, with a visible "buscando en N pedidos cargados" hint.

### Phase 5 — Transactional Communications

<a id="task-5-4"></a>

- [ ] **5.4. Customer E-mail Redesign and Lifecycle E-mails** _(P2 · NEW; coordinate with 0.21, 2.16 and 8.21)_
  - **Evidence (`api/_lib/emailTemplates.ts`, `api/_lib/email.ts`):** one flat `div` + inline-CSS layout (`:111-131`) for every message — no logo/wordmark treatment, no preheader, links as plain underlined URLs instead of a button, no "what happens next" section, no status timeline, no contact block (WhatsApp) in the footer; no `Reply-To` (`email.ts:66-72`) although the footer says "do not reply", so replies go nowhere useful; the transfer instructions are a small text block with no emphasised amount, no "usa el N° de pedido como glosa/referencia" instruction and no payment deadline; `div`/`border-radius`/`max-width` layout renders poorly in Outlook, common in clinics; the warehouse alert has no deep link to `/admin#orders/<id>` (the console already supports it).
  - **Lifecycle gap:** customers get mail at order received, payment confirmed, transfer approved and review resolved — and **nothing** at voucher received, dispatched (courier/reference/tracking), delivered, cancelled or quote declined. For B2B buyers the only signal today is the tracking page.
  - **Config smells fixed in the same pass:** `BANK` literals silently fall back to hard-coded account data when `VITE_BANK_*` is missing server-side (`:94-101`) — log loudly in production; `siteUrl()` defaults to `https://prontoinsumos.com` (`:104`), not the accepted host (8.9); sender `pedidos@prontoinsumos.com` vs bank contact `pagos@prontoinsumos.cl` use different domains (§4 question D).
  - **Unchanged by owner decision:** the header line "Melipilla & Región Metropolitana" stays; the Resend sending domain is already verified.
  - **Fix (lean, no template engine):** shared table-based layout helpers in `emailTemplates.ts` (header with wordmark, preheader, CTA button, order summary card, timeline strip, footer with WhatsApp + legal line), mobile-first and Outlook-safe; `Reply-To` support in `sendEmail` (optional `EMAIL_REPLY_TO`); transfer block with amount, glosa and deadline (3 days, see 8.21); new templates `dispatched`, `delivered`, `cancelled`, `voucherReceived` (and the 8.21 transfer reminder) wired into `dispatch-order`, `mark-delivered`, `cancel-order` and `upload-voucher` through the existing `emailDelivery` claim/telemetry so failures stay visible and resendable (extend the kinds, `resend-order-email` and the "Correos transaccionales" panel); keep the guardrails — never state a Boleta was issued (1.5), "Total referencial" until verified, escape every interpolation.
  - **Preview/test:** extend `scripts/send-test-comms.ts` to render every template to `.html` files and to send to a TEST inbox; snapshot-style tests assert escaping, absence of forbidden claims, link targets and plain-text parity.
  - **Accept:** all templates render with the shared layout; lifecycle mails are sent exactly once per transition and recorded in `emailDelivery`; owner approves screenshots from the preview script.

### Phase 6 — Catalog

<a id="task-6-2"></a>

- [ ] **6.2. Downloadable Technical Documentation** _(P3)_ — "Descargar ficha técnica (PDF)" on product details (datasheets and ISP registration codes).

<a id="task-6-3"></a>

- [ ] **6.3. Expand Catalog SKUs by Specialty** _(P3)_ — Endodontics, Periodontics & Prophylaxis, Restorative & Esthetics, Orthodontics, Surgery & Implants, Sterilization & Infection Control (categories are open strings; use `+ Nuevo Insumo` / CSV import).

<a id="task-6-4"></a>

- [ ] **6.4. Decision: the Fate of the `odon-*` Prototype Fixtures** _(P3 — owner question)_
  - Six consumers (`src/services/api.ts` dev fallback, `CategoryFilter`, `adminApi.ts` inventory fallback, `scripts/manage-firestore-schema.ts` seed source, `firebase.ts` `seedProductsToFirestore()` (uncalled), four test suites) — a migration, not a deletion. Decide the replacement seed source for `schema:seed*`, then delete `PRODUCTS` and repoint tests to inline fixtures, or keep them as a documented dev/test artifact (status quo; they cannot reach the production storefront after 2.11). Coordinate with 8.17.

### Phase 7 — Legal & Domain — SUSPENDED (owner decision, 2026-09-29)

> Do not chase 7.1 or implement 7.2 until the owner lifts the suspension.

<a id="task-7-1"></a>

- [ ] **7.1. Legal Review of SERNAC / Ley 19.628 Draft Copy** _(P1 — suspended)_ — published legal copy stays an owner-reviewed draft without lawyer sign-off.

<a id="task-7-2"></a>

- [ ] **7.2. Custom `.cl` Domain and SSL** _(P1 — suspended)_ — do not register the domain, configure DNS, replace `pronto-insumos.vercel.app`, or re-check Resend/Mercado Pago URLs. Retained scope: NIC Chile registration, Vercel DNS/TLS, `SITE_URL` sweep, provider URL re-check.

### Phase 8 — Infrastructure, DevOps & Telemetry

<a id="task-8-1"></a>

- [ ] **8.1. Bundle Optimization** _(P3)_ — `vendor-firebase` is ~672 kB (the remaining >500 kB warning; `main` 137 kB, `vendor-react` 141 kB). The storefront imports `getAuth` (`src/services/firebase.ts:25`) but only the admin needs it, and the admin bundle also pulls the `odon-*` fixtures through that module; fixing 8.11 is the biggest win, then `React.lazy()` for `CheckoutModal` / `ProductQuickView`. After 2.14 the storefront no longer needs the Firestore **read** API at all (only `setDoc`).

<a id="task-8-2"></a>

- [ ] **8.2. Type-Check the Serverless Functions** _(P3)_ — `tsconfig.json` covers only `src/**/*`. `api/**` passes `pnpm exec tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --types node --skipLibCheck api/*.ts api/_lib/*.ts api/_lib/admin/*.ts api/webhooks/*.ts` — `--target es2022` and `--skipLibCheck` are **required** (else `TS2802`/`TS18028`). Add a `tsconfig.server.json` with those flags and run it in `pnpm run verify` (8.4). Vercel's own per-function check logs `TS7006` (implicit-`any` transaction callbacks) and `TS2503` (`FirebaseFirestore` namespace) on deploy — harmless today, a hard failure if Vercel tightens it; annotate the `runTransaction`/`map` callbacks when picked up.

<a id="task-8-5"></a>

- [ ] **8.5. Real-Time Error Monitoring & Analytics (Sentry & GA4)** _(P3)_ — Sentry for unhandled client errors; GA4 e-commerce events; and the missing production alert path — fail-closed 500s (0.10), webhook/incident alerts and the 8.13 sweep report currently rely on someone reading Vercel logs or the console.

<a id="task-8-9"></a>

- [ ] **8.9. `.env.example` Completeness & URL Default** _(P3 documentation; the production environment is owner-confirmed, see the checklist)_
  - `SITE_URL` is in `.env.example` but its value is `https://prontoinsumos.com` (`.env.example:63`), not the accepted `https://pronto-insumos.vercel.app`; `api/_lib/emailTemplates.ts:104` repeats the wrong default, and `env:sync` could push the placeholder to a target. Correct both, document `VITE_VERCEL_ENV` as a build-time `define` (not a dashboard variable), inventory the remaining `api/` and `src/` variables, and note that `VITE_BANK_*` must also exist server-side. The `.cl` change stays suspended under 7.2.

<a id="task-8-10"></a>

- [ ] **8.10. Widen Lint/Format Scope to `api/` and `src/admin/`** _(P3)_ — the pointer-comment rule already lints both trees; what remains is the full TypeScript rule set (measured earlier: ~65 problems, e.g. 12× `no-explicit-any` in `adminApi.ts`, handler `any`s, unused imports in `src/admin/types.ts`). Fix in a dedicated pass, then delete the carve-out.

<a id="task-8-11"></a>

- [ ] **8.11. Resilient Firebase Init** _(P3)_ — `src/services/firebase.ts:25` calls `getAuth(app)` unguarded at module scope: a missing/invalid `VITE_FIREBASE_API_KEY` throws `auth/invalid-api-key` at import and blanks the page. Make `auth` nullable or admin-only (touches `adminApi.ts`, `AdminApp.tsx`, `AdminLogin.tsx`); also the 8.1 bundle win.

<a id="task-8-14"></a>

- [ ] **8.14. Dependency Hygiene** _(P3 — widened by the 2026-09-30 audit)_
  - `pnpm audit --prod`: **high** `@grpc/grpc-js <1.13.6` (GHSA-m9gg-hp2v-232j) and **low** (GHSA-f596-whhp-79r4) via `firebase > @firebase/firestore`; **moderate** `uuid <11.1.1` via `firebase-admin > … > gaxios` (GHSA-w5hq-g745-h8pq, only reachable when a caller passes `buf`; not used). The browser Firestore SDK transports over WebChannel, so the grpc-js path should not be reachable from the storefront bundle, but add a `pnpm.overrides` entry for `@grpc/grpc-js >=1.13.6` (and `uuid` if compatible), re-run `pnpm audit --prod`, `pnpm run verify` and a preview smoke. Re-check after each `firebase`/`firebase-admin` bump. The `jose@^5` override is EOL upstream — remove per the 8.6 condition (`jwks-rsa` > 4.1.0 ships the lazy-`jose` fix; re-verify `firebase-admin/auth` on a preview deploy).

<a id="task-8-15"></a>

- [ ] **8.15. Operator Smoke-Script UX** _(P3)_ — production seed/import safety is done (8.17). Remaining: `scripts/send-test-comms.ts --only=whatsapp` throws because `TEST_ORDER.items` is `{ name, quantity, price }` cast to `CartItem[]` while `generateWhatsAppQuoteUrl` reads `i.product.name`; shape the fixture as `{ product: { name, price }, quantity }` and drop the cast. This script is also the documented importability smoke for `whatsappLink()` under plain Node/tsx and the base for the 5.4 preview tooling.

<a id="task-8-16"></a>

- [ ] **8.16. Firebase App Check for the Public `orders` Create Path** _(P2 — abuse friction, not authentication or price validation)_
  - **Residual:** public order creation can be abused for billed writes and e-mail (0.21). App Check adds friction; it does not authenticate customers or validate catalog prices. Rule-shape gaps are tracked in 0.19.
  - **Fix / owner steps:** initialize App Check before Firestore and enforce per environment (reCAPTCHA Enterprise/v3 site key; debug tokens for preview) without exposing values; if rules budget cannot cover all item lines, consider a lean server-side create path instead. If App Check needs a new script origin, add it to the 8.12 CSP before enforcing.
  - **Accept:** initialization order tested; rules emulator tests (if practical); owner checklist confirms enforcement and a working preview checkout.

<a id="task-8-18"></a>

- [ ] **8.18. API Response Hygiene** _(P2 · NEW)_
  - **Evidence:** unauthenticated handlers return raw `error.message` on 500 (`api/track-order.ts:249`, `api/create-preference.ts:457`, `api/order-confirmation.ts:195`, webhook `:1056`); `create-preference.ts:443` returns Mercado Pago's response body as `details` to the browser; `adminAuth.ts:51` echoes SDK verification errors; `order-confirmation.ts:41` is the only function setting `Access-Control-Allow-Origin: *`; no API response sets `Cache-Control: no-store` although tracking and admin responses carry PII. The 8.12 `vercel.json` header rules exclude `/api/` by design, so API headers need their own rule or per-handler `setHeader`. 8.12 also observed that the live deployment returns `access-control-allow-origin: *` on static responses — a Vercel project-level setting, not `vercel.json`; remove it in the project settings.
  - **Fix:** log the cause server-side, return a fixed customer-safe message; drop `details`; remove the wildcard CORS (same-origin only, like the admin API); add `Cache-Control: no-store` to tracking, confirmation and every admin response; validate that `initPoint` is an `https` Mercado Pago host before `window.location.href` (`src/services/mercadopago.ts:126`).
  - **Accept:** handler tests assert generic bodies, no `details`, no wildcard CORS header, `no-store` present.

<a id="task-8-19"></a>

- [ ] **8.19. Crawl Basics** _(P3 · NEW)_ — `public/` has no `robots.txt` or `sitemap.xml`. Add both (disallow `/admin` and `/api/`); the storefront is a single-URL SPA, so product-level SEO would need per-product routes and is a separate decision.

<a id="task-8-20"></a>

- [ ] **8.20. Remove Hard-Coded Test Counts from Docs** _(P3 · NEW)_ — `AGENTS.md`, `src/tests/AGENTS.md`, this file and the per-task as-built notes each quote different suite/test counts and every merge makes them wrong. Replace with "run `pnpm test`" and keep counts only in PR descriptions.

<a id="task-8-21"></a>

- [ ] **8.21. Pending Bank Transfers: Reminder and Stale List (never auto-cancel)** _(P2 · NEW; follow-up to the built 8.13; coordinate with 5.4)_
  - **Evidence:** the 8.13 sweep only closes `PENDIENTE_PAGO_MERCADOPAGO` / `PENDIENTE_PAGO`, because it can consult the Mercado Pago ledger. `PENDIENTE_TRANSFERENCIA` orders have no equivalent — and no stock is reserved at order creation (stock moves only on approval), so an old pending transfer costs nothing except price drift (`approve-transfer` re-verifies against the live catalog and answers `409` on a mismatch) and queue clutter.
  - **Recommended windows (answer to the owner's question):** 24 h is **not too long — it is too short** for a B2B transfer: clinics often pay through an accountant the next business day, and a Friday evening order would be cancelled before the weekend. Use **a reminder at 24 h** (e-mail "tu pedido sigue pendiente de transferencia", with the amount and the order number as the transfer reference) and **a flag at 72 h** (listed for the operator, who cancels manually with a reason through `cancel-order`). **Never auto-cancel a transfer**: the bank ledger cannot be consulted programmatically, so a transfer could have arrived without a voucher; orders with an uploaded voucher are never swept — the operator verifies those.
  - **Fix:** extend the `close-stale-orders` report (read-only) with a transfer-candidates section (`PENDIENTE_TRANSFERENCIA`, no voucher, older than 72 h) and surface it in the console's *Pedidos Pendientes Antiguos* card with a per-order *Cancelar* shortcut; reminder via a new `emailDelivery` kind sent from an admin button (a scheduler is out of scope on the Hobby plan; revisit with a Vercel cron only if volume justifies it).
  - **Accept:** tests for the 24 h/72 h classification, voucher-bearing orders excluded, no status write by the report, reminder claimed once and recorded.

### Phase 9 — Commercial Promotions

<a id="task-9-1"></a>

- [ ] **9.1. Promo Controls Only When Campaigns Need Them** _(P2 — conditional)_
  - `PRONTO10` and `DENT20` are bundled public codes; `DENT20` is an unlimited 20 % discount with no expiry, redemption audit or eligibility rules. Before traffic the owner must confirm they are intentional and margin-safe or disable unused codes (owner gate in §1). Do not preemptively add an admin collection. If limited/private campaigns appear, design expiry, exhaustion, eligibility, redemption audit and controls as one bounded scope, keeping `resolvePromo` as the shared policy authority and transactional exhaustion.

---

## 4. Owner Decisions and Open Questions

### Decisions recorded (2026-09-30)

1. **No MFA** for admin accounts (4.7 reduced to auth-failure visibility).
2. **Resend** sending domain is verified and a test e-mail was delivered.
3. **E-mail header stays** "Melipilla & Región Metropolitana" — the storefront audience is Región Metropolitana clients (removed from 3.3).
4. **Last-moment price check** at the Pago step, with visible feedback to the shopper (2.19).
5. **Voucher window:** the owner proposed 24 h; the recommendation (reminder at 24 h, flag at 72 h, never auto-cancel) is in 8.21, and the Mercado Pago link expiry recommendation (24 h) is in 0.20 — **awaiting confirmation**, see question A.
6. **Out-of-zone deliveries are not rejected**; those buyers can only pay through WhatsApp (0.22).
7. **Stock is removed from the public**; only low stock (≤ 3 units) is visible. There is already an "Últimas unidades" badge on the product card, but at ≤ 5 and not on the quick view or cart (2.14).
8. **Production environment variables are set in Vercel** (not independently verified).
9. **Branch rebased** onto the merged 8.4 / 8.12 / 8.13 work.

### Open questions

- **A. Time windows.** Confirm: Mercado Pago link valid for **24 h**; bank-transfer orders get a reminder at **24 h** and appear in the operator list at **72 h**, cancelled only manually. If you prefer a hard auto-close for transfers, say so — the cost is a possible cancellation of a transfer that already arrived without a voucher.
- **B. San Antonio minimum.** Should the `$60.000` minimum apply to every payment method (assumed yes, as the root guide says) — including a San Antonio buyer who pays by WhatsApp quote?
- **C. "No RM copy" rule.** The root `AGENTS.md` §3.4 forbids `RM` in delivery-coverage copy, while you want the audience/e-mail wording to stay Región Metropolitana. Should §3.4 be amended to allow RM for audience/branding while keeping delivery coverage as "Melipilla y San Antonio"?
- **D. E-mail identity.** Which `Reply-To` should customers get (a sales mailbox, or WhatsApp only)? Which lifecycle e-mails do you want from the proposed set (voucher received, dispatched, delivered, cancelled, transfer reminder)? Sender is `pedidos@prontoinsumos.com` while the bank-contact line uses `pagos@prontoinsumos.cl` — is the `.cl` mailbox real?
- **E. Rules deployment.** Are the current Firestore rules, indexes and storage rules deployed to production? (The environment variables were confirmed; the rules were not.)
- **F. Regulated products and Boleta.** Please confirm the live catalog has no `prescriptionRequired` items (1.6 is suspended on that assumption) and that "no Boleta claims anywhere" remains the policy while 1.5 is suspended.
- **G. Low-stock wording.** Public threshold is 3 units; the admin low-stock KPI uses ≤ 5 — keep them different (operations vs. customer pressure) or align both to 3? Badge wording: "Últimas unidades" or "Quedan N"?

---

## 5. Resolved History

Outcomes only; detail lives in the relevant `AGENTS.md` and git history. Items marked † still owe an owner acceptance step (listed in the [owner checklist](#owner-only-checklist)).

| ID | Outcome |
| :-- | :-- |
| 0.1–0.5 | Orders start `PENDIENTE_*`; client never approves payment or touches stock; webhook on `firebase-admin` with transactions, idempotent (fast path + in-transaction guard), HMAC-SHA256 `x-signature` timing-safe; one canonical order id across order doc, preference and `external_reference`. |
| 0.6–0.8 | `firestore.rules` deployed (public catalog read, admin-only writes, pending-only order create, client order read/update/delete denied); public seed button removed; mock customer data and card fields purged (no card data in state). |
| 0.9 | Server-side price rebuild in `create-preference` + webhook amount assertion (`PAGO_EN_REVISION` on mismatch) + admin `resolve-payment-review`. |
| 0.10 / 0.11 | Simulated payment paths gated by `simulationPolicy` (fail closed in production); `submitOrder` fails closed and the client Firestore instance uses `ignoreUndefinedProperties`. |
| 0.12 † | Order documents bound to their own id + `keys().hasOnly` create-shape allowlist; canonical doc-key-first resolver `orderLookup.ts`; payload↔rules drift guard. **Rules still need `pnpm run deploy:rules`.** |
| 0.13 | Voucher URLs allowlisted at the render sink (`voucherUrl.ts`) — closed the admin-origin XSS. |
| 0.14 | Webhook reconciliation closed: MP verification fails closed (`502`, only `404` acked), one signed payment id, status guard, at-most-once deduction, double-payment incidents, refund/chargeback parking, oversell shortfalls recorded. |
| 0.15 / 0.16 | `dispatch-order` accepts a blank tracking code and the Admin Firestore ignores `undefined`; `track-order` fails closed in production instead of fabricating an order. |
| 0.17 | Approved/reversal payments with a missing/unusable order reference persist an idempotent `payment_incidents` record before being acknowledged (`5xx` if the incident cannot be stored). |
| 0.18 † | Partial Mercado Pago refunds detected (`transaction_amount_refunded > 0`), one deduplicated `PAGO_REEMBOLSO_PARCIAL` history event + warehouse alert; no status flip, stock movement or automatic refund. |
| 1.1–1.4 | Integer-CLP catalog and `formatCLP`; billing block with tax breakdown and gated Factura validation; ISP/SIS validation for regulated items; distributor RUT single-sourced from `BANK_DETAILS.rut`. |
| 1.7 | Fiscal breakdown is server-authoritative: `submitOrder` derives RUT/breakdown/status, rules pin the decomposition, e-mails and `track-order` derive via `calculateTaxBreakdown`; pre-verification mail says `Total referencial`. |
| 2.1–2.8 | Payment-return handling; cart persistence (`pronto_cart_v1`, 7-day TTL); stock guards; bank-transfer workflow; customer tracking; 5-step checkout; real search forms; simulated fallbacks only outside production. |
| 2.9 | Vouchers go to private Cloud Storage via `sign` → direct PUT → `confirm` (V4 signed URL, 5 MiB signed cap, server-side MIME/size re-check, deny-all `storage.rules`); no Base64 transport. |
| 2.10 / 2.11 / 2.12 | WhatsApp number single-sourced (`contact.ts`); production never serves `odon-*` fixtures (`CatalogResult.source`); payment return no longer claims accreditation and resets the cart only for the order this tab created. |
| 2.13 | Courier-less dispatches mint an internal reference `<ZONE>-<YYMMDD>-<NN>` from a per-zone/day counter. |
| 2.15 † | Voucher leftovers bounded and reclaimable: lifetime per-order sign cap (10), `voucher-housekeeping` admin sweep (grace window, dry run), admin list drops legacy Base64 `voucherUrl` (`hasVoucher`). |
| 2.17 | `create-preference` bound to a valid pending MP order: lifecycle guard (`409`), stored-total agreement, server-side San Antonio minimum, `SITE_URL`-only origin in production, repeat budget; client never fabricates a paid state. |
| 2.18 | Failed-return retry is order-bound (`resumeMercadoPagoPayment`, server re-asserts lifecycle), no categorical "no charge" copy; per-tab advisory notice (residual accepted; 8.13 is the backstop). |
| 4.0 / 4.1 | Admin portal (`admin.html`, Firebase custom claim `admin: true`, `api/admin/[action].ts` dispatcher); schema freeze, `order_status_history` / `inventory_audit_logs`, migration CLI. |
| 4.2 | Backoffice sweep: bounded paginated order reads with server-side status filter (composite index `orders(status ASC, createdAt DESC)` declared and deployed), `count()` aggregations, deep links, failure-vs-empty state, KPI keyed on settlement timestamp. |
| 4.3 † | Admin handlers hardened: source-state guards (`409`), promo-aware catalog total recomputed before stock writes, required bank `reconciliationReference`, transactions + CLP/unit bounds (`adminLimits.ts`), revoke-aware tokens, no wildcard CORS. |
| 4.4 | Inventory-admin hook-order violation fixed (`StockAdjustModal` guard + keyed form). |
| 4.5 † | Manual order operations: `MANUAL_ORDER_OPERATIONS.md` runbook + `cancel-order` (never-settled statuses only) + `record-order-incident`; no refunded status, no automatic gateway refund. |
| 4.6 † | WhatsApp quote handoff: `resolve-quote` (`convert` with one stock deduction after operator attestation, or `decline`); WhatsApp stays exposed per owner decision. |
| 5.1 / 5.2 | Resend transactional e-mail (fail-safe, plain `fetch`); production WhatsApp number `56929831595`. |
| 5.3 | Mail-delivery reliability: transactional claim per kind (`emailDelivery` map), `503` when Admin is down, failures visible in the panel, `resend-order-email` with a 5-per-kind budget. |
| 6.1 | Real catalog photography and gallery. |
| 7.1 / 7.3 | Terms, SERNAC warranty and privacy (Ley 19.628) via `LegalModal` (copy = draft; sign-off suspended); `og-preview.jpg` and `favicon.svg` delivered. |
| 8.3 | Integration tests for the serverless endpoints. |
| 8.4 † | One-command pre-release gate `pnpm run verify` (`test && tsc --noEmit && build`; `verify:full` adds lint + format), a minimal single-job PR workflow (`.github/workflows/ci.yml`, never deploys) and the read-only credential-free `pnpm run smoke:preview` probe set (refuses the production host). The credential-bearing half stays a manual TEST-only step. |
| 8.6 | `api/` consolidated to 6 functions (Hobby cap 12); ESM `.js` import rule and `jose@^5` override (removal condition recorded in 8.14). |
| 8.7 | Catalog progressive reveal (16 per page). |
| 8.8 | Public dual-factor endpoints return one identical `404`, are throttled per IP/order (`abuseThrottle.ts`, fail-open with a loud log), and use the `PRONTO-` + 8 Crockford base32 id; warehouse voucher alerts budgeted per order. |
| 8.12 † | Edge security headers in `vercel.json`: `frame-ancestors 'none'` + `X-Frame-Options: DENY` **enforced** on `/admin`, `/admin.html` and `/admin/:path*`; `nosniff`, `Referrer-Policy`, `Permissions-Policy` and the full CSP in **Report-Only** on every non-`api/` path (promotion to enforcement is an owner step). |
| 8.13 † | `close-stale-orders` admin action (on the existing dispatcher, still 6 function slots): scans abandoned `PENDIENTE_PAGO_MERCADOPAGO` / `PENDIENTE_PAGO` orders, consults the Mercado Pago ledger first (approved payment ⇒ parked in `PAGO_EN_REVISION`, never cancelled; unreadable ledger ⇒ untouched), transaction re-asserts the pending status, `dryRun` defaults to true, 7 s wall-clock budget, console card in `#settings`. Transfers are intentionally out of scope (see 8.21). |
| 8.17 † | Catalog imports/seeds are non-destructive and identity-stable (name-bound ids, metadata-only updates, soft-retire `odon-*`, explicit `--confirm-production-*`, `--dry-run`). |
