import { FieldValue } from 'firebase-admin/firestore'
import type { Firestore, DocumentReference } from 'firebase-admin/firestore'
import { EMAIL_CLAIM_TTL_MS } from '../../src/utils/orderLifecycle.js'
import type { EmailDeliveryEntry } from '../../src/types'

export { EMAIL_CLAIM_TTL_MS }
export type { EmailDeliveryEntry }

/**
 * Transactional-mail delivery telemetry for customer-facing notices.
 *
 * Customer emails are sent AFTER the financial state commits (webhook, admin
 * approvals), so a Resend outage can never roll back a paid order — the
 * failure is recorded here instead, and the backoffice resend action recovers
 * it. Each kind carries:
 *
 * - `sentAt` — durable sent marker (the confirmation kind also honors the
 *   legacy `confirmationEmailSentAt` field so pre-existing documents read
 *   correctly).
 * - `claimedAt` — in-flight reservation, written inside a transaction so two
 *   concurrent sends serialize on the order document. A claim abandoned by a
 *   crashed function expires after `EMAIL_CLAIM_TTL_MS` and is reclaimable.
 * - `failedAt` / `failureReason` — last send failure; cleared on the next
 *   successful send.
 * - `resendCount` — manual-resend budget (`EMAIL_RESEND_MAX_PER_KIND`), so an
 *   operator resend loop cannot drain the Resend quota.
 *
 * All commit/failure writers are best-effort and never throw: an email
 * telemetry write must never break a webhook ack or an admin response.
 *
 * Runtime: Node.js (Vercel Serverless) — Admin SDK only, never the web SDK.
 */

export type OrderEmailKind = 'confirmation' | 'payment'

export const EMAIL_RESEND_MAX_PER_KIND = 5

export type EmailClaimOutcome = 'claimed' | 'already-sent' | 'in-flight' | 'capped'

export interface EmailClaim {
  outcome: EmailClaimOutcome
  /** The claim token written to the document — required to commit or release it. */
  claimIso?: string
  /** Fresh document data read inside the claim transaction. */
  orderData: Record<string, unknown>
}

/**
 * Reads one kind's telemetry from raw order data. For `confirmation`, the
 * legacy top-level `confirmationEmailSentAt` marker is merged in so orders
 * stamped before this map existed still read as sent.
 */
export function readDeliveryEntry(
  orderData: Record<string, unknown> | undefined,
  kind: OrderEmailKind
): EmailDeliveryEntry {
  const raw = (orderData?.emailDelivery as Record<string, unknown> | undefined)?.[kind]
  const entry: EmailDeliveryEntry = raw && typeof raw === 'object' ? { ...raw } : {}
  if (kind === 'confirmation' && !entry.sentAt) {
    const legacy = orderData?.confirmationEmailSentAt
    if (typeof legacy === 'string' && legacy) {
      entry.sentAt = legacy
    }
  }
  return entry
}

/**
 * A claim younger than the TTL belongs to a send still in progress — a second
 * caller must not send again. Older claims are abandoned (the function died
 * between claim and outcome) and reclaimable.
 */
export function isClaimFresh(entry: EmailDeliveryEntry, now: number = Date.now()): boolean {
  const claimedAt = typeof entry?.claimedAt === 'string' ? Date.parse(entry.claimedAt) : NaN
  return Number.isFinite(claimedAt) && now - claimedAt < EMAIL_CLAIM_TTL_MS
}

/**
 * Claims the right to send one email of `kind` for an order, inside a
 * transaction so concurrent callers serialize on the order document.
 *
 * - `skipIfSent` (default true): an already-recorded `sentAt` answers
 *   `already-sent`. Resends pass `skipIfSent: false, forResend: true`.
 * - `forResend`: enforces the per-kind resend budget (`capped`).
 * - A fresh outstanding claim answers `in-flight`; a stale one is reclaimed.
 */
export async function claimEmailSend(
  db: Firestore,
  orderRef: DocumentReference,
  kind: OrderEmailKind,
  options: { skipIfSent?: boolean; forResend?: boolean } = {}
): Promise<EmailClaim> {
  const skipIfSent = options.skipIfSent !== false
  let claimIso: string | undefined
  let orderData: Record<string, unknown> = {}

  const outcome = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(orderRef)
    orderData = (snap.data() || {}) as Record<string, unknown>
    const entry = readDeliveryEntry(orderData, kind)

    if (skipIfSent && entry.sentAt) return 'already-sent' as const
    if (isClaimFresh(entry)) return 'in-flight' as const
    if (
      options.forResend &&
      (Number(entry.resendCount) || 0) >= EMAIL_RESEND_MAX_PER_KIND
    ) {
      return 'capped' as const
    }

    claimIso = new Date().toISOString()
    transaction.update(orderRef, {
      [`emailDelivery.${kind}.claimedAt`]: claimIso,
      updatedAt: claimIso
    })
    return 'claimed' as const
  })

  return { outcome: outcome as EmailClaimOutcome, claimIso, orderData }
}

