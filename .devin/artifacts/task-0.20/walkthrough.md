# Task 0.20 — Walkthrough

**Branch:** `fix/task-0.20-freeze-preference-amount` (YOLO stack layer 2 of 3, cut from
`fix/task-0.19-harden-order-create-rule`)
**Plan:** [implementation_plan.md](./implementation_plan.md)
**PR:** _created at wrap-up_

## What shipped

1. **`api/_lib/preferenceSnapshot.ts` (new)** — the price-freeze authority:
   `PREFERENCE_TTL_MS` (24 h), `buildPreferenceSnapshot(pricedTotal, lines, now)` →
   `{ pricedTotal, priceSnapshot, preferenceCreatedAt, preferenceExpiresAt }`,
   `readFrozenPricedTotal(orderData)`, and `toChileanOffsetIso(epochMs)`.
2. **`api/create-preference.ts`** — captures the resolved order's `DocumentReference`,
   writes the snapshot **before** minting the preference (best-effort, loud log on failure —
   the webhook's catalog fallback remains, so a snapshot-write failure never blocks a sale),
   and sends `expires: true` with `expiration_date_from`/`expiration_date_to` in Mercado
   Pago's documented Chilean-offset form.
3. **`api/webhooks/mercadopago.ts`** — the amount assertion now asserts against the frozen
   `pricedTotal` when present (catalog recomputation only as the fallback for orders without
   a snapshot), requires `currency_id === 'CLP'`, and treats a catalog that drifted from the
   freeze as a **soft alert** (`frozenTotal` / `priceSnapshotDiverged` / `catalogTotal` in the
   approval-history metadata + a loud log) rather than parking a legitimately paid order in
   review. The review-history reason and metadata name the currency and the frozen total.

## Verification

`pnpm run verify:full` — **104 suites / 1292 tests pass**, build clean, lint clean, format
clean, `tsc --noEmit` and `typecheck:server` clean.

New coverage: `preferenceSnapshot.test.ts` (new suite — offset shape/round-trip/DST,
snapshot build, `readFrozenPricedTotal`), `create-preference.test.ts` (snapshot written +
MP expiry fields + best-effort failure), `mercadopago-webhook.test.ts` (settles against the
freeze despite a catalog edit with one deduction, non-CLP parks in review with no stock
movement, snapshot-less fallback), and the two security suites (the snapshot keys are not
client-writable).

## Review findings and disposition

| # | Severity | Finding | Disposition |
| :-- | :-- | :-- | :-- |
| F1 | MAJOR | The plan's documentation/roadmap sync was missing — `api/AGENTS.md` and the root `AGENTS.md` still described the catalog as the amount authority (and called the price-drift review "fail-closed by design"), and 0.20 was still open in the roadmap. | **Fixed** — `api/AGENTS.md` (§1.1 create-preference row, §2.1 step 3, §2.2 amount assertion, §8.5 residual), the root `AGENTS.md` price-verification iron rule, the roadmap closure (board row + §3 entry removed, one §5 row, an owner preview-check bullet), and the test counts. |
| F2 | MINOR | `expiration_date_to` was sent as a UTC `Z` string, while Mercado Pago documents `yyyy-MM-dd'T'HH:mm:ssz` (numeric offset) and answers `invalid_expiration_date_to` — a rejected value would `502` every preference, i.e. a total checkout outage. | **Fixed** — `toChileanOffsetIso` emits the offset form (DST-aware, unit-tested), `expiration_date_from` is sent alongside `to` as the docs prescribe, and the owner checklist carries a preview verification. |
| F3 | MINOR | `pre-0.20` phrasing in two new comments violates the self-contained-comments policy (the ESLint rule only matches a literal `task`/`todo` token, so lint missed it). | **Fixed** — reworded inline in `create-preference.ts` and the webhook test. |
| F4 | NIT | `priceSnapshot` stored no quantity, so it could not rebuild `pricedTotal` (its stated purpose) and was never read. | **Fixed** — the line now carries `quantity`, and the unit test asserts the snapshot rebuilds the frozen total. |
| F5 | NIT | The test duplicated the 24 h literal instead of importing `PREFERENCE_TTL_MS`. | **Fixed** — the constant is imported and asserted. |

## Human action items

- **Owner (optional, recorded in the roadmap checklist):** on a preview deploy with a TEST
  Mercado Pago account, confirm a preference carrying `expires: true` +
  `expiration_date_from`/`to` is accepted (a rejected value returns `502` and would fail
  every checkout) and that an expired link is refused. If the account has offline/cash
  methods enabled, their validity must be at least the 24 h window.
