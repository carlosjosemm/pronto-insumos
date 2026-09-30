# Task 2.15: Bound Orphan Voucher Uploads and Legacy Payloads

**Branch:** `fix/task-2.15-voucher-upload-bounding` (primary working tree — no worktree; cut from `main` @ `85144e0`)
**Status:** **Implemented, reviewed, remediated — gates green; awaiting owner "wrap up and proceed".** 93 suites / 1064 tests (89-suite baseline + 4 new; rebased onto `origin/main` @ Task 2.18). Adversarial review returned *approve with findings* (M1/M2 doc sync, m1/m2, n1–n4); all code findings remediated, doc findings land in the as-built pass (step 8).
**Baseline on this branch:** `pnpm test` → 1014/1014 (89 suites) green after rebasing onto `origin/main` (Task 0.18 merge `85144e0`).

---

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` **2.15 (P2)** — three follow-ups left over from Task 2.9 (the browser→Storage voucher flow):

1. **Unconfirmed uploads are never cleaned up.** `handleSign` (`api/upload-voucher.ts:88-145`) mints a fresh
   `vouchers/{env}/{orderId}/{epochMs}-{token}.{ext}` object path on every call and mints a signed PUT URL
   with **no lifetime cap**. The Task 8.8 throttle bounds *attempts per 15-minute window*, so minting is
   bounded per window but **repeatable forever**. An upload that is signed and PUT but never `confirm`ed
   (tab closed, network drop) leaves an orphan object of up to 5 MiB under `vouchers/…` with no owner and
   no cleanup path — Cloud Storage bills it indefinitely. `handleConfirm` only deletes the object it
   *replaces* (`:329-331`), never an abandoned one.

2. **Legacy base64 vouchers bloat the admin list response.** Pre-2.9 order docs may carry the whole voucher
   as a `data:` URL in `voucherUrl` (up to ~1 MiB). `api/_lib/admin/orders.ts:47-58` spreads **every** field
   of **every** order into the list response, so a handful of legacy vouchers can exceed Vercel's **4.5 MB**
   response cap and break the entire backoffice order list. `/api/track-order` already hides `data:` URLs
   (`:226-231`); the admin list was not covered.

3. **`voucherUrl` is a permanent capability URL.** The Firebase download token never expires unless rotated.
   Acceptable today (only the RUT-authenticated customer and admins ever see it) — this is a documentation
   item, not a code change.

**Chosen direction (owner-confirmed):**
- Orphan uploads → **durable per-order sign counter (Firestore) + an authenticated housekeeping sweep on the
  existing `/api/admin/[action]` dispatcher** (no new serverless-function slot), triggered from the admin UI.
- Legacy payloads → **`orders.ts` list returns `hasVoucher` instead of `voucherUrl`; the `?orderId=` detail
  request still returns the full document**, and the admin UI fetches the detail on select. No data migration.

---

## 2. Human Action Items & Placeholders (TODO for Human)

- **No new credentials, secrets or environment variables.** Both new bounds are code constants; nothing is
  added to `.env.example`.
- **Operator action (documented, optional):** the housekeeping sweep is exposed as a button in
  `#settings`. The owner may run it periodically (e.g. after a campaign) to reclaim abandoned uploads.
- **Deployment:** no new Vercel function is added (the admin action rides the existing `api/admin/[action]`
  slot), so the Hobby 12-function cap is untouched (stays at 6 used).
- **Note for the owner (recorded, no action):** `voucherUrl` remains a non-expiring capability URL; if
  voucher revocation is ever required, the download token must be rotated / the object deleted.

---

## 3. Proposed Changes

### 3.1 Durable per-order sign cap (orphan bounding)

- **[MODIFY]** `api/upload-voucher.ts`
  - New constant `VOUCHER_MAX_SIGNS_PER_ORDER = 10` with a self-contained comment explaining that this is a
    **lifetime** bound (unlike the 15-minute throttle) and why 10 is generous for legitimate replacements.
  - New helper `reserveVoucherSignSlot(adminDb, order, cap)` → runs a Firestore transaction on the order doc:
    read fresh, `current = Number(voucherSignCount) || 0`; if `current >= cap` → `{ allowed: false, count }`;
    else `transaction.update(ref, { voucherSignCount: current + 1 })` → `{ allowed: true, count: current + 1 }`.
    Transactional so concurrent signs serialize on the order document (a plain read-then-write could exceed
    the cap). Reserve **before** minting: a slot is spent even if `getSignedUrl` later throws (conservative,
    documented inline).
  - `handleSign` gains `adminDb` + `order` parameters and calls the helper after the lifecycle guard, before
    `buildVoucherStoragePath`. On refusal: `429` + a Chilean-Spanish message pointing to WhatsApp (no
    `Retry-After` — the cap is not time-bound). On a counter-write failure: fail **closed** (`500`, loud log)
    — we must not mint an unbounded URL because the bound could not be recorded.
