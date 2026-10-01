import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'
import {
  VOUCHER_PATH_ROOT,
  deleteVoucherObject,
  getVoucherBucket,
  isCanonicalOrderId,
  sanitizeCollectionSegment,
  sanitizeOrderIdForPath,
  type AdminBucket
} from '../voucherStorage.js'

/**
 * Voucher-object housekeeping.
 *
 * `/api/upload-voucher` bounds how many signed URLs one order can ever mint
 * (`voucherSignCount`), but a sign that is PUT and never `confirm`ed still leaves an
 * unreferenced object under `vouchers/…`, and Cloud Storage bills every stored byte.
 * This operator action is the cleanup half: it lists each scanned order's voucher
 * folder and deletes the objects that order does not reference.
 *
 * It runs on the existing `/api/admin/[action]` dispatcher, so it consumes no
 * serverless-function slot, and it is `POST`-only because it mutates Storage.
 */

/**
 * Objects newer than this are never deleted. The signed PUT URL lives 10 minutes, so a
 * one-hour grace window cannot race an upload that is still in flight (signed but not
 * yet confirmed) — a stale-object sweep must never break a legitimate upload in progress.
 */
export const VOUCHER_ORPHAN_GRACE_MS = 60 * 60 * 1000

/** Orders scanned per run when the caller does not say otherwise. */
export const VOUCHER_SWEEP_DEFAULT_LIMIT = 100
/** Hard ceiling on orders scanned per run — bounds the per-order Storage listings. */
export const VOUCHER_SWEEP_MAX_LIMIT = 500
/** Cap on reported failures so a pathological run cannot bloat the response. */
export const VOUCHER_SWEEP_MAX_REPORTED_FAILURES = 50

/** One order to sweep: its canonical id and the object it legitimately references. */
export interface VoucherSweepTarget {
  orderId: string
  referencedPath?: string
}

export interface VoucherSweepOutcome {
  scannedObjects: number
  /** Paths removed (or, in a dry run, that would be removed). */
  deleted: string[]
  keptReferenced: number
  skippedRecent: number
  /** Non-fatal problems (a listing or a delete that failed) — the sweep never aborts on these. */
  failures: string[]
}

export interface VoucherSweepOptions {
  now?: number
  graceMs?: number
  dryRun?: boolean
}

/** Clamps a caller-supplied order limit into `[1, VOUCHER_SWEEP_MAX_LIMIT]`. */
export function resolveSweepLimit(raw: unknown): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return VOUCHER_SWEEP_DEFAULT_LIMIT
  return Math.min(Math.floor(parsed), VOUCHER_SWEEP_MAX_LIMIT)
}

/** Age of a Storage object from its `timeCreated`, or `null` when it is unusable. */
function objectAgeMs(timeCreated: unknown, now: number): number | null {
  const created = typeof timeCreated === 'string' ? Date.parse(timeCreated) : NaN
  if (!Number.isFinite(created)) return null
  return now - created
}

/**
 * Verdict for one listed object.
 *
 * `keep`        — it is the object the order references, so it must survive.
 * `skip-recent` — younger than the grace window, or its age is unreadable. Never delete
 *                 on an unknown age: the safe direction is to leave the object for the
 *                 next sweep rather than risk an upload that is still being confirmed.
 * `delete`      — unreferenced and demonstrably older than the grace window.
 */
export function classifyVoucherObject(
  storagePath: string,
  timeCreated: unknown,
  referencedPath: string | undefined,
  now: number,
  graceMs: number
): 'keep' | 'delete' | 'skip-recent' {
  if (referencedPath && storagePath === referencedPath) return 'keep'
  const ageMs = objectAgeMs(timeCreated, now)
  if (ageMs === null || ageMs < graceMs) return 'skip-recent'
  return 'delete'
}

/**
 * Deletes every unreferenced object in each target order's voucher folder.
 *
 * Listing is done per order (never one whole-prefix listing): an object is only ever
 * considered when its own order document was read, so an order that was not scanned can
 * never be mistaken for an orphan. `deleteVoucherObject` re-asserts the `vouchers/` prefix
 * on every removal, and a listing/delete failure is recorded instead of aborting the run.
 */
