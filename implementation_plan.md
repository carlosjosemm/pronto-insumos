# Task 2.12: Payment-Return Modal Claims Success From URL Parameters Alone

**Branch:** `fix/task-2.12-payment-return-trust-gap` (primary working tree — no worktree)
**Base:** `main` @ **`eaf79da`** (clean, in sync with `origin/main` — verified `git log HEAD..origin/main` empty before branching)
**RequestFeedback:** true · **UserFacing:** true
**Status:** **Implemented and verified — 817/817 tests (81 suites)**; `pnpm build`, `pnpm lint`, `pnpm format:check` and `pnpm exec tsc --noEmit` all clean. Adversarial review round 1 returned R1–R8 + P1–P2; every finding is disposed of in §8 (R1–R5 fixed, R6 accepted + documented, R7/R8/P2 fixed, P1 pre-existing and out of scope). Awaiting the explicit **"wrap up and proceed"** command before staging/committing.
**Owner decisions:** **Proceed** approved 2026-09-29, with **D2 extended by the owner: the `Ver estado del pedido` action goes on all three states** (approved, pending **and** failure). D1/D3/D4 as recommended.

---

## 1. Context & Problem Statement

Reference: [`PRODUCTION_READINESS_TODO.md`](./PRODUCTION_READINESS_TODO.md) → **2.12 — Payment-Return Modal Claims Success From URL Parameters Alone** _(P2, not a launch blocker)_.

### 1.1 What is wrong today

`/?status=approved&orderId=…` is a **trivially forgeable** URL — and it is also the exact URL Mercado Pago is told to return the shopper to (`api/create-preference.ts:230-234`, `back_urls.success`) **before our webhook has verified anything**. The storefront treats that query string as proof of payment:

| # | Defect (as built) | Evidence |
| :-- | :-- | :-- |
| a | The modal asserts a completed payment: `¡Pago Confirmado Exitosamente!`, `Tu transacción ha sido acreditada vía Mercado Pago Chile / Webpay`, `● Pago Acreditado (PAGADO)` | `src/components/PaymentReturnModal.tsx:84-88`, `:120` |
| b | The URL is parsed straight into that state, with no server round-trip | `src/App.tsx:50-98` (`parseUrlBootstrap`) → `:140` (`paymentReturn`) |
| c | The same flag **empties the shopper's cart**: both lazy initializers bail out to empty when `approved`, and the mount effect purges storage | `src/App.tsx:123-127`, `:134-138`, `:240` |

### 1.2 Why it matters (and why it is only P2)

The claim is **not** backed by the payment authority — only the verified webhook may mark `PAGADO_MERCADOPAGO` (root [`AGENTS.md`](./AGENTS.md) §4). Nothing is corrupted server-side (no stock moves, no status flips, no money is claimed), but:

* a customer (or a staff member reading over their shoulder) is told the payment is accredited when it may still fail, be refunded, or never have existed;
* a crafted or stale return link **destroys a real cart with no order behind it** — a genuine data-loss path for the shopper;
* the honest, already-built answer to "did my payment go through?" is the dual-factor tracking flow (`/api/track-order` + `OrderTrackingModal`), which the modal never offers.

### 1.3 The roadmap's required fix (implemented verbatim, no more)

> **Fix:** soften the copy to what is actually known ("Recibimos tu retorno de pago; confirmaremos por correo cuando se acredite") and add the `Ver estado del pedido` action (tracking needs the RUT the customer already typed); clear the cart only when a matching order was just created in this session.

### 1.4 Explicitly out of scope (anti-overshooting)

* **No server-side verification of the return URL.** `/api/track-order` already requires the order id **+ RUT**; the modal has only the id, and adding a public "is this order paid?" endpoint keyed by the id alone would re-open exactly the enumeration oracle Task 8.8 closed. The modal stays advisory; the authority remains the webhook + email + tracking.
* **No change to `api/**`, `firestore.rules`, order statuses, or payment flow.** The backend is already correct (Task 0.14).
* **The `failure` branch keeps its retry/transfer CTA as the primary action** (it claims no money moved) — but per the owner's decision it now **also** carries the `Ver estado del pedido` secondary action, so a declined payment whose order *was* registered (`PENDIENTE_PAGO_MERCADOPAGO`) can still be tracked. The tracking action therefore appears on **all three** states — see D2.
* **No new state library, no new dependency, no CSS framework** — one tiny browser-storage module and copy/UX edits.

