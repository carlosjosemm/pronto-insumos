import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../../api/_lib/admin/mark-delivered'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

function mockDeliverDb(orderData: Record<string, unknown> | null) {
  const orderRef = {
    id: 'order-ref',
    get: vi.fn().mockResolvedValue(orderData ? { exists: true, data: () => orderData } : { exists: false })
  }
  const updates: Array<Record<string, unknown>> = []
  const sets: Array<Record<string, unknown>> = []

  const db = {
    collection: vi.fn((name: string) => {
      if (name === 'orders') {
        return {
          doc: vi.fn(() => orderRef),
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn().mockResolvedValue({ empty: true, docs: [] })
            }))
          }))
        }
      }
      return { doc: vi.fn(() => ({ id: 'generated-id' })) }
    }),
    runTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const transaction = {
        get: vi.fn(async () => (orderData ? { exists: true, data: () => orderData } : { exists: false })),
        update: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
          updates.push(data)
        }),
        set: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
          sets.push(data)
        })
      }
      return await callback(transaction)
    })
  }

  return { db, updates, sets }
}

describe('Serverless Admin Mark Delivered (/api/admin/mark-delivered)', () => {
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

  it('rejects non-POST methods with 405', async () => {
    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(405)
  })

  it('rejects unauthenticated requests with 403', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: false, error: 'Unauthorized' })
    await handler({ method: 'POST', body: { orderId: 'PRONTO-1' } } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(403)
  })

  it('marks a dispatched order as delivered', async () => {
    const store = mockDeliverDb({ orderId: 'PRONTO-1', status: 'DESPACHADO' })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: { orderId: 'PRONTO-1' } } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.status).toBe('ENTREGADO')
    expect(store.updates[0]).toMatchObject({ status: 'ENTREGADO' })
    expect(store.sets[0]).toMatchObject({ newStatus: 'ENTREGADO' })
  })

  it('is idempotent for an already-delivered order (no writes)', async () => {
    const store = mockDeliverDb({ orderId: 'PRONTO-1', status: 'ENTREGADO' })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: { orderId: 'PRONTO-1' } } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.duplicate).toBe(true)
    expect(store.updates).toHaveLength(0)
  })

  it('refuses to deliver a non-dispatched order with 409 and no writes', async () => {
    const store = mockDeliverDb({ orderId: 'PRONTO-1', status: 'PENDIENTE_TRANSFERENCIA' })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: { orderId: 'PRONTO-1' } } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.currentStatus).toBe('PENDIENTE_TRANSFERENCIA')
    expect(store.updates).toHaveLength(0)
  })

  it('returns 404 when the order does not exist', async () => {
    const store = mockDeliverDb(null)
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: { orderId: 'PRONTO-GHOST' } } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(404)
  })
})
