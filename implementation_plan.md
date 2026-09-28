# Task 0.10: Fail-Closed Payment Paths in Production

**Branch:** `fix/task-0.10-fail-closed-payment-paths` (cut from `main` @ `5f8593a`, synced with `origin/main`; executing in the primary worktree — no separate worktree, per explicit user instruction)
**Status:** Awaiting user approval — no source code changes until approved.

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **0.10. Fail-Closed Payment Paths in Production** (P0 · Critical · production blocker).

Two server-side payment paths degrade silently instead of failing closed:

1. **`api/create-preference.ts` — fabricated approved checkout.** When `MERCADOPAGO_ACCESS_TOKEN` is missing/placeholder (`hasRealToken === false`), the endpoint returns `200 { isSimulated: true, initPoint: '<baseUrl>/?status=approved&orderId=…' }` from **two** branches: (a) Firestore Admin unavailable (l. 40–56) and (b) after full catalog/stock validation (l. 173–182). A production deploy that loses the token hands the customer a fake "approved" return with no money collected — `PaymentReturnModal` then renders the approved-payment screen.
2. **`api/_lib/mercadopagoSignature.ts` — fail-open signature gate.** When `MERCADOPAGO_WEBHOOK_SECRET` is unset/placeholder, `verifyMercadoPagoSignature()` returns `{ valid: true, reason: 'secret_not_configured' }` (l. 33–36) and the webhook proceeds to the MP API re-check — i.e. an unverifiable webhook is trusted. Flagged in 0.5's audit note; remediation explicitly assigned here.

3. **`api/webhooks/mercadopago.ts` — placeholder access-token ack.** *(Approved scope expansion — the plan's adjacent observation, promoted at the user's request.)* When `MERCADOPAGO_ACCESS_TOKEN` is missing, the handler falls back to the literal `'YOUR_MERCADOPAGO_ACCESS_TOKEN'` (l. 15–16); the MP API re-check then 401s and the webhook acks `200 { note: 'Payment verification failed or credentials placeholder' }` without processing — silently dropping reconciliation and stopping MP retries.

All three behaviors are correct for local dev and tests, but must be impossible in a production runtime. Vercel sets `VERCEL_ENV=production|preview|development` on every deployment; Vitest/local runs leave it unset (which is why the existing simulated-fallback tests currently pass).

---

## 2. Human Action Items & Placeholders (TODO for Human)

- **No new credentials or secrets are required.**
- New **optional** env var, documented in `.env.example` (placeholder only — no real value shipped):
  - `ALLOW_SIMULATED_PAYMENTS=false` — explicit opt-in escape hatch to force simulated payment paths inside a production runtime (controlled demos). Leave unset/`false` in Production.
- **Human check after merge:** confirm `ALLOW_SIMULATED_PAYMENTS` is absent (or `false`) in Vercel → Project → Settings → Environment Variables → **Production**. Nothing needs to be pushed — `env:sync` only writes variables present in the local env file.
- No human-produced assets, no new dependencies, no external configuration changes.

---

## 3. Proposed Changes

### 3.A `[NEW] api/_lib/simulationPolicy.ts` — single policy authority

```ts
export function isSimulatedPaymentAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_SIMULATED_PAYMENTS === 'true') return true
  return env.VERCEL_ENV !== 'production'
}
```

- Injectable `env` (defaults to `process.env`) → pure and unit-testable without global mutation.
- Strict opt-in: only the exact string `'true'` enables the override (`'TRUE'`, `'1'`, `'false'` do **not**).
- Lives under `api/_lib/` → not counted against the Vercel Hobby function cap.
- Deliberately **not** keyed on `getFirestoreEnv()`: `FIRESTORE_ENV` governs collection namespacing and can be explicitly overridden (`FIRESTORE_ENV=development`) — coupling payment policy to it would let a Firestore-scoping mistake reopen the simulation door.

### 3.B `[MODIFY] api/create-preference.ts` — early fail-closed checkpoint

One gate, placed immediately after the method guard (before any Firestore work):

```ts
// FAIL-CLOSED (Task 0.10): a production runtime must never fabricate an approved
// checkout. Without a real access token, refuse loudly instead of simulating.
if (!hasRealToken && !isSimulatedPaymentAllowed()) {
  console.error(
    '[create-preference] MERCADOPAGO_ACCESS_TOKEN missing in a production runtime; refusing to fabricate a simulated checkout.'
  )
  return res.status(500).json({
    error: 'Servicio de pagos no configurado. Por favor cotiza por WhatsApp mientras lo resolvemos.'
  })
}
```

