# Self-Contained Comments: Lint Rule + Repo-Wide Comment Cleanup

**Branch:** `chore/self-contained-comments-lint` (primary working tree — no worktree; cut from `main` @ `d39875a`)
**Status:** **Implemented and verified — 860/860 tests (82 suites), build/lint/format/tsc all clean.** Owner approved 2026-09-29 ("proceed with Cleanup sweep now"). All 137 flagged comments rewritten across 55 source files; `pnpm lint` is clean (0 errors, 0 warnings — the now-dead `no-control-regex` disable directive in `api/_lib/voucherStorage.ts` was removed; it only became unused because this change scopes `api/**` to the pointer rule). As-built entry added to the root `AGENTS.md` §2 guardrail 7. Adversarial review round 1 returned F1–F5 (verdict *approve with findings*); every finding is remediated in this change.

---

## 1. Context & Problem Statement

Code comments and JSDoc across the repo carry pointers to external documents
(`AGENTS.md`, `PRODUCTION_READINESS_TODO.md`, task numbers such as "Task 0.14",
`§` section references). A reader with only the source file open cannot
understand those comments; the information lives outside the code. Owner
decision: **pointers are forbidden outright** — every comment must be
self-contained.

Not a roadmap task; this is comment-hygiene + tooling. No runtime behavior
changes.

## 2. Human Action Items & Placeholders

None. No env vars, no external services, no owner gates.

## 3. Proposed Changes

- `[NEW]` `.devin/rules/self-contained-comments.md` — always-on agent rule
  stating the policy and the fix-in-place expectation. *(done)*
- `[MODIFY]` `eslint.config.js` — inline plugin
  `self-contained-comments/no-external-doc-pointers` (error, all linted files);
  `api/**` and `src/admin/**` enter lint scope for this rule only (TS parser,
  no full TS rule set). *(done)*
- `[MODIFY]` 55 source files — rewrite the 137 flagged comments/JSDoc to
  inline the actual constraint each pointer stood for, then delete the pointer.
  Comment-only edits: no code, no strings, no exports change.

## 4. Robust Unit Testing Plan

No new suites — comment text is not behavior. Existing 860 tests / 82 suites
must pass unchanged (zero-regression policy). The lint rule itself is the
verification artifact for the policy.

## 5. As-Built Documentation & Roadmap Sync Plan

- Update the root `AGENTS.md` with a short guardrail entry (comments must be
  self-contained; enforced by the ESLint rule) so future agents and humans see
  it at the root level.
- No `PRODUCTION_READINESS_TODO.md` roadmap checkbox (not a roadmap task).
- Verification gates: `pnpm test`, `pnpm build`, `pnpm lint` (must be clean
  after the sweep), `pnpm format:check`, `pnpm exec tsc --noEmit`.
- Wrap-up per the workflow skill: conventional commit, pre-PR sync, push, PR
  to `main` after the owner says "wrap up and proceed".
