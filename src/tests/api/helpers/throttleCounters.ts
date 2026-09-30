import { vi } from 'vitest'
import { THROTTLE_COLLECTION, hashThrottleKey } from '../../../../api/_lib/abuseThrottle'
import { getCollectionName } from '../../../../api/_lib/firestoreEnv'

/**
 * In-memory Firestore double for the abuse-throttle counters.
 *
 * The endpoint suites already build their own Admin SDK doubles for the order
 * documents; this helper adds the `abuse_counters` half so the **real** throttling
 * code runs (and its counters can be asserted/seeded) instead of silently
 * fail-opening on a mock that has no `runTransaction`.
 *
 * Wire it in with:
 *
 * ```ts
 * const counters = createThrottleCounters()
 * const db = {
 *   collection: vi.fn((name: string) =>
 *     String(name).includes('abuse_counters') ? counters.collection(name) : orderCollectionApi
 *   ),
 *   runTransaction: counters.runTransaction
 * }
 * ```
 *
 * A suite that also runs its own transaction (upload-voucher) passes a `fallback`
 * so non-counter refs keep reaching the order-document behaviour.
 */
export interface ThrottleCounterFallback {
  get?: (ref: unknown) => Promise<unknown>
  set?: (ref: unknown, data: Record<string, unknown>) => void
  update?: (ref: unknown, data: Record<string, unknown>) => void
}

export function counterDocPath(scope: string, kind: string, rawKey: string): string {
  return `${getCollectionName(THROTTLE_COLLECTION)}/${scope}_${kind}_${hashThrottleKey(rawKey)}`
}

export function createThrottleCounters(fallback: ThrottleCounterFallback = {}) {
  const docs = new Map<string, Record<string, unknown>>()

  const counterPrefix = `${getCollectionName(THROTTLE_COLLECTION)}/`
  const isCounterPath = (path: unknown): path is string => typeof path === 'string' && path.startsWith(counterPrefix)

  const collection = (name: string) => ({
    doc: (id: string) => ({ path: `${name}/${id}`, id }),
    // The throttle never queries, but the stub keeps this double's shape identical to
    // the order-collection double so a suite can hold both in one `collection` mock.
    where: vi.fn()
  })

  const transaction = {
    get: vi.fn(async (ref: { path?: string }) => {
      if (isCounterPath(ref?.path)) {
        const data = docs.get(ref.path)
        return { exists: data !== undefined, data: () => data }
      }
      if (fallback.get) return fallback.get(ref)
      throw new Error(`[throttleCounters] unexpected transaction ref: ${String(ref?.path)}`)
    }),
    set: vi.fn((ref: { path?: string }, data: Record<string, unknown>) => {
      if (isCounterPath(ref?.path)) {
        docs.set(ref.path, data)
        return
      }
      if (fallback.set) {
        fallback.set(ref, data)
        return
      }
      throw new Error(`[throttleCounters] unexpected transaction ref: ${String(ref?.path)}`)
    }),
    update: vi.fn((ref: unknown, data: Record<string, unknown>) => {
      fallback.update?.(ref, data)
    })
  }

  const runTransaction = vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction))

  return {
    docs,
    collection,
    transaction,
    runTransaction,
    isCounterPath,
    /** Seed a locked counter document (the `429` path). */
    seedLocked(scope: string, kind: string, rawKey: string, lockedUntil: number = Date.now() + 60_000) {
      const now = Date.now()
      docs.set(counterDocPath(scope, kind, rawKey), {
        scope,
        kind,
        attempts: 1,
        failures: 99,
        windowStartedAt: now,
        lockedUntil,
        updatedAt: now
      })
    },
    read(scope: string, kind: string, rawKey: string): Record<string, unknown> | undefined {
      return docs.get(counterDocPath(scope, kind, rawKey))
    }
  }
}
