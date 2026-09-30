/**
 * Shared numeric bounds for the admin catalog handlers.
 *
 * CLP is a whole-peso currency with no cents, so a catalog price is an integer in
 * `[1, MAX_CLP]`, and a warehouse count is an integer in `[0, MAX_STOCK_UNITS]`.
 *
 * These live in one module because `create-product`, `update-product` and
 * `update-stock` must reject exactly the same values: three private copies drift,
 * and a drifted copy lets one endpoint persist a price or stock level the others
 * refuse.
 *
 * The guards are deliberately **number-only**. `parseInt(String(value))` silently
 * truncated `189.99` to `189` and accepted junk prefixes like `'12abc'` (→ `12`) or
 * `'1e3'` (→ `1`), so a typo could quietly change a charged catalog price.
 */

/** Upper bound for a CLP price — CLP is a whole-peso currency with no cents. */
export const MAX_CLP = 999_999_999

/** Upper bound for a physical warehouse count — rejects absurd or overflow input. */
export const MAX_STOCK_UNITS = 1_000_000

/** True only for a whole-peso CLP amount in `[1, MAX_CLP]`. */
export function isValidClpAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_CLP
}

/** True only for a whole-unit warehouse count in `[0, MAX_STOCK_UNITS]`. */
export function isValidStockUnits(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_STOCK_UNITS
}
