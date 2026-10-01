# PRONTO Utilities & Domain Logic Guide (`src/utils/`)

This document is the **authoritative algorithmic and technical guide** for the pure utility functions and domain logic algorithms of PRONTO Insumos Odontológicos.

---

## 🎯 1. Directory Scope & Algorithmic Principles

* **Role:** Houses algorithmic calculations, string formatters, Chilean tax mathematics, and national identity validation.
* **Strict Purity:** All functions in this directory are **strictly pure and deterministic**:
  * ❌ Zero side effects (no DOM manipulation, no `localStorage` mutation).
  * ❌ Zero network calls or asynchronous promises.
  * ❌ Zero React hooks (`useState`, `useEffect`).
  * Given identical input arguments, they must always return identical outputs.
* **Where hooks live:** anything that needs React state or a DOM side effect belongs in [`src/hooks/`](../hooks) (`useScrollLock`, `useFocusTrap`, `useIncrementalReveal`), **not** here. That directory exists precisely to keep this purity contract intact.
* **Zero External Dependencies:** No `lodash`, `moment.js`, or external math libraries. Built entirely with modern ECMAScript standards.
* **File map:** [`rut.ts`](./rut.ts) (RUT Modulo 11), [`currency.ts`](./currency.ts) (CLP formatting/parsing + IVA), [`tax.ts`](./tax.ts) (gross→neto IVA breakdown + Factura field validation), [`schemaValidation.ts`](./schemaValidation.ts) (untrusted Firestore document validators), [`categoryAlias.ts`](./categoryAlias.ts) (category display names), [`orderTotal.ts`](./orderTotal.ts) (server-authoritative payable-total math — Task 0.9), [`voucherUrl.ts`](./voucherUrl.ts) (voucher-URL allowlist: storage / legacy-data / unsafe — Task 0.13), [`orderLifecycle.ts`](./orderLifecycle.ts) (Task 5.3 — the shared `SETTLED_ORDER_STATUSES` set + `isSettledOrderStatus` and the `EMAIL_CLAIM_TTL_MS` / `EMAIL_RESEND_MAX_PER_KIND` constants for the `emailDelivery` send-claim telemetry; pure constants importable from both `api/` and the client bundle).

---

## 🇨🇱 2. Chilean Domain Algorithms & Legal Specifications

### 2.1 Chilean Modulo 11 Algorithm (`src/utils/rut.ts`)

The **Rol Único Tributario (RUT)** / **Rol Único Nacional (RUN)** is the official unique identifier for Chilean natural persons and corporate legal entities.

#### Algorithmic Specification

1. **Cleaning:** Strips all dots, hyphens, and whitespace:
   ```typescript
   export function cleanRut(rut: string): string {
     return rut.replace(/[^0-9kK]/g, '').toUpperCase()
   }
   ```
2. **Modulo 11 Calculation (`calculateDv`):**
   * Multiplies digits of the body from right to left using repeating sequence weights: `[2, 3, 4, 5, 6, 7]` (the multiplier cycles 2→7 and resets).
   * Sums the products.
   * Calculates `remainder = 11 - (sum % 11)`.
   * If `remainder === 11`, check digit is `'0'`.
   * If `remainder === 10`, check digit is `'K'`.
   * Otherwise, check digit is `remainder.toString()`.
   * Exported as `calculateDv(body: string): string` — usable standalone for generating DVs (e.g. seed data).
3. **Validation (`validateRut`):**
   * Guards `!rut || typeof rut !== 'string'` up front, then cleans.
   * Requires a cleaned length of 8–9 characters: 7–8 body digits plus 1 check digit.
   * Verifies the body consists strictly of digits (`/^\d+$/`).
   * Computes the expected DV and compares with a plain `===` (not constant-time — acceptable here; a RUT is not a secret credential).
4. **Formatting (`formatRut`):**
   * Formats clean numbers into standard Chilean commercial notation with thousand separators: `12.345.678-5`.

---

### 2.2 Chilean Peso Currency Logic (`src/utils/currency.ts`)

