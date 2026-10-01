import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../../api/_lib/admin/record-order-incident'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

interface MockDbOptions {
  orderData?: Record<string, unknown> | null
  directLookupMisses?: boolean
  historyWriteFails?: boolean
}

/** Firestore Admin double for the incident-recording transaction. */
function mockIncidentDb(options: MockDbOptions = {}) {
  const {
    orderData = { orderId: 'PRONTO-123456', status: 'ENTREGADO' },
    directLookupMisses = false,
    historyWriteFails = false
  } = options

  const mockOrderRef = {
    id: 'order-ref',
    get: vi.fn().mockResolvedValue(directLookupMisses ? { exists: false } : { exists: Boolean(orderData) })
  }

  const collectionCalls: string[] = []
  const collection = vi.fn((name: string) => {
    collectionCalls.push(name)
    if (name === 'orders') {
      return {
        doc: vi.fn(() => mockOrderRef),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi
              .fn()
              .mockResolvedValue(
                directLookupMisses && orderData
                  ? { empty: false, docs: [{ ref: mockOrderRef }] }
                  : { empty: true, docs: [] }
              )
          }))
        }))
      }
    }
    return { doc: vi.fn(() => ({ id: 'generated-id' })) }
  })

  const orderUpdates: Array<Record<string, unknown>> = []
  const historySets: Array<Record<string, unknown>> = []

  const db = {
    collection,
    runTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      if (historyWriteFails) throw new Error('firestore unavailable')
      const transaction = {
        get: vi.fn(async (ref: unknown) => {
          if (ref !== mockOrderRef) return { exists: false }
          return orderData ? { exists: true, data: () => orderData } : { exists: false }
        }),
        update: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
          orderUpdates.push(data)
        }),
        set: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
          historySets.push(data)
        })
      }
      return await callback(transaction)
    })
  }

  return { db, orderUpdates, historySets, collectionCalls }
}

const KINDS = ['CANCELACION', 'REEMBOLSO', 'DEVOLUCION', 'CONTRACARGO']

describe('Serverless Admin Record Order Incident (/api/admin/record-order-incident)', () => {
  let mockRes: Partial<VercelResponse>
  let jsonOutput: Record<string, unknown> = {}
  let statusOutput: number

  beforeEach(() => {
    vi.clearAllMocks()
    jsonOutput = {}
    statusOutput = 200
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
  })

  const request = (body: Record<string, unknown>) => ({ method: 'POST', body }) as VercelRequest

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
    await handler(request({ orderId: 'PRONTO-123456', kind: 'REEMBOLSO', note: 'x' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(403)
  })

  it('requires orderId, a known kind and a non-empty note', async () => {
    await handler(request({ kind: 'REEMBOLSO', note: 'cartola' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(400)

    await handler(request({ orderId: 'PRONTO-123456', kind: 'NOPE', note: 'cartola' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('kind')

    await handler(request({ orderId: 'PRONTO-123456', kind: 'REEMBOLSO', note: '   ' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('note')
  })

  it('returns 500 when Firestore Admin is unavailable', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(null)
    await handler(request({ orderId: 'PRONTO-123456', kind: 'REEMBOLSO', note: 'cartola' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(500)
  })

  it('returns 404 when the order does not exist', async () => {
    const store = mockIncidentDb({ orderData: null })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(request({ orderId: 'PRONTO-GHOST', kind: 'REEMBOLSO', note: 'cartola' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(404)
  })

  it.each(KINDS)('records a %s incident as a same-status history entry', async (kind) => {
    const store = mockIncidentDb({ orderData: { orderId: 'PRONTO-123456', status: 'ENTREGADO' } })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      request({ orderId: 'PRONTO-123456', kind, note: 'cartola 30-09, devolución $189.990' }),
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(jsonOutput).toMatchObject({ success: true, incidentKind: kind, status: 'ENTREGADO' })
    // The order status is never touched, and no inventory is read or written.
    expect(store.orderUpdates).toHaveLength(0)
    expect(store.collectionCalls).not.toContain('products')
    expect(store.historySets).toHaveLength(1)
    expect(store.historySets[0]).toMatchObject({
      previousStatus: 'ENTREGADO',
      newStatus: 'ENTREGADO',
      reason: 'cartola 30-09, devolución $189.990',
      actorRole: 'ADMIN'
    })
    expect(store.historySets[0].metadata).toMatchObject({
      event: 'INCIDENTE_MANUAL',
      incidentKind: kind
    })
  })

  it('records an incident for a non-delivered order too (e.g. a cancellation note)', async () => {
    const store = mockIncidentDb({ orderData: { orderId: 'PRONTO-123456', status: 'PENDIENTE_TRANSFERENCIA' } })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      request({ orderId: 'PRONTO-123456', kind: 'CANCELACION', note: 'cliente desistió por WhatsApp' }),
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(store.historySets[0]).toMatchObject({
      previousStatus: 'PENDIENTE_TRANSFERENCIA',
      newStatus: 'PENDIENTE_TRANSFERENCIA'
    })
  })

  it('appends a separate entry for every incident (repeatable by design)', async () => {
    const store = mockIncidentDb({ orderData: { orderId: 'PRONTO-123456', status: 'ENTREGADO' } })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      request({ orderId: 'PRONTO-123456', kind: 'DEVOLUCION', note: 'devolución recibida' }),
      mockRes as VercelResponse
    )
    await handler(
      request({ orderId: 'PRONTO-123456', kind: 'REEMBOLSO', note: 'reembolso transferido' }),
      mockRes as VercelResponse
    )

    expect(store.historySets).toHaveLength(2)
    expect(store.historySets[1].metadata).toMatchObject({ incidentKind: 'REEMBOLSO' })
  })

  it('resolves the order through the orderId query fallback', async () => {
    const store = mockIncidentDb({
      orderData: { orderId: 'PRONTO-123456', status: 'ENTREGADO' },
      directLookupMisses: true
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      request({ orderId: 'PRONTO-123456', kind: 'CONTRACARGO', note: 'caso banco 123' }),
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
  })

  it('fails closed with 500 when the history write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = mockIncidentDb({
      orderData: { orderId: 'PRONTO-123456', status: 'ENTREGADO' },
      historyWriteFails: true
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(request({ orderId: 'PRONTO-123456', kind: 'REEMBOLSO', note: 'cartola' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(500)
    expect(jsonOutput.success).toBe(false)
  })
})
