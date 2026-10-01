import { describe, it, expect, vi, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Firestore } from 'firebase-admin/firestore'
import { Timestamp } from 'firebase-admin/firestore'

import {
  THROTTLE_COLLECTION,
  THROTTLE_DOC_TTL_MS,
  THROTTLE_LOCKOUT_MS,
  THROTTLE_MESSAGE,
  THROTTLE_POLICIES,
  THROTTLE_WINDOW_MS,
  consumeThrottleAttempt,
  getClientIp,
  hashThrottleKey,
  recordThrottleFailures,
  respondThrottled
} from '../../../api/_lib/abuseThrottle'
import { counterDocPath, createThrottleCounters } from './helpers/throttleCounters'

/** Minimal Firestore double backed by the shared counter store. */
function createDb() {
  const counters = createThrottleCounters()
  const db = {
    collection: vi.fn((name: string) => counters.collection(name)),
    runTransaction: counters.runTransaction
  } as unknown as Firestore
  return { db, counters }
}

function requestWithHeaders(headers: Record<string, string | string[]>): VercelRequest {
  return { method: 'POST', headers } as unknown as VercelRequest
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getClientIp (Task 8.8)', () => {
  it('prefers the Vercel-computed x-real-ip over a client-supplied x-forwarded-for', () => {
    const req = requestWithHeaders({ 'x-real-ip': '200.83.10.4', 'x-forwarded-for': '10.0.0.99' })

    expect(getClientIp(req)).toBe('200.83.10.4')
  })

  it('falls back to x-vercel-forwarded-for', () => {
    const req = requestWithHeaders({ 'x-vercel-forwarded-for': '190.44.7.1' })

    expect(getClientIp(req)).toBe('190.44.7.1')
  })

  it('falls back to the first x-forwarded-for hop and trims it', () => {
    const req = requestWithHeaders({ 'x-forwarded-for': ' 200.1.2.3 , 10.0.0.1' })

    expect(getClientIp(req)).toBe('200.1.2.3')
  })

  it('returns an empty string when no IP header is present (the IP budget is then skipped)', () => {
    expect(getClientIp({ method: 'POST' } as VercelRequest)).toBe('')
    expect(getClientIp({ method: 'POST', headers: {} } as VercelRequest)).toBe('')
  })
})

describe('hashThrottleKey (Task 8.8)', () => {
  it('is deterministic, 32 hex characters, and never contains the raw value', () => {
    const ip = '200.83.10.4'
    const hash = hashThrottleKey(ip)

    expect(hash).toBe(hashThrottleKey(ip))
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
    expect(hash).not.toContain(ip)
    expect(hash).not.toContain('200')
  })
})