- **[MODIFY]** `src/types/index.ts` — add `voucherSignCount?: number` to `Order` (server-written, never
  client-written; Admin SDK bypasses `firestore.rules`, so no rules change is needed).

### 3.2 Housekeeping sweep (orphan cleanup)

- **[NEW]** `api/_lib/admin/voucher-housekeeping.ts` — `POST` admin handler:
  - `setAdminResponseHeaders` / `isAdminPreflight` / `verifyAdminToken` / `405` on non-POST, mirroring the
    other admin handlers.
  - Body: `{ orderId?: string, dryRun?: boolean, limit?: number }`.
  - Loads orders (single doc when `orderId` given; otherwise the collection read — the same
    full read the existing admin order list already performs — sorted `createdAt` desc and
    capped at `limit`, default 100 / max 500). Orders are never deletable (`firestore.rules`
    denies client deletes and no handler deletes them), so **per-order folder listing is
    complete** — every voucher folder belongs to a live order. Listing per loaded order (not
    one whole-prefix listing) guarantees an object is only ever deleted when its own order was
    read, so an unscanned order can never be mistaken for an orphan. The admin UI exposes the
    `limit` so an operator can widen the scan to reach older orders (the server clamps to 500).
  - For each order: `bucket.getFiles({ prefix: vouchers/{env}/{orderId}/ })`; keep the object equal to the
    order's `voucherStoragePath`; delete every other object whose `timeCreated` is older than
    `VOUCHER_ORPHAN_GRACE_MS = 60 min` (the signed PUT TTL is 10 min, so 60 min can never race an in-flight
    upload); objects with an unknown age are skipped (conservative).
  - Response: `{ success, dryRun, scannedOrders, scannedObjects, deletedCount, keptReferenced,
    skippedRecent, deletedSample: string[], failures: string[] }` — counts + a capped sample, never a dump.
  - Guards: `deleteVoucherObject` (existing helper) already refuses any path outside `vouchers/`; a delete
    failure is recorded in `failures` and never aborts the sweep.
- **[MODIFY]** `api/admin/[action].ts` — register `'voucher-housekeeping': voucherHousekeeping` (now **14**
  actions) and correct the stale "12 administrative handlers" comment.
- **[MODIFY]** `src/admin/types.ts` — add `VoucherHousekeepingResult`.
- **[MODIFY]** `src/admin/services/adminApi.ts` — `runVoucherHousekeeping({ orderId?, dryRun?, limit? })`.
- **[MODIFY]** `src/admin/components/AdminSettings.tsx` — a "Mantenimiento de Comprobantes" card with a
  **Revisar huérfanos** (dry-run) button and a **Eliminar huérfanos** button; renders the returned counts or
  the error. No new CSS framework; reuses `admin-card` / `admin-btn` classes.

### 3.3 Legacy base64 bounding in the admin list

- **[MODIFY]** `api/_lib/admin/orders.ts`
  - List path: destructure `voucherUrl` out of each doc and add
    `hasVoucher: Boolean(data.voucherUrl || data.voucherStoragePath)` (same predicate `track-order` uses).
  - Detail path (`?orderId=`, both the doc-key hit and the `where('orderId','==')` fallback): return the full
    document unchanged, including `voucherUrl`.
- **[MODIFY]** `src/types/index.ts` — add `hasVoucher?: boolean` to `Order`, documented as a **list-projection**
  flag (the list omits `voucherUrl`; the detail request supplies it).
- **[MODIFY]** `src/admin/components/AdminOrders.tsx`
  - On select, show the list row immediately then `fetchAdminOrder(orderId)` and replace with the full detail
    (guarded against out-of-order responses). Deep-link `initialOrderId` fetches the detail directly.
  - `onOrderUpdated` now refreshes the selected order's detail as well as the list — fixes the stale-selection
    panel after an approve/dispatch action (today `selectedOrder` is never re-read).
- **[MODIFY]** `src/admin/components/OrderDetailPanel.tsx` — the voucher block also renders when
  `order.hasVoucher` is true but the detail URL has not loaded, showing a neutral "no se pudo cargar el
  enlace" note instead of silently hiding an attached voucher.

### 3.4 Documentation

- **[MODIFY]** `api/AGENTS.md` — sign-phase cap, the housekeeping action, the list/detail voucher projection,
  and the permanent-capability-URL note.
