# Task 5.3: Transactional-Mail Delivery Reliability

**Status:** Drafted — awaiting approval.
**Branch:** `feat/task-5.3-mail-delivery-reliability`
**RequestFeedback:** true · **UserFacing:** true

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` item **5.3** (P2):

- **Evidence:**
  - `api/order-confirmation.ts:61-72` returns `200 { success: true }` when Firestore Admin is unavailable — the caller is told "ok" while nothing can ever be sent or recorded.
  - `api/order-confirmation.ts:107-145` reads `confirmationEmailSentAt`, sends via Resend, and stamps the flag in three separate steps. Two concurrent requests both pass the read check and send the customer a duplicate email.
  - `CheckoutModal.tsx:384-386` invokes the confirmation endpoint fire-and-forget; the Mercado Pago webhook (`api/webhooks/mercadopago.ts:982-985`), `approve-transfer.ts:384-387`, `resolve-payment-review.ts:329` and `resolve-quote.ts:452-455` all `await sendEmail(...)` and **discard the result**. A Resend outage leaves no trace — the failed notice is invisible and can never be resent.
- **Fix (from the roadmap):** lightweight failed-send visibility + recoverable manual resend, with concurrency idempotency via transaction reservation. No new queue/service; never roll back paid state when mail fails.
- **Accept criteria:** Admin-down is not reported sent; concurrent confirmation sends at most once; Resend failure after checkout/approval is visible and manually recoverable without changing paid state.

**Design** — mirrors the proven Task 8.8 voucher-alert reservation pattern (`api/upload-voucher.ts`), which already serializes concurrent claims on the order document inside a transaction:

- A new server-written `emailDelivery` map on the order document holds per-kind delivery telemetry: `{ confirmation?: Entry, payment?: Entry }` where `Entry = { sentAt?, claimedAt?, failedAt?, failureReason?, resendCount? }`.
  - `sentAt` — durable sent marker. For `confirmation`, the legacy `confirmationEmailSentAt` field is still honored on read and still written on success (deployed orders already carry it; the type contract documents it).
  - `claimedAt` — in-flight reservation with a 5-minute TTL, written inside a transaction so concurrent sends serialize; a crashed claim expires and becomes reclaimable.
  - `failedAt` / `failureReason` — last send failure, stamped best-effort; cleared on the next success.
  - `resendCount` — manual-resend budget (cap 5/kind) so a resend loop cannot drain Resend quota.
- A shared helper `api/_lib/emailDelivery.ts` owns claim/commit/failure primitives so `order-confirmation` and the new admin resend action use one mechanism.
- Customer-facing kinds: `confirmation` (order received) and `payment` (payment confirmed / transfer approved / review resolved — template chosen from the order's settled state). Warehouse alerts keep their existing budgets; they are out of scope.

## 2. Human Action Items & Placeholders (TODO for Human)

- **None.** No new credentials, env vars, or services. Reuses `RESEND_API_KEY`, `EMAIL_FROM`, `WAREHOUSE_NOTIFICATION_EMAIL`, and the Firebase Admin triple already configured. `.env.example` needs no changes.
- Operational note for the walkthrough: the admin order panel gains a transactional-mail block with a manual resend action — no owner SOP change required beyond awareness.

## 3. Proposed Changes

### `api/` — serverless backend

- **[NEW] `api/_lib/emailDelivery.ts`** — shared delivery-telemetry primitives:
  - `type OrderEmailKind = 'confirmation' | 'payment'`; `EMAIL_CLAIM_TTL_MS = 5 * 60 * 1000`; `EMAIL_RESEND_MAX_PER_KIND = 5`.
  - `readDeliveryEntry(orderData, kind)` — merges the legacy `confirmationEmailSentAt` marker into `confirmation.sentAt` so pre-change documents read correctly.
  - `claimEmailSend(db, orderRef, kind, opts)` — transaction: fresh read → `'sent'` (skipIfSent + sentAt present), `'in-flight'` (fresh `claimedAt`), `'capped'` (resend over cap) or `'claimed'` (writes `claimedAt` + `updatedAt`).
  - `markEmailSent(db, orderRef, kind, claimIso, { resend })` — clears `claimedAt`/`failedAt`/`failureReason`, sets `sentAt` (+ `resendCount` increment on resend; + `confirmationEmailSentAt` for the confirmation kind). Compare-and-swap on `claimedAt` when a claim was taken. Best-effort, never throws.
  - `markEmailFailed(db, orderRef, kind, reason, claimIso?)` — releases our own claim (CAS) and stamps `failedAt`/`failureReason`; without a claim stamps the failure fields directly. Best-effort, never throws.
- **[MODIFY] `api/order-confirmation.ts`**
  - Admin-down: `503 { success: false, error }` + loud `console.warn` (was `200 success:true` — the "reported sent" lie).
  - Replaces the non-atomic read/send/stamp with `claimEmailSend` → `sendEmail` → `markEmailSent`/`markEmailFailed`. Fresh-claim calls return `200 { success: true, emailSent: false, inFlight: true }` without sending. A missing customer email is recorded as a `failedAt` entry (`missing_customer_email`) so the panel can see it.
- **[NEW] `api/_lib/admin/resend-order-email.ts`** — 15th entry of the existing dispatch table (no new Hobby slot):
  - POST + `verifyAdminToken`. Body `{ orderId, kind: 'confirmation' | 'payment' }` → `400` on bad input, `404` unknown order.
  - `kind: 'payment'` requires a settled status (`PAGADO_MERCADOPAGO`, `TRANSFERENCIA_APROBADA`, `PAGADO_TRANSFERENCIA`, `EN_PREPARACION`, `DESPACHADO`, `ENTREGADO`) → `409` otherwise — a "paid" email can never go out for an unpaid order. Template: `mercadopago`/`PAGADO_MERCADOPAGO` → `buildPaymentConfirmedEmail`, otherwise `buildTransferApprovedEmail`.
  - Missing customer email → `400`; in-flight claim → `409`; resend cap → `429`.
  - On send: claim → `sendEmail` → `markEmailSent(resend)` + an `order_status_history` same-status event (`metadata.event: 'CORREO_REENVIADO'`, `actorRole: 'ADMIN'`, the kind and recipient in metadata) → `200 { success: true, resent: true }`. On Resend failure: `markEmailFailed` + `502 { success: false, error }` — visible to the operator, retriable.
- **[MODIFY] `api/admin/[action].ts`** — register `'resend-order-email'` in `ADMIN_ACTIONS`.
- **[MODIFY] `api/webhooks/mercadopago.ts`** — capture the customer send result (line ~982): `markEmailSent`/`markEmailFailed` for kind `payment`, best-effort. Paid state and the `200` ack are untouched.
- **[MODIFY] `api/_lib/admin/approve-transfer.ts`, `resolve-payment-review.ts`, `resolve-quote.ts`** — capture each customer send result and stamp `emailDelivery.payment` accordingly (best-effort, after commit; never changes the financial outcome).

### `src/` — types & admin portal

- **[MODIFY] `src/types/index.ts`** — add `EmailDeliveryEntry` + `Order.emailDelivery` (server-written telemetry block; documents that `confirmationEmailSentAt` remains the legacy confirmation marker).
- **[MODIFY] `src/admin/services/adminApi.ts`** — `resendOrderEmail(orderId, kind)` → POST `/api/admin/resend-order-email`, same error-contract shape as `resolveQuote` (`{ success, duplicate?, error? }`).
- **[MODIFY] `src/admin/components/OrderDetailPanel.tsx`** — small "Correos transaccionales" block: per-kind status (`Enviado <fecha>` / `Falló <fecha> — <motivo>` / `No enviado`), a **Reenviar confirmación** button, and a **Reenviar correo de pago** button enabled only for settled statuses. Inline result/error; refreshes the order via `onOrderUpdated`.

### Docs & roadmap

- **[MODIFY]** `api/AGENTS.md` (endpoint table row, email-delivery section, action count 14→15), `src/types/AGENTS.md`, `src/admin/AGENTS.md`, `src/tests/AGENTS.md` (suite/test counts), `PRODUCTION_READINESS_TODO.md` (mark `[x]` + as-built note).

## 4. Robust Unit Testing Plan

- **[MODIFY] `src/tests/api/order-confirmation.test.ts`**
  - Admin-down: `503` + `success: false` (replaces the `200 success:true` expectation).
  - Fresh-claim path: an order carrying a non-expired `claimedAt` → `200 inFlight:true`, **no Resend fetch**, no writes.
  - Stale claim (claimedAt older than TTL) → reclaim proceeds and sends.
  - Concurrent-send serialization: the claim transaction double serves a fresh doc; second caller sees the claim → no send.
  - Send failure: claim released (CAS — only if still ours), `failedAt`/`failureReason` stamped; `sentAt`/`confirmationEmailSentAt` absent.
  - Send success: `sentAt` + `confirmationEmailSentAt` stamped, `claimedAt` cleared.
  - Missing customer email → `emailDelivery.confirmation.failedAt` recorded with `missing_customer_email`.
  - Legacy doc with `confirmationEmailSentAt` only → still `duplicate`, no send.
- **[NEW] `src/tests/api/admin/resend-order-email.test.ts`** (~15 cases): OPTIONS/method gate; unauthenticated → 401; missing/invalid `kind` → 400; unknown order → 404; `payment` on unpaid statuses → 409; settled MP order → `buildPaymentConfirmedEmail` + stamp + `CORREO_REENVIADO` history event; `PAGADO_TRANSFERENCIA` → transfer template; missing customer email → 400; resend cap → 429; in-flight claim → 409; Resend failure → `502` + `failedAt` recorded; resend over a previously-failed entry clears `failedAt` on success.
- **[MODIFY] `src/tests/api/mercadopago-webhook.test.ts`** — approved payment where the customer Resend call fails → `200` ack, order still `PAGADO_MERCADOPAGO`, `emailDelivery.payment.failedAt` stamped (paid state never rolled back); success case stamps `sentAt`.
- **[MODIFY] `src/tests/api/admin/approve-transfer.test.ts`**, **`resolve-payment-review.test.ts`**, **`resolve-quote.test.ts`** — one case each: customer-send failure leaves the approval/resolution committed AND stamps `emailDelivery.payment.failedAt`.
- **[MODIFY] `src/tests/api/admin/admin-router.test.ts`** — 15 mapped actions, `resend-order-email` routes.
- **[MODIFY] `src/tests/admin/OrderDetailPanel.test.tsx`** — block renders sent/failed/not-sent states; resend buttons call `resendOrderEmail` with the right kind; payment resend hidden/disabled for unpaid statuses; error surfaces inline.
- **Mocks:** no new boundaries — `global.fetch` for Resend, existing Admin SDK doubles (`throttleCounters` fallback handles the new claim transactions — update the double to route order refs to the suite's doc state), `firebaseAdmin` mock. No real network.
- **Gate:** full suite green (`pnpm test`), `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit`.

## 5. As-Built Documentation & Roadmap Sync Plan

- `api/AGENTS.md`: `order-confirmation` row (503 fail-closed + transactional claim), new `resend-order-email` admin action (count 14→15), new `emailDelivery` reservation/failure model in the email section.
- `src/types/AGENTS.md`: `Order.emailDelivery` block + `EmailDeliveryEntry` contract.
- `src/admin/AGENTS.md`: transactional-mail block + manual resend in `OrderDetailPanel`.
- `src/tests/AGENTS.md`: suite additions/counts.
- `PRODUCTION_READINESS_TODO.md`: mark **5.3** `[x]` with an as-built summary.
