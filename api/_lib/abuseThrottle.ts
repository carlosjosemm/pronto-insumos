import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Firestore } from 'firebase-admin/firestore'
import { Timestamp } from 'firebase-admin/firestore'
import { createHash } from 'node:crypto'
import { getCollectionName } from './firestoreEnv.js'

/**
 * Abuse throttling for the public dual-factor endpoints (Task 8.8).
 *
 * `/api/track-order`, `/api/upload-voucher` and `/api/order-confirmation` are
 * unauthenticated and take an order id + RUT. Before Task 8.8 they answered `404`
 * for an unknown id but `401` for a wrong RUT — an enumeration oracle — and nothing
 * bounded repeated attempts.
 *
 * The counters are Firestore documents in `abuse_counters` (env-scoped, like every
 * other collection), one per `{scope, kind, key}`:
 *
 *   * `kind: 'ip'`    — keyed by the Vercel-computed client IP (SHA-256 hashed; the
 *                       raw address is never persisted).
 *   * `kind: 'order'` — keyed by the canonical order id.
 *
 * Two budgets per key, both inside one fixed 15-minute window:
 *
 *   * `maxAttempts` — requests allowed per window; the request that would exceed it
 *                     is refused with `429` and the key is locked.
 *   * `maxFailures` — failed lookups tolerated per window; the failure that reaches
 *                     it locks the key (subsequent requests are refused).
 *
 * A success never resets a counter — only the window does.
 *
 * FAIL-OPEN, LOUDLY: a Firestore failure inside a counter call logs and allows the
 * request. The throttle must never take order tracking down; the lookup itself still
 * requires a matching order id *and* RUT. The counters are also a best-effort
 * approximation — two concurrent failures can under-count by one.
 */

export const THROTTLE_COLLECTION = 'abuse_counters'

/** Fixed window for both budgets. */
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000
/** How long a key stays locked once a budget is exhausted. */
export const THROTTLE_LOCKOUT_MS = 15 * 60 * 1000
/** Retention marker for the Firestore TTL policy (human action item H1/H2). */
export const THROTTLE_DOC_TTL_MS = 24 * 60 * 60 * 1000

export const THROTTLE_MESSAGE =
  'Demasiados intentos. Por seguridad, espera unos minutos antes de volver a intentarlo.'

export type ThrottleScope = 'track-order' | 'upload-voucher' | 'order-confirmation'
export type ThrottleKeyKind = 'ip' | 'order'

export interface ThrottlePolicy {
  /** Requests allowed per key per window; the request that would exceed it is refused. */
  maxAttempts: number
  /** Failed lookups tolerated per key per window; the failure that reaches it locks the key. */
  maxFailures: number
}

/**
 * Per-endpoint budgets. The `order` failure budget is the tightest on
 * `order-confirmation` (an order is only ever confirmed once, so a handful of
 * retries is the entire legitimate surface) and the loosest on `track-order`
 * (a customer mistyping their RUT must not be locked out of their own order).
 */
export const THROTTLE_POLICIES: Record<ThrottleScope, Record<ThrottleKeyKind, ThrottlePolicy>> = {
  'track-order': {
    ip: { maxAttempts: 60, maxFailures: 12 },
    order: { maxAttempts: 60, maxFailures: 25 }
  },
  'upload-voucher': {
    ip: { maxAttempts: 40, maxFailures: 12 },
    order: { maxAttempts: 30, maxFailures: 25 }
  },
  'order-confirmation': {
    ip: { maxAttempts: 40, maxFailures: 12 },
    order: { maxAttempts: 20, maxFailures: 10 }
  }
}

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number }

const ALLOWED: ThrottleDecision = { allowed: true }

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function secondsUntil(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 1000))
}

/**
 * Client IP as computed by Vercel's proxy.
 *
 * Vercel **overwrites** `x-forwarded-for` and does not forward client-supplied
 * values ("this restriction is in place to prevent IP spoofing"), and `x-real-ip` /
 * `x-vercel-forwarded-for` are proxy-computed too. `x-real-ip` first, then the
 * Vercel-specific header, then the first `x-forwarded-for` hop — and `''` when no
 * header is present, which makes the caller skip the IP budget entirely rather than
 * bucket unrelated callers together.
 */
