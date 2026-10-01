import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))
vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

import handler, {
  PENDING_PAYMENT_STATUSES,
  STALE_PENDING_DEFAULT_HOURS,
  STALE_PENDING_MAX_HOURS,
  STALE_PENDING_MIN_HOURS,
  STALE_SWEEP_DEFAULT_LIMIT,
  STALE_SWEEP_MAX_LIMIT,
  STALE_SWEEP_TIME_BUDGET_MS,
  createdAtMs,
  isStalePendingOrder,
  parseApprovedPaymentId,
  resolveStaleHours,
  resolveSweepLimit
} from '../../../../api/_lib/admin/close-stale-orders'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import { getAdminFirestore } from '../../../../api/_lib/firebaseAdmin'

const HOUR_MS = 60 * 60 * 1000

/** An order comfortably past the default window. */
const staleCreatedAt = () => new Date(Date.now() - 72 * HOUR_MS).toISOString()
/** An order inside the window. */
const freshCreatedAt = () => new Date(Date.now() - 2 * HOUR_MS).toISOString()

interface Fixture {
  id: string
  data: Record<string, unknown>
}

interface DbOptions {
  /** Status the transaction re-read sees — simulates a webhook landing mid-sweep. */
  transactionStatus?: string
  /** What the pending `count()` aggregation reports (defaults to the fixture count). */
  pendingTotal?: number
}

/**
 * Firestore Admin double: the collection query returns the fixtures, and every
 * write goes through a transaction whose re-read can be told to disagree with the
 * scanned status.
 */
function createDb(fixtures: Fixture[], options: DbOptions = {}) {
  const refs = new Map<string, { id: string }>()
  const docs = fixtures.map((fixture) => {
    const ref = { id: fixture.id }
    refs.set(fixture.id, ref)
    return { id: fixture.id, ref, data: () => fixture.data }
  })

  const updates: Array<{ id: string; data: Record<string, unknown> }> = []
  const historySets: Array<Record<string, unknown>> = []
  const collectionCalls: string[] = []
  const whereCalls: Array<{ field: string; op: string; value: unknown }> = []
  let lastLimit = 0

  const collection = vi.fn((name: string) => {
    collectionCalls.push(name)
    if (name !== 'orders') {
      return { doc: vi.fn(() => ({ id: `hist-${historySets.length + 1}` })) }
    }
    return {
      where: vi.fn((field: string, op: string, value: unknown) => {
        whereCalls.push({ field, op, value })
        return {
          limit: vi.fn((count: number) => {
            lastLimit = count
            return { get: vi.fn(async () => ({ docs, empty: docs.length === 0 })) }
          }),
          count: vi.fn(() => ({
            get: vi.fn(async () => ({
              data: () => ({ count: options.pendingTotal ?? fixtures.length })
            }))
          }))
        }
      })
    }
  })

  const db = {
    collection,
    runTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const transaction = {
        get: vi.fn(async (ref: unknown) => {
          const fixture = fixtures.find((entry) => refs.get(entry.id) === ref)
          if (!fixture) return { exists: false }
          const data = options.transactionStatus ? { ...fixture.data, status: options.transactionStatus } : fixture.data
          return { exists: true, data: () => data }
        }),
        update: vi.fn((ref: unknown, data: Record<string, unknown>) => {
          const fixture = fixtures.find((entry) => refs.get(entry.id) === ref)
          updates.push({ id: fixture?.id ?? 'unknown', data })
        }),
        set: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
          historySets.push(data)
        })
      }
      return await callback(transaction)
    })
  }

  return {
    db,
    updates,
    historySets,
    collectionCalls,
    whereCalls,
    limitUsed: () => lastLimit
  }
}

function ledger(statuses: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ results: statuses.map((status, index) => ({ id: 1000 + index, status })) })
  }
}

/** Shape of the gateway call the sweep makes, so `mock.calls` stays typed. */
type FetchLike = (url: string, init: { headers?: Record<string, string> }) => Promise<unknown>

const fetchMock = vi.fn<FetchLike>(async () => ledger([]))