---

## 2. Human Action Items & Placeholders (TODO for Human)

**No new credentials, no new environment variables, no `.env.example` change.** Nothing in this task needs a secret, an external console action, or a DNS change.

| # | Action | Where |
| :-- | :--- | :--- |
| H1 | Review the softened Spanish copy (§3.4) — it is the customer-facing wording of a legal-adjacent claim, so the owner should confirm the phrasing. The strings are plain JSX text, text-only edits afterwards | This plan, §3.4 |
| H2 | Deploy as usual (`pnpm dlx vercel@latest deploy --prod`) once merged — no migration, no rules change, no storage change | Terminal |

*(The pre-existing human items — `pnpm run deploy:rules` for 0.12, the production storage check for 2.9, the optional dev TTL policy for 8.8 — are unchanged and **not** part of this task.)*

---

## 3. Proposed Changes

### 3.1 Files

| Action | File | Purpose |
| :-- | :-- | :-- |
| **[NEW]** | `src/services/orderSession.ts` | ~45-line sessionStorage helper: remembers the canonical order id **this tab created** and answers "is this returned id mine?" |
| **[MODIFY]** | `src/App.tsx` | `parseUrlBootstrap()` gains `clearsCart` (approved **and** the returned id matches this tab's order); the mount effect consumes the marker (`forgetSessionOrderId`) on a match; `PaymentReturnModal` gets `onTrackOrder` wired to the tracking modal. `handleOrderSuccess` is **unchanged** from `main` |
| **[MODIFY]** | `src/components/CheckoutModal.tsx` | `rememberSessionOrderId(result.orderId)` immediately after a successful `submitOrder()` — before payment initiation, so the redirect can never outrun the marker (review R4) |
| **[MODIFY]** | `src/components/PaymentReturnModal.tsx` | Truthful `approved`/`pending` copy + `Ver estado del pedido` action + `onTrackOrder?: () => void` prop |
| **[MODIFY]** | `src/tests/services/orderSession.test.ts` *(new suite)*, `src/tests/components/AppPaymentReturn.test.tsx`, `src/tests/components/AppCartPersistence.test.tsx`, `src/tests/components/PaymentReturnModal.test.tsx` | See §4 |
| **[MODIFY]** | `src/services/AGENTS.md`, `src/components/AGENTS.md`, `src/tests/AGENTS.md`, `AGENTS.md`, `PRODUCTION_READINESS_TODO.md` | As-built docs + counts + checkbox (§5) |

**No `[DELETE]`.** No type change in `src/types/index.ts` (nothing new is persisted in Firestore).

### 3.2 `src/services/orderSession.ts` — the session marker (D1)

```ts
export const SESSION_ORDER_STORAGE_KEY = 'pronto_session_order_v1'

/** Records the canonical order id created by this tab (Task 2.12). */
export function rememberSessionOrderId(orderId: string): void
/** The canonical order id this tab created, or null. */
export function getSessionOrderId(): string | null
/** True when `orderId` names the order this tab created (trim + upper-case normalized). */
export function isSessionOrder(orderId: string | null | undefined): boolean
```

* **`sessionStorage`, not `localStorage`:** the marker is per-tab and dies with the tab, matching "in this session". Mercado Pago's Checkout Pro redirect is a **same-tab** `window.location.href` hop (`src/services/mercadopago.ts:100`), so the marker survives the round trip; a different tab's forged link can never match it.
* **Defensive by construction** (mirrors `cartStorage.ts`): `typeof window === 'undefined'` / missing `sessionStorage` / a throwing storage (`QuotaExceededError`, Safari private mode) → no throw, `getSessionOrderId()` → `null`, `isSessionOrder()` → `false` (fail-safe: no clear, no crash).
* **Why a module and not inline `sessionStorage` calls in `App.tsx`:** the comparison rule (normalization, empty/null handling, storage absence) is the security-relevant part and must be unit-testable without rendering the app — same rationale as `cartStorage.ts`.
* **No TTL needed** — the storage itself is scoped to the tab's lifetime.

### 3.3 `src/App.tsx` — clear the cart only for our own order

```ts
interface UrlBootstrap {
  hasParams: boolean
  /** Task 2.12: true only when the return URL names the order THIS tab just created. */
  clearsCart: boolean
  paymentReturn: { … }
  tracking: { … }
}
```

* `parseUrlBootstrap()` keeps its module-scope/lazy-initializer contract (root `AGENTS.md` §8.4 — **not** moved into an effect): it normalizes the returned id (`trim().toUpperCase()`) and computes
  `clearsCart = status === 'approved' && isSessionOrder(normalizedOrderId)`.
* The `cart` / `appliedPromo` lazy initializers and the mount effect now key off `bootstrap.clearsCart` instead of `bootstrap.approved` (`App.tsx:124`, `:135`, `:240`). A forged/unknown/stale return URL therefore **preserves** the cart; the URL is still sanitized by `history.replaceState()` exactly as today (`hasParams` is unchanged).
* A matched return also calls `forgetSessionOrderId()` (review R5) so replaying the URL from history/bookmarks cannot wipe a cart refilled after paying.
* `handleOrderSuccess` keeps its `main` signature; the marker is written by `CheckoutModal` at the creation point (see §3.2 / review R4).
* `PaymentReturnModal` gains `onTrackOrder`, wired to the existing `handleOpenTracking(paymentReturn.orderId)` after closing the payment modal — the tracking modal then opens with the order id prefilled.

### 3.4 `src/components/PaymentReturnModal.tsx` — copy + action

| Element | As built (approved) | Proposed |
| :-- | :-- | :-- |
| Title | `¡Pago Confirmado Exitosamente!` | **`Recibimos tu Retorno de Pago`** |
| Body | `Tu transacción ha sido acreditada vía Mercado Pago Chile / Webpay.` | **`Mercado Pago nos informó un pago aprobado. Estamos confirmando la acreditación con nuestro servidor de pagos y te avisaremos por correo electrónico en cuanto quede registrada en tu pedido.`** |
| Status row | `● Pago Acreditado (PAGADO)` | **`● Verificando acreditación`** |
| Boleta note | `Tu Boleta Electrónica (IVA 19%) será emitida…` | **`Una vez acreditado el pago, emitiremos tu Boleta Electrónica (IVA 19%) y la enviaremos al correo electrónico registrado.`** |
| WhatsApp CTA | `Coordinar Despacho por WhatsApp` (green primary) | **kept**, prefilled text softened (`COORDINACIÓN DE PEDIDO`; "realicé el pago … quisiera confirmar los tiempos y condiciones de entrega") |
| New action | — | **`Ver estado del pedido`** (`btn-secondary`, `PackageSearch` icon) → `onTrackOrder()`, rendered only when `orderId && onTrackOrder` |
| Order/payment id rows, `Continuar en la Tienda`, Escape/overlay/close behaviour | — | unchanged |

`pending` gains the same **`Ver estado del pedido`** secondary action above `Entendido, Volver a la Tienda`; its copy is already truthful ("Mercado Pago está validando…") and stays. `failure` keeps `Reintentar / Opciones de Pago` as its primary and gains the tracking action as a secondary button, so all three states offer the same honest self-service path (D2 — owner decision, 2026-09-29).

**Decision D3 — no RUT is stored or prefilled.** Tracking stays dual-factor: the modal prefills only the order id, and the customer types the RUT they already know (the roadmap's parenthetical). Persisting a RUT in browser storage would be new PII at rest for a UX shortcut the task does not ask for.

### 3.5 Deliberate non-changes (guardrail check)

* No new dependency (no state library, no date/util lib) — `lucide-react@^1.25.0` already provides `PackageSearch`.
* No inline hex in the new styles: `var(--…)` tokens only (`btn-secondary` reuses the existing class).
* No `api/**` edit, no rules edit, no new Firestore field, no CLP/RUT/IVA surface touched.
* No `VITE_*` variable added.

---

## 4. Robust Unit Testing Plan (MANDATORY)

All suites mock at the boundary (Firebase/Firestore and `fetch` are already mocked in the affected suites); **no test may hit a network or a real storage backend**. Target: full suite green, ~5 s runtime.

### 4.1 `src/tests/services/orderSession.test.ts` — [NEW] (~10 cases)

| # | Case | Asserts |
| :-- | :-- | :-- |
| 1 | `rememberSessionOrderId('PRONTO-ABCD1234')` then `getSessionOrderId()` | returns the canonical id; the key is `pronto_session_order_v1` |
| 2 | `rememberSessionOrderId('  pronto-abcd1234 ')` | stored/normalized upper-case-trimmed (no duplicate-format drift vs. the URL param) |
| 3 | `isSessionOrder` with the exact id / lower-case / padded | `true` in all three |
| 4 | `isSessionOrder` with a different id, `''`, `null`, `undefined` | `false` — **never throws** |
| 5 | No marker stored | `getSessionOrderId()` → `null`, `isSessionOrder(anything)` → `false` |
| 6 | `rememberSessionOrderId('')` / non-string (`@ts-expect-error`) | no marker written, no throw |
| 7 | `sessionStorage.setItem` throws (quota/private mode) | no throw + `console.warn` (spy) |
| 8 | `window.sessionStorage` absent (`Object.defineProperty` to `undefined`, restored in `afterEach`) | no throw; `null` / `false` (fail-safe) |
| 9 | `getSessionOrderId` when `getItem` throws | `null` + warn, no throw |
| 10 | Marker survives a re-read; overwriting a second order id wins | last order created in the tab is the match |

### 4.2 `src/tests/components/PaymentReturnModal.test.tsx` — [MODIFY]

| # | Case | Asserts |
| :-- | :-- | :-- |
| 1 | `approved` render (updated) | new title/body present; **no** `¡Pago Confirmado Exitosamente!`, **no** `Pago Acreditado (PAGADO)`, **no** `/acreditada vía Mercado Pago/` (negative assertions pin the softened copy) |
| 2 | `approved` + `onTrackOrder` + `orderId` | `Ver estado del pedido` renders; click → `onTrackOrder` called once |
| 3 | `approved` **without** `onTrackOrder` prop | the action is **not** rendered (no dead button) |
| 4 | `approved` **without** `orderId` | the action is **not** rendered |
| 5 | `pending` + `onTrackOrder` | action renders and fires; existing `Entendido, Volver a la Tienda` still closes |
| 6 | `failure` + `onTrackOrder` | decline copy unchanged; `Reintentar / Opciones de Pago` and `Cerrar` still work; the tracking action renders and fires |
| 7 | WhatsApp link (existing Task 2.10 sentinel test) | still built through `whatsappLink()`; the message now says the payment was *made*, not *accredited* |
| 8 | `isOpen=false` / `status=null` | renders nothing (unchanged) |

### 4.3 `src/tests/components/AppPaymentReturn.test.tsx` — [MODIFY]

| # | Case | Asserts |
| :-- | :-- | :-- |
| 1 | `?status=approved&orderId=…&payment_id=…` (no session marker) | modal opens with the **new** copy, ids rendered, URL sanitized (`window.location.search === ''`) |
| 2 | **NEW:** `Ver estado del pedido` from the return modal | `OrderTrackingModal` opens with the order id prefilled and the RUT field empty; the payment modal is closed |
| 3 | `status=failure` / `status=pending` / `collection_status=…` (existing) | unchanged behaviour (regression pins) |
| 4 | No status param | no modal (unchanged) |

*Drift note (review §e): the cart assertions (matching ⇒ cleared + marker consumed; foreign ⇒ preserved) landed in `AppCartPersistence.test.tsx` — the suite that already owns the cart fixtures — instead of here; coverage is equivalent to the original §4.3 case 1/2 intent.*

### 4.4 `src/tests/components/AppCartPersistence.test.tsx` — [MODIFY]

| # | Case | Asserts |
| :-- | :-- | :-- |
| 1 | Existing "clears localStorage via the Mercado Pago return flow" → **rewritten** to seed `rememberSessionOrderId` first | cart cleared **and** the marker consumed (`sessionStorage` null) — the replay guard |
| 2 | **NEW:** forged/foreign return URL with a cart present | `localStorage[pronto_cart_v1]` still populated, cart badge still shows the saved quantity (the data-loss path is closed; the discriminating case — proven to fail if the gate is reverted) |
| 3 | Existing hydration/revalidation/`unavailable` cases | unchanged (regression pins) |

`sessionStorage` is cleared in `beforeEach`/`afterEach` of every touched component suite so the marker cannot leak between tests (the harness's `localStorage` mock is per-suite already).

### 4.5 `src/tests/components/CheckoutModal.test.tsx` — [MODIFY, 3 cases]

The marker writer lives here, so the suite owns its coverage (review R3): the created order id is recorded after a successful submit; it is **already in storage when `processMercadoPagoPayment()` is called** (the redirect-ordering pin, review R4 — the mock reads `sessionStorage` at call time); and nothing is recorded when the registration fails (Task 0.11 path).

### 4.6 Zero-regression statement

Baseline **794 / 794 (80 suites)** on `eaf79da`. Final: **817 / 817 (81 suites)** — `orderSession` (+15) and the changed suites (`PaymentReturnModal` +3, `CheckoutModal` +3, `AppPaymentReturn` +1, `AppCartPersistence` +1). Every pre-existing test still passes; no test was skipped or deleted to make the suite green.

---

## 5. As-Built Documentation & Roadmap Sync Plan

| File | Update |
| :-- | :-- |
| `src/services/AGENTS.md` | §1.1 file map + a new bullet for `orderSession.ts` (sessionStorage key, normalization, fail-safe absence, why sessionStorage and not localStorage) |
| `src/components/AGENTS.md` | §2.1 App contract bullet: the approved-return cart reset is now **session-matched** (`clearsCart`), never URL-only; §7.3 `PaymentReturnModal` rewritten (truthful copy, tracking action, `onTrackOrder`) |
| `src/tests/AGENTS.md` | suite/test counts (3 occurrences), the `sessionStorage`-is-real-storage + jsdom-Proxy-spy note, and the new/changed suite descriptions (`orderSession`, the 2.12 cases in `AppPaymentReturn` / `AppCartPersistence` / `PaymentReturnModal` / `CheckoutModal`) |
| `AGENTS.md` (root) | the three count-bearing lines (`:14`, `:138`, `:207`) + the §8.4 URL-bootstrap wording (review P2: "module scope" → "once per mount in a `useMemo`") |
| `UI_UX_EVALUATION_AND_REDESIGN_PROPOSAL.md` | **Appendix C.7** — the deck owns storefront copy, so the rewritten strings and the new action are registered there (review R2) |
| `PRODUCTION_READINESS_TODO.md` | remove the 2.12 row from §1, add the resolved row to §2, delete the §3 Phase 2 block (the house convention — no `- [x]` items survive in §3), refresh the "Last updated" + baseline header |

**Roadmap sync:** `PRODUCTION_READINESS_TODO.md` — §1 row removed, §2 row added, §3 Phase-2 block removed (the 8.8/2.11 precedent).

---

## 6. Verification Gates (run before the code review)

```bash
pnpm test && pnpm build && pnpm lint && pnpm format:check && pnpm exec tsc --noEmit
```

Plus a manual read-through of the rendered modal copy (jsdom asserts the strings; the owner should eyeball the Spanish in a browser during wrap-up).

---

## 7. Open Decisions for the Owner

| # | Decision | Recommendation |
| :-- | :-- | :-- |
| **D1** | Session marker in `sessionStorage` (`pronto_session_order_v1`) rather than `localStorage` | **Recommended** — per-tab lifetime, survives MP's same-tab redirect, cannot be matched by another tab's forged link |
| **D2** | Add `Ver estado del pedido` to **all three** states | **DECIDED by the owner (2026-09-29): all three.** A declined payment can still have registered an order (`PENDIENTE_PAGO_MERCADOPAGO`), so the tracking path is offered there too; the failure branch keeps `Reintentar / Opciones de Pago` as its primary CTA |
| **D3** | Do **not** store/prefill the RUT for the tracking action | **Recommended** — no new PII at rest; tracking stays dual-factor |
| **D4** | Keep the green WhatsApp CTA as the primary button; the tracking action is a secondary button | **Recommended** — minimal visual churn; owner may invert if the tracking action should lead |

---

## 8. Adversarial Review Disposition (round 1)

Reviewer verdict: **APPROVE WITH FINDINGS** (8 findings + 2 pre-existing). Every finding is disposed of below; the two MAJOR items were documentation-completeness findings, not code defects.

| # | Severity | Finding | Disposition |
| :-- | :-- | :-- | :-- |
| R1 | MAJOR | As-built docs + roadmap still described the pre-2.12 behaviour and carried stale 794/80 counts | **Fixed** — §5 applied in full: `src/services/AGENTS.md` §1.1 + new §3.1, `src/components/AGENTS.md` §2.1 + §7.3 + §4.1.2 note, `src/tests/AGENTS.md` (81/817 + the sessionStorage/jsdom-Proxy note + suite descriptions), root `AGENTS.md` (3 counts + §8.4 wording), `PRODUCTION_READINESS_TODO.md` (§1 row removed, §2 row added, §3 block deleted, header/baseline refreshed) |
| R2 | MAJOR | Storefront copy rewritten without the Appendix C deck entry the repo mandates | **Fixed** — `UI_UX_EVALUATION_AND_REDESIGN_PROPOSAL.md` C.7 rewritten with the new title/body/status row/Comprobante/WhatsApp strings, the new action, the superseded strings and the unchanged `failure`/`pending` copy; the `src/components/AGENTS.md` "do not edit without an Appendix C entry" note now records the Task 2.12 rewrite |
| R3 | MINOR | The App-level marker write had no test (proved by revert) | **Fixed, and the design moved** — the write now lives in `CheckoutModal` (see R4) and is covered by 3 new cases; re-running the reviewer's revert experiment fails 2 of them (`should record the created order id…`, `should record the marker before Mercado Pago payment initiation`) |
| R4 | MINOR | The marker was recorded after the MP redirect was requested | **Fixed** — `rememberSessionOrderId(result.orderId)` moved to immediately after the successful `submitOrder()`, before the confirmation email and before `processMercadoPagoPayment()`; `onOrderSuccess` reverts to its `main` signature, so `App.tsx`'s handler is untouched. The ordering is pinned by a test whose MP mock reads `sessionStorage` at call time |
| R5 | MINOR | The marker was never consumed, so a replayed return URL still wiped a *new* cart | **Fixed** — `forgetSessionOrderId()` added and called in the same mount effect as `clearCartFromStorage()`; idempotency + throwing-store paths unit-tested; `AppCartPersistence` asserts the marker is gone after a matched return |
| R6 | MINOR | An approved return that does not match no longer purges the persisted cart (cross-context returns) | **Accepted + documented** — deliberate trade-off: the URL alone must never destroy a cart. Residual recorded in `src/services/AGENTS.md` §3.1 ("Recorded residual (accepted)") with the affected scenario |
| R7 | NIT | `implementation_plan.md` status contradicted the working tree | **Fixed** — this header + §3/§4 refreshed to the as-built state |
| R8 | NIT | The canonical-id regex assertion was trivially satisfied by the suite's own `generateOrderId` mock | **Fixed by construction** — that assertion was replaced by the marker tests, which compare against the id actually passed to `submitOrder`; no regex remains |
| P1 | MINOR (pre-existing) | The `failure` copy says "Tus insumos continúan guardados" although the MP flow already purged the cart, and "Reintentar" opens an empty checkout | **Out of scope** — pre-existing, unchanged by this task (which only adds the tracking action to that branch). Raised to the owner at wrap-up as a candidate follow-up item: the fix is a design decision (restore the pre-checkout cart snapshot vs. reword), not a copy edit |
| P2 | NIT (pre-existing) | "URL bootstrap parsed at module scope" doc drift (it is a `useMemo`) | **Fixed** in the two docs touched by this task (root `AGENTS.md` §8.4, `src/components/AGENTS.md` §2.1) |
