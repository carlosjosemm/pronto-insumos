# PRONTO Utilities & Domain Logic Guide (`src/utils/`)

This document is the **authoritative algorithmic and technical guide** for the pure utility functions and domain logic algorithms of PRONTO Insumos Odontológicos.

---

## 🎯 1. Directory Scope & Algorithmic Principles

* **Role:** Houses algorithmic calculations, string formatters, Chilean tax mathematics, and national identity validation.
* **Strict Purity:** All functions in this directory are **strictly pure and deterministic**:
  - ❌ Zero side effects (no DOM manipulation, no `localStorage` mutation).
  - ❌ Zero network calls or asynchronous promises.
  - ❌ Zero React hooks (`useState`, `useEffect`).
  - Given identical input arguments, they must always return identical outputs.
* **Zero External Dependencies:** No `lodash`, `moment.js`, or external math libraries. Built entirely with modern ECMAScript standards and native `Intl` formatters.

---

## 🇨🇱 2. Chilean Domain Algorithms & Legal Specifications

### 2.1 Chilean Modulo 11 Algorithm (`src/utils/rut.ts`)
The **Rol Único Tributario (RUT)** / **Rol Único Nacional (RUN)** is the official unique identifier for Chilean natural persons and corporate legal entities.

#### Algorithmic Specification:
1. **Cleaning:** Strips all dots, hyphens, and whitespace:
   ```typescript
   export function cleanRut(rut: string): string {
     return rut.replace(/[^0-9kK]/g, '').toUpperCase()
   }
   ```
2. **Modulo 11 Calculation:**
   - Multiplies digits of the body from right to left using repeating sequence weights: `[2, 3, 4, 5, 6, 7]`.
   - Sums the products.
   - Calculates `remainder = 11 - (sum % 11)`.
   - If `remainder === 11`, check digit is `'0'`.
   - If `remainder === 10`, check digit is `'K'`.
   - Otherwise, check digit is `remainder.toString()`.
3. **Validation (`validateRut`):**
   - Verifies the body consists strictly of digits.
   - Requires a length of 7 to 8 body digits plus 1 check digit.
   - Computes expected DV and compares against input DV in constant time.
4. **Formatting (`formatRut`):**
   - Formats clean numbers into standard Chilean commercial notation with thousand separators: `12.345.678-5`.

---

### 2.2 Chilean Peso Currency Logic (`src/utils/currency.ts`)
The Chilean Peso (**CLP**) has no active fractional subunits (cents were officially abolished). 
* **`formatCLP(amount: number)`**:
  - Formats numbers using Chilean locale: `$189.990` (dollar symbol prefix, period thousands separator, zero decimals).
  - Implemented via `Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })`.
* **`parseCLP(formatted: string)`**:
  - Safely extracts raw integer amounts from formatted currency strings, stripping `$`, dots, and spaces.

---

### 2.3 Chilean SII 19% IVA Tax Calculations (`src/utils/tax.ts`)

Under Chilean tax law, the standard **Impuesto al Valor Agregado (IVA)** rate is **19%**.

#### Mathematical Formulas & Integer Rounding:
1. **Gross Price (Precio Bruto - IVA incluido):**
   $$\text{Bruto} = \text{Math.round}(\text{Neto} \times 1.19)$$
2. **Net Extraction from Gross:**
   $$\text{Neto} = \text{Math.round}\left(\frac{\text{Bruto}}{1.19}\right)$$
3. **IVA Amount Extraction:**
   $$\text{IVA} = \text{Math.round}(\text{Bruto} - \text{Neto})$$
4. **Rounding Iron Rule:**
   - In Chile, tax and billing amounts are strictly whole integers. 
   - Never use `toFixed(2)` or allow floating point residues (e.g. `$18999.33`). Always apply `Math.round()` at each step to prevent payment gateway or SII DTE rejection.

#### Factura Validation Rules (`validateFacturaFields`):
Validates the mandatory attributes required by the SII before a Factura Electrónica can be issued:
* `rut`: Must be a valid corporate or personal RUT satisfying Modulo 11.
* `razonSocial`: Minimum 3 characters (e.g., *"Sociedad Dental SpA"*).
* `giroComercial`: Minimum 3 characters (e.g., *"Atención odontológica"*).
* `address`: Registered fiscal domicile street and office/suite number.
* `city`: Official commune in Chile.
