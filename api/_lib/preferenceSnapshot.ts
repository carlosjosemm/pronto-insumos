/**
 * The server-only price freeze written at Mercado Pago preference time.
 *
 * The amount a shopper is charged must be the amount they were quoted, so
 * `/api/create-preference` snapshots the payable total — and the per-line
 * discounted unit prices it was built from — onto the order document when it
 * builds the preference. The webhook then asserts the paid amount against that
 * snapshot rather than the live catalog, so an admin price edit, a product pause
 * or a stock change between preference creation and payment can no longer park a
 * legitimately paid order in manual review.
 *
 * Orders created before this existed carry no snapshot and still fall back to the
 * catalog recomputation, so the freeze is additive.
 *
 * These keys are server-written only: the public `orders` create rule allowlists
 * exactly the shape `submitOrder()` writes, so a client can never write them.
 */

/**
 * How long a Mercado Pago preference stays payable. Card/Webpay payments settle in
 * minutes, so a longer link only widens the window in which a stale price could be
 * paid; a payment already `in_process` when the link expires still completes.
 * `close-stale-orders` uses a 48-hour default — this 24-hour expiry plus a 24-hour
 * buffer for in-review payments and delayed webhooks — so the two agree.
 */
export const PREFERENCE_TTL_MS = 24 * 60 * 60 * 1000

export interface PreferenceSnapshotLine {
  productId: string
  quantity: number
  unitPrice: number
}

export interface PreferenceSnapshot {
  /** Payable total (integer CLP) the shopper was quoted — the webhook's assertion target. */
  pricedTotal: number
  /**
   * Per-line discounted unit prices AND quantities, so a reconciliation can rebuild
   * `pricedTotal` from the snapshot alone (Σ unitPrice × quantity) without rejoining
   * the order's item lines.
   */
  priceSnapshot: Array<{ productId: string; quantity: number; unitPrice: number }>
  /** When the preference was built, in the Chilean-offset form sent to Mercado Pago. */
  preferenceCreatedAt: string
  /** When the preference stops being payable, in the same form. */
  preferenceExpiresAt: string
}

/**
 * ISO-8601 timestamp with the Chilean UTC offset (e.g. `2026-10-02T09:00:00.000-03:00`).
 *
 * Mercado Pago documents `expiration_date_from`/`expiration_date_to` in
 * `yyyy-MM-dd'T'HH:mm:ssz` form, where `z` is a numeric offset, and answers an
 * `invalid_expiration_date_to` error for a value it cannot read — a wrong format would
 * fail every preference creation, so the offset is emitted rather than a UTC `Z`
 * suffix. The offset is read per instant, so Chile's DST transition is reflected.
 */
export function toChileanOffsetIso(epochMs: number): string {
  const instant = new Date(epochMs)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(instant)
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00'
  const zoneName =
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', timeZoneName: 'longOffset' })
      .formatToParts(instant)
      .find((part) => part.type === 'timeZoneName')?.value ?? ''
  const offset = zoneName.match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? '-04:00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.000${offset}`
}

/** Builds the snapshot written onto the order at preference time. */
export function buildPreferenceSnapshot(
  pricedTotal: number,
  lines: PreferenceSnapshotLine[],
  now: number = Date.now()
): PreferenceSnapshot {
  return {
    pricedTotal,
    priceSnapshot: lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice
    })),
    preferenceCreatedAt: toChileanOffsetIso(now),
    preferenceExpiresAt: toChileanOffsetIso(now + PREFERENCE_TTL_MS)
  }
}

/**
 * The frozen payable total stored on an order, or `null` when the order carries no
 * usable snapshot (a legacy order, or a malformed value). A `null` return means the
 * caller must fall back to recomputing the total from the live catalog.
 */
export function readFrozenPricedTotal(orderData: Record<string, unknown> | null | undefined): number | null {
  const raw = orderData?.pricedTotal
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : null
}
