# PRONTO Catalog & Static Data Guide (`src/data/`)

This document is the **authoritative domain and technical reference** for the baseline product catalog definitions, clinical dental categories, and test fixtures for PRONTO Insumos Odontológicos.

---

## 🎯 1. Directory Scope & Business Role

* **Role:** Serves as the primary seed source for Google Firebase Firestore (`products` collection), the resilient offline fallback for local development when database credentials are not configured, and the mock dataset for Vitest automated test suites.
* **Key File:**
  * [`products.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/data/products.ts): Contains `INITIAL_PRODUCTS` (the master catalog of dental supplies) and dental category constants.

---

## 🦷 2. Dental Catalog Architecture & Chilean Clinical Specialties

The catalog is structured around standard Chilean dental practice and specialties:

| Specialty Category | Scope & Clinical Applications | Typical Supplies |
| :--- | :--- | :--- |
| **Instrumental** | Hand instruments for diagnostics, surgery, and operative dentistry. Must be sterilizable in autoclave at 134°C. | Espejos bucales con mango ergonómico, exploradores dobles, pinzas algodoneras, fórceps de extracción, curetas Gracey. |
| **Equipamiento** | Rotary handpieces and electromechanical clinic equipment. Requires coupling standard specifications (Borden / Midwest 4 vías) and ISP sanitary registry. | Turbinas dentales LED con acople Borden 2 vías o Midwest 4 vías, micromotores neumáticos, lámparas de fotocurado LED inalámbricas, ultrasonidos para destartraje. |
| **Materiales Restauradores** | Consumables for restorative and aesthetic dentistry. Subject to expiration dates and shade matching (VITA classical). | Resinas compuestas nanohíbridas (Composite jeringas), adhesivos universales de 8ª generación, ionómeros de vidrio restauradores, matrices seccionales. |
| **Desechables** | Single-use hygiene and infection control supplies for operating chairs. High turnover B2B consumables. | Baberos impermeables tricapa, mangas/rollos de esterilización para autoclave con indicador químico, eyectores de saliva descartables, gasas estériles. |
| **Endodoncia** | Supplies and equipment for root canal therapies. | Limas rotatorias NiTi térmicamente tratadas, conos de gutapercha estandarizados, cementos selladores biocerámicos. |
| **Ortodoncia** | Consumables for fixed and removable orthodontic mechanics. | Brackets metálicos prescripción Roth/MBT, arcos NiTi térmicos termoactivados, tubos para molares. |
| **Periodoncia** | Supplies for periodontal surgery and prophylaxis. | Puntas de ultrasonido tipo scaler, pastas profilácticas de granulometría media/fina con flúor. |

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
