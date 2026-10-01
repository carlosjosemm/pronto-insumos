# Task 8.4 — Walkthrough: Pre-Flight Checks & Minimal CI

**Branch:** `chore/task-8.4-preflight-gate-and-minimal-ci` — **bottom of the stack** `8.4 → 8.12 → 8.13` (base `main`).
**Commit:** see the branch's single commit (conventional, with the Devin trailer).
**Pull request:** opened against `main`; linked into the GitHub stack after 8.12 and 8.13 exist.

---

## What shipped

1. **One-command pre-release gate.** `pnpm run verify` = `pnpm test && pnpm exec tsc --noEmit && pnpm build` (the exact sequence the task names); `pnpm run verify:full` adds `pnpm lint` and `pnpm format:check` for the pre-PR pass. Recorded in the root guide's command list and its deployment section, which now replaces the hand-typed two-command pre-flight.
2. **Minimal CI.** `.github/workflows/ci.yml` — one job, `contents: read`, `persist-credentials: false`, superseded runs cancelled, Node 22 with pnpm read from `package.json`'s `packageManager`, then `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`. **It never deploys** — the Vercel CLI stays the only release path.
3. **Read-only runtime gate tool.** `pnpm run smoke:preview -- --base=<preview>` runs nine credential-free probes (both HTML shells, the webhook module load, the admin preflight, the unauthenticated admin read, and the four public endpoints' malformed-body validation), classifies any `5xx` as a runtime/ESM or provider-configuration failure, refuses the production host and its subdomains, sends no `Authorization` header and mutates nothing.
4. **The operator runbook** (root guide §7): the automated half above, then the manual credential-bearing half (browser render, test checkout + payment, transfer voucher, admin login + read, approve-transfer/stock adjustment) restricted to Mercado Pago TEST credentials and non-customer test data, with the Vercel Deployment Protection caveat.

## Verification

| Gate | Result |
| :--- | :--- |
| `pnpm test` | **1222/1222** across **99 suites** (+1 suite, +16 cases) |
| `pnpm exec tsc --noEmit` | clean |
| `pnpm build` | clean (`built in 4.59s`) |
| `pnpm lint` | clean (includes the self-contained-comment policy rule) |
| `pnpm format:check` | clean |
| `pnpm run verify` (the new gate itself) | exit 0 end to end |
| `pnpm run smoke:preview -- --help` / no `--base` / production host / `www.` subdomain | usage exits 0; the three unsafe targets exit 1 with a clear message |
| Live probe run against a non-existent `*.vercel.app` host | 9/9 fail with the received status, exit code 1 — proves real requests and classification, with no writes |

## Review findings and disposition

Adversarial review: **approve with findings** (F1 major, F2–F5 minor, F6–F8 nits). Nothing touched payment, stock, order or rules logic.

| # | Finding | Disposition |
| :-- | :--- | :--- |
| F1 | The `GET /` probe was documented as catching the storefront blank-page failure, which an HTTP `200` check cannot see. | **Fixed.** Script header, probe name, the plan's probe table and the runbook now state that only the manual browser step catches a blank page; the runbook lists it as such. |
| F2 | The "no request on import" test was trivially true (no `--base` under Vitest ⇒ `main()` short-circuits before any `fetch`). | **Fixed and verified by mutation:** the case now supplies a valid `--base` plus a recording `fetch` double before importing. Temporarily forcing `invokedDirectly = true` made it fail (16/16 → 1 failed); restored. |
| F3 | Two probe rationales claimed more than a status check proves (admin auth vs. unconfigured Admin SDK; CORS headers vs. route existence). | **Fixed.** Both probe names, the plan table and the runbook now say what is actually proven and name the two conditions the `403` cannot separate. |
| F4 | Lint was excluded from CI while it enforces the self-contained-comment guardrail; "prose noise" framing. | **Fixed by inclusion.** `pnpm lint` is now a CI step, with the reason stated; `format:check` stays local and is the only thing framed as whitespace noise. |
| F5 | 8.4 marked `[x]` while its operator verification has not run. | **Accepted, consistent with precedent.** 8.17 is `[x]` with "Operator rehearsal pending"; the as-built here states **"Remaining (owner): deploy a preview, run the smoke test, complete the manual half, then promote."** |
| F6 | Production-host guard was exact-match; Deployment Protection unmentioned. | **Fixed.** The guard also refuses subdomains of the production host (a preview host is not one), and the runbook plus the script header note that protection makes every probe fail. |
| F7 | The plan attributed the `jose`/ESM regression to the webhook probe. | **Fixed.** The `jose` rationale now sits on the admin probes (the router statically imports `adminAuth` → `firebase-admin/auth`); the webhook probe is described as a public-module load check. |
| F8 | Promised `walkthrough.md` absent. | **Fixed** — this file. |

## Human action items

None to build or merge. The owner step before promoting remains: deploy a preview (`pnpm dlx vercel`), run the smoke test, complete the manual credential-bearing half with TEST credentials, then promote.

## Known limits (do not over-read a green smoke run)

- The shell probes prove the HTML shells are served; they cannot see a blank page.
- The admin `403` is answered identically by a healthy deployment and by one with no Admin SDK credentials.
- The admin preflight `200` precedes any CORS header, so it is a route check.
- `api/**` is not type-checked by the gate — that is Task 8.2's `tsconfig.server.json`, deliberately out of scope here.
- CI semantics were reviewed statically; the workflow has not yet run on GitHub Actions.
