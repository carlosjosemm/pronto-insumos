import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'
import { hasRealMercadoPagoToken } from '../simulationPolicy.js'

/**
 * Closes abandoned online-payment orders — the ghosts left behind when a shopper
 * opens Checkout Pro and never returns.
 *
 * Every checkout attempt writes a fresh `PENDIENTE_PAGO_MERCADOPAGO` order and
 * nothing ever closes the ones nobody retries, so the pending queue grows
 * without bound. Closing one blind is dangerous, though: a payment can settle
 * while its webhook delivery is lost, leaving the money in the Mercado Pago
 * ledger and the order still reading pending. The sweep therefore checks the
 * gateway ledger for every candidate BEFORE writing anything:
 *
 *   - a settled payment is never cancelled — the order is parked in
 *     `PAGO_EN_REVISION` for a human, exactly as the webhook parks a payment it
 *     cannot join to a payable order;
 *   - a candidate whose ledger cannot be read is left untouched (fail closed),
 *     because "I could not verify" must never mean "no money arrived";
 *   - a payment that settles AFTER the sweep is caught by the webhook's own
 *     status guard, which parks the cancelled order in `PAGO_EN_REVISION`
 *     without stock movement — it never reopens the order as paid.
 *
 * The write happens inside a transaction that re-reads the document and
 * re-asserts the pending status, so a webhook approval landing between the scan
 * and the write wins and the sweep skips the order.
 *
 * It runs on the shared `/api/admin/[action]` dispatcher, so it consumes no
 * serverless-function slot.
 */

/** Orders idle for less than this are never considered — the window must outlast a late webhook. */
export const STALE_PENDING_DEFAULT_HOURS = 48
export const STALE_PENDING_MIN_HOURS = 1
/** Hard ceiling so a caller cannot ask the sweep to look years back in one run. */
export const STALE_PENDING_MAX_HOURS = 720

/** Pending orders scanned per run when the caller does not say otherwise. */
export const STALE_SWEEP_DEFAULT_LIMIT = 25
/** Hard ceiling on the scan — each candidate costs one gateway request. */
export const STALE_SWEEP_MAX_LIMIT = 500
/** Cap on reported failures so a pathological run cannot bloat the response. */
export const STALE_SWEEP_MAX_REPORTED_FAILURES = 50

/**
 * Wall-clock budget for the sweep.
 *
 * Each candidate costs one Mercado Pago round-trip plus one Firestore
 * transaction, strictly serially, and the platform kills the function at its own
 * timeout — which would leave a half-finished sweep with no response and no
 * report. The loop therefore stops itself well inside that window and says so
 * (`timeBudgetExhausted` + `truncated`), so the operator gets a complete report
 * and can simply run it again.
 */
export const STALE_SWEEP_TIME_BUDGET_MS = 7000

/**
 * The statuses that mean "an online payment was started and never settled".
 * `PENDIENTE_PAGO` is the generic fallback the order writer uses when a payment
 * method is unrecognised, and it carries no gateway preference of its own — the
 * ledger check simply finds nothing for it.
 */
export const PENDING_PAYMENT_STATUSES = ['PENDIENTE_PAGO_MERCADOPAGO', 'PENDIENTE_PAGO']

/** Mercado Pago payment search — filtered by the canonical order id. */
export const MP_PAYMENTS_SEARCH_URL = 'https://api.mercadopago.com/v1/payments/search'

const HOUR_MS = 60 * 60 * 1000

/** Clamps a caller-supplied idle window into `[STALE_PENDING_MIN_HOURS, STALE_PENDING_MAX_HOURS]`. */
export function resolveStaleHours(raw: unknown): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return STALE_PENDING_DEFAULT_HOURS
  return Math.min(Math.max(Math.floor(parsed), STALE_PENDING_MIN_HOURS), STALE_PENDING_MAX_HOURS)
}

/** Clamps a caller-supplied scan bound into `[1, STALE_SWEEP_MAX_LIMIT]`. */
export function resolveSweepLimit(raw: unknown): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return STALE_SWEEP_DEFAULT_LIMIT
  return Math.min(Math.floor(parsed), STALE_SWEEP_MAX_LIMIT)
}

/**
 * Age key for an order, from its `createdAt`.
 *
 * `0` means "no usable timestamp" — a Firestore `Timestamp`, an ISO string and an
 * epoch number are all understood, and anything else is treated as unreadable so
 * the caller never closes an order on an unknown age.
 */