The Chilean Peso (**CLP**) has no active fractional subunits (cents were officially abolished).
* **`formatCLP(amount: number): string`**:
  * Formats numbers using Chilean convention: `$189.990` (dollar prefix, period thousands separator, zero decimals).
  * Implemented with a hand-rolled regex thousands separator (`replace(/\B(?=(\d{3})+(?!\d))/g, '.')`) after `Math.round()` — **not** `Intl.NumberFormat`, so output is identical in Node, jsdom, and every browser regardless of ICU data.
  * Handles `NaN`/`null`/`undefined` → `'$0'`, and negatives → `-$10.000`.
* **`parseCLP(formatted: string): number`**:
  * Safely extracts raw integer amounts from formatted currency strings, stripping `$`, dots, and spaces. Preserves a leading `-` sign; returns `0` on garbage input.
* **`calculateIVA(netAmount: number, rate = 0.19): number`**:
  * `Math.round(netAmount * rate)` for net→tax math; returns `0` on non-positive/`NaN` input. (Gross→neto extraction lives in `tax.ts` — do not confuse the two directions.)

---

### 2.3 Chilean SII 19% IVA Tax Calculations (`src/utils/tax.ts`)

Under Chilean tax law, the standard **Impuesto al Valor Agregado (IVA)** rate is **19%**.

#### Mathematical Formulas & Integer Rounding

`calculateTaxBreakdown(totalAmount: number): TaxBreakdown` is the single gross→neto extractor. It returns `{ neto, iva, total }` where the identity **`neto + iva === total` always holds** (IVA is the exact remainder, never independently rounded):

1. **Net Extraction from Gross:** `neto = Math.round(Math.round(total) / 1.19)`
2. **IVA Amount Extraction:** `iva = roundedTotal - neto`
3. **Gross direction (neto → bruto)** is `Math.round(neto * 1.19)` — provided by `calculateIVA` in `currency.ts`.
4. **Rounding Iron Rule:**
   * In Chile, tax and billing amounts are strictly whole integers.
   * Never use `toFixed(2)` or allow floating point residues (e.g. `$18999.33`). Always apply `Math.round()` at each step to prevent payment gateway or SII DTE rejection.
   * Non-positive or `NaN` input returns `{ neto: 0, iva: 0, total: 0 }` rather than throwing.

#### Factura Validation Rules (`validateFacturaFields`)

`validateFacturaFields(fields: FacturaValidationInput): FacturaValidationResult` returns `{ isValid, errors }` with localized Spanish messages per field. Validates the mandatory attributes required by the SII before a Factura Electrónica can be issued:
* `rut`: Must be a valid corporate or personal RUT satisfying Modulo 11.
* `razonSocial`: Minimum 3 characters (e.g., *"Sociedad Dental SpA"*).
* `giroComercial`: Minimum 3 characters (e.g., *"Atención odontológica"*).
* `address`: Registered fiscal domicile street and office/suite number.
* `city`: Official commune in Chile.

---

### 2.4 Document Schema Freezing & Validation Engine (`src/utils/schemaValidation.ts`)

To prevent data drift and ensure that all Firestore documents strictly satisfy domain rules before writing or migrating, `src/utils/schemaValidation.ts` implements pure, deterministic schema validators:

> **Input contract (as built):** every validator takes `input: unknown`, not `doc: any`. They reject non-objects up front, then narrow through a module-local `type SchemaDoc = Record<string, unknown>` view before reading any field. This is deliberate: the validators exist precisely to inspect *untrusted* documents (CLI migrations, `scripts/manage-firestore-schema.ts`), so the parameter must not promise a shape. **Do not widen these back to `any`** — `no-explicit-any` is an error.
>
> **`as OrderStatus` / `as PaymentMethod` casts** on the two `VALID_*` membership checks are required because `Array.prototype.includes` is invariant; they are safe because the check is exactly what validates the value.
>
> **The `customer.rut` check is string-guarded:** `typeof c.rut !== 'string' || !validateRut(c.rut)` — a non-string RUT reports a validation error instead of throwing inside `rut.replace(...)`.
>
> **Scope honesty — what the validators do NOT check:** `orderId` is only asserted non-empty (there is no `PRONTO-XXXXXXXX` format check); `timestamp`/`actorRole`/`changeType` fields in the audit validators are only asserted as present strings (no ISO-8601 parse, no enum-membership check except `newStatus`/`status`/`paymentMethod` on orders); stock deltas (`previousStock`/`newStock`/`delta`) are not validated at all. If you need stricter guarantees, add them here and to the tests together — do not assume coverage that is not in the code.