export function getClientIp(req: VercelRequest): string {
  const headers = (req?.headers || {}) as Record<string, string | string[] | undefined>
  const read = (name: string): string => {
    const raw = headers[name]
    const value = Array.isArray(raw) ? raw[0] : raw
    return typeof value === 'string' ? value.trim() : ''
  }

  const realIp = read('x-real-ip')
  if (realIp) return realIp

  const vercelForwarded = read('x-vercel-forwarded-for')
  if (vercelForwarded) return vercelForwarded

  const forwarded = read('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()

  return ''
}

/**
 * SHA-256 (hex, truncated) so no raw IP address is ever written to Firestore.
 *
 * Pseudonymization, not anonymization: the hash is deterministic over the IPv4 space
 * and therefore brute-forceable by anyone with Admin-SDK/console access to
 * `abuse_counters` (client reads are denied by the default-deny rules). Treat the keys
 * as pseudonymous identifiers — never as anonymous data.
 */
export function hashThrottleKey(raw: string): string {
  return createHash('sha256').update(String(raw)).digest('hex').slice(0, 32)
}

function throttleDocId(scope: ThrottleScope, kind: ThrottleKeyKind, rawKey: string): string {
  return `${scope}_${kind}_${hashThrottleKey(rawKey)}`
}

function throttleRef(db: Firestore, scope: ThrottleScope, kind: ThrottleKeyKind, rawKey: string) {
  return db.collection(getCollectionName(THROTTLE_COLLECTION)).doc(throttleDocId(scope, kind, rawKey))
}

/**
 * Consume one attempt from the key's budget. Called once per key, before the order
 * lookup, so a locked key never reaches Firestore for the order read.
 */
export async function consumeThrottleAttempt(
  db: Firestore,
  scope: ThrottleScope,
  kind: ThrottleKeyKind,
  rawKey: string,
  now: number = Date.now()
): Promise<ThrottleDecision> {
  // An absent key (e.g. no IP header at all) is never bucketed into a shared
  // `''` counter — that would let one caller lock out everybody.
  if (!rawKey) return ALLOWED

  const policy = THROTTLE_POLICIES[scope][kind]

  try {
    const ref = throttleRef(db, scope, kind, rawKey)

    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref)
      const data = (snapshot.exists ? snapshot.data() : {}) as Record<string, unknown>

      const lockedUntil = toNumber(data.lockedUntil)
      if (lockedUntil > now) {
        return { allowed: false, retryAfterSeconds: secondsUntil(lockedUntil, now) }
      }

      const windowStartedAt = toNumber(data.windowStartedAt)
      const expired = now - windowStartedAt >= THROTTLE_WINDOW_MS
      const attempts = (expired ? 0 : toNumber(data.attempts)) + 1
      const failures = expired ? 0 : toNumber(data.failures)
      const locked = attempts > policy.maxAttempts

      transaction.set(ref, {
        scope,
        kind,
        attempts,
        failures,
        windowStartedAt: expired ? now : windowStartedAt,
        lockedUntil: locked ? now + THROTTLE_LOCKOUT_MS : 0,
        updatedAt: now,
        expiresAt: Timestamp.fromMillis(now + THROTTLE_DOC_TTL_MS)
      })

      if (!locked) return ALLOWED

      console.warn(
        `[abuseThrottle] ${scope}/${kind} attempt budget exhausted (${policy.maxAttempts}) — locked for ${Math.round(
          THROTTLE_LOCKOUT_MS / 60000
        )} min.`
      )
      return { allowed: false, retryAfterSeconds: Math.ceil(THROTTLE_LOCKOUT_MS / 1000) }
    })
  } catch (err: unknown) {
    console.error(
      '[abuseThrottle] attempt counter unavailable — allowing the request:',
      err instanceof Error ? err.message : err
    )
    return ALLOWED
  }
}

/**
 * Record failed lookups (unknown order id *or* RUT mismatch — the caller cannot
 * distinguish them, and neither can this module) against every supplied key.
 * Best-effort: failures here never change the endpoint's response.
 */
export async function recordThrottleFailures(
  db: Firestore,
  scope: ThrottleScope,
  keys: Partial<Record<ThrottleKeyKind, string>>,
  now: number = Date.now()
): Promise<void> {
  const entries = Object.entries(keys).filter(
    (entry): entry is [ThrottleKeyKind, string] => typeof entry[1] === 'string' && entry[1].length > 0
  )
  if (entries.length === 0) return

  await Promise.all(entries.map(([kind, rawKey]) => recordFailure(db, scope, kind, rawKey, now)))
}

async function recordFailure(
  db: Firestore,
  scope: ThrottleScope,
  kind: ThrottleKeyKind,
  rawKey: string,
  now: number
): Promise<void> {
  const policy = THROTTLE_POLICIES[scope][kind]

  try {
    const ref = throttleRef(db, scope, kind, rawKey)

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref)
      const data = (snapshot.exists ? snapshot.data() : {}) as Record<string, unknown>

      const lockedUntil = toNumber(data.lockedUntil)
      // Already locked: the lock is what stops the next attempt, so nothing to count.
      if (lockedUntil > now) return

      const windowStartedAt = toNumber(data.windowStartedAt)
      const expired = now - windowStartedAt >= THROTTLE_WINDOW_MS
      // This request's attempt was already consumed (or the window rolled over between
      // the two calls) — never let the counter read as "no attempts".
      const attempts = expired ? 1 : Math.max(1, toNumber(data.attempts))
      const failures = (expired ? 0 : toNumber(data.failures)) + 1
      const locked = failures >= policy.maxFailures

      transaction.set(ref, {
        scope,
        kind,
        attempts,
        failures,
        windowStartedAt: expired ? now : windowStartedAt,
        lockedUntil: locked ? now + THROTTLE_LOCKOUT_MS : 0,
        updatedAt: now,
        expiresAt: Timestamp.fromMillis(now + THROTTLE_DOC_TTL_MS)
      })

      if (locked) {
        console.warn(
          `[abuseThrottle] ${scope}/${kind} failure budget exhausted (${policy.maxFailures}) — locked for ${Math.round(
            THROTTLE_LOCKOUT_MS / 60000
          )} min.`
        )
      }
    })
  } catch (err: unknown) {
    console.error(
      '[abuseThrottle] failure counter unavailable (the lookup response is unaffected):',
      err instanceof Error ? err.message : err
    )
  }
}

/** Uniform `429` for every endpoint: no order data, no hint about what was probed. */
export function respondThrottled(res: VercelResponse, retryAfterSeconds: number): VercelResponse {
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterSeconds))))
  return res.status(429).json({ error: THROTTLE_MESSAGE })
}