export function createdAtMs(raw: unknown): number {
  if (raw && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    const date = (raw as { toDate: () => Date }).toDate()
    const time = date instanceof Date ? date.getTime() : NaN
    if (Number.isFinite(time)) return time
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    const parsed = new Date(raw).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

/**
 * True only for an order that is still awaiting an online payment and is older
 * than the cutoff. A settled, transfer, quote or cancelled order is never a
 * candidate however old it is.
 */
export function isStalePendingOrder(data: Record<string, unknown> | undefined, cutoffMs: number): boolean {
  if (!PENDING_PAYMENT_STATUSES.includes(String(data?.status || ''))) return false
  const created = createdAtMs(data?.createdAt)
  return created > 0 && created < cutoffMs
}

/**
 * The id of the newest settled payment in a Mercado Pago search response, or
 * `null` when the order has no approved payment.
 *
 * The results are requested newest-first, so the first approved entry wins.
 * Pending, in-process, rejected, cancelled and refunded payments are ignored:
 * only money that actually settled must block a cancellation.
 */
export function parseApprovedPaymentId(payload: unknown): string | null {
  const results = (payload as { results?: unknown } | null | undefined)?.results
  if (!Array.isArray(results)) return null

  for (const entry of results) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (record.status !== 'approved') continue
    if (typeof record.id === 'string' && record.id.trim()) return record.id.trim()
    if (typeof record.id === 'number' && Number.isFinite(record.id)) return String(record.id)
  }

  return null
}

type LedgerResult = { ok: true; approvedPaymentId: string | null } | { ok: false; reason: string }

/**
 * Asks the gateway whether this order already has settled money.
 *
 * Any failure — missing token, non-2xx, network error, unreadable body — is
 * reported as `ok: false` so the caller skips the order. The sweep must never
 * interpret an unverifiable ledger as "no payment".
 */
async function checkMercadoPagoLedger(orderId: string, accessToken: string): Promise<LedgerResult> {
  const url = `${MP_PAYMENTS_SEARCH_URL}?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=10`
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store'
    })
    if (!response.ok) {
      return { ok: false, reason: `Mercado Pago respondió ${response.status}` }
    }
    const payload: unknown = await response.json()
    // A 200 whose body is not a payment search (an HTML error page from a proxy,
    // a truncated payload) must not be read as "no payment exists": the only
    // answer this sweep may act on is one that actually carries a results array.
    if (!Array.isArray((payload as { results?: unknown } | null | undefined)?.results)) {
      return { ok: false, reason: 'respuesta de Mercado Pago ilegible' }
    }
    return { ok: true, approvedPaymentId: parseApprovedPaymentId(payload) }
  } catch (err: unknown) {
    return { ok: false, reason: err instanceof Error ? err.message : 'error de red' }
  }
}

type TransitionOutcome = 'applied' | 'status-changed' | 'missing'

interface TransitionInput {
  orderId: string
  /** `close` cancels; `park` moves the order to manual review with the payment id stamped. */
  kind: 'close' | 'park'
  paymentId?: string
  staleHours: number
  /** Verified admin identity — the same columns every other admin action records. */
  actor: string
  actorEmail: string | null
}

/**
 * Applies one transition inside a transaction.
 *
 * The document is re-read and the pending status re-asserted before any write, so
 * a webhook approval that landed between the scan and this call wins: the order
 * is reported as `status-changed` and nothing is written. No stock moves in
 * either direction — a pending order never deducted any.
 */
