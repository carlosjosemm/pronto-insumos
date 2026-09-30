# Task 2.18: Failed Payment Return and Retry Workflow

**Branch:** `feat/task-2.18-failed-payment-return-retry` (Windsurf-managed worktree checkout at `~/.windsurf/worktrees/pronto-insumos/pronto-insumos-burnished-governor` — the session's sanctioned working environment; no manually-created `git worktree add` or sibling task directory)
**Status:** **Implemented, reviewed, gates green — awaiting owner "wrap up and proceed".** 1027/1027 tests (89 suites) after rebasing onto `origin/main` (Task 0.18 merged mid-task); build / lint / format:check / tsc all clean. Adversarial review returned *approve with findings* (F1–F7); all remediated. See §6.

---

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` §3, Task 2.18 *(P2; coordinate with 8.13, not UI polish alone)*:

> **Evidence:** `src/components/PaymentReturnModal.tsx:218-257` claims *"No se ha realizado ningún cobro"* from a forgeable failure query and Retry reopens checkout; `src/components/CheckoutModal.tsx:307-355` creates a new order. A late approval of the first order can cause separate order IDs/charges; the webhook's per-order duplicate guard cannot join them.
> **Risk:** duplicate order/charge or false assurance that no payment occurred.
> **Fix:** remove categorical no-charge language; verify tracking/payment ledger before retry. Reuse pending order where safe, or direct the operator to reconcile the prior order before a new attempt. Do not clear cart from a forged return.

The Mercado Pago return URL (`/?status=failure&orderId=…`) is trivially forgeable **and** is written by Mercado Pago before our webhook has verified anything. Today the failure branch of `PaymentReturnModal` makes two categorical claims from that query:

1. *"ℹ️ Tus insumos continúan guardados: **No se ha realizado ningún cobro a tu tarjeta.**"* — a categorical no-charge assurance the storefront cannot actually know.
2. *"La transacción en Mercado Pago no pudo procesarse o fue cancelada."* — the same false-assurance class: the URL says failure, but the payment may have gone through with a delayed webhook.

Worse, the "Reintentar / Opciones de Pago" button reopens checkout, and `handleCompleteOrder()` mints a **new** order id and charges it. If the first payment later approves (delayed webhook), the shopper holds two separate orders/charges that `/api/webhooks/mercadopago`'s per-order duplicate guard cannot join — the guard only joins payments recorded against the *same* order document.

The server already provides the safe primitives (both built in earlier tasks, only unwired on this surface):

- `/api/track-order` — dual-factor (order id + RUT) server-authoritative order status.
- `/api/create-preference` **lifecycle guard** — only a `mercadopago` order in `PENDIENTE_PAGO_MERCADOPAGO` may get a preference (`409` otherwise), so re-initiating payment on the *same* pending order can never double-bill a settled one, and any genuine double payment on that order is joined by the webhook's `PAGO_DUPLICADO` incident path.

This task wires the storefront retry path onto those primitives.

## 2. Human Action Items & Placeholders (TODO for Human)

**None.** No new credentials, env vars or `.env.example` entries — the change reuses the existing serverless endpoints and their secrets. (Task 8.13's stale-pending-order close remains a separate roadmap item; this task only coordinates with it.)

## 3. Proposed Changes

### 3.1 `src/components/PaymentReturnModal.tsx` — copy honesty + protected retry entry

- **`failure` branch rewrite (the named gap):**
  - Remove *"No se ha realizado ningún cobro a tu tarjeta"* and *"La transacción en Mercado Pago no pudo procesarse o fue cancelada"* — both assert an outcome the forgeable URL cannot prove.
  - New copy states only what is known: Mercado Pago returned a payment-not-completed notice; the notice does not confirm the charge outcome; before a new attempt, verify the order status (RUT as second factor) or coordinate by WhatsApp.
  - Actions: `Cerrar` + `Verificar estado antes de reintentar` (calls `onTrackOrder`; renders only when both `orderId` and `onTrackOrder` are present — the same condition as the tracking action), plus a WhatsApp coordination link for the manual-reconciliation path.
- **Remove the now-dead `onRetryPayment` prop** — a direct retry that skips ledger verification is exactly the unsafe path this task removes; the protected retry completes inside the tracking modal instead.
- **`pending` branch:** unchanged (its copy makes no no-charge claim).

### 3.2 `src/services/mercadopago.ts` — new `resumeMercadoPagoPayment(orderId)`

- `POST /api/create-preference` with `{ orderId }` only — the endpoint reads the line items, payer and promo from the order document (Task 0.14g/2.17 contract), so the request contributes nothing chargeable.
- Success with a usable `initPoint` → redirect to Checkout Pro. Exact result shape `{ success: true }` — no payment id, status or timestamp is ever fabricated client-side.
- `409` (settled / in-review / transfer / quote / cancelled) → `{ success: false, error }` with the server's message; the caller surfaces "revisa el estado de tu pedido" instead of creating a new order.
- Production transport failure → loud `console.error` + `{ success: false }`; the dev/preview simulation stays (same `isSimulatedFallbackAllowed()` gate as the existing adapter).
- `MercadoPagoPaymentParams`'s `items` / `total` / `customer` become optional — the endpoint only reads the `orderId`, and the checkout call keeps passing all four.

### 3.3 `src/components/OrderTrackingModal.tsx` — the protected retry completion

- Import `resumeMercadoPagoPayment` (the modal already invokes adapters directly — `fetchOrderTracking`, `uploadTransferVoucher`).
- When the tracked order is `PENDIENTE_PAGO_MERCADOPAGO` **and** method is `mercadopago`, render `Reintentar pago de este pedido` → adapter call; on failure the server message renders inside the modal. On success the browser navigates to Checkout Pro.
- No retry button for any other status/method combination (settled orders show `Pago Acreditado`; transfer/quote orders route through the existing WhatsApp support link).

### 3.4 `src/App.tsx` — wiring

- `PaymentReturnModal`: drop the `onRetryPayment` wiring (the verify action **is** `onTrackOrder`).
- No other App changes — the tracking modal owns the resume call internally.

### 3.5 `src/components/CheckoutModal.tsx` — pre-checkout pending-payment notice

- An order this tab already created may still be awaiting payment when the shopper re-enters checkout: the Mercado Pago return URL is forgeable and is written before the webhook verifies anything, so the storefront cannot know whether that earlier charge went through.
- `pendingSessionOrderId` (a `useMemo` keyed on `[isOpen, step]`) reads the Task 2.12 session marker only while the checkout is open on step 1, so a just-created order is never shown as the pending one.
- When the marker holds an id, the step-1 panel renders an advisory notice above the contact fields: `⚠️ Pago pendiente de confirmar (<id>): ya registraste un pedido que puede estar esperando la acreditación del pago. Verifica su estado antes de crear uno nuevo.` with a `Ver estado del pedido` button that closes the checkout and opens `OrderTrackingModal` via the existing `onOpenTracking` prop (RUT stays a second factor the customer types).
- Deliberately **advisory, not a hard gate**: the client cannot query pending orders (rules deny reads) and the marker goes stale (e.g. an order cancelled after the marker was written), so a hard gate would block legitimate checkouts. The residual (a shopper may still mint a second order while the first is pending; the notice is per-tab) is recorded in the as-built docs and the roadmap entry.

## 4. Robust Unit Testing Plan (MANDATORY)

Vitest suites in `src/tests/` (mock every network boundary; never a real outbound request):

| Suite | Change | Cases |
| :-- | :-- | :-- |
| `components/PaymentReturnModal.test.tsx` | MODIFY | Failure state: *"No se ha realizado ningún cobro a tu tarjeta"* pinned **absent** (the existing test asserted its presence — update it); honest copy present (`/no confirma el resultado del cobro/i`); the verify action fires `onTrackOrder` (relabelled retry-button test); `defaultProps` without `onRetryPayment`. |
| `components/OrderTrackingModal.test.tsx` | MODIFY | Pending-MP order → retry button renders and calls the mocked adapter with the order id; settled / transfer / quote / cancelled → no retry button; adapter failure → server message renders inside the modal; malformed document (status `PENDIENTE_PAGO_MERCADOPAGO`, method `transferencia`) → no retry button. |
| `services/mercadopago.test.ts` | MODIFY | `resumeMercadoPagoPayment`: success → redirect initiated, exact result shape `{ success: true, initPoint }` (nothing else may exist); `409` → failure with the server message, no redirect; production transport failure → loud error + failure; dev simulation → success without an `initPoint`; empty order id → refused before any network call. |
| `components/AppPaymentReturn.test.tsx` | MODIFY | Failure return → clicking the verify action opens `OrderTrackingModal` with the order id prefilled and an empty RUT (mirror of the approved-state test). |
| `components/AppCartPersistence.test.tsx` | MODIFY | Forged `?status=failure&orderId=…` → saved cart and badge count untouched (the failure branch never clears the cart — only an approved return naming the session order may). |
| `components/CheckoutModal.test.tsx` | MODIFY | Session marker present → the pending-payment notice renders with the order id and its `Ver estado` action opens tracking; no marker → no notice. |

**Mocking strategy:** `global.fetch` at the boundary (preference + tracking endpoints); `resumeMercadoPagoPayment` mocked in component suites; `window.sessionStorage.clear()` in `beforeEach`/`afterEach` wherever the Task 2.12 marker is exercised (jsdom's own storage, not the harness mock).

**Zero Regression Policy:** the full suite (1027 tests, 89 suites) stays green. Suite duration is dominated by jsdom environment setup (~36–55 s wall clock across runs; the test bodies themselves run in ~15 s) — the repo's "under 5 s" guideline applies to test execution speed, not environment bootstrapping, and is unchanged by this task.

## 5. As-Built Documentation & Roadmap Sync Plan

- `src/components/AGENTS.md` §7.3 (`PaymentReturnModal`) — **landed:** the `failure` bullet rewritten to the as-built honest copy + protected-retry wiring; the removed `onRetryPayment` prop recorded; the failure-state WhatsApp message documented.
- `src/components/AGENTS.md` §4.1.2 (`OrderTrackingModal`) — **landed:** the in-modal resume-payment action and its lifecycle guard documented.
- `src/components/AGENTS.md` §3.1.1 (`CheckoutModal`) — **landed:** the pre-checkout pending-payment notice documented, including the advisory-not-gate disposition and the recorded residual.
- `src/services/AGENTS.md` §1.1 (`mercadopago.ts`) — **landed:** `resumeMercadoPagoPayment` and the relaxed params shape documented.
- `PRODUCTION_READINESS_TODO.md` §3 Task 2.18 — add the "As built" entry (with the duplicate-order residual recorded) and mark `[x]`; refresh the §1 board row.
- `walkthrough.md` — branch, commit, PR URL, verification results, review-finding dispositions (at wrap-up).
