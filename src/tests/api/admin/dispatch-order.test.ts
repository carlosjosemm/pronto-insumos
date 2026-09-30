import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../../api/_lib/admin/dispatch-order'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import { chileanDateKey, counterDocumentId } from '../../../../api/_lib/dispatchReference'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

interface MockRef {
  id: string
  kind: 'order' | 'counter' | 'history'
}

interface MockDbOptions {
  /** `undefined` → a paid Melipilla order; `null` → no document at all. */
  order?: Record<string, unknown> | null
  /** Forces the legacy `where('orderId','==')` fallback to resolve this document. */
  legacyQuery?: Record<string, unknown> | null
  counterSeed?: Record<string, number>
  transactionError?: Error
}

describe('Serverless Admin Dispatch Order (/api/admin/dispatch-order)', () => {
  let mockRes: Partial<VercelResponse>
  let jsonOutput: Record<string, unknown> = {}
  let statusOutput: number

  beforeEach(() => {
    vi.clearAllMocks()
    jsonOutput = {}
    statusOutput = 200

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

    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({
      authenticated: true,
      uid: 'admin-1',
      email: 'bodega@pronto.cl'
    })
  })

  afterEach(() => {
    // A `console.error` spy must never survive a failing assertion into the next test.
    vi.restoreAllMocks()
  })

  /**
   * Deep scan for `undefined` values. `JSON.stringify` drops them silently, which is
   * exactly the Task 0.15 failure mode: the Admin SDK rejects the write only when the
   * raw payload still carries the key.
   */
  function containsUndefined(value: unknown): boolean {
    if (value === undefined) return true
    if (Array.isArray(value)) return value.some(containsUndefined)
    if (value !== null && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some(containsUndefined)
    }
    return false
  }

  function snapshotOf(data: Record<string, unknown> | null | undefined) {
    return { exists: Boolean(data), data: () => data || {} }
  }

  /**
   * Admin SDK double: the order document, the daily `dispatch_counters` sequence and
   * the `order_status_history` audit write, all served through a `runTransaction`
   * double so the real mint/keep/override logic and the counter bump are exercised.
   */
  function mockDispatchDb(options: MockDbOptions = {}) {
    const order =
      options.order === undefined ? { status: 'PAGADO_MERCADOPAGO', customer: { city: 'Melipilla' } } : options.order
    // When the document key misses, the legacy `orderId` query resolves the real
    // document — the transaction then reads that same data.
    const transactionOrder = order ?? options.legacyQuery ?? null

    const counterStore = new Map<string, Record<string, unknown>>()
    for (const [id, lastNumber] of Object.entries(options.counterSeed || {})) {
      counterStore.set(id, { lastNumber })
    }

    const updates: { ref: MockRef; data: Record<string, unknown> }[] = []
    const sets: { ref: MockRef; data: Record<string, unknown> }[] = []

    const ordersCollection = {
      doc: vi.fn((id: string) => {
        const ref: MockRef = { id, kind: 'order' }
        return { ...ref, get: vi.fn().mockResolvedValue(snapshotOf(order)) }
      }),
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn().mockResolvedValue(
            options.legacyQuery
              ? {
                  empty: false,
                  docs: [
                    {
                      ref: { id: 'legacy-order-doc', kind: 'order' } as MockRef,
                      data: () => options.legacyQuery
                    }
                  ]
                }
              : { empty: true, docs: [] }
          )
        }))
      }))
    }

    const counterCollection = {
      doc: vi.fn((id: string) => ({ id, kind: 'counter' as const }))
    }
    const historyCollection = {
      doc: vi.fn(() => ({ id: 'history-doc-1', kind: 'history' as const }))
    }

    const runTransaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      if (options.transactionError) {
        throw options.transactionError
      }
      const tx = {
        get: vi.fn(async (ref: MockRef) => {
          if (ref.kind === 'counter') return snapshotOf(counterStore.get(ref.id))
          return snapshotOf(transactionOrder)
        }),
        set: vi.fn((ref: MockRef, data: Record<string, unknown>) => {
          sets.push({ ref, data })
          if (ref.kind === 'counter') {
            counterStore.set(ref.id, { ...(counterStore.get(ref.id) || {}), ...data })
          }
        }),
        update: vi.fn((ref: MockRef, data: Record<string, unknown>) => {
          updates.push({ ref, data })
        })
      }
      return callback(tx)
    })

    const mockDb = {
      collection: vi.fn((name: string) => {
        if (String(name).includes('dispatch_counters')) return counterCollection
        if (String(name).includes('order_status_history')) return historyCollection
        return ordersCollection
      }),
      runTransaction
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    return {
      mockDb,
      counterStore,
      updates,
      sets,
      orderUpdate: () => (updates[0]?.data || {}) as Record<string, unknown>,
      historyPayload: () => (sets.find((entry) => entry.ref.kind === 'history')?.data || {}) as Record<string, unknown>
    }
  }

  function dispatchRequest(body: Record<string, unknown>): VercelRequest {
    return { method: 'POST', body } as VercelRequest
  }

  const todayKey = () => chileanDateKey(new Date())

  describe('Request gates', () => {
    it('answers the OPTIONS preflight with 200 and never touches Firestore', async () => {
      const db = mockDispatchDb()
      await handler({ method: 'OPTIONS' } as VercelRequest, mockRes as VercelResponse)

      expect(statusOutput).toBe(200)
      expect(mockRes.end).toHaveBeenCalled()
      expect(db.mockDb.runTransaction).not.toHaveBeenCalled()
    })

    it('rejects non-POST methods with 405', async () => {
      mockDispatchDb()
      await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)

      expect(statusOutput).toBe(405)
      expect(jsonOutput.success).toBe(false)
    })

    it('refuses an unauthenticated caller with 403 before any Firestore access', async () => {
      vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({
        authenticated: false,
        error: 'Acceso denegado: permisos administrativos requeridos'
      })
      const db = mockDispatchDb()

      await handler(dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'starken' }), mockRes as VercelResponse)

      expect(statusOutput).toBe(403)
      expect(db.mockDb.runTransaction).not.toHaveBeenCalled()
    })

    it('requires both orderId and carrier', async () => {
      mockDispatchDb()
      await handler(dispatchRequest({ orderId: 'PRONTO-123456' }), mockRes as VercelResponse)
      expect(statusOutput).toBe(400)

      statusOutput = 200
      await handler(dispatchRequest({ carrier: 'starken' }), mockRes as VercelResponse)
      expect(statusOutput).toBe(400)
    })

    it('answers 404 for an unknown order without opening a transaction', async () => {
      const db = mockDispatchDb({ order: null })
      await handler(dispatchRequest({ orderId: 'PRONTO-999999', carrier: 'starken' }), mockRes as VercelResponse)

      expect(statusOutput).toBe(404)
      expect(db.mockDb.runTransaction).not.toHaveBeenCalled()
    })
  })

  describe('Manual guía (admin override)', () => {
    it('records a typed guía as the reference and keeps the legacy tracking fields', async () => {
      const db = mockDispatchDb()

      await handler(
        dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'starken', trackingCode: 'STK-998877' }),
        mockRes as VercelResponse
      )

      expect(statusOutput).toBe(200)
      expect(jsonOutput).toMatchObject({
        success: true,
        status: 'DESPACHADO',
        dispatchReference: 'STK-998877',
        referenceSource: 'manual'
      })

      const update = db.orderUpdate()
      expect(containsUndefined(update)).toBe(false)
      expect(update).toMatchObject({
        status: 'DESPACHADO',
        courier: 'starken',
        trackingNumber: 'STK-998877'
      })
      expect(update.dispatch).toMatchObject({
        carrier: 'starken',
        trackingCode: 'STK-998877',
        reference: 'STK-998877',
        referenceSource: 'manual'
      })

      expect(db.historyPayload()).toMatchObject({
        newStatus: 'DESPACHADO',
        actorRole: 'ADMIN',
        changedByEmail: 'bodega@pronto.cl',
        reason: 'Despachado vía starken (N° Seguimiento: STK-998877)',
        metadata: {
          carrier: 'starken',
          trackingNumber: 'STK-998877',
          dispatchReference: 'STK-998877',
          referenceSource: 'manual'
        }
      })

      // A real guía never burns a route-sheet number.
      expect(db.counterStore.size).toBe(0)
    })

    it('coerces a numeric tracking code into a trimmed string (Task 0.15)', async () => {
      const db = mockDispatchDb()

      await handler(
        dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'chilexpress', trackingCode: 998877 }),
        mockRes as VercelResponse
      )

      expect(statusOutput).toBe(200)
      const update = db.orderUpdate()
      expect(containsUndefined(update)).toBe(false)
      expect(update.trackingNumber).toBe('998877')
      expect(update.dispatch).toMatchObject({ trackingCode: '998877', referenceSource: 'manual' })
    })

    it('lets a typed guía override a previously generated route code', async () => {
      const db = mockDispatchDb({
        order: {
          status: 'DESPACHADO',
          customer: { city: 'Melipilla' },
          dispatch: {
            carrier: 'despacho_local_melipilla',
            reference: 'MEL-260929-07',
            referenceSource: 'generated',
            dispatchedAt: '2026-09-29T14:00:00.000Z',
            dispatchedBy: 'bodega@pronto.cl'
          }
        }
      })

      await handler(
        dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'chilexpress', trackingCode: 'CHX-84192' }),
        mockRes as VercelResponse
      )

      expect(jsonOutput).toMatchObject({ dispatchReference: 'CHX-84192', referenceSource: 'manual' })
      expect(db.orderUpdate()).toMatchObject({ trackingNumber: 'CHX-84192' })
      expect(db.counterStore.size).toBe(0)
    })
  })

  describe('Generated internal dispatch reference (Task 2.13)', () => {
    it('mints a Melipilla route code for a courier-less dispatch and bumps the daily counter', async () => {
      const db = mockDispatchDb()
      const expectedReference = `MEL-${todayKey()}-01`

      await handler(
        dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'despacho_local_melipilla' }),
        mockRes as VercelResponse
      )

      expect(statusOutput).toBe(200)
      expect(jsonOutput).toMatchObject({
        success: true,
        status: 'DESPACHADO',
        dispatchReference: expectedReference,
        referenceSource: 'generated'
      })

      const update = db.orderUpdate()
      expect(containsUndefined(update)).toBe(false)
      expect(update).not.toHaveProperty('trackingNumber')
      expect(update).toMatchObject({ courier: 'despacho_local_melipilla' })
      expect(update.dispatch).toMatchObject({
        carrier: 'despacho_local_melipilla',
        reference: expectedReference,
        referenceSource: 'generated'
      })
      expect(update.dispatch).not.toHaveProperty('trackingCode')

      expect(db.counterStore.get(counterDocumentId('MEL', todayKey()))).toMatchObject({ lastNumber: 1 })

      const history = db.historyPayload()
      expect(containsUndefined(history)).toBe(false)
      expect(history).toMatchObject({
        reason: `Despachado vía despacho_local_melipilla (Ref. Despacho: ${expectedReference})`,
        metadata: {
          trackingNumber: null,
          dispatchReference: expectedReference,
          referenceSource: 'generated'
        }
      })
    })

    it('continues the daily sequence on the next dispatch', async () => {
      const db = mockDispatchDb({
        counterSeed: { [counterDocumentId('MEL', todayKey())]: 6 }
      })

      await handler(
        dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'despacho_local_melipilla' }),
        mockRes as VercelResponse
      )

      expect(jsonOutput.dispatchReference).toBe(`MEL-${todayKey()}-07`)
      expect(db.counterStore.get(counterDocumentId('MEL', todayKey()))).toMatchObject({ lastNumber: 7 })
    })

    it('mints the San Antonio prefix for a San Antonio delivery, on its own sequence', async () => {
      const db = mockDispatchDb({
        order: { status: 'PAGADO_MERCADOPAGO', customer: { city: 'San Antonio' } }
      })

      await handler(
        dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'despacho_local_melipilla' }),
        mockRes as VercelResponse
      )

      expect(jsonOutput.dispatchReference).toBe(`SAN-${todayKey()}-01`)
      expect(db.counterStore.has(counterDocumentId('SAN', todayKey()))).toBe(true)
      expect(db.counterStore.has(counterDocumentId('MEL', todayKey()))).toBe(false)
    })

    it('treats a blank or whitespace-only tracking code as absent (Task 0.15)', async () => {
      const db = mockDispatchDb()

      await handler(
        dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'starken', trackingCode: '   ' }),
        mockRes as VercelResponse
      )

      expect(statusOutput).toBe(200)
      const update = db.orderUpdate()
      expect(containsUndefined(update)).toBe(false)
      expect(update).not.toHaveProperty('trackingNumber')
      expect(update.dispatch).not.toHaveProperty('trackingCode')
      expect(jsonOutput.referenceSource).toBe('generated')
    })

    it('falls back to the query by orderId when the document key is not found', async () => {
      const db = mockDispatchDb({
        order: null,
        legacyQuery: { status: 'TRANSFERENCIA_APROBADA', customer: { city: 'Melipilla' } }
      })

      await handler(
        dispatchRequest({ orderId: 'PRONTO-FALLBACK-DISPATCH', carrier: 'chilexpress' }),
        mockRes as VercelResponse
      )

      expect(statusOutput).toBe(200)
      expect(jsonOutput).toMatchObject({ success: true, status: 'DESPACHADO', referenceSource: 'generated' })
      expect(db.updates[0].ref).toMatchObject({ id: 'legacy-order-doc' })
    })
  })

  describe('Re-dispatch stability', () => {
    it('keeps the generated route code and never bumps the counter on a code-less re-dispatch', async () => {
      const db = mockDispatchDb({
        order: {
          status: 'DESPACHADO',
          customer: { city: 'Melipilla' },
          dispatch: {
            carrier: 'despacho_local_melipilla',
            reference: 'MEL-260929-07',
            referenceSource: 'generated',
            dispatchedAt: '2026-09-29T14:00:00.000Z',
            dispatchedBy: 'bodega@pronto.cl'
          }
        }
      })

      await handler(
        dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'despacho_local_melipilla' }),
        mockRes as VercelResponse
      )

      expect(jsonOutput).toMatchObject({ dispatchReference: 'MEL-260929-07', referenceSource: 'generated' })
      expect(db.orderUpdate().dispatch).toMatchObject({ reference: 'MEL-260929-07' })
      expect(db.counterStore.size).toBe(0)
    })

    it('never downgrades a manual guía to a generated code', async () => {
      const db = mockDispatchDb({
        order: {
          status: 'DESPACHADO',
          customer: { city: 'Melipilla' },
          dispatch: {
            carrier: 'starken',
            trackingCode: 'STK-0001',
            reference: 'STK-0001',
            referenceSource: 'manual',
            dispatchedAt: '2026-09-28T14:00:00.000Z',
            dispatchedBy: 'bodega@pronto.cl'
          }
        }
      })

      await handler(
        dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'despacho_local_melipilla' }),
        mockRes as VercelResponse
      )

      expect(jsonOutput).toMatchObject({ dispatchReference: 'STK-0001', referenceSource: 'manual' })
      expect(db.orderUpdate().dispatch).toMatchObject({
        reference: 'STK-0001',
        referenceSource: 'manual',
        trackingCode: 'STK-0001'
      })
      expect(db.counterStore.size).toBe(0)
    })

    it('promotes a pre-2.13 guía into the reference when a legacy order is re-dispatched without a code', async () => {
      const db = mockDispatchDb({
        order: {
          status: 'DESPACHADO',
          customer: { city: 'Melipilla' },
          dispatch: {
            carrier: 'starken',
            trackingCode: 'STK-0001',
            dispatchedAt: '2026-09-01T10:00:00.000Z',
            dispatchedBy: 'bodega@pronto.cl'
          }
        }
      })

      await handler(
        dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'despacho_local_melipilla' }),
        mockRes as VercelResponse
      )

      // The legacy guía is the reference now: it is never masked by a minted route code,
      // and the top-level `trackingNumber` is omitted ⇒ untouched, exactly as before.
      expect(jsonOutput).toMatchObject({ dispatchReference: 'STK-0001', referenceSource: 'manual' })
      const update = db.orderUpdate()
      expect(update).not.toHaveProperty('trackingNumber')
      expect(update.dispatch).toMatchObject({
        reference: 'STK-0001',
        referenceSource: 'manual',
        trackingCode: 'STK-0001'
      })
      expect(db.counterStore.size).toBe(0)
    })

    it('mints a route code for a pre-2.13 order that has no guía at all', async () => {
      const db = mockDispatchDb({
        order: {
          status: 'DESPACHADO',
          customer: { city: 'Melipilla' },
          dispatch: {
            carrier: 'despacho_local_melipilla',
            dispatchedAt: '2026-09-01T10:00:00.000Z',
            dispatchedBy: 'bodega@pronto.cl'
          }
        }
      })

      await handler(
        dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'despacho_local_melipilla' }),
        mockRes as VercelResponse
      )

      expect(jsonOutput).toMatchObject({
        dispatchReference: `MEL-${todayKey()}-01`,
        referenceSource: 'generated'
      })
      expect(db.counterStore.size).toBe(1)
    })
  })

  describe('Failure handling', () => {
    it('answers 500 and writes nothing when the transaction fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const db = mockDispatchDb({ transactionError: new Error('Firestore unavailable') })

      await handler(
        dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'despacho_local_melipilla' }),
        mockRes as VercelResponse
      )

      expect(statusOutput).toBe(500)
      expect(jsonOutput).toMatchObject({ success: false })
      expect(db.updates).toHaveLength(0)
      expect(db.sets).toHaveLength(0)
      expect(db.counterStore.size).toBe(0)
      expect(consoleError).toHaveBeenCalled()
    })
  })
})
