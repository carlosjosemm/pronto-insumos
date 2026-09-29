# Task 2.9: Bank-Transfer Voucher Storage & Validation Rework

**Branch:** `fix/task-2.9-voucher-storage-validation` (cut from `main` @ `40d7aa2`, synced with `origin/main`; executing in the primary working tree)
**Status:** Implemented, verified, reviewed and rebased onto `origin/main` (which had merged Tasks 2.8 and 7.1); H1–H6 provisioned and smoke-tested against the live bucket. Awaiting merge of the PR.
**Owner decisions already taken:** (1) storage design = **Firebase Storage + client-direct signed-URL upload**; (2) lifecycle guard = transition allowed from `PENDIENTE_TRANSFERENCIA` **and** `TRANSFERENCIA_COMPROBANTE_SUBIDO` (same-state re-upload replaces the voucher).

---

## 1. Context & Problem Statement

Reference: `PRODUCTION_READINESS_TODO.md` → **2.9. Bank-Transfer Voucher Storage & Validation Rework** (audit finding, P1).

As built, `/api/upload-voucher` receives a Base64 `dataUrl` and writes **the whole thing into the order document**:

| # | Defect (as built) | Consequence |
| :-- | :--- | :--- |
| D1 | Bytes stored in the Firestore order doc | > ~750 KB voucher ⇒ Firestore's 1 MiB document cap ⇒ `batch.commit()` 500 (and the client used to report that as success — Task 2.8) |
| D2 | Even sub-1 MiB vouchers occupy the **shared 1 GiB Spark free tier** | A few hundred vouchers exhaust it; writes then fail until the daily reset |
| D3 | MIME/size validated **client-side only** (`transferVoucher.ts`) | Any caller can store any byte stream / any size |
| D4 | No lifecycle guard | Anyone with `orderId` + RUT can overwrite a voucher and regress `PAGADO_MERCADOPAGO` / `DESPACHADO` / `ENTREGADO` → `TRANSFERENCIA_COMPROBANTE_SUBIDO` |
| D5 | Vouchers are Base64 **data URLs** | Chrome blocks top-frame navigation to `data:` ⇒ the admin portal's *Ver Comprobante* link is dead; `/api/track-order` also echoes the full Base64 blob in its JSON |

**Verified platform constraints** (recorded in the TODO on 2026-09-28, re-verified here): Firestore 1 MiB/doc + 1 GiB shared Spark storage; Vercel Functions cap request bodies at 4.5 MB (a 5 MB voucher as Base64 ≈ 6.7 MB can never transit); Cloud Storage for Firebase requires **Blaze** (Spark has no bucket access at all).

**Chosen design (owner decision):** client-direct upload — the serverless function handles **authorization, MIME/size validation and metadata only**; bytes go **browser → bucket** over a short-lived V4 signed PUT URL. No Base64 anywhere, no Firestore document bloat, and `voucherUrl` becomes a real HTTPS link.

---

## 2. Human Action Items & Placeholders (TODO for Human)

> [!IMPORTANT]
> **Enable Blaze BEFORE merging/deploying this branch.** Until the bucket exists, production voucher uploads fail closed with a 500 (the customer sees an honest error + WhatsApp fallback instead of a fabricated success). No Firestore document limit is hit either way.