- Chosen over gating each simulated branch individually: a single checkpoint means both existing branches (l. 49–55 and l. 175–181) become **unreachable in production by construction**, no partial work is done first, and there is exactly one place to audit.
- The existing `hasRealToken → 503` Admin-unavailable branch, the order lookup, the catalog price/stock rebuild, and the real MP preference call are **untouched**.
- Net effect: production + missing token ⇒ **500 + `console.error`**; dev / test / preview ⇒ simulated fallback exactly as today.

### 3.C `[MODIFY] api/webhooks/mercadopago.ts` — close the fail-open gate

Immediately after the existing 401 branch (l. 60–68):

```ts
if (signatureResult.reason === 'secret_not_configured' && !isSimulatedPaymentAllowed()) {
  console.error(
    '[Mercado Pago Webhook] MERCADOPAGO_WEBHOOK_SECRET missing in a production runtime; refusing to process an unverifiable webhook.'
  )
  return res.status(500).json({ error: 'Webhook configuration error: signature verification unavailable' })
}
```

- `verifyMercadoPagoSignature()` itself stays a **pure crypto helper — unchanged** (all 12 existing signature tests untouched): it already reports *why* it passed (`reason: 'secret_not_configured'`), so the trust decision belongs at the boundary that consumes the result.
- **500, not 401, is deliberate:** it signals misconfiguration (not an auth rejection) and Mercado Pago retries 5xx, so real deliveries are processed once the secret is restored.
- The rest of the webhook (MP API double-check, amount assertion, transaction, idempotency, emails) is untouched.

**Additional gate — placeholder access token (approved expansion).** Derive `hasRealAccessToken` the same way `create-preference` does and refuse *before* the MP API call:

```ts
if (!hasRealAccessToken && !isSimulatedPaymentAllowed()) {
  console.error(
    '[Mercado Pago Webhook] MERCADOPAGO_ACCESS_TOKEN missing in a production runtime; refusing to process an unverifiable payment notification.'
  )
  return res.status(500).json({ error: 'Webhook configuration error: payment verification unavailable' })
}
```

The `Authorization` header keeps its existing placeholder fallback (`rawAccessToken || 'YOUR_MERCADOPAGO_ACCESS_TOKEN'`), so non-production behavior — including every existing mocked test — is unchanged.

### 3.D `[MODIFY] .env.example`

New block under the Mercado Pago server secrets:

```bash
# Payment Simulation Policy (Server-Side, Optional)
# Simulated checkouts / unverified webhook signatures are automatically disabled when
# VERCEL_ENV=production. Set to "true" ONLY for a controlled demo deployment — never
# for the real storefront.
ALLOW_SIMULATED_PAYMENTS=false
```

### Explicitly NOT done (scope guardrails)

- **No changes to `src/services/mercadopago.ts`.** The client still swallows any HTTP error (incl. the new 500) into `success: true, initPoint: undefined`, so the browser masks server failures until Task **2.8** ("Simulated-Success Fallbacks Must Not Mask Real HTTP Errors"). Residual risk to be recorded honestly: after 0.10 the *server* never fabricates success, but the *browser* still can — the roadmap already sequences 2.8 immediately after 0.11/1.4.
- No new dependencies, no framework, no changes to the MP payload shape, Firestore rules, or admin endpoints.

### Scope note

- The placeholder access-token observation from the original plan draft is **in scope** (approved by the user): see the additional gate in §3.C.

---

## 4. Robust Unit Testing Plan (MANDATORY)

**`[NEW] src/tests/api/simulationPolicy.test.ts`** (~6 tests; pure — no mocks, no `process.env` mutation):

1. `VERCEL_ENV` unset ⇒ allowed (local dev / Vitest).
2. `VERCEL_ENV='preview'` and `'development'` ⇒ allowed.
3. `VERCEL_ENV='production'` ⇒ blocked.
4. production + `ALLOW_SIMULATED_PAYMENTS='true'` ⇒ allowed (escape hatch).
5. production + `'false'` / `'TRUE'` / `'1'` ⇒ still blocked (strict opt-in).
6. No-argument call reads `process.env` (set + restored inside the test).

**`[MODIFY] src/tests/api/create-preference.test.ts`** (+4 tests, new describe `Production fail-closed policy`):

