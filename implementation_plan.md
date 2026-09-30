# Task 8.17: Destructive / Repeat Catalog Import and Seed Risk

**Branch:** `fix/task-8.17-non-destructive-catalog-imports` (primary working tree — no worktree; cut from `main` @ `5b615a4`)
**Status:** **Implemented, reviewed, gates green — awaiting owner "wrap up and proceed".** 1004/1004 tests (89 suites); build / lint / format:check / tsc all clean. Adversarial review returned *block* (F1–F9); all findings remediated — odon-* name collisions can no longer produce update+delete on one doc, `--dry-run` is gate-exempt for read-only rehearsal, and new ids allocate strictly above the existing max.

---

## 1. Context & Problem Statement

`PRODUCTION_READINESS_TODO.md` **8.17 (P1; cross-link 8.15 and 6.4)** — the two
operator scripts that write the catalog can silently destroy live data:

**`scripts/import-catalog-csv.ts`:**
- `:155-183` deletes every `odon-*` product unconditionally — including products
  referenced by real orders, which orphans order line references.
- `:189-234` derives product IDs from the **CSV row index** (`pronto-001`…) and
  merges `stockCount: 10`, `inStock: true`, `isActive: true`,
  `prescriptionRequired: false`, `images: []` into **existing** products — so a
  re-run resets sold stock, erases regulatory/visibility/image metadata, and a
  reordered CSV silently re-identifies products.
- `:237-260` writes a bogus `CATALOG_SEED` audit (`previousStock: null,
  newStock: 10`) on every re-run, for every row.
- `:90` accepts plain `--force` as production confirmation.

**`scripts/manage-firestore-schema.ts` (`--seed`):**
- `:130-158` `set(merge)` resets `inStock`/`stockCount`/`prescriptionRequired`/
  `images` on existing products (same metadata wipe).
- No production confirmation at all (`--seed --env=prod` runs bare).
- `:186-265` inserts a fake **paid** order `PRONTO-SAMPLE-001`
  (`TRANSFERENCIA_APROBADA` + fabricated voucher trail) into production orders.

**Fix direction (task entry):** create-only or metadata-only updates; preserve
stock, visibility, regulated fields, images; stable IDs; reorder/collision
detection; never delete products referenced by orders; audit real price
changes; `--dry-run` preview; explicit `--confirm-production-seed` /
`--confirm-production-import` (no `--force` fallback); never create the sample
paid order in production.

---

## 2. Chosen Approach

Refactor both scripts to the **`sync-env-to-vercel.ts` convention**: pure
exported planner functions + a `main()` guarded by
`import.meta.url === pathToFileURL(process.argv[1]).href`. Credentials,
Firestore init and all writes move inside `main()`, so tests can import the
module and drive the planner without env vars or a process exit.

### 2.1 Shared semantics (both scripts)

- **Update = metadata-only.** On an existing product the write carries only:
  `name`, `category`, `brand`, `manufacturer`, `description`, `price`,
  `priceNeto`, `unitOfSale` (import) / canonical descriptive fields (seed:
  `specs`, `packageContents`, `tag`-free descriptive set), `updatedAt`.
  **Never written on update:** `stockCount`, `inStock`, `isActive`,
  `prescriptionRequired`, `ispRegistrationNumber`, `images`, `rating`,
  `reviewsCount`, `sku`, `createdAt`, `placeholderTheme`, `mediaBadge`.
  Written via `update()` on the matched doc, so unlisted fields survive by
  omission.
- **Create = full document** as today (initial `stockCount`, `inStock`,
  `isActive: true`, `prescriptionRequired: false`, `images: []`) + `CATALOG_SEED`
  audit entry.
- **Audit only real changes:**
  - new product → `CATALOG_SEED` (unchanged);
  - existing product whose `price` changed → `METADATA_UPDATE` log
    (`previousStock`/`newStock` = the untouched live `stockCount`,
    `metadata: { previousPrice, newPrice }`, `reasonCode:
    'catalogo_precio_csv'` / `'semilla_precio_canonico'`);
  - nothing changed → no write, no audit.
- **`--dry-run`** prints the computed plan (creates / updates / deactivations /
  deletes / audits) and writes nothing — the operator rehearsal path.
- **Production gates:** prod runs require the exact flag
  `--confirm-production-import` / `--confirm-production-seed`. `--force` is
  **not** accepted as a substitute (removed from the import gate; it stays
  required only for `--purge-and-seed`, which also keeps
  `--confirm-production-wipe`).

### 2.2 `import-catalog-csv.ts`

- **Stable identity:** match each CSV row to an existing product by
  **normalized name** (lowercase, trim, collapse whitespace, strip accents).
  Matched → update that doc id (identity survives row reordering). Unmatched →
  assign the next free `pronto-NNN` index above the existing max — never reuse a
  freed index. SKU is preserved on update; generated only on create.
