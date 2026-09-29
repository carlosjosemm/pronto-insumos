# PRONTO Catalog & Static Data Guide (`src/data/`)

This document is the **authoritative domain and technical reference** for the baseline product catalog definitions, clinical dental categories, and test fixtures for PRONTO Insumos Odontológicos.

---

## 🎯 1. Directory Scope & Business Role

* **Role:** Serves as the primary seed source for Google Firebase Firestore (`products` collection), the resilient offline fallback for local development when database credentials are not configured, and the mock dataset for Vitest automated test suites.
* **Key File:**
  * [`products.ts`](./products.ts): Contains `PRODUCTS` (the master catalog of dental supplies — **11 `odon-*` prototype fixtures**) and `CATEGORIES` (storefront category pills: `all` + the 6 Chilean specialties). `MOCK_PROMOS` moved to [`src/config/promos.ts`](../config/AGENTS.md) (Task 0.9 — single promo source shared with the serverless payment layer) and is re-exported here for import compatibility.
  * **Category display naming:** `CATEGORIES` derives each `name` from `formatCategoryDisplayName()` in [src/utils/categoryAlias.ts](../utils/categoryAlias.ts). Never hardcode a second label for a category id — extend the alias map instead, so storefront naming cannot drift from the frozen Firestore keys.

---

## 🦷 2. Dental Catalog Architecture & Chilean Clinical Specialties

The catalog is structured around 6 authentic Chilean dental specialties reconciled directly from the distributor's official price list:

| Official Chilean Category | Scope & Clinical Applications | Typical Supplies |
| :--- | :--- | :--- |
| **`DESECHABLES, ESTERILIZACION Y DESINFECCION`** | Single-use infection control, patient draping, and autoclave sterilization consumables. | Mascarillas tricapa, campos quirúrgicos impermeables, bolsas de esterilización para autoclave, desinfectantes de superficies clínicas. |
| **`ENDODONCIA`** | Specialized root canal instruments, apex locators, and obturation materials. | Localizadores de ápice digitales, limas rotatorias NiTi térmicamente tratadas, conos de gutapercha, cementos selladores endodónticos. |
| **`HIGIENE BUCAL`** | Clinical oral hygiene, scaling, and preventive prophylaxis supplies. | Escariadores y puntas ultrasónicas para detartraje, pastas de profilaxis, cepillos y copas de pulido. |
| **`IMPRESION`** | Accurate dental impression materials for prosthetics and study models. | Alginatos cromáticos de alta precisión, siliconas de adición y condensación, cubetas de impresión. |
| **`INSTRUMENTAL Y ACCESORIOS`** | Autoclaveable stainless steel hand instruments and surgical rotary handpieces. | Turbinas dentales LED Midwest 4 vías, contra-ángulos, espejos bucales n° 5, exploradores dobles, motores de implante. |
| **`OPERATORIA`** | Direct restorative materials, light-curing adhesives, and local anesthetics. | Lámparas de fotocurado LED inalámbricas, resinas compuestas nanohíbridas (composites), adhesivos universales, anestésicos locales (Lidocaína 2%). |

### 2.1 Catalog Ingestion & Lifecycle Management
1. **Official Price List Ingestion:** The production catalog is populated using [`scripts/import-catalog-csv.ts`](../../scripts/import-catalog-csv.ts) reading from `listo-of-prices-pronto-basic.csv` (75 official clinical supplies, default inventory of 10 units each, IDs `pronto-001` through `pronto-075`). The CSV is deliberately **not committed** (`*.csv` is gitignored) — it lives only on the operator's machine.
2. **Prototype Fixture Lifecycle:** The 11 `odon-*` items exist **only as code fixtures** — every one is `isActive: false` and `inStock: false`, so they never display on the storefront but remain usable by tests and the local offline fallback. **Since Task 2.11 they are also unreachable in a production runtime**: `fetchProducts()` refuses to fabricate a catalog there (`source: 'unavailable'` → retryable error card) and never revalidates a persisted cart from fixture data. Their remaining consumers are the dev/offline fallback, the admin portal's inventory fallback, the `schema:seed` operator command and four test suites — the question of whether they should survive at all is tracked as **Task 6.4**. ⚠️ In Firestore they are *deleted*, not deactivated: `import-catalog-csv.ts` batch-deletes any `odon-*` doc it finds, and `fix-catalog-data-quality.ts` does the same. `manage-firestore-schema.ts --seed` re-creates them (still inactive) only if you re-seed.
3. **Dynamic Category Extensibility:** While the 6 core categories form the baseline catalog, the store backend and backoffice support open dynamic categories (e.g. `ORTODONCIA`, `PERIODONCIA`, `CIRUGIA`) registered on the fly — `Product.category` is `string`, and `ProductCategory` deliberately widens beyond `ChileanDentalCategory` for that reason.

