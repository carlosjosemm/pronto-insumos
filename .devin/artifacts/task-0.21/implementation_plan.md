# Task 0.21: Unverified Customer E-mail Is a Branded Relay

**Branch:** `fix/task-0.21-bound-confirmation-relay` (stack layer 3, cut from
`fix/task-0.20-freeze-preference-amount`)
**Status:** implemented, reviewed and remediated (see [walkthrough.md](./walkthrough.md) at wrap-up)
**YOLO stack:** layer 3 of 3.

## 1. Context & Problem Statement

- **Roadmap item:** `PRODUCTION_READINESS_TODO.md` §3, Task 0.21 (P2 · NEW).
- **Gap:** a visitor can create an order (public create) with any `customer.email`, then
  call `/api/order-confirmation` with the order id and **their own** RUT. The message is sent
  from the verified PRONTO sender with attacker-chosen `fullName`, `address` and item `name`
  text (HTML-escaped, but free text). Per-order idempotency and the IP/order throttles bound
  one order, but nothing bounds many orders aimed at one third-party address.
- **Fix (lean):** step (1) "land 8.16" is already done (App Check is on the public create
  path). The remaining steps: render item names from the **catalog** instead of the
  client-written document, clamp the free-text echoes, add a per-recipient budget, and add a
  "this was not you" WhatsApp line.

## 2. Human Action Items & Placeholders (TODO for Human)

- None required. The WhatsApp link reads `VITE_WHATSAPP_NUMBER` with the same digits-only
  normalization and fallback as `src/config/contact.ts` (which the API cannot import because
  it reads `import.meta.env`); the owner checklist already records that `VITE_BANK_*` (and
  now the WhatsApp number) should be present server-side.
- No e-mail verification flow is added — the task explicitly defers that unless the abuse
  materializes.

## 3. Proposed Changes

- **[MODIFY] `api/_lib/abuseThrottle.ts`**
  - Add `'recipient'` to `ThrottleKeyKind` and optional `windowMs`/`lockoutMs` to
    `ThrottlePolicy`; the counter document's `expiresAt` is now
    `now + max(THROTTLE_DOC_TTL_MS, windowMs + lockoutMs)` so a TTL sweep can never reset a
    budget still in force.
  - `ThrottlePolicies` makes `recipient` optional per scope; a kind with no policy for a
    scope is never throttled.
  - `order-confirmation` gains a `recipient` budget: 5 sends / 24 h per hashed address,
    locked 24 h.
- **[MODIFY] `api/order-confirmation.ts`**
  - `resolveCatalogItemNames(adminDb, orderData)` reads the `products` collection by
    `productId` (best-effort; a failed read logs and leaves the neutral label).
  - Consume the recipient budget **after** the send claim and before the send, so an
    idempotent duplicate never spends a slot; a refusal releases the claim
    (`markEmailFailed(..., 'recipient_budget')`) and answers the uniform `429`.
  - Pass `{ itemNames }` into `toOrderEmailData`.
- **[MODIFY] `api/_lib/emailTemplates.ts`**
  - `toOrderEmailData(orderId, orderData, options?)` — when `options.itemNames` is supplied
    the line name comes from the catalog (neutral label when unresolved) and the stored name
    is never rendered; the server/admin templates (no map) keep rendering the stored name.
  - Clamp the free-text echoes (`fullName` 80, `address` 120, `city` 40).
  - A server-side WhatsApp helper (`VITE_WHATSAPP_NUMBER`, digits-only, same fallback as the
    browser config) and a "Si no reconoces este pedido…" line in
    `buildOrderConfirmationEmail`.
- **[MODIFY] tests** — `src/tests/api/abuseThrottle.test.ts` (the 24 h window/lockout
  override, the TTL, the no-policy kind), `src/tests/api/order-confirmation.test.ts` (the
  double resolves `products` separately; catalog names render and the client names never do;
  the recipient-budget `429` releases the claim; the WhatsApp line), `src/tests/api/email.test.ts`
  (the name-map override, the neutral fallback, the stored-name default, the echo clamps, the
  WhatsApp line).
- **[MODIFY] docs** — `api/AGENTS.md` (the order-confirmation row + the abuse-throttle
  section), `PRODUCTION_READINESS_TODO.md` (close 0.21).

## 4. Robust Unit Testing Plan (MANDATORY)

1. **Throttle:** the recipient policy's window/lockout override (a 5-attempt budget, a 24 h
   lock, `retryAfterSeconds` from the override), `expiresAt` past the default TTL, and a
   key kind with no policy for the scope being allowed without touching Firestore.
2. **Endpoint:** catalog names render and the client-written names never appear; an
   unresolvable product renders the neutral label; the free-text echo is clamped; the
   WhatsApp line is present; a locked recipient key answers `429`, sends nothing (no Resend
   fetch) and releases the claim with `failureReason: 'recipient_budget'`.
3. **Templates:** the name-map override, the stored-name default when no map is given, and
   the echo clamps.
4. **Zero regressions:** full suite + the five gates green.

## 5. As-Built Documentation & Roadmap Sync Plan

- `api/AGENTS.md`: the `/api/order-confirmation` row (catalog-sourced names, the recipient
  budget) and the abuse-throttle description (the recipient kind + the per-kind window).
- `PRODUCTION_READINESS_TODO.md`: remove the 0.21 board row and §3 entry, add one §5 history
  row.
- `.devin/artifacts/task-0.21/walkthrough.md` at wrap-up.