#### 1. `validateProductSchema(input: unknown): ValidationResult`

* Enforces required string `id`, `name`, and `category`.
* Validates `price`: Must be a positive integer in CLP (zero decimals, no floating points).
* Validates `stockCount`: Must be a non-negative integer (`>= 0`).
* Validates boolean flags: `inStock`, `prescriptionRequired`, and optional `isActive`.
* Asserts that array attributes (`specs`, `images`) are valid arrays.
* Validates optional `unitOfSale`: when present it must be a **non-empty string of at most 60 characters** (`typeof !== 'string'`, `trim() === ''` or `length > 60` is an error). Absent on every legacy document — the field is optional, so no migration is needed and `pronto-*` / `odon-*` docs stay valid. `scripts/import-catalog-csv.ts` writes it only when the CSV carries a `unit_of_sale` column.

#### 2. `validateOrderSchema(input: unknown): ValidationResult`

* Requires a non-empty string `orderId` (no `PRONTO-XXXXXXXX` format check — see scope note above).
* Enforces membership in `VALID_ORDER_STATUSES` (all 12 `OrderStatus` values) and `VALID_PAYMENT_METHODS` (`'transferencia' | 'mercadopago' | 'whatsapp'`).
* Validates `totalAmount`: Must be a positive integer in CLP.
* Enforces Chilean Modulo 11 RUT validation on `customer.rut` (string-guarded, see above), plus required `fullName`, `email` (must contain `@`), `address`, `city`.
* If `customer.documentType === 'factura'`, enforces non-empty `razonSocial` and `giroComercial`.
* Verifies item line integrity: each item needs a `productId` (or legacy `id`), a `name`, integer `quantity >= 1` and integer `price >= 0`. Items are read through a `SchemaDoc[]` view, not `any[]`.

#### 3. `validateOrderStatusHistorySchema(input: unknown): ValidationResult`

* Enforces relational foreign key `orderId` (non-empty string).
* Enforces `newStatus` membership in `VALID_ORDER_STATUSES`; `changedBy`, `actorRole`, `timestamp`, `reason` are only asserted non-empty strings (see scope note).

#### 4. `validateInventoryAuditLogSchema(input: unknown): ValidationResult`

* Enforces relational foreign key `productId` (non-empty string).
* `changeType`, `changedBy`, `actorRole`, `timestamp` are only asserted non-empty strings (see scope note); stock deltas are not validated.

---

### 2.5 Category Display Alias Map (`src/utils/categoryAlias.ts`)
Firestore stores frozen, uppercase Chilean category keys (`DESECHABLES, ESTERILIZACION Y DESINFECCION`). Storefront presentation must never leak those raw keys, so this module is the **single source of truth for customer-facing category naming**:

* **`CATEGORY_DISPLAY_MAP`**: Record mapping internal keys to clean labels (e.g. `Desechables y Esterilización`). Only `DESECHABLES, ESTERILIZACION Y DESINFECCION` also registers a lowercase variant — matching is otherwise case-sensitive and exact.
* **`formatCategoryDisplayName(category?: string): string`**:
  * Trims the input, returns the alias when registered, and otherwise falls back safely to the **trimmed** string (legacy fixtures like `Sterilization` render unchanged).
  * Returns `''` for `undefined`, non-string, empty, or whitespace-only values, so callers can guard rendering without extra checks.