- prod + no token (Admin unavailable) ⇒ **500**, no `isSimulated`/`initPoint`, `console.error` called (loud log).
- prod + no token + Admin mocked with a valid product ⇒ **500** (proves the gate precedes catalog work / is Admin-independent).
- prod + no token + `ALLOW_SIMULATED_PAYMENTS='true'` ⇒ simulated 200 (escape hatch).
- Env hygiene: `beforeEach` deletes `VERCEL_ENV` / `ALLOW_SIMULATED_PAYMENTS`; prod tests set + restore in `afterEach` (same pattern the webhook suite already uses for `MERCADOPAGO_WEBHOOK_SECRET`). Existing simulated-fallback tests (both branches) stay green **unchanged**.

**`[MODIFY] src/tests/api/mercadopago-webhook.test.ts`** (+5 tests, new describe `Production fail-closed configuration gates`):

- prod + missing secret ⇒ **500**, `console.error` called, MP API `fetch` never invoked.
- prod + missing token (secret configured + valid HMAC) ⇒ **500**, `fetch` never invoked, `console.error` called.
- prod + missing secret + `ALLOW_SIMULATED_PAYMENTS='true'` ⇒ falls through to today's unsigned-ack behavior (escape hatch).
- prod + configured secret **and** token + MP API failure ⇒ existing 200 ack preserved (gate never over-fires).
- non-production + missing secret ⇒ unchanged open behavior (explicit regression guard; currently only covered implicitly).

**Unchanged suites:** `mercadopago-signature.test.ts` (helper untouched) plus every client-side suite.

**Mocking:** reuse existing boundary doubles (`vi.mock('api/_lib/firebaseAdmin')`, `vi.spyOn(global, 'fetch')`, `createMockRes()`, `mockAdminDbWithProducts`) — no real network, Firebase, or MP calls.

**Zero-regression target:** `pnpm test` (534 → 555 tests; 65 → 66 suites), `pnpm build`, `pnpm lint`, `pnpm format:check` — all green.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- **`api/AGENTS.md`:**
  - §1.1 table (`/api/create-preference` row): extend the fail-closed summary with the production gate.
  - §2.2: replace the "⚠️ Fail-open when unconfigured" paragraph with the as-built fail-closed behavior (500 + loud log in production; simulation only outside production or with the explicit flag).
  - §4.2 env vars: add `ALLOW_SIMULATED_PAYMENTS` (optional, non-secret).
  - §5 (security rules) / §8.5 (known trust-boundary gaps): record the new invariant and resolve the fail-open entry.
- **`src/tests/AGENTS.md`:** add the `simulationPolicy` suite to the `api/` list; refresh suite/test counts.
- **`PRODUCTION_READINESS_TODO.md`:** mark **0.10** `[x]` with an as-built summary; annotate 0.5's "⚠️ Audit note" (fail-open) as resolved by 0.10.
- **Root `AGENTS.md` §4:** one-line addition — simulated payment paths are environment-gated (`VERCEL_ENV !== 'production'` or `ALLOW_SIMULATED_PAYMENTS=true`), never in production.

---

## 6. Verification Sequence (workflow steps 6 → 8)

1. `pnpm test` — full suite green (no regressions; new tests passing).
2. `pnpm build` — production bundle compiles.
3. `pnpm lint` + `pnpm format:check`.
4. Adversarial read-only self-review of the diff (defensive programming, runtime separation, observability, negative assertions), remediate findings, re-run 1–3.

---

## 7. Post-Approval Review Follow-ups (external code review)

An independent review approved the task ("ship it") and raised five findings. Disposition:

| # | Finding | Disposition |
| :-- | :--- | :--- |
| F1 | Duplicated token-placeholder logic across both endpoints (DRY — this repo has divergence history) | **Fixed** — `hasRealMercadoPagoToken(env)` extracted into `api/_lib/simulationPolicy.ts`; both endpoints import it (+4 unit tests). |
| F2 | Webhook `!adminDb` branch acks `200` for a *verified* payment (money collected, nothing reconciled, MP stops retrying) — same silent-degradation class | **Fixed** — same environment gate: production ⇒ `500` + loud log (MP retries), non-production unchanged (+2 webhook tests). Sibling order-not-found path left permissive (retries cannot help) and recorded as known gap #6 → Task 0.11. |
| F3 | 500-refusal relies on Mercado Pago's retry window; the only signal is `console.error` | **Accepted, no code change** — detection depends on log monitoring (Task 8.5 Sentry/GA4, still pending); recorded in the roadmap as-built note. |
| F4 | Regression test cements known gap #5's permissive ack | **Addressed** — pointer comment added in the test (`api/AGENTS.md` §8.5). |
| F5 | Plan estimated ~548 tests vs 549 actual | **Fixed** — target corrected to the final **555** tests (549 + 6 follow-up tests). |
