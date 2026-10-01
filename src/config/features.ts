/**
 * Storefront feature switches — one-line re-enable flags, mirroring the
 * `FACTURA_ENABLED` pattern in `CheckoutModal.tsx`.
 */

/**
 * Ratings and reviews are off: the storefront has no review system, so any star
 * rating or review count it displayed would be fabricated. While this is false
 * the product card and the quick view render no stars and no review count, and
 * the catalog sort offers no rating/review options. The `rating` /
 * `reviewsCount` fields and the `sortBy` branches in `fetchProducts` stay in
 * place, so turning reviews on later is this flag plus a real review source.
 */
export const REVIEWS_ENABLED = false