* **Consumers:** `ProductCard.tsx`, `ProductQuickView.tsx`, and `CATEGORIES` in [src/data/products.ts](../data/products.ts) (category pills derive their labels from this map to prevent naming drift).
* **Purity Contract:** No imports from `src/data/`, no side effects — safe to use from any layer.

---

### 2.6 Server-Authoritative Payable Total (`src/utils/orderTotal.ts`) — Task 0.9

The single source of truth for "how much does this order cost" — integer CLP, IVA-inclusive catalog prices, promo applied per line. Four surfaces derive the SAME amount through it: the cart display (`App`/`Cart` via `computeCartTotal`), order registration (`submitOrder` persists it), the MP preference (`create-preference` charges it), and the webhook (asserts the payment against it).

* **`normalizeQuantity(quantity: unknown): number`** — positive-integer clamp (minimum 1); fractional/NaN/garbage collapse to 1. Identical on every call site by construction.
* **`computeDiscountedUnitPrice(price, discountPercent)`**: `Math.round(price × (100 − pct) / 100)`; returns `0` for non-finite/non-positive prices; discount clamped to 0–100.
* **`computeOrderTotal(lines, pct)`**: `Σ discountedUnit × quantity` over plain `{ price, quantity }` lines — exactly the amount Mercado Pago charges a preference built with the same unit prices.
* **`toOrderLines(items)`** / **`computeCartTotal(items, pct)`**: the CartItem adapter — cart lines carry the price at `item.product.price`, so raw cart lines fed to `computeOrderTotal` would charge `$0` (regression-tested). Always go through `computeCartTotal` for cart-shaped input.
* **Rounding iron rule:** `Math.round` at every step; CLP has no cents; floating residues are a gateway/SII rejection risk.
* **Consumers:** `App.tsx` (`cartTotal`), `Cart.tsx` (drawer total), `src/services/api.ts` (`submitOrder`), `api/create-preference.ts` (preference lines), `api/webhooks/mercadopago.ts` (amount assertion).
* **Purity Contract:** No DOM, no network, no `import.meta.env` — importable from Node (`api/`) and tsx scripts.

---

### 2.7 Voucher-URL Allowlist (`src/utils/voucherUrl.ts`) — Task 0.13

`classifyVoucherUrl(raw): 'storage' | 'legacy-data' | 'unsafe'` is the single policy for "may this stored voucher value be opened?". It exists because `order.voucherUrl` is a client-writable string and the admin panel used to open whatever it found — a `javascript:` link, or a `data:` URL turned into a same-origin `blob:` page, i.e. script execution inside the admin origin.

* **`storage`** — `https:` on the `firebasestorage.googleapis.com` host only (the one URL shape `api/_lib/voucherStorage.ts` builds). `http:`, a foreign host, `firebasestorage.googleapis.com.evil.com`, a protocol-relative or relative path, a `blob:`/`javascript:` scheme and non-string/empty values are all `unsafe`.
* **`legacy-data`** — a pre-2.9 `data:` voucher whose **declared** MIME is allowlisted (`ALLOWED_VOUCHER_DATA_TYPES` = PDF/PNG/JPEG). `normalizeAllowedVoucherMime()` also maps the non-standard `image/jpg` → `image/jpeg`; it returns `null` for everything else (incl. `text/html`, `image/svg+xml`).
* **Consumers:** `src/admin/components/OrderDetailPanel.tsx` (real `<a>` / Blob-opening `<button>` / plain text). Any future surface that links a stored voucher URL — e.g. the storefront tracking modal, which renders none today — must use this classifier.
* **Load-bearing detail:** a `blob:` URL inherits the creator's origin, so the Blob must always be re-wrapped with the forced allowlisted type (`new Blob([blob], { type })`) and never passed through untyped. For a `data:` URL the fetched `blob.type` *is* the declared type, so the post-fetch check is belt-and-braces, not the control.
* **Purity:** string/URL parsing only — no DOM, no network, no `import.meta.env`.
