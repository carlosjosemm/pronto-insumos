import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  claimEmailSend,
  markEmailFailed,
  markEmailSent,
  readDeliveryEntry,
  isClaimFresh,
  EMAIL_CLAIM_TTL_MS,
  EMAIL_RESEND_MAX_PER_KIND
} from '../../../api/_lib/emailDelivery'

/**
 * Applies a Firestore `update()` payload (dot paths + FieldValue sentinels) to
 * the in-memory order state, so compare-and-swap checks in the real
 * email-delivery code see a realistic document between transactions.
 */
function applyOrderUpdate(target: Record<string, unknown>, update: Record<string, unknown>) {
  for (const [path, value] of Object.entries(update)) {
    const keys = path.split('.')
    let node = target
    for (let i = 0; i < keys.length - 1; i += 1) {
      const next = node[keys[i]]
      node[keys[i]] = next && typeof next === 'object' ? next : {}
      node = node[keys[i]] as Record<string, unknown>
    }
    const last = keys[keys.length - 1]
    const sentinelName =
      value && typeof value === 'object'
        ? String((value as { constructor?: { name?: string } }).constructor?.name || '')
        : ''
    if (sentinelName === 'DeleteTransform') {
      delete node[last]
    } else if (sentinelName === 'NumericIncrementTransform') {
      node[last] = (Number(node[last]) || 0) + Number((value as { operand?: number }).operand || 0)
    } else {
      node[last] = value
    }
  }
}

const FRESH_CLAIM = new Date().toISOString()
const STALE_CLAIM = new Date(Date.now() - EMAIL_CLAIM_TTL_MS - 60_000).toISOString()

/** Mutable in-memory order doc + transaction double; returns the recorded updates. */
function mockDb(orderData: Record<string, unknown>) {
  const state: { current: Record<string, unknown> } = { current: structuredClone(orderData) }
  const orderRef = { id: 'order-ref' }
  const txUpdates: Array<Record<string, unknown>> = []
  const db = {
    runTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        get: vi.fn(async () => ({ exists: true, data: () => state.current })),
        update: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
          txUpdates.push(data)
          applyOrderUpdate(state.current, data)
        })
      })
    )
  }
  return { db, state, orderRef, txUpdates }
}

const entry = (state: { current: Record<string, unknown> }) =>
  (state.current.emailDelivery as Record<string, Record<string, unknown>>).confirmation

