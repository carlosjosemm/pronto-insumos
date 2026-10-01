# Task 4.2: Backoffice Readiness Sweep

**Branch:** `feat/task-4.2-backoffice-readiness-sweep` (Windsurf-managed worktree checkout — the session's sanctioned working environment; no manually-created `git worktree add`)
**Status:** **Implemented, reviewed, gates green — awaiting owner "wrap up and proceed".** 1059/1059 tests (92 suites) after rebasing onto `origin/main` (Task 2.18 merged mid-task); build / lint / format:check / tsc all clean. Adversarial review returned *approve with findings* (F1–F9); all remediated. See §6.

---

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` §3, Task 4.2 *(P2)* — the backoffice readiness sweep:

> - Add dedicated handler suites for `orders`, `products`, `mark-delivered`, `toggle-visibility` (happy path, auth rejection, method gate, `OPTIONS`, malformed payload; mirror `approve-transfer.test.ts`).
> - **Bound reads:** `orders.ts:48` loads all orders and slices to 50; `dashboard-stats.ts:49-50` loads all orders/products. `fetchAdminOrders({ cursor })` sends a cursor the server ignores. Add `orderBy('createdAt','desc').limit(n).startAfter(cursor)` and server-side status filtering; keep search on the loaded page or indexed field. Use `count()` aggregations or bounded stats, keeping read/per-page cost in scope without heavy infrastructure.
> - **Deep links/state:** `AdminOrders` searches only the first 50 although `fetchAdminOrder` exists; refresh selected order after `onOrderUpdated`. Distinguish read failure from an empty list.
> - **Dashboard definition:** KPI excludes dispatched/delivered paid sales and transfer `approvedAt`, while subtitle says pending preparation; align the KPI and copy.
> - Relabel placeholder cards in `src/admin/AGENTS.md` §6.1 to 8.5 / suspended 3.1; use `--teal-600` instead of undefined token references in `OrderDetailPanel.tsx:396,409`. Fix `ProductEditModal` prop→state sync effect (`:56-61`, `react-hooks/set-state-in-effect`) with lazy initialization/`key` remount. Stale `AdminOrders.tsx:42` copy remains suspended under 3.3.

Current state (verified against the tree):

- **Handler suites:** `mark-delivered.test.ts` (6 cases), `toggle-visibility.test.ts` (4) and `dashboard-stats.test.ts` (2) already exist — the TODO's coverage-gap note is stale for those three. The remaining gap is **`orders` and `products`**: no dedicated suite exercises either handler's `OPTIONS` preflight, method gate, auth rejection, happy path, `orderId` lookup or error paths.
- **Unbounded reads:** `api/_lib/admin/orders.ts:47` reads the whole `orders` collection on every list view, sorts/filters in memory, then slices to 50 — read cost grows with volume and the payload risks Vercel's 4.5 MB response cap (the same risk Task 2.15 records for legacy Base64 vouchers). `dashboard-stats.ts:48-49` reads all orders + all products on every dashboard load. `fetchAdminOrders({ cursor })` (`src/admin/services/adminApi.ts:60`) sends a `cursor` the server never reads.
- **Deep links/state:** `AdminOrders.tsx:22-24` only preselects the deep-linked order when it appears in the first page, although `fetchAdminOrder` exists; after `onOrderUpdated` the component reloads the list but leaves `selectedOrder` holding the stale pre-update object; a read failure is swallowed (`catch` only logs) so the UI renders an empty table indistinguishable from a genuinely empty queue.
- **Dashboard KPI:** `dashboard-stats.ts:62` computes `paidAtRaw = data.paidAt || (paid-status ? data.createdAt : null)` and `:71` sums only orders whose **current** status is one of the three paid states — so money confirmed today drops out of "Ventas Hoy" the moment the order ships, and a transfer approved today counts on its creation date (`approvedAt` is never consulted). The subtitle says "Facturación neta confirmada hoy" while the value is neither all confirmed-today money nor net-of-IVA.
- **Small fixes:** `OrderDetailPanel.tsx:461,474` reference `var(--primary)`, which `admin.css` never defines (both declarations silently drop); `ProductEditModal.tsx:56-82` populates form fields from `product` inside a `useEffect` — the synchronous-setState-in-effect pattern the storefront forbids.

## 2. Human Action Items & Placeholders (TODO for Human)

**Resolved (2026-09-30):** the composite index `orders(status ASC, createdAt DESC)` was declared in `firestore.indexes.json`, registered in `firebase.json`, deployed with `firebase deploy --only firestore:indexes --project pronto-insumos` and independently verified live via `firebase firestore:indexes` (fields: `status ASC`, `createdAt DESC`, implicit `__name__ DESC`; density `SPARSE_ALL`). Firestore builds new indexes asynchronously — the definition is registered and the build completes in the background, so the first status-filtered request may need to wait for the build to reach `Ready` before it succeeds. The pre-existing `abuse_counters.expiresAt` TTL field override was preserved (no `--force`). No new credentials or `.env.example` entries. (Task 8.5 — monitoring/analytics — and suspended 3.1 — freight — remain separate roadmap rows; this task only relabels the placeholder cards to point at them.)

## 3. Proposed Changes

### 3.1 `api/_lib/admin/orders.ts` — cursor pagination + server-side status filtering

- List path: `orderBy('createdAt','desc').limit(n)` with `startAfter(parsedCursor)` — the server honors the `cursor` `fetchAdminOrders` already sends (parsed from its ISO string to a `Date`; `createdAt` is a server `Timestamp`, so the field is orderable and the cursor is a valid start-after value).
- Server-side status filtering: a single status becomes `where('status','==',status)`; the `TRANSFERENCIA_APROBADA` chip keeps its dual-status semantics through `where('status','in',['TRANSFERENCIA_APROBADA','PAGADO_TRANSFERENCIA'])`. An equality-family filter on `status` combined with the sort on a different field (`createdAt`) requires the manual composite index `orders(status ASC, createdAt DESC)` — declared in `firestore.indexes.json`, deployed with `firebase deploy --only firestore:indexes`; without it Firestore answers `failed-precondition` and the handler returns `500`.
- Search stays client-side on the loaded page (per the task: "keep search on the loaded page or indexed field") — the in-memory search block is unchanged, it just operates on the bounded page.
- `total` becomes the filtered-set count via a `count()` aggregation on the same filtered query (index-entry reads only, no document transfer) so the UI's `total` stays meaningful under pagination; `nextCursor` is the last loaded document's `createdAt` ISO string.

### 3.2 `api/_lib/admin/dashboard-stats.ts` — bounded stats + KPI alignment

- `pendingOrders`: `where('status','in',[pending statuses])` + `count()` aggregation — the exact all-time count with zero document reads, so an old unresolved order (the Task 8.13 case) can never disappear from the KPI.
- `lowStockProducts`: bounded `where('stockCount','<=',5)` read (the candidate set is inherently small for one store) + the existing published filter applied client-side — exact, index-free.
- `salesToday` + `ordersThisMonth`: one bounded recent-orders read (`orderBy('createdAt','desc').limit(400)`) + the existing client-side Chile-date math. KPI fix: `settledAt = data.paidAt || data.approvedAt` (falling back to `createdAt` only for paid statuses without a marker) and the settled check accepts orders carrying a settlement marker regardless of their current fulfillment status — money confirmed today stays in "Ventas Hoy" after shipping, and transfer approvals count on `approvedAt`.
- Documented edge: orders older than the bounded window cannot be today's sales or this month's orders by definition; a months-old order approved today is caught while it is inside the window (realistic for one dental supplier) — recorded in the as-built docs.

### 3.3 `src/admin/components/AdminOrders.tsx` — deep links, selection refresh, failure-vs-empty

- Deep-link fetch: when `initialOrderId` is set and the order is not in the first page, fall back to `fetchAdminOrder(initialOrderId)` so `#orders/<id>` opens the inspector from any queue depth.
- Selection refresh: after `onOrderUpdated`, reload the list **and** re-find the selected order by id, replacing the stale object (the panel then renders the updated status instead of the pre-action snapshot).
- Failure-vs-empty: a read failure sets an error state rendered as a retryable banner above the table — an empty queue and a failed load are no longer the same screen.

### 3.4 `src/admin/components/AdminDashboard.tsx` — KPI copy alignment

- "Ventas Hoy" subtitle: "Facturación neta confirmada hoy" → "Facturación confirmada hoy (IVA incluido)" — the value is `totalAmount` (IVA-inclusive), so the copy stops calling it net.

### 3.5 Small fixes

- `src/admin/components/OrderDetailPanel.tsx` — `var(--primary)` → `var(--teal-600)` at both sites (the `History` icon colour and the audit-timeline `borderLeft`), resolving the known broken token from `src/admin/AGENTS.md` §2.3.
- `src/admin/components/ProductEditModal.tsx` — drop the prop→state sync `useEffect`; seed the form fields with lazy `useState` initializers from `product` and let the parent's per-open remount (plus `key={product?.id ?? 'create'}`) re-seed on product switch — the same convention `StockAdjustModal` already follows.
- `src/admin/AGENTS.md` §6.1 — relabel the placeholder surfaces to their real roadmap anchors: the two analytics cards → Task 8.5 (monitoring/analytics if useful), the shipping-rates card → suspended 3.1 (no freight below `$150.000`, owner decision). §6.2's `ProductEditModal` known-issue entry is updated to "as built" once the effect is gone.
- ❌ NOT touched: `AdminOrders.tsx:42` header copy (`…Melipilla y RM`) — suspended under 3.3.

## 4. Robust Unit Testing Plan (MANDATORY)

Vitest suites in `src/tests/` (every network/SDK boundary mocked; never a real outbound request):

| Suite | Change | Cases |
| :-- | :-- | :-- |
| `api/admin/orders.test.ts` | NEW | `OPTIONS` preflight → `200`; non-GET → `405`; unauthenticated → `403`; happy path returns the bounded page sorted by `createdAt` desc with `total` + `nextCursor`; `orderId` direct hit → `200`, field fallback → `200`, miss → `404`; server-side status filter (single `==` and the dual-status `in` chip); search filters the loaded page; Firestore rejection → `500`. |
| `api/admin/products.test.ts` | NEW | `OPTIONS` → `200`; non-GET → `405`; unauthenticated → `403`; happy path returns products with `id` + `total`; category filter (`all` passthrough + exact match); Firestore rejection → `500`. |
| `api/admin/dashboard-stats.test.ts` | MODIFY | Existing two cases re-pointed at the new bounded double; new: `pendingOrders` counted through the status-in `count()` aggregation (an old pending order inside the double is counted); `lowStockProducts` from the bounded low-stock read + published filter (a paused product with low stock is excluded); KPI fix — a settled order that has since been dispatched still counts in `salesToday`, and a transfer approval counts on `approvedAt` (not `createdAt`). |
| `admin/AdminOrders.test.tsx` | NEW | Deep link: an `initialOrderId` present in the first page preselects it; one absent from the first page triggers the `fetchAdminOrder` fallback and opens the panel; `onOrderUpdated` reloads and re-selects the updated order; a read failure renders the retryable banner (distinct from an empty list); the retry action re-runs the load. |
| `admin/AdminDashboard.test.tsx` | MODIFY | "Ventas Hoy" subtitle asserts the aligned copy. |
| `admin/ProductEditModal.test.tsx` | MODIFY | Existing cases re-pointed at the lazy-initializer shape; new: opening the modal for product A then product B re-seeds the fields (key remount); create mode seeds the defaults. |

**Mocking strategy:** Firestore Admin doubles per handler (the `approve-transfer.test.ts` shape); `fetchAdminOrders`/`fetchAdminOrder` mocked in UI suites; `global.fetch` at the boundary where the adapter is exercised.

**Zero Regression Policy:** the full suite (1028+ tests, 89+ suites) stays green.

## 5. As-Built Documentation & Roadmap Sync Plan

- `src/admin/AGENTS.md` — §6.1 relabel (8.5 / suspended 3.1); §6.2 entries updated to "as built" (`ProductEditModal` effect gone, `--primary` resolved); the AdminOrders deep-link/refresh/failure contract documented.
- `api/AGENTS.md` — the orders/dashboard-stats handlers' bounded-read contracts (cursor pagination, server-side status filter, count() aggregation) documented in the admin-handler section.
- `src/tests/AGENTS.md` — the new/modified suites catalogued.
- `PRODUCTION_READINESS_TODO.md` §3 Task 4.2 — "As built" entry + `[x]`; refresh the §1 board row.
- `walkthrough.md` — branch, commit, PR URL, verification results, review-finding dispositions (at wrap-up).
