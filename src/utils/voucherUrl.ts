/**
 * Voucher-URL policy (Task 0.13).
 *
 * `order.voucherUrl` is a string that any anonymous visitor could once write
 * straight into a new order document, and the admin panel opened whatever it
 * found: a `javascript:` link, or a `data:` URL converted into a Blob and opened
 * as a same-origin `blob:` page — which is script execution inside the admin
 * origin (it can read the Firebase Auth session and call every `/api/admin/*`
 * action).
 *
 * This module is the single policy for "may this stored value be opened?":
 *
 * - `storage`     → the only URL shape the app ever writes: a Firebase Storage
 *                   download-token URL on the `firebasestorage.googleapis.com`
 *                   host (built by `api/_lib/voucherStorage.ts`).
 * - `legacy-data` → a pre-Task-2.9 Base64 voucher whose DECLARED MIME is
 *                   allowlisted. A `data:` Blob inherits exactly that declared type,
 *                   so callers must open it through an explicit
 *                   `new Blob([blob], { type: forcedType })` re-wrap — never hand the
 *                   fetched Blob straight to `URL.createObjectURL`, because a
 *                   `blob:` URL inherits the creator's origin and the forced type is
 *                   what keeps HTML bytes inert.
 * - `unsafe`      → everything else: `javascript:`, `data:text/html`, a foreign
 *                   https host, a relative URL, a non-string.
 */

export type VoucherLinkKind = 'storage' | 'legacy-data' | 'unsafe'

export const ALLOWED_VOUCHER_DATA_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const

const STORAGE_HOST = 'firebasestorage.googleapis.com'

/**
 * Normalize a MIME type to an allowlisted one, or `null` when it is not allowed.
 * `image/jpg` is the non-standard spelling browsers accept; normalize it to the
 * canonical `image/jpeg`.
 */
export function normalizeAllowedVoucherMime(rawType: unknown): string | null {
  if (typeof rawType !== 'string') return null
  const clean = rawType.split(';')[0].trim().toLowerCase()
  if (clean === 'image/jpg') return 'image/jpeg'
  return (ALLOWED_VOUCHER_DATA_TYPES as readonly string[]).includes(clean) ? clean : null
}

/** MIME type declared by a `data:` URL (RFC 2397); `''` when none is declared. */
function declaredDataMime(raw: string): string {
  const match = raw.match(/^data:([^;,]*)/i)
  return match ? match[1].trim().toLowerCase() : ''
}

export function classifyVoucherUrl(raw: unknown): VoucherLinkKind {
  if (typeof raw !== 'string') return 'unsafe'
  const value = raw.trim()
  if (!value) return 'unsafe'

  if (value.toLowerCase().startsWith('data:')) {
    return normalizeAllowedVoucherMime(declaredDataMime(value)) ? 'legacy-data' : 'unsafe'
  }

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return 'unsafe'
    if (url.hostname !== STORAGE_HOST) return 'unsafe'
    return 'storage'
  } catch {
    return 'unsafe'
  }
}
