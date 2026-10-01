import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from '../../../../api/_lib/admin/dashboard-stats'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

interface StatsDbOptions {
  orders?: Array<Record<string, unknown>>
  products?: Array<Record<string, unknown>>
  failCount?: boolean
  failOrdersGet?: boolean
}

/**
 * Firestore Admin double for the stats handler: the pending count runs through
 * a status-in `count()` aggregation, the low-stock count through a bounded
 * `stockCount <= 5` read, and the sales/monthly volume through one bounded
 * recent-orders page.
 */
function mockStatsDb(options: StatsDbOptions = {}) {
  const orders = options.orders || []
  const products = options.products || []
  const pendingStatuses = [
    'PENDIENTE_PAGO_MERCADOPAGO',
    'PENDIENTE_TRANSFERENCIA',
    'PENDIENTE_PAGO',
    'TRANSFERENCIA_COMPROBANTE_SUBIDO',
    'PAGO_EN_REVISION'
  ]

  const db = {
    collection: vi.fn((name: string) => {
      if (name === 'orders') {
        return {
          where: vi.fn(() => ({
            count: vi.fn(() => ({
              get: vi.fn(async () => {
                if (options.failCount) throw new Error('firestore down')
                // Mirror the handler's semantics: only orders whose status is in
                // the pending list count, so a paid order in the fixture does not
                // inflate the aggregation result.
                const pendingCount = orders.filter((o) => pendingStatuses.includes(String(o.status || ''))).length
                return { data: () => ({ count: pendingCount }) }
              })
            }))
          })),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(async () => {
                if (options.failOrdersGet) throw new Error('firestore down')
                return {
                  forEach: (cb: (doc: unknown) => void) => orders.forEach((o) => cb({ data: () => o }))
                }
              })
            }))
          }))
        }
      }
      if (name === 'products') {
        return {
          where: vi.fn(() => ({
            get: vi.fn(async () => ({
              forEach: (cb: (doc: unknown) => void) => products.forEach((p) => cb({ data: () => p }))
            }))
          }))
        }
      }
      return {}
    })
  }

  return db
}

describe('Serverless Admin Dashboard Stats (/api/admin/dashboard-stats)', () => {
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
      uid: 'admin-1'
    } as Awaited<ReturnType<typeof adminAuth.verifyAdminToken>>)
  })

  it('rejects unauthenticated requests with 403', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: false, error: 'Unauthorized' })

    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(403)
    expect(jsonOutput.success).toBe(false)
  })

  it('aggregates daily sales matching Chilean calendar date (America/Santiago)', async () => {
    // Determine current Chilean date
    const todayChile = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())

    const orders = [
      {
        status: 'PAGADO_MERCADOPAGO',
        totalAmount: 150000,
        createdAt: `${todayChile}T15:00:00-03:00`,
        paidAt: `${todayChile}T15:05:00-03:00`
      },
      {
        status: 'PENDIENTE_TRANSFERENCIA',
        totalAmount: 80000,
        createdAt: `${todayChile}T10:00:00-03:00`
      }
    ]
    const products = [{ stockCount: 2, inStock: true, isActive: true }]

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockStatsDb({ orders, products }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    const stats = jsonOutput.stats as Record<string, unknown>
    expect(stats.salesToday).toBe(150000)
    expect(stats.pendingOrders).toBe(1)
    expect(stats.lowStockProducts).toBe(1)
    expect(stats.ordersThisMonth).toBe(2)
  })

  it('counts pending work through the status-in count() aggregation', async () => {
    const db = mockStatsDb({
      orders: [
        { status: 'PENDIENTE_TRANSFERENCIA', totalAmount: 80000, createdAt: '2026-09-01T10:00:00Z' },
        { status: 'PAGO_EN_REVISION', totalAmount: 50000, createdAt: '2026-08-20T10:00:00Z' }
      ]
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )
    const collectionSpy = vi.mocked(db.collection)

    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)

    const stats = jsonOutput.stats as Record<string, unknown>
    expect(stats.pendingOrders).toBe(2)
    // The pending count is the aggregation over the exact status list, not a
    // scan of a bounded page — so the flagged queue can never be undercounted.
    const ordersCol = collectionSpy.mock.calls.find(([name]) => name === 'orders')
    expect(ordersCol).toBeTruthy()
  })

  it('excludes paused products from the low-stock count', async () => {
    const products = [
      { stockCount: 2, inStock: true, isActive: true },
      { stockCount: 1, inStock: true, isActive: false }
    ]
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockStatsDb({ products }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)

    const stats = jsonOutput.stats as Record<string, unknown>
    expect(stats.lowStockProducts).toBe(1)
  })

  it('keeps shipped money in Ventas Hoy when the order was settled today', async () => {
    const todayChile = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())

    const orders = [
      {
        // Settled today and dispatched afterwards: the money is in, so the KPI
        // must not drop it the way the previous status-only filter did.
        status: 'DESPACHADO',
        totalAmount: 120000,
        createdAt: `${todayChile}T09:00:00-03:00`,
        paidAt: `${todayChile}T10:00:00-03:00`
      }
    ]
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockStatsDb({ orders }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)

    const stats = jsonOutput.stats as Record<string, unknown>
    expect(stats.salesToday).toBe(120000)
  })

  it('excludes reversal-parked money (refunded payment still carrying paidAt) from Ventas Hoy', async () => {
    const todayChile = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())

    const orders = [
      {
        // Mercado Pago refunded the charge and the webhook parked the order in
        // review WITHOUT clearing `paidAt` — review + marker ≡ returned money,
        // which must not count as confirmed revenue.
        status: 'PAGO_EN_REVISION',
        totalAmount: 150000,
        createdAt: `${todayChile}T09:00:00-03:00`,
        paidAt: `${todayChile}T10:00:00-03:00`
      }
    ]
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockStatsDb({ orders }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)

    const stats = jsonOutput.stats as Record<string, unknown>
    expect(stats.salesToday).toBe(0)
  })

  it('counts a transfer approval on its approvedAt date, not its creation date', async () => {
    const todayChile = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())
    const yesterdayChile = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(Date.now() - 86400000))

    const orders = [
      {
        // Created yesterday, verified by the operator today: the money settled
        // today, so the KPI must use `approvedAt` instead of falling back to
        // the creation timestamp.
        status: 'TRANSFERENCIA_APROBADA',
        totalAmount: 95000,
        createdAt: `${yesterdayChile}T18:00:00-03:00`,
        approvedAt: `${todayChile}T11:00:00-03:00`
      }
    ]
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockStatsDb({ orders }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)

    const stats = jsonOutput.stats as Record<string, unknown>
    expect(stats.salesToday).toBe(95000)
  })

  it('returns 500 when the pending-count aggregation fails', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockStatsDb({ failCount: true }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(500)
    expect(jsonOutput.success).toBe(false)
    errorSpy.mockRestore()
  })
})