| # | Action | Where / command |
| :-- | :--- | :--- |
| H1 | Enable the **Blaze** plan (no-cost tiers remain: 5 GB stored, 1 GB/day download, 20k uploads/day; it also lifts the Firestore 1 GiB cap) | Firebase Console → `pronto-insumos` → Usage & billing → Modify plan |
| H2 | Create/enable the default **Storage bucket** (pick the region closest to Chile, e.g. `southamerica-east1`) | Console → Build → Storage → *Get started* |
| H3 | Set `FIREBASE_STORAGE_BUCKET` (server-side) in `.env.local` **and** Vercel (Production + Preview) to the **exact bucket name shown in the console** — the `${FIREBASE_PROJECT_ID}.firebasestorage.app` default only holds for projects created after Oct 2024 (legacy buckets are `.appspot.com`); see R5 | `pnpm run env:sync -- --target production --apply` (new key synced automatically) |
| H4 | Apply the **bucket CORS** config so the browser `PUT` to the signed URL passes preflight | `pnpm run storage:cors -- --apply` (dry run by default) — added during execution because this machine has no Cloud SDK; the equivalent `gcloud storage buckets update gs://<bucket> --cors-file=scripts/storage-cors.json` remains documented |
| H5 | Deploy the new **storage rules** (deny-all; all access is Admin-SDK / signed / token URLs) | `pnpm run deploy:storage-rules` |
| H6 | Smoke test one real voucher upload on a preview deploy (sign → PUT → confirm → admin *Ver Comprobante*) | Manual, after H1–H5 |

New placeholder in `.env.example`: `FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.firebasestorage.app` (non-secret, optional override).

**No new npm dependency.** `@google-cloud/storage@8.2.0` is already installed as firebase-admin's optional dependency (verified resolvable from `firebase-admin`'s context, `getSignedUrl` available).

---

## 3. Proposed Changes

### 3.A `[NEW] api/_lib/voucherStorage.ts` — pure helpers + bucket accessor

Single place for every voucher constant/derivation (mirrors how `src/config/delivery.ts` owns its thresholds):

```ts
export const VOUCHER_MAX_BYTES = 5 * 1024 * 1024          // 5 MiB — client-direct, no Vercel body cap involved
export const VOUCHER_UPLOAD_URL_TTL_MS = 10 * 60 * 1000   // signed PUT validity
export const ALLOWED_VOUCHER_CONTENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const

export function normalizeVoucherContentType(raw: unknown): string | null   // strips ';charset', lowercases, image/jpg → image/jpeg
export function extensionForVoucherContentType(ct: string): 'pdf' | 'png' | 'jpg'
export function sanitizeVoucherFileName(raw: unknown): string              // no separators/control chars, ≤120 chars
export function sanitizeOrderIdForPath(orderId: string): string            // [A-Z0-9-] only
export function buildVoucherStoragePath(collectionName, orderId, contentType, now, token): string
export function isVoucherStoragePathForOrder(path, collectionName, orderId): boolean  // prefix assertion
export function buildVoucherDownloadUrl(bucketName, storagePath, token): string
export function validateVoucherFileMetadata(meta: { size?: unknown; contentType?: unknown }): { valid: boolean; error?: string }
export function getVoucherBucket(): Bucket | null                          // getAdminApp() + bucket name (env override or derived)
```

- Path layout: `vouchers/{orders|dev_orders}/{PRONTO-XXXXXX}/{epochMs}-{8 hex}.{ext}` — mirrors the environment-scoped collection (`getCollectionName('orders')`), so prod and dev vouchers never mix.
- Download URL uses the Firebase convention (`…/o/{encodeURIComponent(path)}?alt=media&token=…`) with a 128-bit random token stored as `firebaseStorageDownloadTokens` metadata — the same shape `firebase-admin`'s `getDownloadURL()` produces, composed locally (no extra round trip) and unit-testable.
- `getVoucherBucket()` returns `null` when Admin credentials are missing (same degradation contract as `getAdminFirestore()`).

### 3.B `[MODIFY] api/upload-voucher.ts` — two-phase, action-dispatched endpoint

**No new serverless function** (Hobby slot count stays 6/12). `req.body.action` selects the phase:

| Phase | Request | Server work | 200 response |
| :--- | :--- | :--- | :--- |
| `sign` | `{ action:'sign', orderId, rut, fileName, contentType, sizeBytes }` | presence checks → RUT normalize → order lookup (doc-id, then `where('orderId','==')` fallback) → RUT equality (`401`) → **lifecycle guard** (`409` unless `PENDIENTE_TRANSFERENCIA` / `TRANSFERENCIA_COMPROBANTE_SUBIDO`) → MIME allowlist (`400`) → declared size `0 < n ≤ 5 MiB` (`400`) → `getSignedUrl({ version:'v4', action:'write', expires, contentType })` | `{ success, orderId, uploadUrl, storagePath, contentType, expiresAt }` |
| `confirm` | `{ action:'confirm', orderId, rut, storagePath, fileName }` | same auth + lifecycle guard → `isVoucherStoragePathForOrder` prefix assertion (`400`) → `getMetadata()` → **authoritative** size/contentType re-validation (violation ⇒ delete object + `400`) → idempotent fast path (same `voucherStoragePath` + status already `TRANSFERENCIA_COMPROBANTE_SUBIDO` ⇒ `{ duplicate: true }`, no write/email) → batch: order doc + `order_status_history` → best-effort delete of the **previous** object → warehouse alert email | `{ success, orderId, voucherUrl, voucherFileName, voucherUploadedAt, status:'TRANSFERENCIA_COMPROBANTE_SUBIDO', message }` |

- **Order document written at confirm:** `voucherUrl` (HTTPS download-token URL — never `data:`), `voucherStoragePath`, `voucherFileName` (sanitized), `voucherContentType` (normalized), `voucherSizeBytes` (actual, from Storage metadata), `voucherUploadedAt`, `status`, `updatedAt`.
- **Write-then-delete ordering:** the doc write commits first; the replaced object is deleted only afterwards (best-effort, `console.warn` on failure) so a failed write can never destroy the existing voucher.
- **Fail-closed in a production runtime** (reuses `isSimulatedPaymentAllowed()` from `api/_lib/simulationPolicy.ts` — one shared gate definition, per Task 0.10): Admin unavailable, bucket/signing failure, or metadata failure ⇒ `500` + loud `console.error` with a customer-safe message pointing at WhatsApp. Outside production the existing simulated path is kept, now explicitly flagged `simulated: true` in the payload (it fabricates no URL, so the client cannot mistake it for a real upload).
- A body carrying `dataUrl` is rejected with a dedicated `400` ("el envío en base64 ya no está soportado") so a stale cached bundle logs a precise cause instead of a generic failure.
- Existing behavior preserved: `OPTIONS` → 200, non-POST → 405, warehouse alert is fail-safe/non-blocking.

### 3.C `[MODIFY] src/services/transferVoucher.ts` — three-step client orchestration

`uploadTransferVoucher()` becomes: local validation → `POST {action:'sign'}` → `PUT` the raw `File` to `uploadUrl` → `POST {action:'confirm'}` → typed result.