async function applyTransition(
  db: NonNullable<ReturnType<typeof getAdminFirestore>>,
  orderRef: FirebaseFirestore.DocumentReference,
  input: TransitionInput
): Promise<TransitionOutcome> {
  return db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(orderRef)
    if (!fresh.exists) return 'missing'

    const freshStatus = String((fresh.data() || {}).status || '')
    if (!PENDING_PAYMENT_STATUSES.includes(freshStatus)) return 'status-changed'

    const nowIso = new Date().toISOString()

    if (input.kind === 'park') {
      transaction.update(orderRef, {
        status: 'PAGO_EN_REVISION',
        mercadopagoPaymentId: input.paymentId || null,
        updatedAt: nowIso
      })
    } else {
      transaction.update(orderRef, {
        status: 'CANCELADO',
        updatedAt: nowIso
      })
    }

    const historyRef = db.collection(getCollectionName('order_status_history')).doc()
    transaction.set(historyRef, {
      id: historyRef.id,
      orderId: input.orderId,
      previousStatus: freshStatus,
      newStatus: input.kind === 'park' ? 'PAGO_EN_REVISION' : 'CANCELADO',
      changedBy: input.actor,
      changedByEmail: input.actorEmail,
      actorRole: 'ADMIN',
      timestamp: nowIso,
      reason:
        input.kind === 'park'
          ? `Pago ya acreditado en Mercado Pago (ID: ${input.paymentId}) para un pedido que seguía pendiente tras ${input.staleHours} horas. Se envía a revisión manual; sin movimiento de stock ni cancelación automática.`
          : `Pedido pendiente de pago en línea cerrado automáticamente tras ${input.staleHours} horas sin pago: la cartola de Mercado Pago no registra ningún pago aprobado para este pedido. Sin movimiento de stock ni reembolso.`,
      metadata: {
        // A late settlement is NOT the webhook's `PAGO_ESTADO_INVALIDO`: that one
        // means "approved for an order that could not be paid automatically",
        // while this order was payable all along and simply settled after its
        // notification was lost. A distinct event keeps the console label honest.
        event: input.kind === 'park' ? 'PAGO_ACREDITADO_TARDIO' : 'CIERRE_AUTOMATICO_PENDIENTE',
        closedBy: input.actor,
        staleHours: input.staleHours,
        ledgerChecked: true,
        ...(input.paymentId ? { paymentId: input.paymentId } : {})
      }
    })

    return 'applied'
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setAdminResponseHeaders(res)

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

  const body = (req.body || {}) as Record<string, unknown>
  // DRY RUN BY DEFAULT: this action cancels business records in bulk, so the
  // caller has to ask for the write explicitly. (The voucher housekeeping sweep
  // defaults the other way because it only removes unreferenced stored objects.)
  const dryRun = body.dryRun !== false
  const staleHours = resolveStaleHours(body.olderThanHours)
  const limit = resolveSweepLimit(body.limit)

  const db = getAdminFirestore()
  if (!db) {
    return res.status(500).json({ success: false, error: 'Base de datos no inicializada' })
  }

  const accessToken = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()
  const canCheckLedger = hasRealMercadoPagoToken()
  const ordersCol = getCollectionName('orders')
  const cutoffMs = Date.now() - staleHours * HOUR_MS
  const actor = authResult.uid || authResult.email || 'admin'
  const actorEmail = authResult.email || null

  const failures: string[] = []
  const recordFailure = (message: string): void => {
    if (failures.length < STALE_SWEEP_MAX_REPORTED_FAILURES) failures.push(message)
  }

  try {
    // BOUNDED, INDEX-FREE SCAN — a single-field `in` on the status needs no
    // composite index (the status+createdAt index exists only for the canonical
    // collection, so an index-dependent query would fail in the isolated dev
    // twin). The age filter runs in memory, and the pending total comes from a
    // `count()` aggregation, which charges index-entry reads only — so
    // `truncated` says whether the scan really missed anything instead of
    // guessing from the page size.
    const pendingQuery = db.collection(ordersCol).where('status', 'in', PENDING_PAYMENT_STATUSES)
    const [snapshot, totalSnapshot] = await Promise.all([pendingQuery.limit(limit).get(), pendingQuery.count().get()])
    const pendingTotal = Number(totalSnapshot.data().count) || 0

    const candidates = snapshot.docs.filter((doc) => isStalePendingOrder(doc.data(), cutoffMs))

    const closed: string[] = []
    const parked: string[] = []
    let skippedStatusChanged = 0
    let timeBudgetExhausted = false
    const startedAt = Date.now()

    for (const doc of candidates) {
      // Stop inside the platform's own timeout: a kill mid-sweep would leave a
      // half-finished run with no response and no report at all.
      if (Date.now() - startedAt > STALE_SWEEP_TIME_BUDGET_MS) {
        timeBudgetExhausted = true
        console.warn(
          `[Admin API Close Stale Orders] Time budget exhausted after ${closed.length + parked.length} order(s); stopping with a partial report so the run can be repeated.`
        )
        break
      }

      const data = doc.data() || {}
      const orderId = String(data.orderId || doc.id)

      if (!canCheckLedger) {
        console.warn(
          `[Admin API Close Stale Orders] Order "${orderId}" left untouched: no usable Mercado Pago access token, so its ledger cannot be checked.`
        )
        recordFailure(`${orderId}: no se pudo verificar la cartola (token de Mercado Pago ausente)`)
        continue
      }

      const ledger = await checkMercadoPagoLedger(orderId, accessToken)
      if (!ledger.ok) {
        console.warn(
          `[Admin API Close Stale Orders] Order "${orderId}" left untouched: the Mercado Pago ledger could not be read (${ledger.reason}).`
        )
        recordFailure(`${orderId}: no se pudo verificar la cartola (${ledger.reason})`)
        continue
      }

      const kind = ledger.approvedPaymentId ? 'park' : 'close'
      const target = kind === 'park' ? parked : closed

      if (dryRun) {
        target.push(orderId)
        continue
      }

      const outcome = await applyTransition(db, doc.ref, {
        orderId,
        kind,
        paymentId: ledger.approvedPaymentId || undefined,
        staleHours,
        actor,
        actorEmail
      })

      if (outcome === 'applied') {
        target.push(orderId)
      } else {
        if (outcome === 'status-changed') {
          skippedStatusChanged++
          console.warn(
            `[Admin API Close Stale Orders] Order "${orderId}" changed status while the sweep was running; nothing was written.`
          )
        } else {
          recordFailure(`${orderId}: el pedido ya no existe`)
        }
      }
    }

    return res.status(200).json({
      success: true,
      dryRun,
      olderThanHours: staleHours,
      cutoff: new Date(cutoffMs).toISOString(),
      scannedOrders: snapshot.docs.length,
      pendingTotal,
      staleOrders: candidates.length,
      closedCount: closed.length,
      parkedCount: parked.length,
      skippedStatusChanged,
      closedSample: closed.slice(0, 20),
      parkedSample: parked.slice(0, 20),
      failures,
      // More pending orders exist than this run could scan, or the run stopped on
      // its own budget: either way the operator should run it again.
      truncated: pendingTotal > snapshot.docs.length || timeBudgetExhausted,
      timeBudgetExhausted
    })
  } catch (err: unknown) {
    console.error('[Admin API Close Stale Orders] Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error al cerrar pedidos pendientes antiguos'
    })
  }
}