describe('Stale pending-order sweep — pure helpers', () => {
  it('clamps the idle window into the supported range', () => {
    expect(resolveStaleHours(undefined)).toBe(STALE_PENDING_DEFAULT_HOURS)
    expect(resolveStaleHours('abc')).toBe(STALE_PENDING_DEFAULT_HOURS)
    expect(resolveStaleHours(0)).toBe(STALE_PENDING_DEFAULT_HOURS)
    expect(resolveStaleHours(-3)).toBe(STALE_PENDING_DEFAULT_HOURS)
    expect(resolveStaleHours(12.7)).toBe(12)
    expect(resolveStaleHours(9999)).toBe(STALE_PENDING_MAX_HOURS)
    // A sub-hour window is raised to the floor, never used as-is.
    expect(resolveStaleHours(0.4)).toBe(STALE_PENDING_MIN_HOURS)
    expect(resolveStaleHours(1)).toBe(STALE_PENDING_MIN_HOURS)
  })

  it('clamps the scan bound so a huge value cannot widen it', () => {
    expect(resolveSweepLimit(undefined)).toBe(STALE_SWEEP_DEFAULT_LIMIT)
    expect(resolveSweepLimit('nope')).toBe(STALE_SWEEP_DEFAULT_LIMIT)
    expect(resolveSweepLimit(-1)).toBe(STALE_SWEEP_DEFAULT_LIMIT)
    expect(resolveSweepLimit(25)).toBe(25)
    expect(resolveSweepLimit(10_000)).toBe(STALE_SWEEP_MAX_LIMIT)
  })

  it('reads a Firestore Timestamp, an ISO string and an epoch number, and refuses the rest', () => {
    const when = Date.now() - HOUR_MS
    expect(createdAtMs({ toDate: () => new Date(when) })).toBe(when)
    expect(createdAtMs(new Date(when).toISOString())).toBe(when)
    expect(createdAtMs(when)).toBe(when)

    // Unreadable age must never make an order closable.
    expect(createdAtMs(undefined)).toBe(0)
    expect(createdAtMs('not-a-date')).toBe(0)
    expect(createdAtMs({ toDate: () => 'nope' })).toBe(0)
  })

  it('only qualifies an old order that is still awaiting an online payment', () => {
    const cutoff = Date.now() - STALE_PENDING_DEFAULT_HOURS * HOUR_MS

    for (const status of PENDING_PAYMENT_STATUSES) {
      expect(isStalePendingOrder({ status, createdAt: staleCreatedAt() }, cutoff)).toBe(true)
      expect(isStalePendingOrder({ status, createdAt: freshCreatedAt() }, cutoff)).toBe(false)
      // No usable timestamp: never a candidate.
      expect(isStalePendingOrder({ status }, cutoff)).toBe(false)
    }

    for (const status of [
      'PAGADO_MERCADOPAGO',
      'PAGO_EN_REVISION',
      'PENDIENTE_TRANSFERENCIA',
      'TRANSFERENCIA_COMPROBANTE_SUBIDO',
      'COTIZACION_SOLICITADA_WHATSAPP',
      'CANCELADO',
      'EN_PREPARACION',
      'DESPACHADO',
      'ENTREGADO'
    ]) {
      expect(isStalePendingOrder({ status, createdAt: staleCreatedAt() }, cutoff)).toBe(false)
    }
  })

  it('returns the newest approved payment id and ignores everything else', () => {
    expect(
      parseApprovedPaymentId({
        results: [
          { id: 1, status: 'pending' },
          { id: 2, status: 'approved' }
        ]
      })
    ).toBe('2')
    expect(parseApprovedPaymentId({ results: [{ id: '9', status: 'approved' }] })).toBe('9')
    expect(parseApprovedPaymentId({ results: [{ id: 3, status: 'approved' }] })).toBe('3')
    // Only a settled payment blocks a cancellation.
    for (const status of ['pending', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back']) {
      expect(parseApprovedPaymentId({ results: [{ id: 4, status }] })).toBeNull()
    }
    expect(parseApprovedPaymentId({ results: [] })).toBeNull()
    expect(parseApprovedPaymentId({})).toBeNull()
    expect(parseApprovedPaymentId(null)).toBeNull()
    expect(parseApprovedPaymentId({ results: 'nope' })).toBeNull()
    expect(parseApprovedPaymentId({ results: [null, 42, { id: {}, status: 'approved' }] })).toBeNull()
  })
})

describe('Serverless Admin Close Stale Orders (/api/admin/close-stale-orders)', () => {
  let mockRes: Partial<VercelResponse>
  let jsonOutput: Record<string, unknown> = {}
  let statusOutput: number

  beforeEach(() => {
    vi.clearAllMocks()
    jsonOutput = {}
    statusOutput = 200
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-access-token'
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockImplementation(async () => ledger([]))

    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({
      authenticated: true,
      uid: 'admin-1',
      email: 'admin@prontoinsumos.cl'
    })

    mockRes = {
      setHeader: vi.fn(),
      status: vi.fn((code: number) => {
        statusOutput = code
        return mockRes as VercelResponse
      }),
      json: vi.fn((data: unknown) => {
        jsonOutput = data as Record<string, unknown>
        return mockRes as VercelResponse
      }),
      end: vi.fn()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete process.env.MERCADOPAGO_ACCESS_TOKEN
  })

  it('acknowledges OPTIONS preflight with 200', async () => {
    await handler({ method: 'OPTIONS' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(200)
    expect(mockRes.end).toHaveBeenCalled()
  })

  it('rejects non-POST methods with 405', async () => {
    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(405)
  })

  it('rejects unauthenticated requests with 403', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: false, error: 'Unauthorized' })
    await handler({ method: 'POST', body: {} } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(403)
  })

  it('returns 500 when Firestore Admin is unavailable', async () => {
    vi.mocked(getAdminFirestore).mockReturnValue(null)
    await handler({ method: 'POST', body: {} } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(500)
  })

  it('defaults to a dry run that writes nothing', async () => {
    const { db, updates, historySets } = createDb([
      {
        id: 'A',
        data: { orderId: 'PRONTO-AAAAAAAA', status: 'PENDIENTE_PAGO_MERCADOPAGO', createdAt: staleCreatedAt() }
      }
    ])
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

    await handler({ method: 'POST', body: {} } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.dryRun).toBe(true)
    expect(jsonOutput.staleOrders).toBe(1)
    expect(jsonOutput.closedCount).toBe(1)
    expect(jsonOutput.closedSample).toEqual(['PRONTO-AAAAAAAA'])
    expect(updates).toHaveLength(0)
    expect(historySets).toHaveLength(0)
  })

  it('cancels a stale pending order with no settled payment, without touching stock', async () => {
    const { db, updates, historySets, collectionCalls, whereCalls, limitUsed } = createDb([
      {
        id: 'A',
        data: { orderId: 'PRONTO-AAAAAAAA', status: 'PENDIENTE_PAGO_MERCADOPAGO', createdAt: staleCreatedAt() }
      }
    ])
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

    await handler({ method: 'POST', body: { dryRun: false } } as VercelRequest, mockRes as VercelResponse)

    expect(jsonOutput.closedCount).toBe(1)
    expect(jsonOutput.parkedCount).toBe(0)
    expect(updates).toEqual([{ id: 'A', data: { status: 'CANCELADO', updatedAt: expect.any(String) } }])

    expect(historySets).toHaveLength(1)
    const history = historySets[0]
    expect(history.orderId).toBe('PRONTO-AAAAAAAA')
    expect(history.previousStatus).toBe('PENDIENTE_PAGO_MERCADOPAGO')
    expect(history.newStatus).toBe('CANCELADO')
    expect(history.actorRole).toBe('ADMIN')
    // The verified operator identity, not a hard-coded role — the console renders
    // `changedByEmail` in the order timeline.
    expect(history.changedBy).toBe('admin-1')
    expect(history.changedByEmail).toBe('admin@prontoinsumos.cl')
    expect((history.metadata as Record<string, unknown>).event).toBe('CIERRE_AUTOMATICO_PENDIENTE')
    expect((history.metadata as Record<string, unknown>).ledgerChecked).toBe(true)

    // A pending order never deducted stock, so the sweep must not read the catalog.
    expect(collectionCalls).not.toContain('products')
    // Bounded, index-free scan over exactly the pending payment statuses.
    expect(whereCalls).toEqual([{ field: 'status', op: 'in', value: PENDING_PAYMENT_STATUSES }])
    expect(limitUsed()).toBe(STALE_SWEEP_DEFAULT_LIMIT)
  })

  it('parks a stale order whose payment already settled instead of cancelling it', async () => {
    fetchMock.mockImplementation(async () => ledger(['approved']))
    const { db, updates, historySets } = createDb([
      {
        id: 'A',
        data: { orderId: 'PRONTO-AAAAAAAA', status: 'PENDIENTE_PAGO_MERCADOPAGO', createdAt: staleCreatedAt() }
      }
    ])
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

    await handler({ method: 'POST', body: { dryRun: false } } as VercelRequest, mockRes as VercelResponse)

    expect(jsonOutput.closedCount).toBe(0)
    expect(jsonOutput.parkedCount).toBe(1)
    expect(jsonOutput.parkedSample).toEqual(['PRONTO-AAAAAAAA'])
    expect(updates).toEqual([
      { id: 'A', data: { status: 'PAGO_EN_REVISION', mercadopagoPaymentId: '1000', updatedAt: expect.any(String) } }
    ])
    expect(historySets[0].newStatus).toBe('PAGO_EN_REVISION')
    // A late settlement is its own event: the webhook's PAGO_ESTADO_INVALIDO means
    // the order could not be paid automatically, which is not this case.
    expect((historySets[0].metadata as Record<string, unknown>).event).toBe('PAGO_ACREDITADO_TARDIO')
    expect((historySets[0].metadata as Record<string, unknown>).paymentId).toBe('1000')
  })

  it('asks the gateway about each candidate by its canonical order id', async () => {
    const { db } = createDb([
      { id: 'doc-key', data: { orderId: 'PRONTO-BBBBBBBB', status: 'PENDIENTE_PAGO', createdAt: staleCreatedAt() } }
    ])
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

    await handler({ method: 'POST', body: { dryRun: false } } as VercelRequest, mockRes as VercelResponse)

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('external_reference=PRONTO-BBBBBBBB')
    expect(url).toContain('/v1/payments/search')
    const init = fetchMock.mock.calls[0][1] as { headers?: Record<string, string> }
    expect(init.headers?.Authorization).toBe('Bearer TEST-access-token')
  })

  it('leaves an order untouched and records a failure when the ledger cannot be read', async () => {
    const failures = [
      async () => ({ ok: false, status: 500, json: async () => ({}) }),
      async () => {
        throw new Error('socket hang up')
      },
      async () => ({ ok: true, status: 200, json: async () => ({}) })
    ]

    for (const failure of failures) {
      vi.clearAllMocks()
      jsonOutput = {}
      statusOutput = 200
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-access-token'
      vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({
        authenticated: true,
        uid: 'admin-1',
        email: 'admin@prontoinsumos.cl'
      })
      vi.stubGlobal('fetch', fetchMock)
      fetchMock.mockImplementation(failure as unknown as FetchLike)

      const { db, updates, historySets } = createDb([
        {
          id: 'A',
          data: { orderId: 'PRONTO-AAAAAAAA', status: 'PENDIENTE_PAGO_MERCADOPAGO', createdAt: staleCreatedAt() }
        }
      ])
      vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

      await handler({ method: 'POST', body: { dryRun: false } } as VercelRequest, mockRes as VercelResponse)

      expect(statusOutput).toBe(200)
      expect(jsonOutput.closedCount).toBe(0)
      expect(jsonOutput.parkedCount).toBe(0)
      expect(updates).toHaveLength(0)
      expect(historySets).toHaveLength(0)
      expect((jsonOutput.failures as string[])[0]).toContain('PRONTO-AAAAAAAA')
    }
  })

  it('refuses to close anything when no usable Mercado Pago token is configured', async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN
    const { db, updates } = createDb([
      {
        id: 'A',
        data: { orderId: 'PRONTO-AAAAAAAA', status: 'PENDIENTE_PAGO_MERCADOPAGO', createdAt: staleCreatedAt() }
      }
    ])
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

    await handler({ method: 'POST', body: { dryRun: false } } as VercelRequest, mockRes as VercelResponse)

    expect(jsonOutput.closedCount).toBe(0)
    expect(updates).toHaveLength(0)
    expect(jsonOutput.failures).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips an order whose status changed while the sweep was running', async () => {
    const { db, updates, historySets } = createDb(
      [
        {
          id: 'A',
          data: { orderId: 'PRONTO-AAAAAAAA', status: 'PENDIENTE_PAGO_MERCADOPAGO', createdAt: staleCreatedAt() }
        }
      ],
      { transactionStatus: 'PAGADO_MERCADOPAGO' }
    )
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

    await handler({ method: 'POST', body: { dryRun: false } } as VercelRequest, mockRes as VercelResponse)

    expect(jsonOutput.skippedStatusChanged).toBe(1)
    expect(jsonOutput.closedCount).toBe(0)
    expect(updates).toHaveLength(0)
    expect(historySets).toHaveLength(0)
  })

  it('never touches a fresh pending order or a stale order in another status', async () => {
    const { db, updates, historySets } = createDb([
      {
        id: 'fresh',
        data: { orderId: 'PRONTO-FRESH', status: 'PENDIENTE_PAGO_MERCADOPAGO', createdAt: freshCreatedAt() }
      },
      { id: 'paid', data: { orderId: 'PRONTO-PAID', status: 'PAGADO_MERCADOPAGO', createdAt: staleCreatedAt() } },
      { id: 'cancelled', data: { orderId: 'PRONTO-CANCELLED', status: 'CANCELADO', createdAt: staleCreatedAt() } }
    ])
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

    await handler({ method: 'POST', body: { dryRun: false } } as VercelRequest, mockRes as VercelResponse)

    expect(jsonOutput.scannedOrders).toBe(3)
    expect(jsonOutput.staleOrders).toBe(0)
    expect(jsonOutput.closedCount).toBe(0)
    expect(updates).toHaveLength(0)
    expect(historySets).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a saturated scan, the pending total, and honours a caller-supplied window', async () => {
    const { db, whereCalls, limitUsed } = createDb(
      [
        {
          id: 'A',
          data: { orderId: 'PRONTO-AAAAAAAA', status: 'PENDIENTE_PAGO_MERCADOPAGO', createdAt: staleCreatedAt() }
        }
      ],
      { pendingTotal: 7 }
    )
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

    await handler(
      { method: 'POST', body: { dryRun: true, limit: 1, olderThanHours: 12 } } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(limitUsed()).toBe(1)
    // Seven pending orders exist and this run could scan one: the operator must re-run.
    expect(jsonOutput.pendingTotal).toBe(7)
    expect(jsonOutput.truncated).toBe(true)
    expect(jsonOutput.timeBudgetExhausted).toBe(false)
    expect(jsonOutput.olderThanHours).toBe(12)
    expect(jsonOutput.cutoff).toEqual(expect.any(String))
    expect(whereCalls).toHaveLength(1)
  })

  it('does not claim a truncated scan when the whole pending set was read', async () => {
    const { db } = createDb([
      {
        id: 'A',
        data: { orderId: 'PRONTO-AAAAAAAA', status: 'PENDIENTE_PAGO_MERCADOPAGO', createdAt: staleCreatedAt() }
      }
    ])
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

    await handler({ method: 'POST', body: { dryRun: true } } as VercelRequest, mockRes as VercelResponse)

    expect(jsonOutput.pendingTotal).toBe(1)
    expect(jsonOutput.truncated).toBe(false)
  })

  it('stops on its own wall-clock budget and reports a partial run instead of being killed', async () => {
    // Fixtures first: building them reads the real clock, so the spy below is
    // installed after them and only intercepts the handler's own reads.
    const { db, updates } = createDb([
      {
        id: 'A',
        data: { orderId: 'PRONTO-AAAAAAAA', status: 'PENDIENTE_PAGO_MERCADOPAGO', createdAt: staleCreatedAt() }
      },
      {
        id: 'B',
        data: { orderId: 'PRONTO-BBBBBBBB', status: 'PENDIENTE_PAGO_MERCADOPAGO', createdAt: staleCreatedAt() }
      }
    ])
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

    const base = Date.now()
    let calls = 0
    // The first two reads are the cutoff and the loop's start stamp; every read
    // after that reports the budget already spent, so the loop stops before its
    // first gateway call.
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockImplementation(() => (calls++ < 2 ? base : base + STALE_SWEEP_TIME_BUDGET_MS + 1))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await handler({ method: 'POST', body: { dryRun: false } } as VercelRequest, mockRes as VercelResponse)

    nowSpy.mockRestore()
    expect(jsonOutput.timeBudgetExhausted).toBe(true)
    expect(jsonOutput.truncated).toBe(true)
    expect(jsonOutput.closedCount).toBe(0)
    expect(updates).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('returns 500 with a loud log when the scan itself fails', async () => {
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => {
              throw new Error('firestore down')
            })
          }))
        }))
      }))
    }
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handler({ method: 'POST', body: {} } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(500)
    expect(errorSpy).toHaveBeenCalled()
  })
})
