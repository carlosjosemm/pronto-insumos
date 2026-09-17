# PRONTO Catalog & Static Data Guide (`src/data/`)

This document is the **authoritative domain and technical reference** for the baseline product catalog definitions, clinical dental categories, and test fixtures for PRONTO Insumos Odontológicos.

---

## 🎯 1. Directory Scope & Business Role

* **Role:** Serves as the primary seed source for Google Firebase Firestore (`products` collection), the resilient offline fallback for local development when database credentials are not configured, and the mock dataset for Vitest automated test suites.
* **Key File:**
  * [`products.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/data/products.ts): Contains `INITIAL_PRODUCTS` (the master catalog of dental supplies) and dental category constants.

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
1. **Official Price List Ingestion:** The catalog is populated using [`scripts/import-catalog-csv.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/scripts/import-catalog-csv.ts) reading from `listo-of-prices-pronto-basic.csv` (75 official clinical supplies, default inventory of 10 units each, IDs `pronto-001` through `pronto-075`).
2. **Prototype Item Inactivation:** Legacy mock products starting with `odon-*` are retained in code and Firestore for test safety and audit compliance, but marked inactive (`isActive: false`, `inStock: false`) so they never display to storefront customers.
3. **Dynamic Category Extensibility:** While the 6 core categories form the baseline catalog, the store backend and backoffice support open dynamic categories (e.g. `ORTODONCIA`, `PERIODONCIA`, `CIRUGIA`) registered on the fly.

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
3. **ISP Sanitary Compliance Flags (`prescriptionRequired`):**
   * Regulated supplies (such as local dental anesthetics or surgical scalpels) must have `prescriptionRequired: true`.
   * This flag triggers the `⚕️ Requiere SIS` badge on product cards and activates the mandatory Superintendencia de Salud (SIS) verification step in `CheckoutModal.tsx`.
4. **Technical REF Codes:**
   * Every product possesses a unique SKU `id` that maps to a technical reference code in the UI (e.g., `id: 'odon-101'` maps to `REF: OD-101`), matching how dental clinic nurses and procurement managers order from distributor catalogs.
