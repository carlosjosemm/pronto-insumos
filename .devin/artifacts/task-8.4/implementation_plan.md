# Task 8.4: Pre-Flight Checks & Minimal CI

**Branch:** `chore/task-8.4-preflight-gate-and-minimal-ci` (primary working tree — no worktree; cut from `main` @ `6fea2e9`, the bottom of the 8.4 → 8.12 → 8.13 stack)
**Status:** Implemented, reviewed, remediated — gates green; awaiting the stack wrap-up commit. Adversarial review returned *approve with findings* (F1 major, F2–F5 minor, F6–F8 nits); all remediated or dispositioned (see the walkthrough).

---

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` **8.4 (P2)**:

> Make `pnpm test && pnpm exec tsc --noEmit && pnpm build` the mandatory local pre-release gate and record it in the workflow. Optional: minimal `.github/workflows/ci.yml` running test + build on pull requests; remain lean.
> **Runtime/operator gate:** on preview, smoke API runtime ESM, admin authentication and read, stock/transfer flow, and public checkout/payment/tracking using TEST credentials and non-customer test data only. Never use real customer data or mutate production. A green Vite build does not exercise runtime ESM or provider configuration; add no heavy infrastructure.

Verified against `main`:

- **The gate is prose, not an executable command.** §6 of `AGENTS.md` lists `pnpm test`, `pnpm build`, `pnpm lint` and `pnpm format:check` as separate commands and §7.0 says "never execute `vercel --prod` without first confirming `pnpm test` and `pnpm build`" — but there is **no single command** that runs the pre-release gate, so the sequence is re-typed (and therefore re-invented) on every deploy. The `production-readiness-workflow` skill documents a five-gate sequence that no `package.json` script implements.
- **Nothing runs on a pull request.** The repo has no `.github/` directory at all: a PR can be merged with a red suite, and the stacked PRs of this very effort would carry no automated evidence.
- **The runtime gate has no tool.** §7.0 already records the two failures a green build cannot catch — a blank storefront from a module-scope `getAuth()` throw, and `FUNCTION_INVOCATION_FAILED` from an ESM resolution fault in `api/` — yet the only way to exercise them is a hand-typed `curl` per endpoint against a preview URL. There is no repeatable, read-only probe set.
- **Scope boundary:** this task does **not** type-check `api/**` (that is Task 8.2, which owns `tsconfig.server.json`), does not touch deployment (Vercel CLI stays the only deploy path, per §7 and guardrail 5), and does not add a smoke that mutates data or needs a credential.

---

## 2. Human Action Items & Placeholders (TODO for Human)

- **None.** No credentials, no secrets, no new environment variables, nothing added to `.env.example`.
- **Owner/operator gate (not agent-executable, documented as the runbook in §5):**
  1. Deploy a preview with the Vercel CLI (`pnpm dlx vercel`) — deployment is owner-only, and the agent must not deploy.
  2. Run `pnpm run smoke:preview -- --base=https://<preview-host>` and confirm every probe reports `PASS`. This is the credential-free half of the runtime gate (API ESM module load, the routed admin endpoint refusing an unauthenticated read, the public-endpoint validation paths, both HTML shells). **A preview behind Vercel Deployment Protection fails every probe** — disable it for the deployment under test.
  3. Complete the credential-bearing half by hand on the same preview, with **Mercado Pago TEST credentials and non-customer test data only**: load the storefront in a browser and confirm it renders (the only step that catches a blank page from a bad `VITE_FIREBASE_API_KEY`), a test checkout + test payment, a bank-transfer order with a test voucher, an admin login + read, and an admin approve-transfer/stock adjustment. **Never** against production, never with real customer data.
  4. Promote with `pnpm dlx vercel --prod` only after 1–3 pass.

---

## 3. Proposed Changes

### 3.1 The gate becomes one command

- **[MODIFY]** `package.json`
  - `"verify": "pnpm test && pnpm exec tsc --noEmit && pnpm build"` — the exact sequence the task names, now a single reproducible command.
  - `"verify:full": "pnpm run verify && pnpm lint && pnpm format:check"` — the full five-gate sequence the repository skill mandates before a PR (adds the two gates that are cheap and already green).
  - `"smoke:preview": "pnpm dlx tsx scripts/smoke-preview.ts"` — the operator runtime gate, `--base=` required.

### 3.2 Minimal CI on pull requests

- **[NEW]** `.github/workflows/ci.yml` — **one job**, deliberately not a pipeline:
  - `actions/checkout@v4` with `persist-credentials: false`, `pnpm/action-setup@v4` (reads `packageManager: pnpm@10.30.1` from `package.json` — no version duplicated in YAML), `actions/setup-node@v4` (`node-version: 22`, `cache: pnpm`).
  - `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`.
  - `permissions: contents: read` (least privilege), `concurrency` with `cancel-in-progress` (a superseded push cancels the older run), `on: pull_request` + `on: push` to `main`.
  - **It never deploys.** Vercel CLI remains the only deploy path (§7, guardrail 5); this workflow is a verification gate, which is why it stays inside the "no over-engineered CI/CD" boundary.
  - `pnpm lint` **is** in CI because it enforces the self-contained-comment policy (guardrail 7), not merely style. `format:check` stays local (`verify:full`), so a PR is never failed on whitespace noise — that is the "remain lean" line.

### 3.3 The runtime gate gets a read-only tool

- **[NEW]** `scripts/smoke-preview.ts` — exported pure planner + injectable `fetch`, direct-invocation-guarded `main()` (the `sync-env-to-vercel` / `import-catalog-csv` convention, so the module is importable by Vitest without side effects):
  - `buildProbePlan()` returns the probes below; `assertSafeTarget(base)` refuses the production host; `runProbes(base, probes, fetchImpl)` runs them and returns per-probe results; `summarize(results)` returns the exit code.
  - **Probes — every one is a read or a validation-failure path that returns before any Firestore/Storage access (verified in the handlers):**

    | Probe | Expected | What it proves |
    | :--- | :--- | :--- |
    | `GET /` | `200` | The storefront **HTML shell** is served. Not a blank-page check: a server-side request never executes the client bundle, so the module-scope `getAuth()` throw is invisible here and is caught only by the manual browser step. |
    | `GET /admin` | `200` | The admin HTML shell serves through the `vercel.json` rewrite. |
    | `GET /api/webhooks/mercadopago` | `200` | A public serverless function module loads under Node's ESM resolver — a missing `.js` extension surfaces here as `500`. |
    | `OPTIONS /api/admin/orders` | `200` | The routed admin endpoint resolved the action and answered its preflight (the handler answers before setting any CORS header, so this is a route check, not a header check). |
    | `GET /api/admin/orders` (no token) | `403` | The routed dispatcher resolved the action and the handler module loaded — its static imports reach `firebase-admin/auth`, which is where a `jose`/ESM regression surfaces. It cannot separate a healthy deployment from one with no Admin SDK credentials: both answer `403`. |
    | `POST /api/create-preference` `{}` | `400` | Public payment endpoint validates before pricing. |
    | `POST /api/track-order` `{}` | `400` | Public tracking validates before the dual-factor lookup. |
    | `POST /api/upload-voucher` `{}` | `400` | Voucher intake validates before the Storage sign. |
    | `POST /api/order-confirmation` `{}` | `400` | Confirmation endpoint validates before the Resend send. |

  - **Safety rails:** `--base` is required and must be an `http(s)` origin; the production host and its subdomains are refused outright; every request is sent without an `Authorization` header; a `5xx` is reported as a distinct "runtime/ESM or configuration failure" (not just a wrong-status mismatch); the process exits non-zero when any probe fails. No probe writes, no probe needs a credential.
  - **[NEW]** `src/tests/scripts/smokePreview.test.ts` — unit tests over the pure planner/runner/summarizer (mocked `fetch`, no network).

### 3.4 Documentation

- **[MODIFY]** `AGENTS.md`
  - §6: add `pnpm run verify` / `verify:full` / `smoke:preview` to the command list.
  - §7: replace the two-command "Pre-Flight Verification" with the one-command gate, record the PR CI workflow (and that it never deploys), and add the **runtime/operator gate** runbook (preview + `smoke:preview` + the credential-bearing test-credential checklist).
- **[MODIFY]** `PRODUCTION_READINESS_TODO.md` — mark 8.4 `[x]` with an as-built note.
- **[NEW]** `.devin/artifacts/task-8.4/walkthrough.md` — written at wrap-up.

---

## 4. Robust Unit Testing Plan (MANDATORY)

`src/tests/scripts/smokePreview.test.ts` (mocked `fetch`; no network, no Firestore):

1. **Planner:** the plan covers every public endpoint and both shells; every probe declares at least one acceptable status and a `name` that identifies it in the report.
2. **Target safety (negative):** `assertSafeTarget` rejects the production host and its subdomains, a non-`http(s)` scheme, a malformed URL, and an empty value; accepts a `*.vercel.app` preview host and a localhost URL.
3. **Runner (happy path):** a `fetch` stub returning the expected status per method+path yields all-`PASS` results, and the request carries no `Authorization` header.
4. **Runner (negative):** a probe returning an unexpected `4xx` fails with the received status; a `500` is reported as a runtime/ESM failure; a thrown `fetch` (DNS/TLS) is reported as a failure instead of crashing the run.
5. **Summarizer:** the exit code is `0` only when every probe passed, and the summary counts match.
6. **No live traffic:** the import-safety case supplies a **valid** `--base` and a recording `fetch` double *before* importing the module, so removing the direct-invocation guard makes the import actually probe and the case fails — verified by temporarily forcing the guard on (16/16 → 1 failed) and restoring it.

**Regression safety:** the full suite (99 suites / 1222 tests) must stay green, plus the new suite. The `verify`/`verify:full` scripts are validated by running them.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- `AGENTS.md` §6 (commands) and §7 (deployment/CI/CD + runtime gate runbook) — as described in §3.4.
- `PRODUCTION_READINESS_TODO.md` — checkbox `[x]` for 8.4 + an as-built line recording the gate command, the CI workflow and the smoke tool.
- No `api/AGENTS.md` change: this task adds no endpoint.