describe('consumeThrottleAttempt (Task 8.8)', () => {
  const scope = 'track-order' as const
  const maxAttempts = THROTTLE_POLICIES[scope].ip.maxAttempts

  it('allows exactly maxAttempts requests in a window and refuses the next one', async () => {
    const { db, counters } = createDb()
    const now = 1_700_000_000_000

    for (let i = 0; i < maxAttempts; i += 1) {
      await expect(consumeThrottleAttempt(db, scope, 'ip', '200.83.10.4', now)).resolves.toEqual({ allowed: true })
    }

    const refused = await consumeThrottleAttempt(db, scope, 'ip', '200.83.10.4', now)

    expect(refused).toEqual({ allowed: false, retryAfterSeconds: Math.ceil(THROTTLE_LOCKOUT_MS / 1000) })
    const counter = counters.read(scope, 'ip', '200.83.10.4')
    expect(counter?.attempts).toBe(maxAttempts + 1)
    expect(counter?.lockedUntil).toBe(now + THROTTLE_LOCKOUT_MS)
  })

  it('refuses a locked key without writing to the counter document', async () => {
    const { db, counters } = createDb()
    const now = 1_700_000_000_000
    const lockedUntil = now + 90_000
    counters.seedLocked(scope, 'order', 'PRONTO-7K3M9Q2Z', lockedUntil)
    const before = counters.read(scope, 'order', 'PRONTO-7K3M9Q2Z')

    const decision = await consumeThrottleAttempt(db, scope, 'order', 'PRONTO-7K3M9Q2Z', now)

    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 90 })
    expect(counters.transaction.set).not.toHaveBeenCalled()
    expect(counters.read(scope, 'order', 'PRONTO-7K3M9Q2Z')).toBe(before)
  })

  it('resets both counters once the window has expired', async () => {
    const { db, counters } = createDb()
    const start = 1_700_000_000_000

    await consumeThrottleAttempt(db, scope, 'ip', '200.83.10.4', start)
    await recordThrottleFailures(db, scope, { ip: '200.83.10.4' }, start)
    expect(counters.read(scope, 'ip', '200.83.10.4')).toMatchObject({ attempts: 1, failures: 1 })

    await consumeThrottleAttempt(db, scope, 'ip', '200.83.10.4', start + THROTTLE_WINDOW_MS + 1)

    expect(counters.read(scope, 'ip', '200.83.10.4')).toMatchObject({
      attempts: 1,
      failures: 0,
      windowStartedAt: start + THROTTLE_WINDOW_MS + 1,
      lockedUntil: 0
    })
  })

  it('keeps the IP and order budgets in independent documents', async () => {
    const { db, counters } = createDb()
    const now = 1_700_000_000_000

    await consumeThrottleAttempt(db, scope, 'ip', '200.83.10.4', now)
    await consumeThrottleAttempt(db, scope, 'order', 'PRONTO-7K3M9Q2Z', now)

    expect(counters.read(scope, 'ip', '200.83.10.4')?.attempts).toBe(1)
    expect(counters.read(scope, 'order', 'PRONTO-7K3M9Q2Z')?.attempts).toBe(1)
    expect(counters.docs.size).toBe(2)
  })

  it('stamps a Timestamp expiresAt for the Firestore TTL policy', async () => {
    const { db, counters } = createDb()
    const now = 1_700_000_000_000

    await consumeThrottleAttempt(db, scope, 'ip', '200.83.10.4', now)

    const counter = counters.read(scope, 'ip', '200.83.10.4')
    expect(counter?.expiresAt).toBeInstanceOf(Timestamp)
    expect((counter?.expiresAt as Timestamp).toMillis()).toBe(now + THROTTLE_DOC_TTL_MS)
  })

  it('writes into the environment-scoped collection', async () => {
    const { db, counters } = createDb()

    await consumeThrottleAttempt(db, scope, 'ip', '200.83.10.4', 1_700_000_000_000)

    const docId = `${scope}_ip_${hashThrottleKey('200.83.10.4')}`
    expect(counters.docs.has(`${THROTTLE_COLLECTION}/${docId}`)).toBe(true)
    expect(counterDocPath(scope, 'ip', '200.83.10.4')).toBe(`${THROTTLE_COLLECTION}/${docId}`)
  })

  it('never buckets an absent key (no shared empty-string counter)', async () => {
    const { db, counters } = createDb()

    await expect(consumeThrottleAttempt(db, scope, 'ip', '', 1_700_000_000_000)).resolves.toEqual({ allowed: true })

    expect(counters.runTransaction).not.toHaveBeenCalled()
    expect(counters.docs.size).toBe(0)
  })

  it('fails open with a loud log when the counter transaction throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => ({ path: `${THROTTLE_COLLECTION}/x`, id: 'x' })) })),
      runTransaction: vi.fn().mockRejectedValue(new Error('firestore unavailable'))
    } as unknown as Firestore

    await expect(consumeThrottleAttempt(db, scope, 'ip', '200.83.10.4')).resolves.toEqual({ allowed: true })
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[abuseThrottle]'),
      expect.stringContaining('firestore unavailable')
    )
  })

  it('fails open even when the counter reference itself cannot be built', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = { collection: vi.fn() } as unknown as Firestore

    await expect(consumeThrottleAttempt(db, scope, 'ip', '200.83.10.4')).resolves.toEqual({ allowed: true })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[abuseThrottle]'), expect.any(String))
  })
})

