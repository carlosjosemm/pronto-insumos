# Task 8.12: Security Headers in `vercel.json`

**Branch:** `chore/task-8.12-security-headers` — **middle of the stack** `8.4 → 8.12 → 8.13`, cut from `chore/task-8.4-preflight-gate-and-minimal-ci` @ `428f825` (PR #46).
**Status:** Implemented, reviewed, remediated — gates green; awaiting the stack wrap-up commit. Adversarial review returned **BLOCK** on one finding (F1: `/admin.html` bypassed the anti-framing headers, because `dist/admin.html` is served as a static file ahead of the catch-all rewrite), plus F2–F4 minors; all remediated (see the walkthrough).

---

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` **8.12 (P2)**:

> `vercel.json` only defines rewrites — no `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy`. The admin portal can be framed (clickjacking on approve/dispatch buttons). Add headers via `headers` in `vercel.json` (no new function): `frame-ancestors 'none'` on `/admin*`, `nosniff`, `strict-origin-when-cross-origin`, and a CSP that allows only the origins actually used (self, Google Fonts, Firebase/Google APIs, Mercado Pago, `wa.me` links). Start `Content-Security-Policy-Report-Only`, verify on a preview deploy, then enforce.

Verified against the branch base:

- `vercel.json` contains **only** `rewrites` — every response is served with Vercel's defaults, so nothing prevents the admin portal from being framed. That is the concrete vulnerability: `/admin` renders *Aprobar Transferencia*, *Marcar Despachado* and the destructive inventory controls, and a framed page can be click-jacked.
- **The header mechanism needs no function.** Vercel applies `headers` at the edge, so this costs zero of the 6 used Hobby function slots (guardrail 2 stays satisfied).
- **The origins actually used, inventoried from the source (not guessed):**

  | Origin | Directive | Consumer |
  | :--- | :--- | :--- |
  | `'self'` | everything | our bundle, `/api/*` fetches, the rewrites |
  | `https://fonts.googleapis.com` | `style-src` | the Google Fonts stylesheet linked by `index.html` and `admin.html` |
  | `https://fonts.gstatic.com` | `font-src` | the font binaries that stylesheet loads |
  | `https://firestore.googleapis.com` | `connect-src` | the Firestore Web SDK channel |
  | `https://identitytoolkit.googleapis.com`, `https://securetoken.googleapis.com` | `connect-src` | Firebase Auth (admin login, `getIdToken`) |
  | `https://storage.googleapis.com` | `connect-src` | the **signed V4 PUT** that uploads a transfer voucher browser → Storage |
  | `data:` | `connect-src` | the backoffice `fetch`es a legacy Base64 voucher URL before re-wrapping it as a Blob (`OrderDetailPanel.handleOpenVoucher`) |
  | `https://firebaselogging-pa.googleapis.com` | `connect-src` | the SDK's own telemetry transport |
  | `https://firebasestorage.googleapis.com` | `img-src` | Storage download-token URLs |
  | `data:`, `blob:` | `img-src` | inline SVG/data URLs and the legacy-voucher Blob URL the backoffice opens |
  | `https://www.mercadopago.cl` | `form-action` | Checkout Pro |
  | `https://wa.me` | **no directive** | see below |

- **Two surfaces CSP cannot govern, and the policy says so instead of pretending otherwise:** the Checkout Pro handoff is a top-level `window.location` redirect to `init_point`, and every `wa.me` link is an `<a href>`. Both are *navigations*, and the only directive that could constrain navigations (`navigate-to`) is unimplemented in every browser — so neither appears in `connect-src`/`img-src`, and `wa.me` appears nowhere at all. `www.mercadopago.cl` is listed under `form-action` so a future form-based handoff is pre-authorized.
- **`style-src` cannot be `'self'` alone:** the codebase sets **575** inline `style={{ … }}` attributes (React inline styles). A bare `style-src 'self'` blocks every one of them, so the policy carries `'unsafe-inline'` for styles — while `script-src` stays `'self'` with **no** `'unsafe-inline'`/`'unsafe-eval'`, which is where the real XSS value is. The only inline `<script>` in either HTML entry is the `application/ld+json` data block, which is not executed as script and is therefore not subject to `script-src`.
- **Staged rollout, exactly as the task prescribes:** the full policy ships as `Content-Security-Policy-Report-Only` (reports, blocks nothing) because the task requires a preview verification before enforcement, and the agent must not deploy a preview. The clickjacking hole is nonetheless closed **immediately** with two enforced headers on `/admin*`: `X-Frame-Options: DENY` and a minimal enforced `Content-Security-Policy: frame-ancestors 'none'`. That enforced policy carries only `frame-ancestors`, so it cannot break the admin app — unlike the report-only policy, which is not enforced at all.

---

## 2. Human Action Items & Placeholders (TODO for Human)

- **None** — no credential, no secret, no environment variable, nothing added to `.env.example`.
- **Owner verification before enforcement (the task's own sequence):**
  1. Deploy a preview (`pnpm dlx vercel`) and open the storefront and `/admin` with the browser console visible.
  2. Walk the flows the policy could plausibly break and confirm **zero** `Content-Security-Policy-Report-Only` violations: storefront catalog load (Firestore `connect-src`), Google Fonts render (`style-src`/`font-src`), admin login + `getIdToken` (`identitytoolkit`/`securetoken`), a bank-transfer voucher upload (`storage.googleapis.com` PUT), a product image (`firebasestorage` `img-src`), and the Checkout Pro redirect.
  3. Promote the policy to enforcement by renaming the header key from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` on the global rule (the `/admin*` rule already has its own enforced `frame-ancestors` policy). Re-run step 2 against the preview first — a violation that only appears after enforcement is a broken page for real customers.
  4. Optional: add a `report-uri`/`report-to` sink if violation telemetry is wanted later; it is deliberately omitted (no reporting endpoint exists, and a dead endpoint is noise).

---

## 3. Proposed Changes

### 3.1 `vercel.json` — one `headers` block, two rules, no new function

- **[MODIFY]** `vercel.json`
  - **Global rule** `source: "/((?!api/).*)"` (the same non-`api/` shape the existing rewrite uses, so API JSON responses do not carry page headers):
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy` denying the features the app never uses (`camera`, `microphone`, `geolocation`, `payment`, `usb`, `serial`, `bluetooth`, `magnetometer`, `gyroscope`, `accelerometer`, `midi`, `display-capture`, `idle-detection`) — verified against the source: no geolocation or media API is called, so nothing legitimate is denied. (`clipboard-read`/`clipboard-write` are deliberately **not** denied — the app uses no clipboard API today, but a future "copy bank details" button is a legitimate use and there is no reason to pre-emptively block it.)
    - `Content-Security-Policy-Report-Only` with the inventory from §1.
  - **Admin rule — three sources, `/admin`, `/admin.html` and `/admin/:path*`** (mirroring the two existing `/admin` rewrites *plus* the static file they rewrite to):
    - `X-Frame-Options: DENY`
    - `Content-Security-Policy: frame-ancestors 'none'` — **enforced**, minimal, and the only directive in it.
    - ⚠️ `/admin.html` is not optional: `dist/admin.html` is a real static file that Vercel serves **ahead** of the catch-all rewrite, so it reaches the same logged-in backoffice without matching either rewrite source. Covering only the two rewrite sources leaves a one-URL bypass — the adversarial review caught this.
  - The existing `rewrites` array is untouched (a test pins it).
  - No `Access-Control-Allow-Origin` or any other CORS header is added: nothing about CORS changes.

### 3.2 Tests

- **[NEW]** `src/tests/security/vercelHeaders.test.ts` — parses `vercel.json` and pins the contract (see §4). It follows the repository's existing `readFileSync`-based config-assertion pattern (`firestore-rules.test.ts`, `storage-rules.test.ts`, `storefrontCss.test.ts`), so no new dependency and no network.

### 3.3 Documentation

- **[MODIFY]** `AGENTS.md` — a new §7 subsection recording the header set, the origin inventory, the enforced-vs-report-only split, the `style-src 'unsafe-inline'` rationale, and the enforcement step; plus the two navigations CSP cannot govern.
- **[MODIFY]** `src/admin/AGENTS.md` — one line in the security section: the portal is un-frameable (XFO `DENY` + enforced `frame-ancestors 'none'`), and the report-only policy is the staged CSP.
- **[MODIFY]** `PRODUCTION_READINESS_TODO.md` — mark 8.12 `[x]` with an as-built note (including the pending enforcement step).
- **[NEW]** `.devin/artifacts/task-8.12/walkthrough.md` — written at wrap-up.

---

## 4. Robust Unit Testing Plan (MANDATORY)

`src/tests/security/vercelHeaders.test.ts` — a static contract test over `vercel.json` (no network, no Firestore), in the spirit of the existing rules/CSS guards:

1. **Structural:** the file parses; `rewrites` is unchanged (the three existing rewrites are still present and in order); a `headers` array exists.
2. **Global rule:** its `source` is evaluated against a path table — `/`, `/admin`, `/admin.html` and an asset URL match; `/api/orders` and `/api/webhooks/mercadopago` do not; it sets `nosniff`, `strict-origin-when-cross-origin`, and a non-empty `Permissions-Policy` that denies `camera`, `microphone` and `geolocation`.
3. **Staged rollout:** the full policy is present **only** as `Content-Security-Policy-Report-Only` on the global rule — the test fails if the global rule starts enforcing a `default-src` policy before the owner has verified it on a preview.
4. **Policy content (positive):** `default-src 'self'`, `base-uri 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `script-src 'self'`, `style-src` including `fonts.googleapis.com`, `font-src` including `fonts.gstatic.com`, `img-src` including `firebasestorage.googleapis.com` and `data:`/`blob:`, `connect-src` including `firestore.googleapis.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com` and `storage.googleapis.com`, `form-action` including `www.mercadopago.cl`.
5. **Policy content (negative — the point of the exercise):** `script-src` contains **no** `'unsafe-inline'`, `'unsafe-eval'`, `*`, `http:` or `data:`; `default-src` is exactly `'self'`; no directive contains a bare `*` or a scheme-only `https:`; `object-src` is `'none'`.
6. **Admin rule:** all **three** admin sources are covered — `/admin`, `/admin.html` and `/admin/:path*` — and the test enumerates every non-global `headers` source so a new admin-serving URL cannot be added without the anti-framing pair; each sets `X-Frame-Options: DENY`; each enforced CSP contains `frame-ancestors 'none'` **and nothing else** (so the enforced policy cannot break the admin bundle); the storefront rule does **not** carry an enforced `default-src` policy. **Mutation-verified:** deleting the `/admin.html` rule makes the suite fail (8/8 → 1 failed); restoring it passes.
7. **Regression:** no `Access-Control-Allow-Origin` is introduced anywhere.

**Regression safety:** the full suite (100 suites / 1230 tests) must stay green, plus the new suite. `pnpm run verify:full` must pass.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- `AGENTS.md` §7 — the header set, the origin inventory with each origin's consumer, the enforced/report-only split, the `style-src` rationale, and the enforcement procedure.
- `src/admin/AGENTS.md` §3 — the clickjacking posture of the portal.
- `PRODUCTION_READINESS_TODO.md` — checkbox `[x]` for 8.12 plus the as-built line recording the pending promotion of the report-only policy.
- No `api/AGENTS.md` change: no endpoint is added or modified.