- **Collision detection:** two CSV rows normalizing to the same name → abort
  before any write with both line numbers.
- **`odon-*` cleanup:** fetch referenced `productId`s from `orders` items once;
  referenced `odon-*` → `isActive: false` (soft-retire, never delete);
  unreferenced → delete as today.
- `--force` no longer satisfies the prod gate.

### 2.3 `manage-firestore-schema.ts`

- `runSeed` adopts the §2.1 update/audit semantics for canonical products.
- `--seed` in prod requires `--confirm-production-seed`.
- **Sample order `PRONTO-SAMPLE-001` is dev-only** — in prod the seed logs that
  it skipped it and writes no fake paid order.
- `--purge-and-seed` unchanged (already `--force` + `--confirm-production-wipe`).
- `--dry-run` prints the plan without writes.

### 2.4 Non-goals

- No new collections, no admin UI, no schema changes.
- `orders`-side voucher/legacy migration (cross-linked in §165 note) stays a
  separate concern; this task only provides the flag pattern it references.

---

## 3. File-by-File Changes

| File | Change |
| :-- | :-- |
| `scripts/import-catalog-csv.ts` | Extract pure `parseArgs`/`normalizeName`/`buildImportPlan` exports; move env/cred/Firestore bootstrap + writes into guarded `main()`; name-matched stable ids; metadata-only update set; next-free-index creates; referenced-`odon-*` soft-retire; `--dry-run`; prod gate = `--confirm-production-import` only |
| `scripts/manage-firestore-schema.ts` | Same refactor for `runSeed`; metadata-only product merge; `METADATA_UPDATE` price audits; `--confirm-production-seed`; dev-only sample order; `--dry-run` |
| `src/tests/scripts/importCatalogCsv.test.ts` | NEW — planner + gate suite |
| `src/tests/scripts/manageFirestoreSchema.test.ts` | NEW — seed planner + prod-gate suite |
| `src/tests/AGENTS.md` | `scripts/` suite count 2→4 + one-line scope notes |
| Root/API/type AGENTS + `PRODUCTION_READINESS_TODO.md` | wrap-up: board `[x]`, as-built bullet, Resolved History row |

No `src/` runtime, `api/`, rules or package.json script-name changes — the
existing `catalog:import` / `schema:seed` commands keep their names; only the
flag contract tightens.

---

## 4. Tests

`src/tests/scripts/importCatalogCsv.test.ts`:
- reordered CSV against live-like products → same doc ids, plan carries only
  metadata fields (assert no `stockCount`/`inStock`/`isActive`/
  `prescriptionRequired`/`images` keys in update payload);
- identical second run → empty plan (no writes, no audits);
- price change → update + `METADATA_UPDATE` audit with previous/new price and
  live stock echoed;
- new row → create op at next free `pronto-NNN` + `CATALOG_SEED` audit;
- duplicate normalized names (incl. accent/case variants) → collision error;
- `odon-*` referenced by an order → `isActive:false` plan; unreferenced → delete;
- prod gate: `--env=prod` without confirm → reject; `--env=prod --force` →
  reject; `--env=prod --confirm-production-import` → accept; `--dry-run`
  parses/plans.

`src/tests/scripts/manageFirestoreSchema.test.ts`:
- existing product → metadata-only update payload (stock/visibility/images
  keys absent);
- price change → `METADATA_UPDATE` audit;
- prod `--seed` without `--confirm-production-seed` → reject;
- prod plan never contains the `PRONTO-SAMPLE-001` write; dev plan does;
- `--dry-run` → plan only.

Conventions: mirror `src/tests/scripts/syncEnvToVercel.test.ts` — pure-function
imports, `vi.stubEnv` where needed, no live Firestore (planner takes plain
fixture snapshots).

---

## 5. Risks & Edge Cases

- **Name matching misses a renamed product** → it creates a new `pronto-NNN`
  and leaves the old doc untouched (safe direction: nothing is overwritten; the
  stale doc stays visible until an operator pauses it — called out in output).
- **One orders scan for `odon-*` references** — bounded at current order volume;
  documented as a one-shot operator script, not a hot path.
- **`merge` update set is a fixed key list** — a future field added to the
  importable set must be consciously added to the allowlist; noted inline.
- Scripts keep top-level `process.exit` only inside `main()` — importing the
  module in tests can never exit the runner or open a Firestore connection.

## 6. Verification

`pnpm test` (expect 87 suites + 2 new), `pnpm build`, `pnpm lint`,
`pnpm format:check`, `npx tsc --noEmit`. Then the adversarial `code-review`
subagent, remediation, as-built docs, roadmap checkbox, commit + PR.

**Operator rehearsal (documented, human):**
`pnpm run catalog:import:dev -- --dry-run` and `schema:seed` dry-run against
dev to confirm the printed plan shows zero destructive ops before any write.
