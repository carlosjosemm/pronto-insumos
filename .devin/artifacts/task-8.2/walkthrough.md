# Task 8.2 Walkthrough — Type-Check the Serverless Functions

**Branch:** `feat/task-8.2-server-typecheck` (stack layer 2, on top of `feat/task-8.16-app-check-order-create-rules`)
**Status:** wrapped up (YOLO layer 2 of the 8.16 → 8.2 → 8.11 stack)
**Plan:** [implementation_plan.md](./implementation_plan.md)

## What was implemented

1. **`tsconfig.server.json` (new)** — the Node-context type-check project for `api/**`, carrying exactly the documented passing flags. Two flags are load-bearing and explained inline in the file: `target ES2022` (default ES5 fails with TS2802 on the Map-iterator loops) and `skipLibCheck` (without it TS18028 fires inside unowned `node_modules` types). The include set covers the four documented globs **plus `api/admin/*.ts`** — the documented command silently skipped `api/admin/[action].ts` (an entry point nothing imports), which this task closed.
2. **Wiring** — `pnpm run typecheck:server` (`tsc -p tsconfig.server.json`) added to the pre-release gate `verify` (`pnpm test && tsc --noEmit && typecheck:server && build`) and as a "Server type check" CI step in `.github/workflows/ci.yml` (the 8.4 gate), with self-contained comments explaining why the step exists.
3. **TS7006/TS2503 fixes at the source** — all 21 `runTransaction` callbacks across 14 `api/**` files annotated `(transaction: Transaction)`; the six `FirebaseFirestore.*` namespace references replaced with named type imports from `firebase-admin/firestore` (the repo's pre-existing convention — `emailDelivery.ts`/`orderLookup.ts` already imported that way). Explicit annotations make the code independent of Vercel's differently-resolving per-function type-check.
4. **`src/tests/security/serverTypecheck.test.ts` (new, 5 tests)** — the config-contract drift guard: load-bearing flags, full coverage of every `api/**/*.ts` file by the include globs, `verify`/CI wiring, and two annotation drift guards (no un-annotated `runTransaction` callback — whitespace-tolerant regex because `api/**` is outside Prettier's scope — and no `FirebaseFirestore.` namespace reference).
5. **Docs** — root `AGENTS.md` (`verify` command description ×2 + CI paragraph), `api/AGENTS.md` §1.3 (the "Admin SDK types are always explicit imports, never inferred" convention), `PRODUCTION_READINESS_TODO.md` (§1 board `[x]`, §3 checkbox + as-built).

## Verification

- `pnpm test`: **1270/1270 tests, 102 suites** (baseline 1265; +5 new).
- `pnpm run typecheck:server`: clean (and it now runs inside `pnpm run verify`).
- `pnpm run verify` (test + browser tsc + server tsc + build), `pnpm lint`, `pnpm format:check`: all clean.

## Code review (adversarial, fresh-context) — findings & disposition

| Finding | Severity | Disposition |
| :-- | :-- | :-- |
| R1 — §3 task checkbox not flipped (board said `[x]`, entry said `[ ]`) | MINOR | **Fixed** — flipped to `[x]`. |
| R2 — TS7006 drift guard was whitespace-format-sensitive (`api/**` is Prettier-ignored, so a variant spelling would escape it) | MINOR | **Fixed** — whitespace-tolerant regex `/runTransaction\(\s*async\s*\(\s*transaction\s*\)/`. |
| R3 — JSONC stripper handled only `//` comments | NIT | **Fixed** — block comments stripped too. |
| R4 — redundant `--noEmit` CLI flag (already in the project file) | NIT | **Fixed** — script is now `tsc -p tsconfig.server.json`; `noEmit` lives in the config, pinned by the test. |
| R5 — glob/dir comparison was POSIX-only (Windows checkouts would false-fail) | NIT | **Fixed** — `path.sep` normalization. |

Reviewer verdict: APPROVE WITH FINDINGS (all five remediated; gates re-run green).

## Notes & residual

- The final confirmation that Vercel's deploy log is TS7006/TS2503-free happens on the next owner deploy (preview step) — not locally observable; the annotations are type-correct regardless (`Transaction`/`Firestore`/`DocumentReference` are real `firebase-admin/firestore` exports).
- The reviewer noted the original 8.2 evidence mentioned `map` callbacks too; no `.map`-over-Admin-types callback exists today that our strict gate leaves implicit-any (the strict local pass proves that), so `runTransaction` annotations plus the namespace imports are the complete current fix.
- Pre-existing, out of scope: the `.prettierignore` carve-out for `api/**` (tracked as 8.10).

## PR

Created against `feat/task-8.16-app-check-order-create-rules` (stack layer 2).
