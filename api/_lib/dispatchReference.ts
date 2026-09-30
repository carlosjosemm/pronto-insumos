import {
  DEFAULT_DELIVERY_ZONE,
  DELIVERY_ZONE_REFERENCE_CODES,
  DELIVERY_ZONES
} from '../../src/config/delivery.js'
import type { DispatchReferenceSource } from '../../src/types'

/**
 * Internal dispatch reference (Task 2.13).
 *
 * The storefront has no courier API, and the default "Despacho Local Melipilla
 * (Flota Directa)" route ships without a guía — so `dispatch-order` mints a
 * human-readable route code (`MEL-260929-07`) when the parcel leaves the
 * warehouse. It is an INTERNAL code, never presented as a courier guía; a real
 * Starken/Chilexpress guía typed by the warehouse supersedes it and is recorded
 * with `referenceSource: 'manual'`.
 *
 * The daily sequence comes from a tiny counter document per zone + Chilean local
 * day (`dispatch_counters/MEL-260929`), incremented inside the dispatch
 * transaction — that is what makes the reference a genuine driver route sheet
 * ("parcel #7 of today's Melipilla run") instead of a reformatted order id.
 */
export const DISPATCH_REFERENCE_COLLECTION = 'dispatch_counters'

export type DispatchReferencePlan =
  | { kind: 'manual'; reference: string }
  | { kind: 'keep'; reference: string; source: DispatchReferenceSource }
  | { kind: 'mint' }

/**
 * Chilean local `YYMMDD` (`America/Santiago`) — a 21:00 Melipilla dispatch
 * belongs to that local day, not to the UTC one. Mirrors the timezone bucketing
 * of `dashboard-stats`.
 */
export function chileanDateKey(date: Date): string {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
  return formatted.replace(/-/g, '').slice(2)
}

function normalizeZoneName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Zone prefix for the reference. The checkout exposes `DELIVERY_ZONES` as a
 * select, but legacy orders may carry a free-text commune — anything that does
 * not match a configured zone falls back to Melipilla, the default zone.
 */
export function resolveDispatchReferencePrefix(city?: string): string {
  const normalizedCity = typeof city === 'string' ? normalizeZoneName(city) : ''
  const zone = DELIVERY_ZONES.find((candidate) => normalizeZoneName(candidate) === normalizedCity)
  return DELIVERY_ZONE_REFERENCE_CODES[zone ?? DEFAULT_DELIVERY_ZONE]
}

/** Counter document id: one sequence per zone + Chilean local day. */
export function counterDocumentId(prefix: string, dateKey: string): string {
  return `${prefix}-${dateKey}`
}

/** `MEL-260929-07` — zero-padded to two digits, growing naturally past 99. */
export function formatDispatchReference(prefix: string, dateKey: string, sequence: number): string {
  const safeSequence = Number.isInteger(sequence) && sequence > 0 ? sequence : 1
  return `${prefix}-${dateKey}-${String(safeSequence).padStart(2, '0')}`
}

/**
 * Decides which reference a dispatch must carry, without touching Firestore:
 * - the warehouse typed a code ⇒ it IS the reference (a real guía, `manual`);
 * - an existing reference is kept (a manual guía is never downgraded to a
 *   generated code, and a generated route code stays stable across re-dispatches);
 * - otherwise the caller mints one from the daily counter.
 */
export function planDispatchReference(input: {
  typedCode?: string | null
  existingReference?: string
  existingSource?: unknown
}): DispatchReferencePlan {
  // Same coercion rule as the handler's Task 0.15 contract: a numeric code the
  // warehouse typed is a string, never a missing value.
  const typedCode =
    input.typedCode === undefined || input.typedCode === null ? '' : String(input.typedCode).trim()
  if (typedCode) {
    return { kind: 'manual', reference: typedCode }
  }

  const existingReference =
    typeof input.existingReference === 'string' ? input.existingReference.trim() : ''
  if (existingReference) {
    return {
      kind: 'keep',
      reference: existingReference,
      source: input.existingSource === 'manual' ? 'manual' : 'generated'
    }
  }

  return { kind: 'mint' }
}
