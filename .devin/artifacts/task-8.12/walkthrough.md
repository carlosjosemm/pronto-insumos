# Task 8.12 — Walkthrough: Security Headers in `vercel.json`

**Branch:** `chore/task-8.12-security-headers` — **middle of the stack** `8.4 → 8.12 → 8.13`, based on `chore/task-8.4-preflight-gate-and-minimal-ci` (PR #46).
**Commit:** see the branch's single commit (conventional, with the Devin trailer).
**Pull request:** opened against the 8.4 branch; linked into the GitHub stack after 8.13 exists.

---

## What shipped

1. **Anti-framing, enforced, on all three admin URLs.** `/admin`, `/admin.html` and `/admin/:path*` each send `X-Frame-Options: DENY` and an enforced `Content-Security-Policy: frame-ancestors 'none'` containing nothing else. That closes the clickjacking surface on *Aprobar Transferencia*, *Marcar Despachado* and the destructive inventory controls.
2. **Baseline hardening on every non-`api/` path.** `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` denying the features the app never uses.
3. **The full CSP, staged as `Content-Security-Policy-Report-Only`**, exactly as the task prescribes, built from an origin inventory read out of the source: Google Fonts (`style-src`/`font-src`), Firestore + Firebase Auth + the signed Storage PUT + the SDK telemetry transport (`connect-src`), Storage download tokens (`img-src`), and a `script-src 'self'` with **no** `'unsafe-inline'`/`'unsafe-eval'`. `style-src` carries `'unsafe-inline'` because the UI sets ~575 inline React `style={{ … }}` attributes.
4. **No new function** — `headers` is edge configuration, so the Hobby function count stays at 6.
5. **An 8-case static contract test** that parses the file and pins all of the above, including the staged-rollout invariant.

## Verification

| Gate | Result |
| :--- | :--- |
| `pnpm test` | **1230/1230** across **100 suites** (+1 suite, +8 cases) |
| `pnpm run verify:full` | clean (test, tsc, build, lint, format:check) |
| `vercel.json` parses + rewrites unchanged | asserted by the suite |
| `/admin.html` guard | **mutation-verified:** deleting that rule fails the suite (8/8 → 1 failed); restoring it passes |
| `script-src` strictness | asserted: no `'unsafe-inline'`, `'unsafe-eval'`, `*`, `data:` |
| No CORS header introduced | asserted |

## Review findings and disposition

Adversarial review: **BLOCK** on one finding, plus minors. The block was a real bypass, not a style issue.

| # | Finding | Disposition |
| :-- | :--- | :--- |
| **F1** | **BLOCKER — `/admin.html` bypassed the anti-framing headers.** `dist/admin.html` is a real static file served ahead of the catch-all rewrite, so it reached the logged-in backoffice without matching either rewrite source; the global rule carries no enforcing anti-framing header. Three docs claimed the hole was "closed immediately". | **Fixed.** A third rule now covers `/admin.html`; the test enumerates *every* non-global `headers` source so a new admin-serving URL cannot be added without the pair, and it was mutation-verified. All three docs were corrected — the "closed immediately" wording is gone, replaced by an explicit warning that `/admin.html` is the easy-to-miss third URL. |
| F2 | The "no api path" assertion was a tautological substring check. | **Fixed.** The global `source` is now evaluated as a regex against a path table (`/`, `/admin`, `/admin.html`, an asset URL match; `/api/orders`, `/api/webhooks/mercadopago` do not). |
| F3 | The enforcement checklist omitted the legacy `data:` voucher `fetch` in the backoffice. | **Fixed, by hardening rather than documenting.** `data:` is now in `connect-src` with its consumer named, so enforcing the policy cannot silently break *Ver comprobante* on pre-2.9 orders. |
| F4 | The `Permissions-Policy` docs mentioned clipboard, which the header does not deny. | **Fixed.** The clipboard claim is removed from the doc sentence; the plan records that `clipboard-read`/`clipboard-write` are deliberately not denied (no clipboard API exists today, and a future "copy bank details" button is legitimate). |

## Pre-existing observation (out of scope, for the owner)

The live deployment returns `access-control-allow-origin: *` on every **static** response (`/`, assets, `/admin`, `/admin.html`). That is a Vercel project-level setting, not this file — this change introduces no CORS header (pinned by the suite). It is not needed for same-origin assets and is worth a separate look, but it is not part of 8.12.

## Human action items

None to build or merge. The owner step before enforcement remains: on a preview, confirm **zero** report-only violations while walking the catalog load, the font render, the admin login, a voucher upload, a product image and the Checkout Pro redirect — then rename the global rule's header key to `Content-Security-Policy`. Add any new origin first.

## Known limits

- The policy is **not enforced**; a green suite proves the header set is present and strict, not that a browser is happy with it. That is the preview walkthrough's job.
- `firebaselogging-pa.googleapis.com` (the SDK telemetry host) and the `storage.googleapis.com` PUT host were reasoned from the SDK/GCS conventions rather than observed on a live deployment; both are cheap to confirm during the preview walkthrough.
- The `headers` block has not been exercised on a deployed preview (the agent must not deploy).
