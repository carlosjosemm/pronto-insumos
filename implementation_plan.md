# Task 8.8: Enumeration & Abuse Throttling on Public Endpoints

**Branch:** `fix/task-8.8-enumeration-abuse-throttling` (primary working tree — no worktree)
**Base:** `main` @ **`4065bda`** — *re-based on 2026-09-29 after `origin/main` moved with **PR #26 / Task 2.11** (catalog fail-closed). `git rebase main` fast-forwarded cleanly; no conflicts, no commits on this branch yet.*
**RequestFeedback:** true · **UserFacing:** true
**Status:** **Implemented and verified — 794/794 tests (80 suites, rebased onto PR #27 / Task 2.10)**; `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit` and the `api/**` strict tsc all clean. Adversarial review rounds 1–3 returned F1–F6 / R1–R7 / M1–M3 + N1–N2; every finding is disposed of in §8–§8.2 (all fixed or explicitly accepted as a documented residual; P1–P4 pre-existing and out of scope). Awaiting the explicit **"wrap up and proceed"** command before staging/committing.
**Owner decisions:** **D1–D4 approved 2026-09-29 ("proceed")** — D1 materialized as the new roadmap item **8.16** (Firebase App Check for the public `orders` create path, P2); D2–D4 as recommended.

---

## 0. Post-Rebase Delta — What PR #26 (Task 2.11) Changed, and Why This Plan Still Holds

`main` moved from `32bc433` to `4065bda` (merge of #26, `fix(catalog): fail closed on an unavailable catalog and never revalidate the cart from fallback data`). Re-audited against the 8.8 plan:

| 2.11 change | Overlap with 8.8 | Adjustment made |
| :--- | :--- | :--- |
| `src/services/api.ts` — `fetchProducts()` rewritten to a source-aware `CatalogResult` (+135 lines) | 8.8 edits the **same file** but only `generateOrderId()` (now at `:76-81`, was `:42-44`) | Plan references re-pointed; §3.F states explicitly that the 2.11 catalog code (`CatalogResult`, `CATALOG_FETCH_TIMEOUT_MS`, the `isSimulatedFallbackAllowed()` gates) is **not touched** |
| `src/tests/services/api.test.ts` — rewritten/extended (+233 lines) | 8.8 re-points the three `PRONTO-\d{6}` assertions | New line refs recorded (`:241`, `:345`, `:380-381`); the entropy guard now extracts the **`generateOrderId` body** rather than scanning the whole file, so the assertion cannot false-positive on unrelated 2.11 code |
| Baseline: **746/746 tests, 78 suites** (was 726/76) | 8.8's §4.6 zero-regression statement + every doc that carries the count | Baseline re-verified on the rebased branch (**746/746, 78 suites, confirmed by a full run**); all count-bearing doc lines enumerated in §5 (root `AGENTS.md` carries **three** — `:14`, `:137`, `:206`; `src/tests/AGENTS.md` two — `:10`, `:30`) |
| New test suites `AppCatalog.test.tsx`, `CategoryFilter.test.tsx`; new roadmap item **6.4** (fixtures' fate, P3); `src/components/AGENTS.md`, `src/data/AGENTS.md`, `src/services/AGENTS.md` §2.2/§5 touched | None functionally | No change. 6.4 is noted as the **precedent** for D1's proposed new item 8.16 (the 2.11 owner added a follow-up item in the same PR rather than dropping the residual) |
| `PRODUCTION_READINESS_TODO.md` — 2.11 removed from §1, added to §2, baseline header refreshed, human-action list untouched | 8.8 marks its own checkbox and adds TTL human items | Plan's §5 TODO row confirmed against the new file structure; the TTL items are **new** entries in the existing human-action list |

**Conclusion: no scope, design or decision changes are required** — the 8.8 work is confined to `api/**`, `src/types/index.ts`, `generateOrderId()` and documentation; 2.11 touched the client catalog read path, the storefront components and their suites.

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **8.8 — Enumeration & Abuse Throttling on Public Endpoints** _(P1, launch blocker)_.

Three public endpoints authenticate an order with a **dual factor** (order id + RUT): `/api/track-order`, `/api/upload-voucher`, `/api/order-confirmation`. As built, they leak the first factor's validity and nothing bounds repeated abuse:

| # | Defect (as built) | Evidence (post-2.11 line refs) | Consequence |
| :-- | :-- | :-- | :-- |
| a | **Enumeration oracle:** an unknown id answers `404`, a known id with a wrong RUT answers `401` | `track-order.ts:91-103`, `upload-voucher.ts:370-387`, `order-confirmation.ts:73-93` | An attacker learns *which order ids exist* without knowing any RUT. A company RUT is public information, so a known clinic RUT + a valid id yields full PII (name, email, address, items) |
| b | **Tiny id space:** `PRONTO-` + 6 digits = 900 000 values, `Math.random()` | `src/services/api.ts:76-81` (`Math.random` is used nowhere else in the file — verified) | The oracle is walkable; collisions also surface as a rules-denied checkout error as volume grows |
| c | **Zero throttling** on any of the three endpoints | grep: no `429` / counter code exists anywhere in `api/` | Enumeration and voucher-sign spam run at request speed |
| d | **Warehouse alert is re-emailed on every voucher `confirm`** (re-upload is allowed while `TRANSFERENCIA_COMPROBANTE_SUBIDO`) | `upload-voucher.ts:268-279` | A free self-created order loops `sign → confirm` and burns the Resend free tier (3 000/month), silencing legitimate mail |
| e | **`orders` create is public and unthrottled** (client-side Firestore write) | `firestore.rules` `allow create`, no serverless hop | Blaze-billed writes; the true fix is Firebase App Check (see D1) |

The roadmap's **Required (lean, no new infra)** list is implemented in full: *one identical response for "not found" and "RUT mismatch"*, *per-IP and per-orderId attempt counters with a lockout window (Firestore counter doc)*, *widen the id space with `crypto.getRandomValues` (`PRONTO-` + 8 base32 chars)*, *dedupe/throttle warehouse emails per order*.

**Explicitly out of scope** (not in the roadmap item, deliberately not added — anti-overshooting): App Check for the public `orders` write path (D1), throttling `/api/create-preference` (it is not a PII oracle — it returns no customer data and requires a pre-existing order; noted in the as-built docs), and the `sign`-per-order cap owned by **Task 2.15** (this task's per-order attempt counter bounds it as a side effect; 2.15 keeps the orphan-object housekeeping item).

---

## 2. Human Action Items & Placeholders (TODO for Human)

No new credentials, no new environment variables, **no `.env.example` change** — the counters live in Firestore, which is already provisioned.

| # | Action | Where / command |
| :-- | :--- | :--- |
| H1 | **Enable a Firestore TTL policy** on the `abuse_counters` collection-group field `expiresAt`, so throttle documents self-delete (they are tiny, but the collection is otherwise unbounded over years) | Firebase console → Firestore → TTL, or `gcloud firestore fields ttls update expiresAt --collection-group=abuse_counters --enable-ttl` |
| H2 | Same TTL policy for the dev twin `dev_abuse_counters` (optional — dev/preview counters only) | `gcloud firestore fields ttls update expiresAt --collection-group=dev_abuse_counters --enable-ttl` |
| H3 | After deploy, watch Vercel logs for `[abuseThrottle]` lines: `throttled` (a key is locked — expected under a scripted probe), `counter unavailable` (Firestore write failure — the endpoint stays available, fail-open by design) | Manual, post-deploy |
| H4 | If a legitimate customer ever reports being locked out, the lock is **time-boxed (15 min)** and the counter doc is keyed by `{scope}_{kind}_{sha256(key)}` — no operator action is required, but the doc can be deleted to lift it immediately | Firestore console (`abuse_counters` / `dev_abuse_counters`) |

**Deployment note:** the TTL policies (H1/H2) are console/gcloud actions; the code ships safely without them (documents simply persist).

---

## 3. Proposed Changes

### 3.A `[NEW] api/_lib/abuseThrottle.ts` — the single throttling authority

Server-only module (no `import.meta.env`), Node runtime, `.js` ESM import specifiers per `api/AGENTS.md` §1.3.

```ts
export const THROTTLE_COLLECTION = 'abuse_counters'
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000   // fixed window
export const THROTTLE_LOCKOUT_MS = 15 * 60 * 1000  // lock duration once tripped
export const THROTTLE_DOC_TTL_MS = 24 * 60 * 60 * 1000  // expiresAt (H1 TTL policy)

export type ThrottleScope = 'track-order' | 'upload-voucher' | 'order-confirmation'
export type ThrottleKeyKind = 'ip' | 'order'

export const THROTTLE_POLICIES: Record<ThrottleScope, Record<ThrottleKeyKind, ThrottlePolicy>>
```

| Scope | `ip.maxAttempts` | `ip.maxFailures` | `order.maxAttempts` | `order.maxFailures` |
| :--- | :-: | :-: | :-: | :-: |
| `track-order` | 60 | 12 | 60 | 25 |
| `upload-voucher` | 40 | 12 | 30 | 25 |
| `order-confirmation` | 40 | 12 | 20 | 10 |

*Semantics (documented in code):* `maxAttempts` = requests allowed per key per 15-min window (the request that would exceed it is refused with `429`); `maxFailures` = failed lookups tolerated per key per window (the failure that reaches it trips the 15-min lock, so the *next* request is refused). A success never resets a counter — only the window does.

Exports:

| Export | Behaviour |
| :--- | :--- |
| `getClientIp(req)` | `x-real-ip` first (Vercel's proxy-computed client IP — `x-forwarded-for` is **overwritten** by Vercel to prevent spoofing, per Vercel's request-header docs), then `x-vercel-forwarded-for`, then the first `x-forwarded-for` entry; `''` when absent (the IP counter is then skipped — fail-open, logged) |
| `hashThrottleKey(raw)` | `sha256(raw).hex.slice(0,32)` — raw IPs are never stored in Firestore; also used for order ids so doc ids are uniform |
| `consumeThrottleAttempt(db, scope, kind, rawKey, now?)` | `runTransaction`: reads the counter doc, returns `{ allowed: false, retryAfterSeconds }` when locked, otherwise increments `attempts` (resetting an expired window) and locks when the attempt budget is exceeded |
| `recordThrottleFailures(db, scope, keys, now?)` | Best-effort `Promise.all` over the supplied keys (`ip`/`order`), each in a transaction: `failures + 1`, lock at the policy limit. Empty/`''` keys are skipped |
| `respondThrottled(res, retryAfterSeconds)` | `429 { error: THROTTLE_MESSAGE }` + `Retry-After` header — uniform for every endpoint, carries no order data |

- **Fail-open, loudly:** any Firestore failure inside a counter call logs `[abuseThrottle] …` and allows the request. A throttle outage must never take order tracking down — the lookup itself still requires a matching id **and** RUT.
- **Doc id:** `{scope}_{kind}_{hash}` in `getCollectionName('abuse_counters')` → `dev_abuse_counters` in development, `abuse_counters` in production (same isolation rule as every other collection).
- **Doc shape:** `{ scope, kind, attempts, failures, windowStartedAt, lockedUntil, updatedAt, expiresAt: Timestamp }` — plain epoch-ms numbers plus one `Timestamp` for the TTL policy.

### 3.B `[MODIFY] api/_lib/orderLookup.ts` — the uniform failure contract

```ts
export const ORDER_LOOKUP_FAILED_STATUS = 404
export const ORDER_LOOKUP_FAILED_MESSAGE =
  'No encontramos un pedido con ese código y RUT. Revisa los datos o escríbenos por WhatsApp.'
export function respondOrderLookupFailed(res: VercelResponse): VercelResponse
```

One status (`404`), one message, byte-identical for "no such order" **and** "RUT mismatch" — the response no longer echoes the order id or hints at which factor failed. All three endpoints import it, so the contract cannot drift.

### 3.C `[MODIFY] api/track-order.ts`

1. Keep `OPTIONS`/`405`/`400` gates and the Task 0.16 fail-closed Admin gate unchanged.
2. After the Admin gate: `consumeThrottleAttempt(db, 'track-order', 'ip', getClientIp(req))` → `respondThrottled` on lock; then the same for `'order'` with `cleanOrderId`.
3. Replace the `404` / `401` pair with `respondOrderLookupFailed(res)` for **both** `!resolvedOrder` and the RUT mismatch, after `recordThrottleFailures(db, 'track-order', { ip, order })`.
4. Success path unchanged (still returns the sanitized 5-stage payload).

### 3.D `[MODIFY] api/order-confirmation.ts`

Same shape as 3.C: IP + order attempt counters before the lookup, uniform `404` for both failure modes, `recordThrottleFailures` on failure. This is also what bounds the *email* abuse — an attacker's own order can trigger at most one confirmation (existing `confirmationEmailSentAt` idempotency) and the IP/order counters cap how many such calls one source can make per window.

### 3.E `[MODIFY] api/upload-voucher.ts`

1. **Throttling** (scope `upload-voucher`) placed after the Admin/bucket gate and before `resolveOrderByCanonicalId`, so both `sign` and `confirm` are covered — this also bounds the Task 2.15 "unlimited signed URLs per order" concern.
2. **Uniform failure:** the `404` / `401` pair becomes `respondOrderLookupFailed(res)` + `recordThrottleFailures`. The lifecycle `409` (which already requires a valid id **and** RUT) and the path-safety `400`s are unchanged.
3. **Warehouse alert dedupe/throttle per order** — new pure helper inside the module:

   ```ts
   const VOUCHER_ALERT_COOLDOWN_MS = 5 * 60 * 1000
   const VOUCHER_ALERT_MAX_PER_ORDER = 5
   function evaluateVoucherAlertBudget(orderData, now): { send: boolean; nextCount: number; reason?: string }
   ```

   - Reads `voucherAlertSentAt` / `voucherAlertCount` from the **fresh** order snapshot captured inside the confirm transaction (`latestData`).
   - **Reserves** the slot inside that same transaction (the stamp is committed with the voucher), so two concurrent confirms of different objects serialize on the order document — a stamp written only after the send let both pass (review F2).
   - Skips (with a `console.warn`) when the last alert is younger than the cooldown, when the per-order cap is reached, or when no warehouse recipient is configured.
   - After the transaction: send, and on a **failed** send release the reservation with a compare-and-swap transaction (restore the previous values, or `FieldValue.delete()` when the fields did not exist) so the alert stays retryable and a newer concurrent reservation is never clobbered (review M1).
   - The idempotent same-object re-confirm path is untouched (it still sends nothing).

### 3.F `[MODIFY] src/services/api.ts` — widen the id space (2.11-safe)

```ts
/** Crockford base32 (no I, L, O, U) — 8 chars = 40 bits ≈ 1.1 × 10¹² ids. */
const ORDER_ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ORDER_ID_LENGTH = 8

export function generateOrderId(): string {
  const bytes = new Uint8Array(ORDER_ID_LENGTH)
  crypto.getRandomValues(bytes)          // CSPRNG; 256 % 32 === 0 → zero modulo bias
  return 'PRONTO-' + Array.from(bytes, (b) => ORDER_ID_ALPHABET[b % 32]).join('')
}
```

- **Scope guard:** this edit replaces `generateOrderId()` (now `:76-81`) and its doc comment only. The Task 2.11 catalog code in the same file (`CatalogSource`/`CatalogResult`, `CATALOG_FETCH_TIMEOUT_MS`, the `isSimulatedFallbackAllowed()` branches, the guarded text-field reads) is **not modified** — the diff for this file must stay confined to that one function.
- `crypto.getRandomValues` is a Web Crypto global available in every browser (including non-secure contexts) and in Node ≥ 19 (the repo runs Node 22.12; jsdom provides it for Vitest).
- Legacy `PRONTO-NNNNNN` orders keep working — nothing parses the id format server-side; the lookup is an exact doc-key/field match.
- **No `firestore.rules` change:** the create contract already allows `orderId.size() <= 32` (new id = 15 chars) and binds the field to the document key. Adding a format regex was considered and rejected: it would only constrain *self-created* ids, would reject nothing an attacker cares about, and would risk breaking a stale open checkout tab during deploy.
- Client copy that shows the old example is updated in the same commit: `src/services/orderTracking.ts:22`, `src/components/OrderTrackingModal.tsx:251`, `src/components/CheckoutModal.tsx:306` (comment), `src/components/LegalModal.tsx:199` (`PRONTO-XXXXXX` → `PRONTO-XXXXXXXX`).

### 3.G `[MODIFY] src/types/index.ts` — order document contract

Add to `Order` (documented as server-written, never client-written):

```ts
voucherAlertSentAt?: string   // ISO — last warehouse "voucher received" alert
voucherAlertCount?: number    // alerts sent for this order (dedupe/throttle, Task 8.8)
```

### 3.H `[NEW] src/tests/api/helpers/throttleCounters.ts` — shared counter double

A tiny in-memory Firestore double for the `abuse_counters` documents (`collection(name).doc(id)` refs + a `runTransaction` whose `get`/`set` dispatch on the ref path), so the three endpoint suites exercise the **real** counter code instead of silently fail-opening. Non-test helper module (Vitest only collects `*.test.{ts,tsx}`), documented in `src/tests/AGENTS.md`.

### 3.I `[DELETE]` — none.

---

## 4. Robust Unit Testing Plan (MANDATORY)

All boundaries mocked (`firebase-admin` Admin SDK doubles, `global.fetch`); no live Firestore/Resend/MP calls. Deterministic time via injected `now`.

### 4.1 `[NEW] src/tests/api/abuseThrottle.test.ts` (~15 tests)

| # | Case |
| :-- | :--- |
| 1–3 | `getClientIp`: `x-real-ip` wins over a spoofed `x-forwarded-for`; `x-vercel-forwarded-for` fallback; first `x-forwarded-for` entry; `''` when no headers |
| 4–5 | `hashThrottleKey`: deterministic, 32 hex chars, never contains the raw value (no PII at rest) |
| 6 | `consumeThrottleAttempt` allows exactly `maxAttempts` requests and refuses the next with `retryAfterSeconds` |
| 7 | A locked key refuses **without** incrementing (`attempts` unchanged, no write) |
| 8 | Window expiry resets `attempts`/`failures` (injected `now` beyond `THROTTLE_WINDOW_MS`) |
| 9–10 | `recordThrottleFailures` locks at `maxFailures`; skips empty/undefined keys (no `''` bucket) |
| 11 | IP and order keys are independent documents (scope + kind in the doc id) |
| 12 | `expiresAt` is a `Timestamp` (the TTL-policy contract) |
| 13–14 | **Fail-open:** a throwing `runTransaction`/`get` ⇒ `{ allowed: true }` / no throw + loud `console.error` |
| 15 | `respondThrottled` sets `429`, `Retry-After`, and the uniform message |

### 4.2 `[MODIFY] src/tests/api/track-order.test.ts` (+5)

- **Uniform errors (the roadmap's Verify item):** unknown id and RUT mismatch return a **deep-equal** `{ error }` body with the same `404` — and the serialized response contains neither the order id nor a hint of which factor failed.
- **Lockout after N failures:** driving `maxFailures` failures locks the key; the next request returns `429` and **never touches the order collection** (asserted on the mock).
- Locked IP vs locked order key (both paths).
- Failure recording: a mismatch increments both the IP and order counter docs; a success increments attempts only.
- Success path regression: the existing 200 payload tests stay green (re-pointed to the counter-capable mock).

### 4.3 `[MODIFY] src/tests/api/order-confirmation.test.ts` (+4)

Uniform `404` for both failure modes (deep equal), `429` on a locked IP key, failure counters recorded, and the existing email/idempotency/stamp tests unchanged.

### 4.4 `[MODIFY] src/tests/api/upload-voucher.test.ts` (+6)

- Uniform `404` for both failure modes; `429` on lock (sign **and** confirm phases).
- **Warehouse dedupe/throttle:** a second confirm of a *new* object inside the cooldown ⇒ **no** second Resend call + warn; an alert older than the cooldown ⇒ sent again with `voucherAlertCount` incremented; at the cap ⇒ skipped.
- Stamp-after-send: a failing Resend send writes **no** `voucherAlertSentAt` (retry stays possible).
- The existing same-object duplicate-confirm test still asserts **zero** alerts.

### 4.5 `[MODIFY] src/tests/services/api.test.ts` + `[MODIFY] src/tests/api/orderLookup.test.ts`

- `generateOrderId` format: `/^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$/`, 200 consecutive draws unique; re-point the three existing `PRONTO-\d{6}` assertions (`api.test.ts:241`, `:345`, `:380-381`) and the test name.
- **Entropy guard (content assertion, same pattern as the `bankDetails`/`firestore-rules` suites):** read `src/services/api.ts`, **extract the `generateOrderId` function body**, and assert it contains `crypto.getRandomValues` and does **not** contain `Math.random` — scoped to that function so the Task 2.11 catalog code in the same file can never trip it.
- `orderLookup`: `respondOrderLookupFailed` emits the single contract message/status.

### 4.6 Zero-regression statement

Baseline re-verified on the rebased branch before any edit: **746 / 746 passing (78 suites)** (full `pnpm test` run, 2026-09-29). Target: all pre-existing tests plus ~30 new/updated ones green, `pnpm test && pnpm build && pnpm lint && pnpm format:check && pnpm exec tsc --noEmit`, plus the `api/**` strict type-check used by Task 0.14 (`--strict --target es2022 --module esnext --moduleResolution bundler --types node --skipLibCheck`).

---

## 5. As-Built Documentation & Roadmap Sync Plan

| File | Update |
| :--- | :--- |
| `api/AGENTS.md` | New **§3.4 "Abuse Throttling & the Uniform Lookup-Failure Contract (Task 8.8)"** (policies table, fail-open semantics, doc shape, TTL human item); endpoint table rows for the three endpoints; §3.1/§3.2 auth lines (`401` → uniform `404`); §4.4 gains the warehouse-alert budget; **§8.5 gap 4 ("No rate limiting") marked RESOLVED** with the residual App Check note |
| `src/services/AGENTS.md` | §2.1 rewritten (`PRONTO-` + 8 Crockford base32 chars, `crypto.getRandomValues`, 40 bits, legacy ids still resolve) + the `api.ts` module-row wording |
| `src/types/AGENTS.md` | `Order` gains `voucherAlertSentAt` / `voucherAlertCount` |
| `src/components/AGENTS.md` | Order-id references in the `CheckoutModal`/`OrderTrackingModal` sections (`PRONTO-XXXXXXXX`) |
| `src/admin/AGENTS.md` | Search-by-id line (`PRONTO-XXXXXXXX`) |
| `src/tests/AGENTS.md` | New `abuseThrottle` suite + the `helpers/` folder in the `api/` line (11 → 12 suites), and **both** count lines (`:10`, `:30`) |
| root `AGENTS.md` | §4 bullet recording the throttling authority + uniform failure contract + the id format; **all three** count lines (`:14`, `:137`, `:206`) |
| `PRODUCTION_READINESS_TODO.md` | Mark **8.8 `[x]`**, remove its row from §1, add it to §2 (next to the 2.11 entry), refresh the baseline header (suite/test counts), add H1/H2 to the human-action list; add **D1's new item 8.16** if approved (the 2.11 PR's new **6.4** is the precedent for this) |

---

## 6. Decisions & Open Questions for the Owner

| # | Decision | Recommendation |
| :-- | :--- | :--- |
| **D1** | The residual `orders`-create abuse (defect **e**) cannot be fixed without **Firebase App Check** (reCAPTCHA v3 + console enforcement) — a human-provisioned Firebase feature, outside this item's "lean, no new infra" list. Record it as a new roadmap item (**8.16**, P2) so it stays visible? | **Yes — add 8.16 (P2)**, mirroring how 2.11 added 6.4. Documented here and in `api/AGENTS.md` §8.5 either way |
| **D2** | Lockout limits (window 15 min, lockout 15 min; per-endpoint numbers in §3.A) | **As tabulated.** `maxFailures` for `order-confirmation`'s order key is deliberately the tightest (10) — that key's only legitimate use is a handful of retries for a *just-created* order; `track-order`'s is the loosest (25) so a customer mistyping their RUT is not locked out of their own order |
| **D3** | Uniform failure = **`404`** with one message (was `404` / `401`) | **404.** "The (id, RUT) pair does not match an order" is the honest semantic; the client already renders the server message verbatim, and no caller branches on `401` |
| **D4** | Warehouse alert budget: 5-min cooldown **and** 5 alerts max per order | **Approved, implementation hardened by review F2:** the budget is now decided **inside** the confirm transaction (a reservation written with the voucher, released best-effort when the send fails), so two concurrent confirms of different objects serialize on the order document instead of both passing the budget |

---

## 7. Execution Log

| Step | State |
| :--- | :--- |
| 1. `api/_lib/abuseThrottle.ts` + its suite | ✅ done (20 tests) |
| 2. `api/_lib/orderLookup.ts` + the three endpoints + `helpers/throttleCounters.ts` + suite updates | ✅ done |
| 3. `generateOrderId()` (2.11-safe, function-scoped diff) + client copy + `Order` fields + suite updates | ✅ done |
| 4. Full gates (`test`, `build`, `lint`, `format:check`, `tsc --noEmit`, `api/` strict tsc) | ✅ all clean |
| 5. Adversarial review round 1 → F1–F6 | ✅ received; disposition in §8 |
| 6. Remediate round 1 + re-verify + as-built docs + roadmap checkbox | ✅ done |
| 7. Adversarial review round 2 → R1–R7 | ✅ received; disposition in §8.1 |
| 8. Remediate round 2 + re-verify | ✅ done |
| 9. Adversarial review round 3 → M1–M3, N1–N2 | ✅ received; disposition in §8.2 |
| 10. Remediate round 3 + final gates | ✅ done — **794/794**, all gates clean |
| 11. Await the explicit **"wrap up and proceed"** before staging/committing | ⏳ waiting on the owner |

---

## 8. Adversarial Review — Findings & Disposition (round 1, 2026-09-29)

Verdict: **APPROVE WITH FINDINGS** — one MAJOR (the as-built guides still documented the pre-8.8 contract), two MINOR, three NITs; two pre-existing issues explicitly out of scope.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| F1 | MAJOR | As-built guides still described the pre-8.8 contract (the `401` split, "no rate limiting", the removed `Math.random` generator as "as built"), the counts were stale, and the plan's §5 file list was incomplete | **Fixed** — `api/AGENTS.md` (endpoint table, §2.1, §3.1, §3.2, new §3.4, §4.4, §8.1, §8.5 gap 4), `src/services/AGENTS.md` §2.1 rewritten, `src/types/AGENTS.md`, `src/components/AGENTS.md`, `src/admin/AGENTS.md`, `src/utils/AGENTS.md`, root `AGENTS.md` (§4 bullet + all three count lines), `src/tests/AGENTS.md` (counts + the `api/` suite line), `PRODUCTION_READINESS_TODO.md` (8.8 → §2, baseline 783/79, H1/H2 TTL human items, new 8.16, 2.15 cross-reference) — **plus the four files §5 missed**: `api/_lib/voucherStorage.ts:62,82`, `PROJECT_ASSESSMENT_AND_ROADMAP.md:45`, `ADMIN_PORTAL_PLAN.md:403`, `src/utils/AGENTS.md:104,117` |
| F2 | MINOR | The warehouse-alert budget was evaluated outside the confirm transaction, so two concurrent confirms of different objects could both send (the "one alert per cooldown" comment over-promised) | **Fixed** — the budget is now decided **inside** the confirm transaction and reserved with the voucher (`voucherAlertSentAt`/`voucherAlertCount` in the same `transaction.update`), so the SDK's transaction retry serializes the losers onto the fresh stamp; a failed send releases the reservation (best-effort, logged) so the alert stays retryable. Two tests pin it: the in-transaction cooldown skip (`transactionData` carries a fresh stamp) and the failed-send release |
| F3 | MINOR | `implementation_plan.md` still said "awaiting approval / no source edit" | **Fixed** — this header + §7 execution log + this disposition table |
| F4 | NIT | The entropy content guard sliced from the function to EOF (8 990 chars) although the plan claimed function scope | **Fixed** — the slice is now bounded to the `generateOrderId` body (next top-level `export`), so unrelated 2.11 code can never trip it |
| F5 | NIT | `api/_lib/voucherStorage.ts` comments still called `PRONTO-NNNNNN` the canonical form | **Fixed** — `PRONTO-XXXXXXXX` (8 Crockford base32; legacy ids still resolve) in both comments |
| F6 | NIT | `sha256(ip)` described as "no raw IP" could be read as anonymization | **Fixed** — the `hashThrottleKey` doc comment now states it is a **pseudonym** (brute-forceable over the IPv4 space), not anonymization; no HMAC secret added (anti-overshoot) |
| P1 | pre-existing | `track-order` / `order-confirmation` return raw driver error text on a 500 | **Out of scope** (untouched by this diff; the throttle runs before the lookup and does not widen it). Noted for a future hardening pass |
| P2 | pre-existing | `order-confirmation` returns `200 { success: true }` when Firestore Admin is unavailable | **Out of scope** (pre-existing, unchanged by this diff) |

**Verified by the reviewer:** gates green, `api/**` strict tsc clean, the oracle closed in all three endpoints, the Vercel IP-header precedence backed by Vercel docs + the `@vercel/functions` source, the Firestore Admin API shapes confirmed against the installed typings, no new dependency/function slot, runtime separation intact, money invariants untouched. **Assumed/not verified:** the TTL policy is a human action; the F2 race was not reproduced against live Firestore (code-path analysis, now structurally closed); no preview/production deploy was performed.

### 8.1 Round 2 (post-remediation) — Findings & Disposition

Verdict: **APPROVE WITH FINDINGS** — one MAJOR left by the round-1 F1 sweep, three MINOR in the new reservation, three NITs.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| R1 | MAJOR | Two artifacts still pinned the removed `401` RUT-mismatch contract: `src/services/AGENTS.md:163` enumerated `400/401/409/413/500/503`, and `src/tests/services/transferVoucher.test.ts` had a "surfaces a 401 RUT mismatch" test | **Fixed** — the guide now enumerates `400/404/409/413/429/500/503` with the uniform-`404` note, and the test is renamed/re-pointed to the real `404` + uniform message |
| R2 | MINOR | `src/types/index.ts` described the alert stamp as "only after a successful send" — the pre-F2 design | **Fixed** — the comment now documents the reservation (written inside the confirm transaction, released best-effort on a failed send) |
| R3 | MINOR | With `WAREHOUSE_NOTIFICATION_EMAIL` unset the reservation was still committed, consuming a cap slot for an alert that could never be sent | **Fixed** — `alertsEnabled` is computed before the transaction and the budget short-circuits to `no warehouse recipient configured`; new test asserts no reservation fields on the order update |
| R4 | MINOR | The per-order failure lockout is a *sustained* DoS on a legitimate customer's own order (an attacker who knows a semi-public id can re-arm it every window) | **Accepted + documented** in `api/AGENTS.md` §3.4 as a deliberate availability tradeoff (the alternative — no order-key lock — removes the per-order bound; a shorter order lockout is a one-line policy change if it ever bites). D2 stays as the owner approved it |
| R5 | NIT | The release path wrote `voucherAlertSentAt: ''` / `voucherAlertCount: 0` onto orders that never had the fields | **Fixed** — the release uses `FieldValue.delete()` for values that were absent (test asserts the sentinel via `isEqual`) |
| R6 | NIT | Dead `reason` in the `alertBudget` initializer (unreachable state) | **Fixed** — initialized to `{ send: false, nextCount: 0 }` |
| R7 | NIT | The two new server-only fields were missing from the admin-only drift guards | **Fixed** — `voucherAlertSentAt`/`voucherAlertCount` added to `ADMIN_ONLY_FIELDS` (`orderCreateContract.test.ts`) and the `firestore-rules.test.ts` allowlist loop |
| P3 | pre-existing | The uniform-404 arms differ in cost (an unknown id also runs the legacy `where` query) → a theoretical timing channel | **Out of scope** — not practical against 40-bit ids; noted by the reviewer as "no action requested" |

### 8.2 Round 3 (post-round-2 remediation) — Findings & Disposition

Verdict: **APPROVE WITH FINDINGS** — three MINOR robustness/doc gaps in the new reservation + two NIT doc-drift items; nothing blocking.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| M1 | MINOR | The failed-send *release* was a non-transactional overwrite from the pre-commit snapshot, so it could clobber a reservation a concurrent confirm had committed meanwhile (a narrower re-run of the F2 race) | **Fixed** — the release is now a compare-and-swap transaction: it re-reads the order and only restores/deletes when the stored stamp+count still equal what this request reserved; otherwise it logs `superseded` and leaves them. New test drives the interleaving via two chained transaction snapshots (the double now returns copies, like the SDK, and applies transaction updates to a mutable state) |
| M2 | MINOR | Counter-document growth is bounded only by a TTL policy that the docs framed as optional, although one document is written per distinct — attacker-chosen — order key | **Fixed (framing)** — the TTL policy is now a **deploy prerequisite** in `PRODUCTION_READINESS_TODO.md` (human item) and `api/AGENTS.md` §3.4. The optional "record the order-key failure only when the order resolved" reduction was **declined**: it would drop the per-order bound for exactly the enumeration case (unknown ids), trading the primary control for a storage saving |
| M3 | MINOR | The shared-IP collateral lockout (office NAT / Chilean CGNAT: one locked IP refuses every caller behind it for 15 min) was the one availability residual not stated | **Accepted + documented** — new residual bullet in `api/AGENTS.md` §3.4 (mirrors the R4 order-key tradeoff; the mitigation is a one-line policy change) |
| N1 | NIT | `implementation_plan.md` §3.E still described the pre-F2 stamp-after-send design | **Fixed** — §3.E now describes the reservation, the M1 compare-and-swap release and the no-recipient short-circuit |
| N2 | NIT | Two `PRODUCTION_READINESS_TODO.md` lines still carried `PRONTO-NNNNNN` (the 0.3 resolved row and open task 8.13, with a stale `CheckoutModal.tsx:286` reference) | **Fixed** — both now read `PRONTO-XXXXXXXX` (0.3 notes the legacy format); 8.13 re-pointed to `CheckoutModal.tsx:306-307` |