- `fileToDataUrl()` and the whole Base64 path are **deleted** (no consumer left after this change).
- `validateVoucherFile()` stays (same 5 MB cap / PDF-PNG-JPG copy) — still the UX gate for both upload surfaces.
- New small helper `resolveVoucherContentType(file)` (declared MIME, else derived from the extension) so the signed URL binds a content type even when the browser reports an empty `file.type`.
- **Real HTTP errors surface** (400/401/409/413/500/503 ⇒ `{ success:false, error }` with the server's Chilean-Spanish message): the previous "any failure ⇒ simulated success" contract is what makes D1/D4 invisible, and Task 2.8's direction is explicit that only a *demonstrably absent* endpoint may simulate. Simulation now requires `import.meta.env.DEV` **and** a non-JSON failure (Vite dev server without `vercel dev`), and its message is honest (`modo desarrollo — no se almacenó`). This pre-empts the `uploadTransferVoucher` row of Task 2.8 (the other rows — `mercadopago`, `orderTracking` — stay open; §5 records the split).

### 3.D `[MODIFY] src/types/index.ts` — order contract

Add `voucherStoragePath?: string`, `voucherContentType?: string`, `voucherSizeBytes?: number` to `Order` (documented in `src/types/AGENTS.md` §2.4c). `UploadVoucherResult` is unchanged.

### 3.E `[MODIFY] api/track-order.ts` — stop echoing Base64 blobs

`voucher.url` is returned only when it is a real URL (`data:` payloads are omitted; `uploaded` / `fileName` / `uploadedAt` unchanged). Legacy orders therefore no longer ship a ~1 MiB Base64 blob to the tracking modal.

### 3.F `[MODIFY] src/components/OrderTrackingModal.tsx` — make re-upload reachable

The voucher widget currently renders only for `PENDIENTE_TRANSFERENCIA`, so the owner-approved "replace a wrong voucher" path would be unreachable from the UI. The widget now also renders for `TRANSFERENCIA_COMPROBANTE_SUBIDO` with adjusted copy ("Ya recibimos tu comprobante. Si te equivocaste de archivo, puedes reemplazarlo aquí."). Same markup/classes, no CSS work. `CheckoutModal` needs **no** change (its copy "PDF, PNG, JPG - máx 5MB" stays accurate).

### 3.G `[MODIFY] src/admin/components/OrderDetailPanel.tsx` — legacy voucher viewing

*Ver Comprobante* is an `<a href={voucherUrl} target="_blank">`; Chrome refuses top-frame `data:` navigation, so pre-2.9 vouchers are unviewable. Clicking now converts a legacy `data:` URL to a Blob object-URL before opening (real HTTPS URLs keep the plain link, unchanged). ~10 lines, no dependency; the existing test fixture (`https://example.com/receipt.pdf`) is unaffected.

### 3.H `[NEW] storage.rules` + `[NEW] scripts/configure-storage-cors.ts` + `[MODIFY] firebase.json`, `package.json`, `.env.example`, `[NEW] scripts/storage-cors.json`

- `storage.rules`: `allow read, write: if false;` — the bucket is **never** touched by client SDKs; signed PUTs (Admin SDK signature) and download-token URLs do not consult these rules, so deny-all is the correct posture and closes any "test-mode bucket" exposure.
- `firebase.json`: register `"storage": { "rules": "storage.rules" }`.
- `package.json`: new `deploy:storage-rules` script. `deploy:rules` is left untouched (it would start failing on Spark, where a storage-rules deploy is impossible).
- `scripts/storage-cors.json`: PUT + `Content-Type` + `x-goog-content-length-range` preflight config (origins `*` — the signed URL is the capability, expires in 10 min, and CORS is not an auth boundary). GCS answers the preflight's `Access-Control-Allow-Headers` from this list, so both headers must stay.
- `scripts/configure-storage-cors.ts` (+ `pnpm run storage:cors`, **added during execution**): applies that file through the Admin SDK credentials in `.env.local`, for machines without the Cloud SDK. Dry run by default, validates the PUT method and both required headers before writing, verifies the bucket exists (reporting the Blaze prerequisite otherwise) and is idempotent. Pinned by `src/tests/scripts/configureStorageCors.test.ts` (9 cases).
- `.env.example`: `FIREBASE_STORAGE_BUCKET` with the Blaze prerequisite noted.

### 3.I `[MODIFY]` tests — see §4.

### Explicitly NOT done (scope guardrails)

- No data migration of existing vouchers (legacy `data:` URLs stay readable via §3.G); no Firestore schema/collection changes; no new serverless function; no new npm dependency; no client-side image compression (unnecessary once the 4.5 MB function cap is bypassed); no `order_status_history` schema change; no changes to the admin order list/history endpoints.
- Orphan objects from an abandoned sign→confirm window are accepted as bounded waste (≤5 MiB, 10-min signed URLs) and documented — no lifecycle/cleanup cron (that would be new infrastructure).

---

## 4. Robust Unit Testing Plan (MANDATORY)

All boundaries mocked (`firebaseAdmin`, `firebase-admin/storage`, `global.fetch`); no live Firebase/Storage/Resend calls.

**`[NEW] src/tests/api/voucher-storage.test.ts`** (~10 tests) — pure helpers: content-type normalization (`image/jpg`→`image/jpeg`, `; charset` stripping, garbage ⇒ `null`), extension mapping, path building (env-scoped prefix, sanitized orderId, extension from MIME), prefix assertion (accepts same order, rejects another order / traversal / partial match), download-URL composition (encoded path + token), `validateVoucherFileMetadata` boundaries (0, exactly 5 MiB, 5 MiB + 1, unknown/oversized types), filename sanitization.

**`[MODIFY] src/tests/api/upload-voucher.test.ts`** (~20 tests, rewritten around the two phases):
- Transport: `OPTIONS` → 200; `GET` → 405; unknown/missing `action` → 400; `dataUrl` in body → 400 with the Base64-deprecation message.
- `sign`: missing `orderId`/`rut`/`fileName`/`contentType`/`sizeBytes` → 400; invalid MIME → 400; `sizeBytes` 0 / negative / > 5 MiB → 400; unknown order → 404; RUT mismatch → 401; **status guard**: `PENDIENTE_TRANSFERENCIA` ✅, `TRANSFERENCIA_COMPROBANTE_SUBIDO` ✅ (re-upload), `PAGADO_MERCADOPAGO` / `PAGADO_TRANSFERENCIA` / `DESPACHADO` / `ENTREGADO` / `CANCELADO` / `COTIZACION_SOLICITADA_WHATSAPP` → 409; happy path returns `uploadUrl`/`storagePath` under the order prefix and **writes nothing to Firestore** (no `batch.commit`, no order update) and stores **no bytes**.
- `confirm`: path belonging to another order → 400; object missing (`getMetadata` rejects) → 400/404; object over the cap → object deleted + 400; object with a disallowed content type → object deleted + 400; happy path writes `voucherStoragePath`/`voucherUrl`/`voucherSizeBytes`/normalized type + history event + warehouse email, and **the order payload contains no `data:` value** (the core D1 regression guard); re-upload deletes the previous object *after* the commit; duplicate confirm (same path, already `TRANSFERENCIA_COMPROBANTE_SUBIDO`) ⇒ `{ duplicate:true }` with no second write/email.
- Fail-closed: Admin unavailable → 500 in a production runtime (`VERCEL_ENV=production`), simulated `{ simulated:true }` otherwise; `getSignedUrl` rejection → 500 in production / simulated in dev; warehouse-email failure still returns 200.

**`[MODIFY] src/tests/services/transferVoucher.test.ts`** (~9 tests) — local validation (unchanged cases); happy path asserts the **3-call contract** (sign body has no bytes; PUT carries the raw `File` with the bound `Content-Type`; confirm body carries `storagePath`); sign 409 ⇒ `success:false` with the server message and **no** `simulated-voucher://` URL; PUT 403 ⇒ error surfaced; confirm 500 ⇒ error surfaced; non-JSON/network failure ⇒ simulated only with `vi.stubEnv('DEV', true)` (and **not** when `DEV` is false); invalid RUT/empty orderId short-circuit before any fetch.

**`[MODIFY] src/tests/components/OrderTrackingModal.test.tsx`** (+1) — the upload widget renders for `TRANSFERENCIA_COMPROBANTE_SUBIDO` with the replace copy and still calls `uploadTransferVoucher`.

**`[MODIFY] src/tests/api/track-order.test.ts`** (+1) — a legacy `data:` `voucherUrl` is not echoed in `voucher.url`, while `uploaded`/`fileName`/`uploadedAt` still are.

**`[MODIFY] src/tests/admin/OrderDetailPanel.test.tsx`** (+1) — legacy `data:` voucher renders and opens via the Blob path (HTTPS URL unchanged).

**`[NEW] src/tests/security/storage-rules.test.ts`** (~4 tests) — content assertions on `storage.rules` (deny-all read/write, no `allow write: if true`, rules_version 2) and `firebase.json` registration, mirroring the existing `firestore-rules` suite.

**Zero-regression target:** `pnpm test` — **663 tests / 72 suites** after rebasing onto `main` (which brought Task 2.8's `simulationPolicy` suite and Task 7.1's legal-page suites) — plus `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit`, all green.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- **`api/AGENTS.md`:** §1.1 table row for `/api/upload-voucher` (two-phase contract, no bytes in the doc, function count still 6); §3.2 rewritten as-built (signed-URL flow, lifecycle guard, authoritative metadata validation, fail-closed gate, orphan caveat); §4.2 env list (`FIREBASE_STORAGE_BUCKET`); §5 CORS/rules note.
- **`src/services/AGENTS.md`:** §1.1 row (`transferVoucher` = 3-step orchestration, `fileToDataUrl` removed); §6 table — the `uploadTransferVoucher` row is marked **RESOLVED (Task 2.9, pre-empts the 2.8 row for this adapter)** and the closing direction sentence updated.
- **`src/types/AGENTS.md`:** §2.4c order contract gains the three new voucher fields (with the "bytes never live in Firestore" invariant).
- **`src/components/AGENTS.md`:** voucher widget re-upload affordance; `src/admin/AGENTS.md`: legacy `data:` voucher viewer note.
- **Root `AGENTS.md`:** §4 iron rules — new bullet: voucher bytes are never written to Firestore documents and the upload transition is lifecycle-guarded; §6 commands — `deploy:storage-rules`.
- **`PRODUCTION_READINESS_TODO.md`:** mark **2.9** `[x]` with the as-built record; keep main's resolved **2.8** entry and add the one-line note that its `uploadTransferVoucher` row was superseded by this task; refresh the repository-state header counts.
- **`src/tests/AGENTS.md`:** suite/test counts + the new suites.

---

## 6. Verification Sequence (workflow steps 6 → 8)

1. `pnpm test` — full suite green (no regressions).
2. `pnpm build` — production bundle compiles.
3. `pnpm lint` + `pnpm format:check` + `pnpm exec tsc --noEmit`.
4. Adversarial read-only code review (fresh-context subagent per the `code-review` skill): signed-URL scope/TTL, path traversal, TOCTOU between sign and confirm, idempotency, production fail-closed, payload-size guarantees, negative assertions.
5. Remediate findings, re-run 1–3, then update the as-built docs and the roadmap checkbox.

---

## 7. Open Risks Recorded for the Owner

| # | Risk | Mitigation / disposition |
| :-- | :--- | :--- |
| R1 | Branch merged before Blaze is enabled ⇒ production voucher uploads return 500 | H1–H5 are sequenced **before** merge; the customer sees an honest error + WhatsApp fallback, never a fabricated success. |
| R2 | Signed URL leaks ⇒ ≤5 MiB written to one order-scoped path within 10 min | Path is prefix-bound to the order, the confirm phase re-validates metadata and the lifecycle guard, and the object is deleted on any validation failure. |
| R3 | Abandoned sign→confirm leaves an orphan object | Bounded to **≤5 MiB**: `x-goog-content-length-range` is signed into the URL and echoed by the browser, so Storage itself refuses oversized PUTs even when `confirm` is never called (review F1). One object per attempt, documented; no cleanup infrastructure added. |
| R4 | Download-token URL is a long-lived capability | 128-bit random token, bucket otherwise deny-all; revocation = clearing `firebaseStorageDownloadTokens`. Same exposure level as the previous RUT+orderId path. |
| R5 | Preview deploys without `FIREBASE_STORAGE_BUCKET` set fall back to the derived default | `.env.example` placeholders are now rejected as *unconfigured* (⇒ production `500` + loud log, review F4). A wrong-but-well-formed bucket name is **not** detectable at sign time (`getSignedUrl` signs locally) — it surfaces as a `PUT 404` in the browser, so **H3 must be verified against the console value** (`.firebasestorage.app` vs legacy `.appspot.com`). |

---

## 8. Adversarial Review Disposition (fresh-context reviewer, read-only)

Verdict: **APPROVE WITH FINDINGS** — 7 findings, no blocker. All were addressed in the working tree; the full-suite gate was re-run afterwards (now **663/663**, 72 suites, after the rebase onto `main`).

| # | Sev | Finding | Disposition |
| :-- | :--- | :--- | :--- |
| F1 | Major | The signed PUT URL did not bound the upload size — the documented "≤5 MiB orphan" claim was false (only `content-type` + `host` were signed) | **Fixed** — `x-goog-content-length-range: 0,5242880` is now signed via `extensionHeaders`, echoed by the browser (`maxBytes` from the sign response, so the value can never drift), and listed in the CORS `responseHeader` (GCS builds `Access-Control-Allow-Headers` from it). Tests pin both halves. |
| F2 | Major | As-built guides + roadmap still described the pre-2.9 pipeline; every test count stale | **Fixed** — §5 executed: `api/AGENTS.md` §1.1/§1.2/§3.2/§4.2/§8.1, `src/services/AGENTS.md` (§1.1, §4 rule 5, §6), `src/types/AGENTS.md` (§2.4c + tracking), `src/components/AGENTS.md` (§3.x, §4.3), `src/admin/AGENTS.md` (§1), root `AGENTS.md` (§1 counts, §4 iron rule, §6 command), `src/tests/AGENTS.md`, TODO 2.9 `[x]` + 2.8 annotation, plan status/R3/R5. |
| F3 | Minor | Lifecycle guard asserted outside the write — a concurrent admin approval could be regressed by `confirm` (TOCTOU) | **Fixed** — `confirm` now runs in `adminDb.runTransaction()`, re-reads the order, re-asserts the guard, and deletes the object + returns `409` when the status changed. A retried confirm of the same object short-circuits **before** any side effect (no token rotation). Both paths are pinned by tests. |
| F4 | Minor | Bucket-name default is an unverified guess; `.env.example` placeholders accepted as real; the wrong-name failure mode was misdescribed | **Fixed (partially, by design)** — placeholder-shaped values are rejected as unconfigured (⇒ production `500` + loud log), R5/H3 now state the real failure mode (`PUT 404`, not a server 500) and require verifying the console bucket name. `bucket.exists()` was considered and rejected: a service account without `storage.buckets.get` would produce a false negative that breaks *working* uploads. |
| F5 | Minor | `cert()` does not populate `app.options.projectId`, so the unit test asserted a shape production cannot produce | **Fixed** — `resolveVoucherBucketName` documents the real coupling (env first, app options as a fallback); the suite now mocks `{ options: {} }` with `FIREBASE_PROJECT_ID` set, i.e. the production shape. |
| F6 | Nit | The legacy-voucher test mutated the global `URL` without restoring it | **Fixed** — the object-URL statics are captured and restored after the assertions. |
| F7 | Nit | `VOUCHER_MAX_FILE_BYTES` exported with no consumer | **Fixed** — `voucher-storage.test.ts` now asserts the client cap equals the server cap (and pins the signed header value), making the cross-runtime contract explicit. |
| P1 | Minor (pre-existing) | Raw internal error messages echoed to unauthenticated callers on the 500 path | **Fixed for this endpoint** — the outer catch logs the raw cause and returns the customer-safe message. The same house pattern in `create-preference` / `track-order` / `order-confirmation` is unchanged and remains a separate follow-up. |

**Also recorded:** the owner-approved deviation from the TODO's literal "only from `PENDIENTE_TRANSFERENCIA`" (same-state re-upload is allowed by design, and the tracking modal exposes it) — documented in `api/AGENTS.md` §3.2 and `src/components/AGENTS.md` §4.3. The H4 CORS step ships as `scripts/configure-storage-cors.ts` (owner-approved addition, this machine has no `gcloud`); the gcloud command remains the documented alternative. Final gate after that addition and the rebase onto `main`: **663/663 tests / 72 suites**, build, lint, format:check and tsc all green.