export async function sweepVoucherObjects(
  bucket: AdminBucket,
  collectionSegment: string,
  targets: VoucherSweepTarget[],
  options: VoucherSweepOptions = {}
): Promise<VoucherSweepOutcome> {
  const now = options.now ?? Date.now()
  const graceMs = options.graceMs ?? VOUCHER_ORPHAN_GRACE_MS
  const dryRun = options.dryRun === true
  const segment = sanitizeCollectionSegment(collectionSegment)
  const outcome: VoucherSweepOutcome = {
    scannedObjects: 0,
    deleted: [],
    keptReferenced: 0,
    skippedRecent: 0,
    failures: []
  }
  const recordFailure = (message: string): void => {
    if (outcome.failures.length < VOUCHER_SWEEP_MAX_REPORTED_FAILURES) outcome.failures.push(message)
  }

  for (const target of targets) {
    const orderSegment = sanitizeOrderIdForPath(target.orderId)
    // Only a canonical id may derive a folder prefix. A non-canonical id could be
    // an id whose stripped characters collide with another order's folder, so the
    // sweep skips it entirely instead of listing (and possibly deleting) an object
    // that belongs to a different order.
    if (!orderSegment || !isCanonicalOrderId(orderSegment)) {
      console.warn(
        `[voucher-housekeeping] Skipping non-canonical order id "${String(target.orderId)}" — no voucher path is derived from it.`
      )
      continue
    }
    const prefix = `${VOUCHER_PATH_ROOT}/${segment}/${orderSegment}/`

    let files: Array<{ name?: string; metadata?: { timeCreated?: unknown } }>
    try {
      const [listed] = await bucket.getFiles({ prefix })
      files = listed
    } catch (err: unknown) {
      recordFailure(`No se pudo listar ${prefix}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    for (const file of files) {
      const path = typeof file?.name === 'string' ? file.name : ''
      outcome.scannedObjects++
      const verdict = classifyVoucherObject(
        path,
        file?.metadata?.timeCreated,
        target.referencedPath,
        now,
        graceMs
      )
      if (verdict === 'keep') {
        outcome.keptReferenced++
        continue
      }
      if (verdict === 'skip-recent') {
        outcome.skippedRecent++
        continue
      }
      if (dryRun) {
        outcome.deleted.push(path)
        continue
      }
      const removed = await deleteVoucherObject(bucket, path)
      if (removed) outcome.deleted.push(path)
      else recordFailure(path)
    }
  }

  return outcome
}

/**
 * Order document → sweep target (its referenced object, when it has one).
 *
 * The `orderId` FIELD is preferred over the document key: the voucher folder is
 * derived from the id the order was signed under, which for a legacy order resolved
 * through the field query is the field value, not the document key.
 */
function toSweepTarget(data: Record<string, unknown> | undefined, fallbackOrderId: string): VoucherSweepTarget {
  const orderId = typeof data?.orderId === 'string' && data.orderId.trim() ? data.orderId : fallbackOrderId
  const referencedPath =
    typeof data?.voucherStoragePath === 'string' && data.voucherStoragePath ? data.voucherStoragePath : undefined
  return { orderId, referencedPath }
}

/** Newest-first ordering key for the bounded scan. */
function createdAtMs(data: Record<string, unknown> | undefined): number {
  const raw = data?.createdAt
  if (raw && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate().getTime()
  }
  const parsed = typeof raw === 'string' || typeof raw === 'number' ? new Date(raw).getTime() : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setAdminResponseHeaders(res, 'POST, OPTIONS')

  if (isAdminPreflight(req)) {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' })
  }

  const authResult = await verifyAdminToken(req)
  if (!authResult.authenticated) {
    return res.status(403).json({ success: false, error: authResult.error })
  }

  const db = getAdminFirestore()
  const bucket = getVoucherBucket()
  if (!db || !bucket) {
    return res.status(500).json({ success: false, error: 'Almacenamiento no inicializado' })
  }

  const body = (req.body || {}) as Record<string, unknown>
  const dryRun = body.dryRun === true
  const requestedOrderId = typeof body.orderId === 'string' ? body.orderId.trim().toUpperCase() : ''
  const limit = resolveSweepLimit(body.limit)
  const ordersCol = getCollectionName('orders')

  try {
    let targets: VoucherSweepTarget[]

    if (requestedOrderId) {
      const doc = await db.collection(ordersCol).doc(requestedOrderId).get()
      if (doc.exists) {
        targets = [toSweepTarget(doc.data(), requestedOrderId)]
      } else {
        const snap = await db.collection(ordersCol).where('orderId', '==', requestedOrderId).limit(1).get()
        if (snap.empty) {
          return res.status(404).json({ success: false, error: 'Pedido no encontrado' })
        }
        targets = [toSweepTarget(snap.docs[0].data(), snap.docs[0].id)]
      }
    } else {
      const snap = await db.collection(ordersCol).get()
      targets = snap.docs
        .map((doc) => ({ target: toSweepTarget(doc.data(), doc.id), createdAt: createdAtMs(doc.data()) }))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map((entry) => entry.target)
    }

    const outcome = await sweepVoucherObjects(bucket, ordersCol, targets, { dryRun })

    return res.status(200).json({
      success: true,
      dryRun,
      scannedOrders: targets.length,
      scannedObjects: outcome.scannedObjects,
      deletedCount: outcome.deleted.length,
      keptReferenced: outcome.keptReferenced,
      skippedRecent: outcome.skippedRecent,
      deletedSample: outcome.deleted.slice(0, 20),
      failures: outcome.failures
    })
  } catch (err: unknown) {
    console.error('[Admin API Voucher Housekeeping] Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error al limpiar comprobantes huérfanos'
    })
  }
}