describe('Email delivery primitives (api/_lib/emailDelivery)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('claimEmailSend', () => {
    it('claims a sendable order inside the transaction and stamps claimedAt', async () => {
      const { db, state, orderRef } = mockDb({ orderId: 'PRONTO-1' })

      const claim = await claimEmailSend(db as never, orderRef as never, 'confirmation')

      expect(claim.outcome).toBe('claimed')
      expect(claim.claimIso).toEqual(expect.any(String))
      expect(entry(state).claimedAt).toBe(claim.claimIso)
    })

    it('answers already-sent when a sent marker exists (and honors the legacy flag)', async () => {
      const { db, orderRef, txUpdates } = mockDb({ confirmationEmailSentAt: '2026-09-21T10:00:00Z' })

      const claim = await claimEmailSend(db as never, orderRef as never, 'confirmation')

      expect(claim.outcome).toBe('already-sent')
      expect(txUpdates).toHaveLength(0)
    })

    it('answers in-flight while a fresh claim is outstanding', async () => {
      const { db, orderRef, txUpdates } = mockDb({
        emailDelivery: { confirmation: { claimedAt: FRESH_CLAIM } }
      })

      const claim = await claimEmailSend(db as never, orderRef as never, 'confirmation')

      expect(claim.outcome).toBe('in-flight')
      expect(txUpdates).toHaveLength(0)
    })

    it('reclaims a stale claim — a crashed send must not lock the order forever', async () => {
      const { db, state, orderRef } = mockDb({
        emailDelivery: { confirmation: { claimedAt: STALE_CLAIM } }
      })

      const claim = await claimEmailSend(db as never, orderRef as never, 'confirmation')

      expect(claim.outcome).toBe('claimed')
      expect(entry(state).claimedAt).toBe(claim.claimIso)
    })

    it('answers capped once the resend budget is exhausted', async () => {
      const { db, orderRef, txUpdates } = mockDb({
        emailDelivery: { confirmation: { resendCount: EMAIL_RESEND_MAX_PER_KIND } }
      })

      const claim = await claimEmailSend(db as never, orderRef as never, 'confirmation', {
        skipIfSent: false,
        forResend: true
      })

      expect(claim.outcome).toBe('capped')
      expect(txUpdates).toHaveLength(0)
    })
  })

  describe('markEmailSent (commit CAS)', () => {
    it('commits while our claim is outstanding and clears claim + failure fields', async () => {
      const claimIso = new Date().toISOString()
      const { db, state, orderRef } = mockDb({
        emailDelivery: {
          confirmation: { claimedAt: claimIso, failedAt: '2026-09-29T10:00:00Z', failureReason: 'http_500' }
        }
      })

      await markEmailSent(db as never, orderRef as never, 'confirmation', claimIso)

      expect(entry(state).sentAt).toEqual(expect.any(String))
      expect(entry(state).claimedAt).toBeUndefined()
      expect(entry(state).failedAt).toBeUndefined()
      expect(entry(state).failureReason).toBeUndefined()
      expect(state.current.confirmationEmailSentAt).toEqual(expect.any(String))
    })

    it('does not write when a FRESH foreign claim superseded the send', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { db, state, orderRef, txUpdates } = mockDb({
        emailDelivery: { confirmation: { claimedAt: FRESH_CLAIM } }
      })

      await markEmailSent(db as never, orderRef as never, 'confirmation', 'our-claim-iso')

      // The other sender owns the outcome — our stamp must not clobber its claim.
      expect(txUpdates).toHaveLength(0)
      expect(entry(state).claimedAt).toBe(FRESH_CLAIM)
      expect(entry(state).sentAt).toBeUndefined()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('superseded'))
    })

    it('still commits over a STALE foreign claim — a dead reservation cannot veto a real send', async () => {
      const { db, state, orderRef } = mockDb({
        emailDelivery: { confirmation: { claimedAt: STALE_CLAIM } }
      })

      await markEmailSent(db as never, orderRef as never, 'confirmation', 'our-claim-iso')

      expect(entry(state).sentAt).toEqual(expect.any(String))
      expect(entry(state).claimedAt).toBeUndefined()
    })

    it('commits an unclaimed send and consumes a resend slot when flagged', async () => {
      const { db, state, orderRef } = mockDb({ orderId: 'PRONTO-1' })

      await markEmailSent(db as never, orderRef as never, 'payment', undefined, { resend: true })

      const payment = (state.current.emailDelivery as Record<string, Record<string, unknown>>).payment
      expect(payment.sentAt).toEqual(expect.any(String))
      expect(payment.resendCount).toBe(1)
      // The legacy confirmation flag is only written for the confirmation kind.
      expect(state.current.confirmationEmailSentAt).toBeUndefined()
    })
  })

  describe('markEmailFailed (release CAS)', () => {
    it('records the failure and releases our claim so the send stays retryable', async () => {
      const claimIso = new Date().toISOString()
      const { db, state, orderRef } = mockDb({
        emailDelivery: { confirmation: { claimedAt: claimIso } }
      })

      await markEmailFailed(db as never, orderRef as never, 'confirmation', 'http_500', claimIso)

      expect(entry(state).failedAt).toEqual(expect.any(String))
      expect(entry(state).failureReason).toBe('http_500')
      expect(entry(state).claimedAt).toBeUndefined()
    })

    it('writes nothing while a FRESH foreign claim owns the next attempt', async () => {
      const { db, state, orderRef, txUpdates } = mockDb({
        emailDelivery: { confirmation: { claimedAt: FRESH_CLAIM } }
      })

      await markEmailFailed(db as never, orderRef as never, 'confirmation', 'http_500', 'our-claim-iso')

      expect(txUpdates).toHaveLength(0)
      expect(entry(state).claimedAt).toBe(FRESH_CLAIM)
      expect(entry(state).failedAt).toBeUndefined()
    })

    it('records the failure even over a STALE foreign claim', async () => {
      const { db, state, orderRef } = mockDb({
        emailDelivery: { confirmation: { claimedAt: STALE_CLAIM } }
      })

      await markEmailFailed(db as never, orderRef as never, 'confirmation', 'network_error', 'our-claim-iso')

      expect(entry(state).failedAt).toEqual(expect.any(String))
      expect(entry(state).failureReason).toBe('network_error')
    })

    it('does not flag a failure once a send already committed (unclaimed path)', async () => {
      const { db, state, orderRef, txUpdates } = mockDb({
        emailDelivery: { confirmation: { sentAt: '2026-09-29T10:00:00Z' } }
      })

      await markEmailFailed(db as never, orderRef as never, 'confirmation', 'http_500')

      // The notice went out — flagging a failure now would be a false alarm.
      expect(txUpdates).toHaveLength(0)
      expect(entry(state).failedAt).toBeUndefined()
    })

    it('truncates the failure reason so oversized provider text cannot bloat the doc', async () => {
      const { db, state, orderRef } = mockDb({ orderId: 'PRONTO-1' })

      await markEmailFailed(db as never, orderRef as never, 'payment', 'x'.repeat(500))

      const payment = (state.current.emailDelivery as Record<string, Record<string, unknown>>).payment
      expect(String(payment.failureReason)).toHaveLength(120)
    })
  })

  describe('readDeliveryEntry + isClaimFresh', () => {
    it('merges the legacy confirmationEmailSentAt flag for the confirmation kind only', () => {
      const order = { confirmationEmailSentAt: '2026-09-21T10:00:00Z' }

      expect(readDeliveryEntry(order, 'confirmation').sentAt).toBe('2026-09-21T10:00:00Z')
      expect(readDeliveryEntry(order, 'payment').sentAt).toBeUndefined()
    })

    it('counts a claim younger than the TTL as fresh and an older one as stale', () => {
      expect(isClaimFresh({ claimedAt: new Date().toISOString() })).toBe(true)
      expect(isClaimFresh({ claimedAt: STALE_CLAIM })).toBe(false)
      expect(isClaimFresh({})).toBe(false)
      expect(isClaimFresh({ claimedAt: 'not-a-date' })).toBe(false)
    })
  })
})
