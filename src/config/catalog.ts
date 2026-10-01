/**
 * Public catalog disclosure constants — shared by the storefront and the
 * serverless catalog endpoint so the UI cue and the API contract can never
 * drift apart.
 */

/**
 * The only stock figure that is public: a product whose `stockCount` is 1–3
 * may expose that count (it powers the "Últimas unidades" cue); every other
 * value is omitted from the public catalog response and the server verifies
 * stock at payment time. The admin low-stock KPI deliberately stays at ≤ 5 —
 * this constant bounds what CUSTOMERS may see, not internal reporting.
 */
export const LOW_STOCK_PUBLIC_THRESHOLD = 3
