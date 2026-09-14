# PRONTO Catalog & Static Data Guide (`src/data/`)

This directory contains the **default product catalog definitions**, dental categories, and baseline data fixtures for PRONTO.

---

## 🎯 1. Directory Scope & Purpose

* **Role:** Serves as the seed data source for Google Firebase Firestore, the offline fallback for local development when database credentials are not configured, and the mock dataset for automated tests.
* **Key File:**
  * [`products.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/data/products.ts): Contains `INITIAL_PRODUCTS` (the master list of dental supplies) and catalog helper constants.

---

## 🚫 2. Anti-Overshooting & Data Guardrails

1. **NO In-Memory Database Engines:**
   * Do **NOT** install LokiJS, Dexie, NeDB, or complex in-memory database libraries.
   * This directory is strictly a static data fixture module exporting typed TypeScript arrays and constants.
2. **Schema Conformity:**
   * Every product object defined in this directory **must strictly implement** the `Product` interface defined in [src/types/index.ts](file:///c:/Users/ecmv2/Documents/PRONTO/src/types/index.ts).
3. **Not a Live Store:**
   * Never treat `INITIAL_PRODUCTS` as a mutable runtime state store. Live stock deductions and new order updates belong in Firestore, not in this file.

---

## 🇨🇱 3. Chilean Pricing & Dental Domain Rules

1. **CLP Integer Pricing (NO DECIMALS):**
   * ❌ **FORBIDDEN:** Pricing with decimals like `189.99` or `129.50`. In Chile, this causes Mercado Pago to charge only $190 or $130 pesos!
   * ✅ All prices must be whole Chilean Peso integers representing realistic dental market value:
     * High-speed LED Turbine: `189990` ($189.990 CLP)
     * Nanohybrid Composite Kit: `79990` ($79.990 CLP)
     * Ultrasonic Scaler: `245000` ($245.000 CLP)
     * Examination Mirror Pack: `14990` ($14.990 CLP)
2. **Authentic Dental Terminology:**
   * Product names, descriptions, and specifications must reflect standard Chilean clinical dental practice:
     * *Categorías:* Instrumental, Equipamiento, Materiales Restauradores, Desechables, Endodoncia, Ortodoncia, Periodoncia.
     * *Especificaciones:* Acople Borden / Midwest de 4 vías, esterilizable en autoclave a 134°C, registro ISP, push button, luz LED autogenerada.
3. **Image Paths & Photography:**
   * Products must specify valid image URLs or paths pointing to static assets in `public/` or high-resolution WebP product photographs (800x800 px) stored in CDN / Firebase Storage.