- **[MODIFY]** `src/admin/AGENTS.md`, `src/types/AGENTS.md`, `src/tests/AGENTS.md` — as-built notes + counts.
- **[MODIFY]** `PRODUCTION_READINESS_TODO.md` — mark 2.15 `[x]` and move it to Resolved History at wrap-up.

### 3.5 Non-goals

- No GCS lifecycle rule, no `pending/` path redesign, no object "move".
- No legacy base64 → Storage migration script.
- No new serverless function (Hobby cap preserved), no new dependency, no rules change.

---

## 4. Robust Unit Testing Plan (MANDATORY)

All boundaries mocked at the edge (`firebase-admin/storage`, `firebase-admin/firestore`, `adminAuth`); no real
network. New/updated suites:

| Suite | Cases |
| :-- | :-- |
| `src/tests/api/admin/orders.test.ts` **(NEW — also closes the TODO 4.2 `orders` gap)** | `405`/`OPTIONS`/`403`/db-down `500`; list **omits** `voucherUrl` for a legacy `data:` order and sets `hasVoucher: true`; `hasVoucher: true` for a Storage-only order; `hasVoucher: false` when no voucher; other fields (customer/items/total/status) preserved; detail doc-key hit **returns** `voucherUrl`; detail `where` fallback returns `voucherUrl`; detail `404`; status filter + search |
| `src/tests/api/upload-voucher.test.ts` **(MODIFY)** | sign reserves exactly one slot (`voucherSignCount: 1`) and mints the URL; sign at the cap → `429` + message and **no** `getSignedUrl` call; sign counter write failure → `500` fail-closed, no URL minted; existing "mints a scoped signed URL" case updated to assert the counter write is the **only** write |
| `src/tests/api/admin/voucher-housekeeping.test.ts` **(NEW)** | `403`/`405`/`OPTIONS`/db-or-bucket-down `500`; deletes only unreferenced + older-than-grace objects; keeps the referenced `voucherStoragePath`; keeps a young orphan; `dryRun` deletes nothing but reports counts; `orderId` scoping lists only that folder; a `delete` rejection lands in `failures` without aborting; a path outside the voucher prefix is never deleted |
| `src/tests/api/admin/admin-router.test.ts` **(MODIFY)** | add `'voucher-housekeeping'` to `ROUTES` (the "maps every declared action" case then covers it) |
| `src/tests/admin/AdminSettings.test.tsx` **(NEW)** | renders the maintenance card; "Revisar" calls the service with `dryRun: true`; "Eliminar" calls with `dryRun: false`; counts render; a service error renders the message |
| `src/tests/admin/AdminOrders.test.tsx` **(NEW)** | selecting a row calls `fetchAdminOrder` and the panel receives the detailed order (voucher link appears from the detail payload, not the list row); the list row has no `voucherUrl` |
| `src/tests/admin/OrderDetailPanel.test.tsx` **(MODIFY)** | `hasVoucher: true` with no `voucherUrl` renders the fallback note (no anchor) |

Conventions: mirror `src/tests/api/admin/mark-delivered.test.ts` (handler doubles) and
`src/tests/admin/OrderTable.test.tsx` (RTL). **Zero-regression:** the full 89-suite / 1014-test baseline plus
the new cases must be green.

---

## 5. As-Built Documentation & Roadmap Sync Plan

- `api/AGENTS.md`: sign-phase durable cap (`voucherSignCount`), the `voucher-housekeeping` action + its
  contract, the admin list/detail voucher projection, and the capability-URL note.
- `src/admin/AGENTS.md`: the detail-fetch-on-select change, the settings maintenance card, the new action.
- `src/types/AGENTS.md`: `Order.hasVoucher` / `Order.voucherSignCount`.
- `src/tests/AGENTS.md`: new suite names + updated counts.
- `PRODUCTION_READINESS_TODO.md`: `[x]` on 2.15 + Resolved History row at wrap-up.

## 6. Risks & Edge Cases

- **Slot spent on a failed mint** — conservative by design (documented inline); the cap is 10, so a customer
  is not realistically locked out.
- **Sweep listing cost** — one `getFiles` per scanned order, bounded by `limit` (≤500); it is an operator
  action, not a hot path.
- **`hasVoucher` without a detail fetch** — the panel shows the fallback note rather than hiding an attached
  voucher; the detail fetch normally supplies the URL.
- **Existing sign test** asserted "no Firestore writes" — intentionally updated to "only the counter is
  written"; this is the one deliberate contract change and is called out in the PR.

## 7. Verification

`pnpm test` (89 suites + 4 new → 93, 1064 tests), `pnpm build`, `pnpm lint`, `pnpm format:check`,
`pnpm exec tsc --noEmit` (+ the documented `api/` strict check). Then the adversarial `code-review` subagent,
remediation, as-built docs, roadmap checkbox, commit + PR.
