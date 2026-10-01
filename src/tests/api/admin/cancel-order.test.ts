import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../../api/_lib/admin/cancel-order'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import * as emailLib from '../../../../api/_lib/email'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

vi.mock('../../../../api/_lib/email', () => ({
  sendEmail: vi.fn(),
  getWarehouseEmail: vi.fn()
}))

interface MockDbOptions {
  orderData?: Record<string, unknown> | null
  /** Status the transaction re-read sees (simulates a webhook approval mid-flight). */
  transactionStatus?: string
  directLookupMisses?: boolean
}

/** Firestore Admin double for the cancellation transaction. */
function mockCancelDb(options: MockDbOptions = {}) {
  const {
    orderData = { orderId: 'PRONTO-123456', status: 'PENDIENTE_TRANSFERENCIA' },
    transactionStatus,
    directLookupMisses = false
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
      const transaction = {
        get: vi.fn(async (ref: unknown) => {
          if (ref !== mockOrderRef) return { exists: false }
          if (!orderData) return { exists: false }
          const data = transactionStatus ? { ...orderData, status: transactionStatus } : orderData
          return { exists: true, data: () => data }
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

const CANCELABLE = [
  'PENDIENTE_PAGO_MERCADOPAGO',
  'PENDIENTE_PAGO',
  'PENDIENTE_TRANSFERENCIA',
  'TRANSFERENCIA_COMPROBANTE_SUBIDO'
]

const REFUSED = [
  'PAGADO_MERCADOPAGO',
  'TRANSFERENCIA_APROBADA',
  'PAGADO_TRANSFERENCIA',
  'EN_PREPARACION',
  'DESPACHADO',
  'ENTREGADO',
  'PAGO_EN_REVISION',
  'COTIZACION_SOLICITADA_WHATSAPP'
]

describe('Serverless Admin Cancel Order (/api/admin/cancel-order)', () => {
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
    vi.mocked(emailLib.getWarehouseEmail).mockReturnValue('bodega@prontoinsumos.cl')
    vi.mocked(emailLib.sendEmail).mockResolvedValue({ sent: true })

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
    await handler(request({ orderId: 'PRONTO-123456', reason: 'x' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(403)
  })

  it('requires orderId and a non-empty reason', async () => {
    await handler(request({ reason: 'sin abono' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(400)

    await handler(request({ orderId: 'PRONTO-123456' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(400)

    await handler(request({ orderId: 'PRONTO-123456', reason: '   ' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(400)
  })

  it('returns 500 when Firestore Admin is unavailable', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(null)
    await handler(request({ orderId: 'PRONTO-123456', reason: 'sin abono' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(500)
  })

  it('returns 404 when the order does not exist', async () => {
    const store = mockCancelDb({ orderData: null })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(request({ orderId: 'PRONTO-GHOST', reason: 'sin abono' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(404)
  })

  it.each(CANCELABLE)('cancels a %s order without moving stock', async (status) => {
    const store = mockCancelDb({ orderData: { orderId: 'PRONTO-123456', status } })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      request({ orderId: 'PRONTO-123456', reason: 'sin abono en cartola tras 7 días' }),
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(jsonOutput).toMatchObject({ success: true, status: 'CANCELADO' })
    expect(store.orderUpdates[0]).toMatchObject({ status: 'CANCELADO' })
    // No inventory movement: the products collection is never touched.
    expect(store.collectionCalls).not.toContain('products')
    expect(store.historySets).toHaveLength(1)
    expect(store.historySets[0]).toMatchObject({
      previousStatus: status,
      newStatus: 'CANCELADO',
      reason: 'sin abono en cartola tras 7 días',
      actorRole: 'ADMIN'
    })
    expect((store.historySets[0].metadata as Record<string, unknown>).event).toBe('CANCELACION_MANUAL')
  })

  it.each(REFUSED)('refuses to cancel a %s order with 409 and writes nothing', async (status) => {
    const store = mockCancelDb({ orderData: { orderId: 'PRONTO-123456', status } })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(request({ orderId: 'PRONTO-123456', reason: 'intento' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.currentStatus).toBe(status)
    expect(store.orderUpdates).toHaveLength(0)
    expect(store.historySets).toHaveLength(0)
    expect(emailLib.sendEmail).not.toHaveBeenCalled()
  })

  it('is idempotent for an already-cancelled order (no second history write or alert)', async () => {
    const store = mockCancelDb({ orderData: { orderId: 'PRONTO-123456', status: 'CANCELADO' } })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(request({ orderId: 'PRONTO-123456', reason: 'reintento' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.duplicate).toBe(true)
    expect(store.orderUpdates).toHaveLength(0)
    expect(store.historySets).toHaveLength(0)
    expect(emailLib.sendEmail).not.toHaveBeenCalled()
  })

  it('re-asserts the guard inside the transaction (a webhook approval mid-flight is not regressed)', async () => {
    const store = mockCancelDb({
      orderData: { orderId: 'PRONTO-123456', status: 'PENDIENTE_PAGO_MERCADOPAGO' },
      transactionStatus: 'PAGADO_MERCADOPAGO'
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(request({ orderId: 'PRONTO-123456', reason: 'carrera' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.currentStatus).toBe('PAGADO_MERCADOPAGO')
    expect(store.orderUpdates).toHaveLength(0)
    expect(store.historySets).toHaveLength(0)
  })

  it('resolves the order through the orderId query fallback', async () => {
    const store = mockCancelDb({
      orderData: { orderId: 'PRONTO-123456', status: 'PENDIENTE_TRANSFERENCIA' },
      directLookupMisses: true
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(request({ orderId: 'PRONTO-123456', reason: 'sin abono' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
  })

  it('alerts the warehouse after cancelling', async () => {
    const store = mockCancelDb({ orderData: { orderId: 'PRONTO-123456', status: 'PENDIENTE_TRANSFERENCIA' } })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(request({ orderId: 'PRONTO-123456', reason: 'sin abono' }), mockRes as VercelResponse)

    expect(emailLib.sendEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(emailLib.sendEmail).mock.calls[0][0]).toMatchObject({
      to: 'bodega@prontoinsumos.cl'
    })
  })

  it('skips the alert when no warehouse recipient is configured', async () => {
    vi.mocked(emailLib.getWarehouseEmail).mockReturnValue('')
    const store = mockCancelDb({ orderData: { orderId: 'PRONTO-123456', status: 'PENDIENTE_TRANSFERENCIA' } })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(request({ orderId: 'PRONTO-123456', reason: 'sin abono' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(emailLib.sendEmail).not.toHaveBeenCalled()
  })

  it('attempts the alert, ignores a reported delivery failure and still returns 200', async () => {
    // `sendEmail` is fail-safe by contract — it reports `{ sent: false }` instead of
    // throwing — so this pins that the committed cancellation is not blocked by a
    // failed notification.
    vi.mocked(emailLib.sendEmail).mockResolvedValue({ sent: false, reason: 'network_error' })
    const store = mockCancelDb({ orderData: { orderId: 'PRONTO-123456', status: 'PENDIENTE_TRANSFERENCIA' } })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(request({ orderId: 'PRONTO-123456', reason: 'sin abono' }), mockRes as VercelResponse)

    expect(emailLib.sendEmail).toHaveBeenCalledTimes(1)
    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
  })
})
