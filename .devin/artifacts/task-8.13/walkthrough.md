# Task 8.13 — Walkthrough: Stale Pending-Order Accumulation

**Branch:** `feat/task-8.13-stale-pending-order-close` — **top of the stack** `8.4 → 8.12 → 8.13`, based on `chore/task-8.12-security-headers` (PR #48).
**Commit:** see the branch's single commit (conventional, with the Devin trailer).
**Pull request:** opened against the 8.12 branch; the three PRs are then linked into one GitHub stack.

---

## What shipped

1. **A new admin action, `close-stale-orders`, on the existing dispatcher** (17 actions, still **6** Hobby function slots — no new function).
2. **The gateway ledger is the gate, before any write.** Each candidate is looked up in Mercado Pago by `external_reference`:
   - an `approved` payment → the order is **parked in `PAGO_EN_REVISION`** with the id stamped and a `PAGO_ACREDITADO_TARDIO` history event (never cancelled, manual review);
   - an unreadable ledger (missing/placeholder token, non-2xx, network error, or a `200` without a `results` array) → the order is **left untouched** and a failure is recorded;
   - a verifiably payment-free candidate → **`CANCELADO`** with a `CIERRE_AUTOMATICO_PENDIENTE` history event.
3. **Race guard:** the ledger call cannot live inside a transaction, so the write re-reads the order and re-asserts the pending status inside one — a webhook approval landing mid-sweep wins and the order is reported as `skippedStatusChanged`. A payment settling *after* the sweep is parked by the webhook's own existing guard and never reopens the order as paid.
4. **Bounded, index-free scan** (`where('status','in',…)` + in-memory age filter, so the `dev_*` twin works too), with a `count()` aggregation reporting `pendingTotal` and a precise `truncated`.
5. **A wall-clock budget** (7 s) so a real backlog returns a complete partial report instead of being killed mid-run by the platform timeout.
6. **Dry run by default** (`dryRun` must be explicitly `false` to write) — the deliberate opposite of the voucher sweep, which only deletes unreferenced stored objects.
7. **UI:** a *Pedidos Pendientes Antiguos* card in `/admin#settings` beside the voucher maintenance card — idle-window input, a review button and a close button, with the result line reporting how much of the queue was scanned and keeping conditional verbs in the dry run.
8. **No side effects beyond the status:** no stock movement, no refund implied, no email — the operator who ran the sweep gets the response, and a parked order surfaces in the console's *Pago en Revisión* queue.

## Verification

| Gate | Result |
| :--- | :--- |
| `pnpm test` | **1255/1255** across **101 suites** (+1 suite, +21 handler/helper cases, +4 UI cases, +1 router mapping) |
| `pnpm run verify:full` | clean (test, `tsc --noEmit`, build, lint, format:check) |
| `api/**` strict type-check (`--strict --target es2022 …`) | clean |
| Time-budget guard | **mutation-verified:** disabling the budget check fails the suite (21/21 → 1 failed); restoring passes |
| Ledger fail-closed paths | asserted for a `500`, a thrown fetch, a body without `results`, and a missing token — zero writes each time |
| Race guard | asserted: a transaction re-read showing a non-pending status writes nothing and counts `skippedStatusChanged` |
| No stock movement | asserted: the `products` collection is never read by the sweep |

## Review findings and disposition

Adversarial review: **approve with findings** — C1 major, C2–C4 minor, C5 nit, plus one pre-existing doc count.

| # | Finding | Disposition |
| :-- | :--- | :--- |
| **C1** | **MAJOR — up to `limit` sequential gateway round-trips per invocation with no wall-clock bound**, so a real backlog run would be killed by the platform timeout mid-sweep: a partial state, no response, no report. | **Fixed.** `STALE_SWEEP_TIME_BUDGET_MS` (7 s) breaks the loop inside the platform's default 10 s, reporting `timeBudgetExhausted` + `truncated` with a loud log; the default scan bound dropped 100 → 25 so a normal run completes. Mutation-verified. |
| C2 | The history wrote `changedBy: 'ADMIN'` / `changedByEmail: null`, so the console timeline showed "Por: ADMIN (ADMIN)" instead of the operator — diverging from all 16 sibling handlers. | **Fixed.** The verified uid/email are threaded through and asserted in the suite. |
| C3 | The scan is document-id ordered with the age filter after the limit, so "repeated runs converge" was overstated; `truncated` also false-positived on an exactly-full page. | **Fixed, honestly.** `pendingTotal` now comes from a `count()` aggregation and `truncated` compares it against what was scanned; the docs and the UI say to re-run **later**, not in a tight loop, and name the ordering caveat. |
| C4 | The dry-run banner used past tense ("se enviaron a revisión manual") while nothing was written. | **Fixed.** The park clause now follows the same conditional verb as the close clause, and the test pins the dry-run wording. |
| C5 | Parking reused `PAGO_ESTADO_INVALIDO`, whose console label ("El pedido no admitía pago automático") describes the opposite case. | **Fixed.** A distinct `PAGO_ACREDITADO_TARDIO` event with its own console label ("El pago se acreditó después de que el pedido dejara de estar pendiente"). |
| F1 (pre-existing) | `api/AGENTS.md` §6 still said the portal "calls 12 actions" while the same file now said 17 elsewhere. | **Fixed** to 17 — the change already updated the sibling counts in that file, and leaving the contradiction inside one document is worse. |

## Human action items

None to build or merge. The owner step remains: on a preview or in production, run the sweep **as a dry run first**, read the candidates, then execute. If it reports `truncated`, run it again later.

## Known limits

- The Mercado Pago `payments/search` behaviour is exercised through a mocked `fetch`; the real endpoint has not been called (the agent must not run it against live data). The `external_reference` filter is the same field the preference is created with.
- The sweep's convergence on a very large backlog is bounded by the scan page order (document-id) and the time budget: it makes progress as the queue drains or as those orders age past the window, not necessarily on two immediate consecutive runs.
- No backfill for pre-existing ghosts beyond what a run closes; and no scheduler — the action is operator-triggered, because a cron would need a new serverless function slot.
