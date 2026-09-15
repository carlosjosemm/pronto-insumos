# PRONTO Utilities & Domain Logic Guide (`src/utils/`)

This directory contains **pure, side-effect-free helper functions** and domain logic algorithms for PRONTO.

---

## 🎯 1. Directory Scope & Purpose

* **Role:** Houses algorithmic calculations, string formatters, Chilean tax logic, and national identity validation.
* **Key Files:**
  * [`rut.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/utils/rut.ts): Chilean national tax ID (RUT/RUN) cleaner, formatter, check digit calculator, and Modulo 11 validator.
  * [`currency.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/utils/currency.ts): Chilean Peso formatting without decimals (`formatCLP`), 19% IVA computation (`calculateIVA`), and integer string parser (`parseCLP`).
  * [`tax.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/src/utils/tax.ts): Chilean SII tax breakdown (`calculateTaxBreakdown`) and legal Factura validation (`validateFacturaFields`).

---

## 🚫 2. Anti-Overshooting & Utility Guardrails

1. **Strictly Pure Functions:**
   * Functions in this directory must be **deterministic and pure**:
     * ❌ No side effects (no DOM manipulation, no `localStorage` mutation).
     * ❌ No asynchronous calls or network `fetch()`.
     * ❌ No React hooks (`useState`, `useEffect`).
   * Given the exact same inputs, they must always return the exact same output.
2. **NO External Utility Libraries:**
   * Do **NOT** install `lodash`, `underscore`, `ramda`, `moment.js`, or `accounting.js`.
   * Modern ECMAScript (standard `Intl.NumberFormat`, `Intl.DateTimeFormat`, regex, and native math) is fully sufficient, zero-cost, and already optimized.
3. **Mandatory 100% Test Coverage:**
   * Every utility function written in this directory must have dedicated unit tests in [src/tests/utils/](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/utils).
   * Edge cases (empty strings, malformed RUTs, zero amounts, negative numbers) must be explicitly covered.

---

## 🇨🇱 3. Chilean Standards Reference

### 1. RUT / RUN Modulo 11 Algorithm (`rut.ts`)
* Must clean all non-alphanumeric characters (dots, spaces, hyphens).
* Must support lowercase `k` and uppercase `K` check digits.
* Must reject strings shorter than 7 characters or containing invalid characters.
* Standard display format: `XX.XXX.XXX-Y` (e.g., `12.345.678-5`).

### 2. Chilean Peso Formatting (`currency.ts`)
* Format standard: `$189.990` (period thousands separator, dollar prefix, zero decimal places).
* Implement using `Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })` or clean integer string regex.

### 3. Chilean SII 19% IVA Calculation (`tax.ts`)
* Net price to Gross price: `gross = Math.round(net * 1.19)`.
* IVA extraction: `tax = Math.round(total - (total / 1.19))`.
* Always use `Math.round()` to prevent fractional cents from leaking into payment gateway payloads.
