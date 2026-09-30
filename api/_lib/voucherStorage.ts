import { randomUUID } from 'node:crypto'
import { getStorage } from 'firebase-admin/storage'
import { getAdminApp } from './firebaseAdmin.js'

/**
 * Bank-transfer voucher storage helpers.
 *
 * Voucher bytes NEVER live in Firestore: the order document holds only the object
 * path, the file metadata and a download-token URL. The browser uploads directly to
 * the private bucket over a short-lived V4 signed URL minted by /api/upload-voucher,
 * which also owns every authorization/validation decision (order lookup, RUT match,
 * lifecycle guard, MIME allowlist, byte cap).
 */

/** Hard cap enforced at signing time and re-verified against the object's real metadata. */
export const VOUCHER_MAX_BYTES = 5 * 1024 * 1024
export const VOUCHER_MAX_MB = 5

/** Signed PUT validity — long enough for a slow clinic connection, short enough to be useless if leaked. */
export const VOUCHER_UPLOAD_URL_TTL_MS = 10 * 60 * 1000

/** Object path prefix every voucher lives under; also the guard used before deleting anything. */
export const VOUCHER_PATH_ROOT = 'vouchers'

/** Firebase's download-token metadata key — the capability embedded in `voucherUrl`. */
export const VOUCHER_DOWNLOAD_TOKEN_METADATA_KEY = 'firebaseStorageDownloadTokens'

export const ALLOWED_VOUCHER_CONTENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const

export type AdminStorage = ReturnType<typeof getStorage>
export type AdminBucket = ReturnType<AdminStorage['bucket']>

/** Normalizes a declared/actual content type to the allowlist (or `null` when unsupported). */
export function normalizeVoucherContentType(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const base = raw.split(';')[0].trim().toLowerCase()
  const normalized = base === 'image/jpg' ? 'image/jpeg' : base
  return (ALLOWED_VOUCHER_CONTENT_TYPES as readonly string[]).includes(normalized) ? normalized : null
}

/** Object extension derived from the (already normalized) content type — never from a user filename. */
export function extensionForVoucherContentType(contentType: string): string {
  const extensions: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg'
  }
  return extensions[contentType] || 'bin'
}

/** Display-only filename: no path separators, control characters or runaway length. */
export function sanitizeVoucherFileName(raw: unknown): string {
  const cleaned = String(raw ?? '')
    .replace(/[\\/]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || 'comprobante').slice(0, 120)
}