---

## 🔒 3. Data Integrity, Pricing & Confidentiality Guardrails

1. **Integer CLP Pricing (NO DECIMALS):**
   * ❌ **FORBIDDEN:** Pricing with decimals like `189.99` or `129.50`. In Chile, this causes payment gateways (Mercado Pago / Webpay) to charge only $190 or $130 pesos!
   * ✅ All prices must be whole Chilean Peso integers representing realistic dental market value:
     * High-speed LED Turbine: `189990` ($189.990 CLP)
     * Nanohybrid Composite Kit: `79990` ($79.990 CLP)
     * Ultrasonic Scaler: `245000` ($245.000 CLP)
     * Examination Mirror Pack: `14990` ($14.990 CLP)
2. **Confidential Warehouse Stock Counts:**
   * Each product defines a `stockCount: number` representing current physical inventory in the Melipilla warehouse.
   * **Confidentiality Iron Rule:** The exact `stockCount` integer is **strictly confidential internal data**. It is used by client logic to cap steppers and check availability, but **must never be displayed as raw numbers to public users** (e.g. never render *"Quedan 42 unidades en bodega"*), preventing competitors from profiling distributor inventory levels.
   * **As enforced:** `ProductCard.tsx` renders the fixed string **`Últimas unidades`** — never an interpolated count. The low-stock *threshold* (`stockCount <= 5`) still drives whether the cue appears; only the number is withheld. `ProductCard.test.tsx` asserts both the fixed string and the absence of an interpolated count. Never reintroduce `{stockCount}` into public copy.
3. **ISP Sanitary Compliance Flags (`prescriptionRequired`):**
   * Regulated supplies (such as local dental anesthetics or surgical scalpels) must have `prescriptionRequired: true`.
   * This flag triggers the `⚕️ Requiere SIS` badge on product cards and activates the mandatory Superintendencia de Salud (SIS) verification step in `CheckoutModal.tsx`.
4. **Technical REF Codes:**
   * The storefront derives the displayed reference code from the product `id` (e.g. `odon-101` → `REF: OD-101`, `pronto-001` → `REF: PRONTO-001`), matching how dental clinic nurses and procurement managers order from distributor catalogs. `Product.sku` also exists (populated by the CSV importer and the schema seed as `REF-XXXX-NNN`) but is currently **not read by the card/QuickView** — it is written for Firestore search and admin display.
5. **Fixture Honesty — no fabricated social proof or permanent discounts:**
   * All 11 `odon-*` prototype items carry **`rating: 0` and `reviewsCount: 0`**. The star UI is intentionally kept in `ProductCard.tsx` / `ProductQuickView.tsx` (it renders only when `reviewsCount > 0`), so it stays dormant until a real review system exists. Fabricated 4.7–5.0★ ratings with invented review counts must not come back.
   * **`originalPrice` survives on exactly one fixture — `odon-401`** — as a single demo discount. Add `originalPrice` only for a genuine, time-boxed promotion: a permanent discount on everything reads as a discount-store signal, not a credible B2B catalogue.
   * ⚠️ **Seed-script caveat:** `import-catalog-csv.ts` writes `rating: 5.0` and `manage-firestore-schema.ts --seed` writes `rating: prod.rating || 5.0` (which also yields `5.0` for a `0` fixture). Stored `5.0` values are invisible today because the star UI keys on `reviewsCount > 0` — but they are fabricated data in Firestore and will mislead any future consumer that reads `rating` alone.
6. **Sales unit (`unitOfSale`) — optional presentation field:**
   * `unitOfSale?: string`, at most 60 characters, describes the presentation clinics actually procure in (`Caja 100 un`, `Bolsa 500 g`, `Kit 8 jeringas × 4 g`, `Set 10 piezas`, `Caja 50 carpules`…). It renders raw under the card title with **no `Venta:` prefix** and is omitted entirely when absent, so it never breaks a legacy document — the field is optional and **no migration is required**.
   * **All 11 `odon-*` fixtures carry it** (values tabulated in the redesign proposal, Appendix D.5), and `src/tests/data/products.test.ts` asserts every fixture value is a non-empty string of ≤60 characters. `src/utils/schemaValidation.ts` enforces the same rule at the schema boundary.
   * Production `pronto-*` items only get one when the source CSV includes a `unit_of_sale` column; the legacy price list has none, so the field is omitted there. An editable admin field is a later task — do not add one opportunistically.
