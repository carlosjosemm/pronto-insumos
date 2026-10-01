# Task 0.21 — Walkthrough

**Branch:** `fix/task-0.21-bound-confirmation-relay` (YOLO stack layer 3 of 3, cut from
`fix/task-0.20-freeze-preference-amount`)
**Plan:** [implementation_plan.md](./implementation_plan.md)
**PR:** _created at wrap-up_

## What shipped

1. **`api/_lib/abuseThrottle.ts`** — a `recipient` key kind with per-kind `windowMs` /
   `lockoutMs` overrides; `order-confirmation` gains a **5 sends / 24 h** per-address budget
   (locked 24 h) keyed by the SHA-256 hash of the case-folded address, and the counter
   document's `expiresAt` is `now + max(24 h, window + lockout)` so a TTL sweep can never
   reset a budget still in force. `maxFailures` became optional (the recipient kind bounds
   sends, not lookups); a kind with no policy for a scope is never throttled.
2. **`api/order-confirmation.ts`** — the recipient budget is consumed after the send claim
   (an idempotent duplicate never spends a slot) and before the send; a refusal releases the
   claim (`failureReason: 'recipient_budget'`) and answers the uniform `429`. Line names are
   read from the **catalog** by `productId` (best-effort; a failed read logs and leaves the
   neutral label) and passed into the template; the recipient key is case-folded.
3. **`api/_lib/emailTemplates.ts`** — `toOrderEmailData` takes an optional `itemNames` map:
   when supplied, every line name comes from the catalog and the client-written name is never
   rendered (unresolved ⇒ `Insumo odontológico`); the server/admin templates keep rendering
   the stored name. The free-text echoes (`fullName` 80, `address` 120, `city` 40,
   `razonSocial` 80) are clamped, and the order-received confirmation carries a "si no
   reconoces este pedido" WhatsApp escape hatch.

## Verification

`pnpm run verify:full` — **104 suites / 1301 tests pass**, build clean, lint clean, format
clean, `tsc --noEmit` and `typecheck:server` clean.

## Review findings and disposition

| # | Severity | Finding | Disposition |
| :-- | :-- | :-- | :-- |
| F1 | MAJOR | The recipient key was the raw e-mail string, so case / `+tag` / dotted-local mutation each got its own budget — defeating the "handful per address per day" claim. | **Fixed** — the key is case-folded (`.trim().toLowerCase()`), a test proves `Andrea@Clinica.CL` lands on the `andrea@clinica.cl` budget, and the comments now state the residual explicitly: the bound is per *literal* address and does not collapse provider-local aliasing. |
| F2 | MINOR | The plan's documentation/roadmap sync was missing (and `api/AGENTS.md` still said "15-minute fixed window"). | **Fixed** — `api/AGENTS.md` (the order-confirmation row, the throttle table/notes incl. the recipient kind and the per-kind window, the TTL note, the §4 mention), the roadmap closure (board row + §3 entry removed, one §5 row), and the test counts. |
| F3 | MINOR | `razonSocial` (and `giroComercial`) echoes were not clamped, unlike `fullName`/`address`/`city`. | **Fixed** — `razonSocial` is clamped to 80 (`giroComercial` is not part of `OrderEmailData`, so it is never rendered); a test pins the clamp. |
| F4 | NIT | `recipient.maxFailures` was dead configuration (no code path records recipient failures). | **Fixed** — `ThrottlePolicy.maxFailures` is now optional and the recipient policy omits it; `recordThrottleFailures` returns early for a kind without a failure budget. |
| F5 | NIT | The WhatsApp digits/fallback literal is duplicated from `src/config/contact.ts`. | **Accepted, documented** — the API cannot import a module that reads `import.meta.env`; the duplication follows the established `VITE_BANK_*` precedent in the same file. Not worth a new shared module + a storefront-config change in this task. |
| F6 | NIT | One throttle assertion (a fresh key) did not actually discriminate the 24 h window. | **Fixed** — the test now re-consumes the same un-locked key past the 15-minute boundary and asserts the window and attempt count survive (`attempts: 2`, `windowStartedAt` unchanged). |

Pre-existing issue the review surfaced but deliberately left out of this task: the
confirmation e-mail still renders client-supplied line prices and `totalAmount` (the totals
block is already labelled `Total referencial`). Rendering those from the catalog/frozen
snapshot is a follow-up; it is not part of this task's stated scope.

## Human action items

- None required. The owner checklist already records that server-side `VITE_*` values (bank
  details, and now the WhatsApp number) should be present so the templates do not fall back
  to their literals.