describe('per-kind window override (the 24-hour recipient budget)', () => {
  it('honors the policy window and lockout instead of the shared 15-minute ones', async () => {
    const { db, counters } = createDb()
    const scope = 'order-confirmation' as const
    const policy = THROTTLE_POLICIES[scope].recipient!
    const now = 1_700_000_000_000

    for (let i = 0; i < policy.maxAttempts; i += 1) {
      await expect(consumeThrottleAttempt(db, scope, 'recipient', 'a@clinica.cl', now)).resolves.toEqual({
        allowed: true
      })
    }

    await expect(consumeThrottleAttempt(db, scope, 'recipient', 'a@clinica.cl', now)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: Math.ceil(policy.lockoutMs! / 1000)
    })
    expect(counters.read(scope, 'recipient', 'a@clinica.cl')?.lockedUntil).toBe(now + policy.lockoutMs!)

    // The window is the policy's 24 h, not the shared 15 minutes: an UN-locked key
    // keeps its window and its attempt count past what would otherwise be a reset.
    // (With the 15-minute default this would read attempts: 1 at the new window.)
    await consumeThrottleAttempt(db, scope, 'recipient', 'b@clinica.cl', now)
    const later = now + THROTTLE_WINDOW_MS + 1
    await consumeThrottleAttempt(db, scope, 'recipient', 'b@clinica.cl', later)
    expect(counters.read(scope, 'recipient', 'b@clinica.cl')).toMatchObject({
      attempts: 2,
      windowStartedAt: now
    })
  })

  it('keeps the counter document alive past its own window + lock so a TTL sweep cannot reset it', async () => {
    const { db, counters } = createDb()
    const scope = 'order-confirmation' as const
    const policy = THROTTLE_POLICIES[scope].recipient!
    const now = 1_700_000_000_000

    await consumeThrottleAttempt(db, scope, 'recipient', 'a@clinica.cl', now)

    const counter = counters.read(scope, 'recipient', 'a@clinica.cl')
    expect((counter?.expiresAt as Timestamp).toMillis()).toBe(now + policy.windowMs! + policy.lockoutMs!)
    expect((counter?.expiresAt as Timestamp).toMillis()).toBeGreaterThan(now + THROTTLE_DOC_TTL_MS)
  })

  it('never throttles a key kind that has no policy for the scope', async () => {
    const { db, counters } = createDb()

    // `track-order` has no recipient budget — an address is not a lookup key there.
    await expect(consumeThrottleAttempt(db, 'track-order', 'recipient', 'a@clinica.cl')).resolves.toEqual({
      allowed: true
    })
    expect(counters.runTransaction).not.toHaveBeenCalled()
  })
})

describe('recordThrottleFailures (Task 8.8)', () => {
  it('locks the key once the failure budget is reached', async () => {
    const { db, counters } = createDb()
    const scope = 'order-confirmation' as const
    const maxFailures = THROTTLE_POLICIES[scope].order.maxFailures!
    const now = 1_700_000_000_000

    for (let i = 0; i < maxFailures - 1; i += 1) {
      await recordThrottleFailures(db, scope, { order: 'PRONTO-7K3M9Q2Z' }, now)
    }
    expect(counters.read(scope, 'order', 'PRONTO-7K3M9Q2Z')).toMatchObject({ lockedUntil: 0 })

    await recordThrottleFailures(db, scope, { order: 'PRONTO-7K3M9Q2Z' }, now)

    expect(counters.read(scope, 'order', 'PRONTO-7K3M9Q2Z')).toMatchObject({
      failures: maxFailures,
      lockedUntil: now + THROTTLE_LOCKOUT_MS
    })
    await expect(consumeThrottleAttempt(db, scope, 'order', 'PRONTO-7K3M9Q2Z', now)).resolves.toMatchObject({
      allowed: false
    })
  })

  it('records the failure against both supplied keys, skipping empty ones', async () => {
    const { db, counters } = createDb()
    const scope = 'track-order' as const

    await recordThrottleFailures(db, scope, { ip: '200.83.10.4', order: 'PRONTO-7K3M9Q2Z' })
    expect(counters.read(scope, 'ip', '200.83.10.4')).toMatchObject({ failures: 1 })
    expect(counters.read(scope, 'order', 'PRONTO-7K3M9Q2Z')).toMatchObject({ failures: 1 })

    await recordThrottleFailures(db, scope, { ip: '', order: undefined })
    expect(counters.docs.size).toBe(2)
  })

  it('never counts a failure while the key is already locked', async () => {
    const { db, counters } = createDb()
    const now = 1_700_000_000_000
    counters.seedLocked('track-order', 'ip', '200.83.10.4', now + 60_000)

    await recordThrottleFailures(db, 'track-order', { ip: '200.83.10.4' }, now)

    expect(counters.transaction.set).not.toHaveBeenCalled()
  })

  it('swallows counter failures (the lookup response is unaffected)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => ({ path: `${THROTTLE_COLLECTION}/x`, id: 'x' })) })),
      runTransaction: vi.fn().mockRejectedValue(new Error('write denied'))
    } as unknown as Firestore

    await expect(recordThrottleFailures(db, 'track-order', { ip: '200.83.10.4' })).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[abuseThrottle]'),
      expect.stringContaining('write denied')
    )
  })
})

describe('respondThrottled (Task 8.8)', () => {
  it('answers 429 with the uniform message and a Retry-After header', () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    } as unknown as VercelResponse & { status: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn> }

    respondThrottled(res, 900)

    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '900')
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith({ error: THROTTLE_MESSAGE })
  })

  it('never advertises a zero-second retry', () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    } as unknown as VercelResponse & { status: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn> }

    respondThrottled(res, 0)

    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '1')
  })
})
