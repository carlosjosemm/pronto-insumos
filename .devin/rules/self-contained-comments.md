---
description: "Comments and JSDoc must be self-contained; external doc pointers are forbidden"
trigger: always_on
---

# Self-Contained Comments

Every code comment and JSDoc must explain its constraint inline. A reader with
only the source file open must fully understand the rule without opening any
other file. Documentation files (AGENTS.md, PRODUCTION_READINESS_TODO.md, etc.)
are for agents and onboarding — they are never a substitute for an inline
explanation.

## Forbidden outright

- ❌ Any reference to a `.md` file or doc section (`AGENTS.md`, `§3`,
  `PRODUCTION_READINESS_TODO.md`, `api/AGENTS.md §1.2`, …) inside a comment.
- ❌ Task numbers as justification (`Task 0.14`, `per Task 8.8`, `TODO 9.1`).
  A task number carries no information to a code reader.
- ❌ Phrases like "see the repo guide", "per the roadmap", "as decided in the
  TODO doc" — any wording that defers the actual explanation elsewhere.

## What to write instead

Inline the constraint itself, in full sentences, then stop. No pointer needed.

```ts
// ❌ Forbidden: the information lives in another file
/**
 * Settles the order. Guards follow Task 0.14; see AGENTS.md §4.
 */

// ✅ Correct: the rule is stated here, self-contained
/**
 * Settles the order exactly once: `paidAt` acts as the settlement marker, so a
 * retried webhook finds it already set and skips stock deduction instead of
 * decrementing the same lines twice.
 */
```

If a behavior is genuinely documented at length elsewhere, still write the
one-to-three-sentence version inline that is enough to work with the code
correctly. Do not add a doc reference to compensate for a missing explanation.

## Scope

- Applies to all new and edited comments in `src/**`, `api/**`, `scripts/**`,
  and config files.
- Enforced mechanically by the `no-external-doc-pointers` ESLint rule
  (inline plugin in `eslint.config.js`); `pnpm lint` fails on violations.
  The rule scans comments/JSDoc only — string literals (including test
  `describe`/`it` titles) are outside its reach, but the same policy applies
  to them: do not add task-number labels to new test titles.
- When editing a comment that already contains a forbidden pointer, remove the
  pointer and inline the explanation in the same change — do not leave it for
  a later cleanup pass.
