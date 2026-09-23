# Task 5.1: Transactional Email Service (Resend) + Task 5.2: Production WhatsApp Number

**Branch:** `feat/task-5.1-transactional-email`
**Status:** Awaiting user approval — no source code changes until approved.

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → Phase 5 (items 5.1 & 5.2) and Go-Live Acceptance Criterion #5: *"The purchasing clinic receives an immediate formal order confirmation with an order number via email and/or WhatsApp."*

Current gaps:
- The platform sends **zero transactional emails**. Customers get no formal order receipt; the Melipilla warehouse gets no real-time alert when a paid order or a transfer voucher arrives — staff must poll `/admin` manually.
- `VITE_WHATSAPP_NUMBER` is still the placeholder `56912345678` (`.env.example`, and the fallback in `src/services/whatsapp.ts`); the real WhatsApp Business number exists but is not wired in.

**Decision (confirmed with user):** Resend as the provider — permanent free tier (3,000 emails/mo, 100/day), single REST call, proper DKIM/SPF/DMARC domain authentication on the existing GoDaddy-registered domain so confirmations don't land in spam.

## 2. Human Action Items & Placeholders (TODO for Human)

| # | Action | Where |
|---|--------|-------|
| H1 | Create Resend account (free), add the production domain, and copy the generated **DKIM TXT**, **SPF TXT**, and optional MX records into the domain's DNS zone (GoDaddy DNS management, or Vercel DNS if nameservers are delegated). Add a `TXT` `_dmarc` record (`v=DMARC1; p=none;`). | Resend dashboard + DNS provider |
| H2 | Generate a Resend **API key** and set `RESEND_API_KEY` in Vercel env vars (Production + Preview if preview emails are wanted). | Vercel Project Settings |
| H3 | Set `EMAIL_FROM` (e.g. `PRONTO Insumos <pedidos@<domain>>`) and `WAREHOUSE_NOTIFICATION_EMAIL` (Melipilla dispatch inbox) in Vercel env vars. | Vercel Project Settings |
| H4 | Set the real `VITE_WHATSAPP_NUMBER=569XXXXXXXX` in `.env.local` and Vercel env vars, then redeploy. | Vercel Project Settings |
| H5 | In the WhatsApp Business app: configure greeting message, away message, quick replies, and product catalog. | WhatsApp Business app (manual) |

**New env vars to add to `.env.example` (safe placeholders only):**
```
# Transactional Email (Resend - serverless only, never VITE_)
RESEND_API_KEY=YOUR_RESEND_API_KEY
EMAIL_FROM="PRONTO Insumos <pedidos@yourdomain>"
WAREHOUSE_NOTIFICATION_EMAIL=bodega@yourdomain
```

## 3. Proposed Changes

### New files
- **[NEW] `api/lib/email.ts`** — shared serverless sender. Reads `RESEND_API_KEY`, `EMAIL_FROM`, `WAREHOUSE_NOTIFICATION_EMAIL` from `process.env`. Single `sendEmail({ to, subject, html, text })` helper doing one `fetch` POST to `https://api.resend.com/emails`. **Fail-safe by contract:** logs `console.warn` on missing key or API failure and returns `{ sent: false }` — never throws, so an email outage can never break payment flows.
- **[NEW] `api/lib/emailTemplates.ts`** — pure template functions returning `{ subject, html, text }`. Plain HTML (no template-engine dependency, per Anti-Overshooting). Templates: `orderConfirmation` (item breakdown, integer CLP, 19% IVA/neto via existing tax utils, freight, Factura/Boleta data, bank details + voucher upload link when `transferencia`), `paymentConfirmed`, `transferApproved`, `warehouseAlert`.
- **[NEW] `api/order-confirmation.ts`** — public endpoint for the "order received" email. Dual-factor auth identical to `/api/track-order` (orderId + Chilean Modulo-11 RUT match). Reads the order via `firebase-admin`, sends the confirmation, and stamps `confirmationEmailSentAt` on the order doc for **idempotency** (repeat calls return `{ duplicate: true }`). CORS headers + `OPTIONS` handling per api/ conventions.
- **[NEW] `src/services/orderConfirmation.ts`** — thin client adapter POSTing `{ orderId, rut }` to `/api/order-confirmation`; fire-and-forget with defensive catch.
- **[NEW] `src/tests/api/email.test.ts`**, **`src/tests/api/order-confirmation.test.ts`**, **`src/tests/services/orderConfirmation.test.ts`** (see §4).