/**
 * Commits a successful send: stamps `sentAt`, clears the claim and any failure
 * fields (and `confirmationEmailSentAt` for the confirmation kind), and — for
 * a manual resend — consumes one resend slot. Compare-and-swap: the commit
 * lands only while the document carries OUR claim or no FRESH claim at all —
 * a racing claimant's commit is never clobbered, while a stale claim left by
 * a crashed send cannot veto a send that really happened.
 */
export async function markEmailSent(
  db: Firestore,
  orderRef: DocumentReference,
  kind: OrderEmailKind,
  claimIso: string | undefined,
  options: { resend?: boolean } = {}
): Promise<void> {
  const nowIso = new Date().toISOString()
  const sentUpdate: Record<string, unknown> = {
    [`emailDelivery.${kind}.sentAt`]: nowIso,
    [`emailDelivery.${kind}.claimedAt`]: FieldValue.delete(),
    [`emailDelivery.${kind}.failedAt`]: FieldValue.delete(),
    [`emailDelivery.${kind}.failureReason`]: FieldValue.delete(),
    updatedAt: nowIso
  }
  if (options.resend) {
    sentUpdate[`emailDelivery.${kind}.resendCount`] = FieldValue.increment(1)
  }
  if (kind === 'confirmation') {
    // The pre-existing idempotency marker is kept written: deployed consumers
    // and documents already rely on it.
    sentUpdate.confirmationEmailSentAt = nowIso
  }

  try {
    let superseded = false
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(orderRef)
      const entry = readDeliveryEntry((snap.data() || {}) as Record<string, unknown>, kind)
      // A FRESH claim held by someone else wins — its owner will stamp its own
      // outcome. A stale claim is a crashed send, not an active one, so it
      // must not veto a send that really happened.
      const freshForeignClaim =
        entry.claimedAt !== undefined && entry.claimedAt !== claimIso && isClaimFresh(entry)
      if (freshForeignClaim) {
        superseded = true
        return
      }
      transaction.update(orderRef, sentUpdate)
    })
    if (superseded) {
      console.warn(`[EmailDelivery] ${kind} sent-stamp for an order was superseded by a newer claim — telemetry left to the owner.`)
    }
  } catch (err: unknown) {
    console.warn(`[EmailDelivery] Email sent but failed to stamp ${kind} telemetry: ${(err as Error)?.message || err}`)
  }
}

/**
 * Records a send failure (and releases our claim when one was taken) so the
 * failure is visible in the backoffice and the send stays retryable.
 * Compare-and-swap: a FRESH claim owned by someone else wins silently (a stale
 * one is a crashed send and does not shield the document); a `sentAt` with no
 * claim of ours outstanding means the notice went out after all and no failure
 * is recorded.
 */
export async function markEmailFailed(
  db: Firestore,
  orderRef: DocumentReference,
  kind: OrderEmailKind,
  reason: string,
  claimIso?: string
): Promise<void> {
  const nowIso = new Date().toISOString()
  const failureUpdate: Record<string, unknown> = {
    [`emailDelivery.${kind}.failedAt`]: nowIso,
    [`emailDelivery.${kind}.failureReason`]: String(reason || 'unknown').slice(0, 120),
    updatedAt: nowIso
  }

  try {
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(orderRef)
      const entry = readDeliveryEntry((snap.data() || {}) as Record<string, unknown>, kind)

      const ourClaimOutstanding = claimIso !== undefined && entry.claimedAt === claimIso
      const freshForeignClaim =
        entry.claimedAt !== undefined && entry.claimedAt !== claimIso && isClaimFresh(entry)
      // Another sender owns the next attempt — the failure belongs to it. A
      // stale claim is a crashed send, so it does not shield the document.
      if (freshForeignClaim) return
      // Unclaimed or superseded send landing after a committed success: the
      // notice went out, so flagging a failure now would be a false alarm.
      if (!ourClaimOutstanding && entry.sentAt) return

      transaction.update(orderRef, {
        ...failureUpdate,
        ...(ourClaimOutstanding ? { [`emailDelivery.${kind}.claimedAt`]: FieldValue.delete() } : {})
      })
    })
  } catch (err: unknown) {
    console.warn(`[EmailDelivery] Failed to record ${kind} email failure: ${(err as Error)?.message || err}`)
  }
}