/** Canonical, path-safe order id (`PRONTO-XXXXXXXX` — 8 Crockford base32 chars; legacy 6-digit ids still resolve). */
export function sanitizeOrderIdForPath(orderId: unknown): string {
  return String(orderId ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
}

/** Path-safe collection segment (`orders` | `dev_orders` | …). */
export function sanitizeCollectionSegment(collectionName: unknown): string {
  const value = String(collectionName ?? '').trim()
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : 'orders'
}

/** Random capability token (hex) used for object names and download tokens. */
export function randomVoucherToken(length = 32): string {
  return randomUUID().replace(/-/g, '').slice(0, Math.max(1, Math.min(length, 32)))
}

/**
 * `vouchers/{orders|dev_orders}/{PRONTO-XXXXXXXX}/{epochMs}-{token}.{ext}`
 * Environment-scoped so production and `dev_*` vouchers can never mix.
 */
export function buildVoucherStoragePath(
  collectionName: string,
  orderId: string,
  contentType: string,
  now: number = Date.now(),
  token: string = randomVoucherToken(8)
): string {
  return [
    VOUCHER_PATH_ROOT,
    sanitizeCollectionSegment(collectionName),
    sanitizeOrderIdForPath(orderId),
    `${now}-${token}.${extensionForVoucherContentType(contentType)}`
  ].join('/')
}

/** True only for a direct child object of this order's voucher folder. */
export function isVoucherStoragePathForOrder(
  storagePath: unknown,
  collectionName: string,
  orderId: string
): storagePath is string {
  if (typeof storagePath !== 'string') return false
  const prefix = `${VOUCHER_PATH_ROOT}/${sanitizeCollectionSegment(collectionName)}/${sanitizeOrderIdForPath(orderId)}/`
  if (!storagePath.startsWith(prefix)) return false
  const remainder = storagePath.slice(prefix.length)
  return remainder.length > 0 && !remainder.includes('/')
}

/** Firebase Storage download URL (same shape firebase-admin's `getDownloadURL()` builds). */
export function buildVoucherDownloadUrl(bucketName: string, storagePath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`
}

/** `.env.example` / console placeholders are not bucket names — treat them as unconfigured. */
function isPlaceholderBucketName(name: string): boolean {
  return /^YOUR_/i.test(name) || name.toUpperCase().includes('YOUR_PROJECT_ID')
}

/**
 * Bucket name: explicit env override first, then the project's default Firebase Storage bucket.
 *
 * Note: `cert()` does NOT populate `app.options.projectId`, so in practice the default
 * resolves through `FIREBASE_PROJECT_ID` (which is mandatory for the Admin SDK anyway).
 * The default suffix differs per project age (`.firebasestorage.app` for projects created
 * after Oct 2024, `.appspot.com` for older ones) — when in doubt, set `FIREBASE_STORAGE_BUCKET`
 * to the bucket name shown in the Firebase console.
 */
export function resolveVoucherBucketName(projectId?: string): string | null {
  const explicit = (process.env.FIREBASE_STORAGE_BUCKET || '').trim()
  if (explicit) return isPlaceholderBucketName(explicit) ? null : explicit
  const id = (projectId || process.env.FIREBASE_PROJECT_ID || '').trim()
  if (!id || isPlaceholderBucketName(id)) return null
  return `${id}.firebasestorage.app`
}

/**
 * Bucket handle for voucher operations, or `null` when Admin credentials/bucket name are
 * unavailable (same degradation contract as `getAdminFirestore()`).
 */
export function getVoucherBucket(): AdminBucket | null {
  const app = getAdminApp()
  if (!app) return null

  const bucketName = resolveVoucherBucketName(app.options.projectId)
  if (!bucketName) {
    console.warn('[voucherStorage] FIREBASE_STORAGE_BUCKET could not be resolved — voucher uploads are unavailable.')
    return null
  }

  try {
    return getStorage(app).bucket(bucketName)
  } catch (err: unknown) {
    console.error(
      '[voucherStorage] Failed to resolve the voucher storage bucket:',
      err instanceof Error ? err.message : err
    )
    return null
  }
}

/** Authoritative size/type validation, run against the object's real Storage metadata. */
export function validateVoucherFileMetadata(metadata: {
  size?: unknown
  contentType?: unknown
}): { isValid: boolean; error?: string } {
  const rawSize = metadata?.size
  const size = typeof rawSize === 'string' ? Number(rawSize) : rawSize

  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    return { isValid: false, error: 'El comprobante no contiene un archivo válido.' }
  }

  if (size > VOUCHER_MAX_BYTES) {
    return {
      isValid: false,
      error: `El archivo excede el tamaño máximo permitido de ${VOUCHER_MAX_MB} MB.`
    }
  }

  if (!normalizeVoucherContentType(metadata?.contentType)) {
    return {
      isValid: false,
      error: 'Formato no soportado. Por favor adjunta un archivo en PDF, PNG o JPG.'
    }
  }

  return { isValid: true }
}

/** The `x-goog-content-length-range` value bound into the signature (and sent by the client). */
export function voucherContentLengthRange(maxBytes: number = VOUCHER_MAX_BYTES): string {
  return `0,${maxBytes}`
}

/**
 * Short-lived V4 signed PUT URL, bound to the exact content type **and byte cap** the
 * client must honour. `x-goog-content-length-range` is signed, so Storage itself rejects
 * any upload above the cap — the confirm phase then re-verifies the object's real metadata.
 * The client must send the same header with the same value (`maxBytes` in the sign response).
 */
export async function createVoucherUploadUrl(
  bucket: AdminBucket,
  storagePath: string,
  contentType: string,
  now: number = Date.now()
): Promise<{ uploadUrl: string; expiresAt: string }> {
  const expires = now + VOUCHER_UPLOAD_URL_TTL_MS
  const [uploadUrl] = await bucket.file(storagePath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires,
    contentType,
    extensionHeaders: {
      'x-goog-content-length-range': voucherContentLengthRange()
    }
  })
  return { uploadUrl, expiresAt: new Date(expires).toISOString() }
}

/** Stamps a download token on the object and returns the resulting capability URL. */
export async function attachVoucherDownloadToken(
  bucket: AdminBucket,
  storagePath: string,
  token: string = randomUUID()
): Promise<string> {
  await bucket.file(storagePath).setMetadata({
    metadata: { [VOUCHER_DOWNLOAD_TOKEN_METADATA_KEY]: token }
  })
  return buildVoucherDownloadUrl(bucket.name, storagePath, token)
}

/** Best-effort object removal, restricted to the voucher prefix so it can never touch anything else. */
export async function deleteVoucherObject(bucket: AdminBucket, storagePath: unknown): Promise<boolean> {
  if (typeof storagePath !== 'string' || !storagePath.startsWith(`${VOUCHER_PATH_ROOT}/`)) return false
  try {
    await bucket.file(storagePath).delete({ ignoreNotFound: true })
    return true
  } catch (err: unknown) {
    console.warn(
      '[voucherStorage] Failed to delete voucher object (best-effort):',
      err instanceof Error ? err.message : err
    )
    return false
  }
}
