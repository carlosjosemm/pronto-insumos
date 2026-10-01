# Task 8.11: Resilient Firebase Init

**Branch:** `feat/task-8.11-resilient-firebase-init` (stack layer 3, cut from `feat/task-8.2-server-typecheck`)
**Status:** wrapped up (implemented, reviewed, verified; see [walkthrough.md](./walkthrough.md))

## 1. Context & Problem Statement

- **Roadmap item:** `PRODUCTION_READINESS_TODO.md` §3, Task 8.11 (P3) — "Resilient Firebase Init".
- **Gap:** `src/services/firebase.ts` calls `getAuth(app)` unguarded at module scope. `getAuth` throws synchronously (`auth/invalid-api-key`) when `VITE_FIREBASE_API_KEY` is missing/invalid, which happens **at import time** — blanking the whole storefront page (the catalog, the cart, everything), even though authentication is an **admin-only** concern the storefront never uses.
- **Side effect of the eager call:** `firebase/auth` is imported by the shared module, so it lands in the storefront bundle (and `vite.config.ts`'s `vendor-firebase` manual chunk includes it) — the bundle cost tracked by Task 8.1.

## 2. Human Action Items & Placeholders (TODO for Human)

None — no new configuration. (The existing `VITE_FIREBASE_*` placeholders in `.env.example` already cover the admin flow.)

## 3. Proposed Changes

- **[MODIFY] `src/services/firebase.ts`** — remove the `getAuth` import and the eager `export const auth`; export the `app` instance instead. `initializeApp`/`initializeFirestore` do not throw on bad config (failures surface per-request, where `fetchProducts()` already degrades to the unavailable-catalog UI), so removing the eager auth init is the complete fix for the import-time blanking.
- **[NEW] `src/admin/services/adminFirebase.ts`** — the admin-only auth accessor: `getAdminAuth(): Auth | null`, a thin guarded `getAuth(app)` that logs a loud `[Admin Auth]` error and returns `null` when the config is unusable. Nothing under `src/` outside `src/admin/**` imports it, so `firebase/auth` stays out of the storefront bundle.
- **[MODIFY] `src/admin/services/adminApi.ts`** — `getAuthHeaders()` resolves `getAdminAuth()?.currentUser` per call (the existing `auth?.currentUser` optional chain already carried the null contract).
- **[MODIFY] `src/admin/components/AdminLogin.tsx`** — resolve the auth instance at submit; a `null` instance surfaces a Spanish configuration error on the form and never calls `signInWithEmailAndPassword`.
- **[MODIFY] `src/admin/AdminApp.tsx`** — resolve the auth instance in the mount effect; a `null` instance keeps the login screen rendered (with a loud log) instead of crashing, and `handleSignOut`/the login-success callback guard it too.
- **[MODIFY] `vite.config.ts`** — drop `firebase/auth` from the `vendor-firebase` manual chunk (the storefront no longer references the module; the admin entry gets it through its own graph). This is the 8.1 bundle win the task calls out.
- **[MODIFY] tests** — `src/tests/services/firebase.test.ts` (getAuth no longer called at import — the 8.11 regression pin; init-order assertions updated), new `src/tests/admin/adminFirebase.test.ts`, `AdminLogin.test.tsx` + `AdminApp.test.tsx` config-broken cases.
- **[MODIFY] docs** — `src/services/AGENTS.md` (§1.1 firebase.ts row, §2.2 caveat 4, the §4.5/§4.6 gap notes), `src/admin/` as-built note, `PRODUCTION_READINESS_TODO.md` (checkbox + as-built + 8.1 cross-note).

## 4. Robust Unit Testing Plan (MANDATORY)

1. **`src/tests/admin/adminFirebase.test.ts` (new):**
   - `getAdminAuth()` returns the `getAuth(app)` instance.
   - A throwing `getAuth` (the `auth/invalid-api-key` shape) yields `null` + a loud `console.error` — never a throw through the module boundary.
   - The storefront bundle config: `vite.config.ts`'s `vendor-firebase` chunk no longer lists `firebase/auth` (the bundle win cannot silently regress).
2. **`src/tests/services/firebase.test.ts` (updated):** after a fresh import, `getAuth` is **never called** (the blank-storefront regression pin); the App Check init-order case drops its `getAuth` leg.
3. **`src/tests/admin/AdminLogin.test.tsx`:** a broken auth config (throwing `getAuth`) renders the Spanish configuration error on the form, never calls `signInWithEmailAndPassword`, and does not crash.
4. **`src/tests/admin/AdminApp.test.tsx`:** a broken auth config renders the login screen (no crash, no unhandled listener) and `onAuthStateChanged` is never registered.
5. **Zero regressions:** full suite + the five gates (which now include `typecheck:server`) stay green.

## 5. As-Built Documentation & Roadmap Sync Plan

- `src/services/AGENTS.md`: firebase.ts row drops `getAuth`; §2.2 caveat 4 rewritten (the missing-config branch is now reachable in the browser — the storefront survives); the §4.5/§4.6 gap notes closed.
- `PRODUCTION_READINESS_TODO.md`: mark 8.11 `[x]` in §1 board + §3 entry (as-built), with a cross-note under 8.1 that the storefront's `firebase/auth` cost is now gone (8.1's remaining scope is the admin/Firestore graph).
- `.devin/artifacts/task-8.11/walkthrough.md` at wrap-up.
