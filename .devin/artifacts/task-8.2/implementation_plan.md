# Task 8.2: Type-Check the Serverless Functions

**Branch:** `feat/task-8.2-server-typecheck` (stack layer 2, cut from `feat/task-8.16-app-check-order-create-rules`)
**Status:** wrapped up (implemented, reviewed, verified; see [walkthrough.md](./walkthrough.md))

## 1. Context & Problem Statement

- **Roadmap item:** `PRODUCTION_READINESS_TODO.md` §3, Task 8.2 (P3) — "Type-Check the Serverless Functions".
- **Gap:** `tsconfig.json` includes only `src/**/*`, so `pnpm exec tsc --noEmit` (one of the five gates) never checks `api/**` — the serverless layer is only type-checked incidentally by Vercel's per-function build step, which uses different resolution and flags.
- **Verified facts:**
  - The invocation `pnpm exec tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --types node --skipLibCheck api/*.ts api/_lib/*.ts api/_lib/admin/*.ts api/webhooks/*.ts` **passes today** (verified on this branch). `--target es2022` and `--skipLibCheck` are **required** — without them the check fails (`TS2802` on Map iterator loops under the default ES5 target, `TS18028` in `node_modules`).
  - Vercel's own per-function type-check logs `TS7006` (`Parameter 'transaction' implicitly has an 'any' type`) and `TS2503` (`Cannot find namespace 'FirebaseFirestore'`) for `api/**` because it does not resolve the Admin SDK typings the way the local command does. The deploy still completes, but the noise is a hard failure waiting to happen if Vercel tightens its check. Annotating the `runTransaction` callbacks explicitly (and replacing the `FirebaseFirestore.*` namespace references with named type imports from `firebase-admin/firestore`, the established repo convention) makes the code independent of that inference, so both checkers agree.

## 2. Human Action Items & Placeholders (TODO for Human)

None — no credentials or external configuration are involved. The Vercel per-function check noise disappearing is observable on the next deploy (owner preview step, not agent-verifiable locally).

## 3. Proposed Changes

- **[NEW] `tsconfig.server.json`** — Node-context project carrying exactly the documented passing flags (`target es2022`, `module esnext`, `moduleResolution bundler`, `strict`, `types: ["node"]`, `skipLibCheck`, `noEmit`) with `include` covering `api/*.ts`, `api/_lib/*.ts`, `api/_lib/admin/*.ts`, `api/webhooks/*.ts`. Comments inline explain why the two load-bearing flags cannot be dropped.
- **[MODIFY] `package.json`** — new `typecheck:server` script (`tsc --noEmit -p tsconfig.server.json`), wired into the pre-release gate `verify` so the one-command gate covers the serverless layer.
- **[MODIFY] `.github/workflows/ci.yml`** — a "Server type check" step running `pnpm run typecheck:server` after the existing "Type check" step (the 8.4 gate).
- **[MODIFY] `api/**` (14 files)** — annotate every `runTransaction(async (transaction) => …)` callback as `transaction: Transaction`, importing `type { Transaction }` from `firebase-admin/firestore`; replace the six `FirebaseFirestore.DocumentReference` / `FirebaseFirestore.Firestore` namespace references in five files with named type imports from `firebase-admin/firestore` (the repo's established convention — `emailDelivery.ts`, `orderLookup.ts` already import that way).
- **[NEW] `src/tests/security/serverTypecheck.test.ts`** — the config-contract drift guard (below).
- **[MODIFY] docs** — root `AGENTS.md` (dev-workflow/verification note), `api/AGENTS.md` (annotation convention), `PRODUCTION_READINESS_TODO.md` (checkbox + as-built).

## 4. Robust Unit Testing Plan (MANDATORY)

- `src/tests/security/serverTypecheck.test.ts` (content-assertion convention of `firestore-rules`/`storage-rules`/`vercelHeaders`):
  1. `tsconfig.server.json` parses and pins the load-bearing flags (`target ES2022`, `skipLibCheck`, `strict`, `types: ["node"]`, `moduleResolution bundler`) and all four `include` globs.
  2. `package.json` wires `typecheck:server` into `verify` (the pre-release gate) — and the script references `tsconfig.server.json`.
  3. `.github/workflows/ci.yml` runs `pnpm run typecheck:server`.
  4. **Annotation drift guard:** no file under `api/` contains an un-annotated `runTransaction(async (transaction)` callback, and no `FirebaseFirestore.` namespace reference remains — so the Vercel-checker TS7006/TS2503 fix cannot silently regress.
- The real gate is the command itself: `pnpm run typecheck:server` must pass (it is added to `verify`, so the standard five-gate runs execute it).
- Zero regressions: the full Vitest suite plus the other four gates stay green.

## 5. As-Built Documentation & Roadmap Sync Plan

- Root `AGENTS.md`: the verification/gates description gains the server type-check.
- `api/AGENTS.md` §1: the type-annotation convention for `runTransaction` callbacks and Admin SDK type imports.
- `PRODUCTION_READINESS_TODO.md`: mark 8.2 `[x]` in §1 board + §3 entry (as-built).
- `.devin/artifacts/task-8.2/walkthrough.md` at wrap-up.