### Modified files
- **[MODIFY] `api/webhooks/mercadopago.ts`** — after the atomic transaction commits: `await` `paymentConfirmed` customer email + `warehouseAlert` email, then return 200 (awaited so Vercel doesn't kill the send mid-flight).
- **[MODIFY] `api/upload-voucher.ts`** — after `TRANSFERENCIA_COMPROBANTE_SUBIDO` transition: `warehouseAlert` ("voucher received — verify against Banco de Chile").
- **[MODIFY] `api/admin/approve-transfer.ts`** — after `TRANSFERENCIA_APROBADA` transition: `transferApproved` customer email + `warehouseAlert`.
- **[MODIFY] `src/components/CheckoutModal.tsx`** — after `submitOrder()` succeeds for `transferencia` (and `whatsapp`) methods: fire-and-forget `sendOrderConfirmationEmail(orderId, rut)`.
- **[MODIFY] `src/services/whatsapp.ts`** — update the fallback default number to the real business number (H4 still required for env override).
- **[MODIFY] `.env.example`** — add the three new vars above; annotate `VITE_WHATSAPP_NUMBER` as the production business number.

### Out of scope (deliberate)
- No `resend` npm SDK — a single `fetch` call is sufficient and keeps dependencies at zero.
- No WhatsApp Cloud API automated messages — per-message pricing + Meta template approval is over-engineering; `wa.me` links already cover the flow.
- No dispatch/delivered customer emails — can be a fast follow-up later using the same `api/lib/email.ts` helper.

## 4. Robust Unit Testing Plan (MANDATORY)

Mocking strategy: `global.fetch` mocked at the Resend boundary (no real outbound calls); `firebase-admin` Firestore mocked per existing `src/tests/api/*` conventions; no `VITE_` vars touched in api tests.

- **`src/tests/api/email.test.ts`**
  - Happy path: correct POST to `api.resend.com/emails` with `Authorization: Bearer`, subject/html/text.
  - Missing `RESEND_API_KEY` → returns `{ sent: false }`, warns, does not throw.
  - Resend API non-2xx → `{ sent: false }`, no throw (fail-safe contract).
- **`src/tests/api/order-confirmation.test.ts`**
  - Happy path: order found, RUT matches → email sent, `confirmationEmailSentAt` stamped.
  - RUT mismatch → 403, no email sent.
  - Missing/unknown order → 404, no email.
  - **Idempotency:** `confirmationEmailSentAt` already set → `{ duplicate: true }`, zero Resend calls.
  - Malformed payload (missing orderId/rut) → 400. `OPTIONS` preflight → 200.
- **`src/tests/api/mercadopago-webhook.test.ts` (extend existing)**
  - Approved payment → both customer + warehouse emails attempted after transaction.
  - **Email failure does not fail the webhook:** Resend rejects → response still 200, order still `PAGADO_MERCADOPAGO`.
  - Duplicate webhook delivery → no second email (guarded by existing idempotency fast-path).
- **`src/tests/api/upload-voucher.test.ts` (extend)** — voucher accepted → warehouse alert attempted; Resend failure → still 200.
- **`src/tests/api/approve-transfer.test.ts` (extend)** — approval → customer `transferApproved` + warehouse alert attempted.
- **`src/tests/services/orderConfirmation.test.ts`** — adapter posts correct payload; network error swallowed (fire-and-forget).
- **`src/tests/components/CheckoutModal.test.tsx` (extend)** — transfer order completion triggers confirmation call with orderId + normalized RUT; Mercado Pago path does not.
- Full suite target: current 343+ tests stay green; suite runs < 5s.

## 5. As-Built Documentation & Roadmap Sync Plan

- **`api/AGENTS.md`** — add `api/lib/email.ts`, `api/lib/emailTemplates.ts`, and `/api/order-confirmation` to the endpoint/library tables; document the fail-safe email contract and the `confirmationEmailSentAt` idempotency flag.
- **`src/services/AGENTS.md`** — add `orderConfirmation.ts` adapter to the services table.
- **`AGENTS.md` (root)** — note Resend env vars under secret-separation rules if warranted.
- **`PRODUCTION_READINESS_TODO.md`** — mark `[x] 5.1` with resolution summary; mark `[x] 5.2` noting env var wiring + WhatsApp Business app config delegated to human items H4/H5; tick Go-Live criterion #5.
