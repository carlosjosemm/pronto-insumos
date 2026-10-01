import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../../api/_lib/admin/orders'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

const LEGACY_DATA_URL = 'data:application/pdf;base64,JVBERi0xLjQK' + 'A'.repeat(64)

interface OrdersDbOptions {
  /** Documents the bounded page read returns (already in createdAt-desc order). */
  docs?: Array<{ id: string; data: Record<string, unknown> }>
  /** Document returned by the orderId direct document-key lookup. */
  directDoc?: Record<string, unknown> | null
  /** Document returned by the orderId field-query fallback. */
  fallbackDoc?: Record<string, unknown> | null
  /** Document key reported for the field-query fallback (the key wins over the stored orderId field). */
  fallbackId?: string
  failGet?: boolean
}

/**
 * Firestore Admin double for the orders handler. The chain records every
 * `orderBy` / `where` / `startAfter` / `limit` call so cases can pin that the
 * status filter and the cursor run server-side and the page read is bounded.
 */
function mockOrdersDb(options: OrdersDbOptions = {}) {
  const docs = options.docs || []
  const whereCalls: Array<[string, string, unknown]> = []
  const snapshots = docs.map((d) => ({ id: d.id, data: () => d.data }))

  const pageSnap = {
    empty: snapshots.length === 0,
    docs: snapshots,
    forEach: (cb: (doc: unknown) => void) => snapshots.forEach(cb)
  }

  const chain = {
    orderBy: vi.fn(() => chain),
    where: vi.fn((field: string, op: string, val: unknown) => {
      whereCalls.push([field, op, val])
      return chain
    }),
    startAfter: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    get: vi.fn(async () => {
      if (options.failGet) throw new Error('firestore down')
      // The orderId field fallback reads through the same chain; it expects the
      // `{ empty, docs }` shape, so the get dispatches on what was filtered for.
      const usedForFallback = whereCalls.some(([field]) => field === 'orderId')
      if (usedForFallback) {
        return options.fallbackDoc
          ? { empty: false, docs: [{ id: options.fallbackId || 'PRONTO-A', data: () => options.fallbackDoc }] }
          : { empty: true, docs: [] }
      }
      return pageSnap
    }),
    count: vi.fn(() => ({
      get: vi.fn(async () => ({ data: () => ({ count: docs.length }) }))
    }))
  }

  const db = {
    collection: vi.fn((name: string) => {
      if (name !== 'orders') return { doc: vi.fn() }
      return {
        // The document key echoes the queried id, mirroring the real resolver:
        // the persisted doc key equals the canonical order id. The get() result
        // carries the snapshot id too — the handler reads `doc.id` off it.
        doc: vi.fn((id: string) => ({
          id,
          get: vi.fn(async () =>
            options.directDoc ? { exists: true, id, data: () => options.directDoc } : { exists: false }
          )
        })),
        ...chain
      }
    })
  }

  return { db, chain }
}

const baseOrder = (overrides: Record<string, unknown> = {}) => ({
  orderId: 'PRONTO-998811',
  status: 'PENDIENTE_TRANSFERENCIA',
  paymentMethod: 'transferencia',
  totalAmount: 189990,
  createdAt: '2026-09-30T12:00:00.000Z',
  customer: { fullName: 'Dra. Andrea', email: 'a@clinica.cl', rut: '12.345.678-5', city: 'Melipilla' },
  items: [{ productId: 'odon-101', name: 'Turbina', quantity: 1, price: 189990 }],
  ...overrides
})

describe('Serverless Admin Orders (/api/admin/orders)', () => {
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
      email: 'admin@prontoinsumos.cl'
    } as Awaited<ReturnType<typeof adminAuth.verifyAdminToken>>)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('answers the OPTIONS preflight with 200', async () => {
    const { db } = mockOrdersDb()
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'OPTIONS' } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(mockRes.end).toHaveBeenCalledTimes(1)
  })

  it('rejects non-GET methods with 405', async () => {
    const { db } = mockOrdersDb()
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST' } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(405)
    expect(jsonOutput.success).toBe(false)
  })

  it('rejects unauthenticated requests with 403', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: false, error: 'Unauthorized' })

    await handler({ method: 'GET', query: {} } as unknown as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(403)
    expect(jsonOutput.success).toBe(false)
  })

  it('returns 500 when Firestore Admin is unavailable', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(null)

    await handler({ method: 'GET', query: {} } as unknown as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(500)
  })

  it('returns the bounded page sorted by createdAt desc with total and nextCursor when full', async () => {
    const docs = [
      {
        id: 'PRONTO-C',
        data: baseOrder({
          orderId: 'PRONTO-C',
          totalAmount: 300000,
          createdAt: { toDate: () => new Date('2026-09-30T15:00:00Z') },
          customer: { fullName: 'Dra. Camila Fuentes' }
        })
      },
      {
        id: 'PRONTO-B',
        data: baseOrder({
          orderId: 'PRONTO-B',
          status: 'PAGADO_MERCADOPAGO',
          totalAmount: 200000,
          createdAt: { toDate: () => new Date('2026-09-30T14:00:00Z') },
          customer: { fullName: 'Dra. Bruno Soto' }
        })
      }
    ]
    const { db, chain } = mockOrdersDb({ docs })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET', query: { limit: '2' } } as unknown as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect((jsonOutput.orders as Array<{ orderId: string }>).map((o) => o.orderId)).toEqual(['PRONTO-C', 'PRONTO-B'])
    expect(jsonOutput.total).toBe(2)
    expect(jsonOutput.nextCursor).toBe('2026-09-30T14:00:00.000Z')
    // The read is bounded: the page query carries the requested page size.
    expect(chain.limit).toHaveBeenCalledWith(2)
  })

  it('omits nextCursor when the page is not full', async () => {
    const docs = [
      {
        id: 'PRONTO-A',
        data: baseOrder({
          orderId: 'PRONTO-A',
          createdAt: { toDate: () => new Date('2026-09-30T15:00:00Z') },
          customer: { fullName: 'Dra. Ana Fuentes' }
        })
      }
    ]
    const { db } = mockOrdersDb({ docs })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET', query: {} } as unknown as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.total).toBe(1)
    expect(jsonOutput.nextCursor).toBeUndefined()
  })

  it('flags a non-timestamp createdAt and refuses to paginate past it', async () => {
    // A legacy or crafted document whose createdAt is not a real timestamp must
    // never be echoed as a cursor: the client would re-request the first page
    // forever. The row is flagged and the cursor omitted instead.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const docs = [
      {
        id: 'PRONTO-A',
        data: baseOrder({
          orderId: 'PRONTO-A',
          createdAt: { toDate: () => new Date('2026-09-30T15:00:00Z') },
          customer: { fullName: 'Dra. Ana Fuentes' }
        })
      },
      { id: 'PRONTO-B', data: baseOrder({ orderId: 'PRONTO-B', createdAt: 'zzz' }) }
    ]
    const { db } = mockOrdersDb({ docs })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET', query: { limit: '2' } } as unknown as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    const orders = jsonOutput.orders as Array<Record<string, unknown>>
    expect(orders[1]).toMatchObject({ orderId: 'PRONTO-B', createdAt: '', createdAtInvalid: true })
    expect(orders[0]).not.toHaveProperty('createdAtInvalid')
    expect(jsonOutput.nextCursor).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-timestamp createdAt'))
    warnSpy.mockRestore()
  })

  it('filters by status server-side through an equality query', async () => {
    const { db, chain } = mockOrdersDb()
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'GET', query: { status: 'PENDIENTE_TRANSFERENCIA' } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )

    expect(chain.where).toHaveBeenCalledWith('status', '==', 'PENDIENTE_TRANSFERENCIA')
  })

  it('filters the transfer-approved chip through the dual-status in query', async () => {
    const { db, chain } = mockOrdersDb()
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'GET', query: { status: 'TRANSFERENCIA_APROBADA' } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )

    expect(chain.where).toHaveBeenCalledWith('status', 'in', ['TRANSFERENCIA_APROBADA', 'PAGADO_TRANSFERENCIA'])
  })

  it('continues after the client cursor through startAfter', async () => {
    const { db, chain } = mockOrdersDb()
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'GET', query: { cursor: '2026-09-30T14:00:00.000Z' } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )

    expect(chain.startAfter).toHaveBeenCalledWith(new Date('2026-09-30T14:00:00.000Z'))
  })

  it('search filters the loaded page in memory by id, name and RUT', async () => {
    const docs = [
      {
        id: 'PRONTO-A',
        data: baseOrder({
          orderId: 'PRONTO-A',
          createdAt: { toDate: () => new Date('2026-09-30T15:00:00Z') },
          customer: { fullName: 'Dra. Camila Fuentes', rut: '12.345.678-5', city: 'Melipilla' }
        })
      },
      {
        id: 'PRONTO-B',
        data: baseOrder({
          orderId: 'PRONTO-B',
          createdAt: { toDate: () => new Date('2026-09-30T14:00:00Z') },
          customer: { fullName: 'Dr. Juan Pérez', rut: '9.876.543-2', city: 'San Antonio' }
        })
      }
    ]
    const { db } = mockOrdersDb({ docs })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'GET', query: { search: 'fuentes' } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )
    expect((jsonOutput.orders as Array<{ orderId: string }>).map((o) => o.orderId)).toEqual(['PRONTO-A'])

    await handler({ method: 'GET', query: { search: '9.876' } } as unknown as VercelRequest, mockRes as VercelResponse)
    expect((jsonOutput.orders as Array<{ orderId: string }>).map((o) => o.orderId)).toEqual(['PRONTO-B'])
  })

  it('omits a legacy Base64 voucherUrl from the list and reports hasVoucher instead', async () => {
    const docs = [
      {
        id: 'PRONTO-LEGACY',
        data: baseOrder({
          orderId: 'PRONTO-LEGACY',
          voucherUrl: LEGACY_DATA_URL,
          voucherFileName: 'comprobante.pdf',
          voucherUploadedAt: '2026-09-01T10:00:00.000Z'
        })
      }
    ]
    const { db } = mockOrdersDb({ docs })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET', query: {} } as unknown as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    const orders = jsonOutput.orders as Record<string, unknown>[]
    expect(orders).toHaveLength(1)
    expect(orders[0]).not.toHaveProperty('voucherUrl')
    expect(orders[0].hasVoucher).toBe(true)
    // The small voucher metadata is still available for the row/panel.
    expect(orders[0].voucherFileName).toBe('comprobante.pdf')
    // Everything else survives the projection.
    expect(orders[0]).toMatchObject({
      orderId: 'PRONTO-LEGACY',
      status: 'PENDIENTE_TRANSFERENCIA',
      totalAmount: 189990
    })
  })

  it('reports hasVoucher for a Storage-backed voucher and false when there is none', async () => {
    const docs = [
      {
        id: 'PRONTO-STORAGE',
        data: baseOrder({
          orderId: 'PRONTO-STORAGE',
          voucherStoragePath: 'vouchers/orders/PRONTO-STORAGE/1700000000000-abc.pdf'
        })
      },
      { id: 'PRONTO-NONE', data: baseOrder({ orderId: 'PRONTO-NONE' }) }
    ]
    const { db } = mockOrdersDb({ docs })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET', query: {} } as unknown as VercelRequest, mockRes as VercelResponse)

    const orders = jsonOutput.orders as Record<string, unknown>[]
    const storage = orders.find((o) => o.orderId === 'PRONTO-STORAGE')
    const none = orders.find((o) => o.orderId === 'PRONTO-NONE')
    expect(storage?.hasVoucher).toBe(true)
    expect(storage).not.toHaveProperty('voucherUrl')
    expect(none?.hasVoucher).toBe(false)
  })

  it('returns a single order on the orderId direct document-key hit', async () => {
    const directDoc = baseOrder({ orderId: 'PRONTO-A' })
    const { db } = mockOrdersDb({ directDoc })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'GET', query: { orderId: 'PRONTO-A' } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect((jsonOutput.order as Record<string, unknown>).orderId).toBe('PRONTO-A')
  })

  it('returns the full document, voucherUrl included, for a detail request', async () => {
    const directDoc = baseOrder({ orderId: 'PRONTO-LEGACY', voucherUrl: LEGACY_DATA_URL })
    const { db } = mockOrdersDb({ directDoc })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'GET', query: { orderId: 'PRONTO-LEGACY' } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    // The detail request is the only response allowed to carry a legacy Base64
    // voucher — a single order document is always within Vercel's 4.5 MB cap.
    expect((jsonOutput.order as Record<string, unknown>).voucherUrl).toBe(LEGACY_DATA_URL)
  })

  it('falls back to the orderId field query when the direct key misses, doc key winning', async () => {
    const fallbackDoc = baseOrder({ orderId: 'PRONTO-LEGACY', voucherUrl: LEGACY_DATA_URL })
    const { db } = mockOrdersDb({ fallbackDoc, fallbackId: 'PRONTO-DECOY' })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'GET', query: { orderId: 'PRONTO-LEGACY' } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    const order = jsonOutput.order as Record<string, unknown>
    expect(order.voucherUrl).toBe(LEGACY_DATA_URL)
    // The document key wins over the stored orderId field.
    expect(order.orderId).toBe('PRONTO-DECOY')
  })

  it('returns 404 when neither orderId lookup finds the order', async () => {
    const { db } = mockOrdersDb()
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'GET', query: { orderId: 'PRONTO-MISSING' } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(404)
    expect(jsonOutput.success).toBe(false)
  })

  it('returns 500 when Firestore rejects the page read', async () => {
    const { db } = mockOrdersDb({ failGet: true })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handler({ method: 'GET', query: {} } as unknown as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(500)
    expect(jsonOutput.success).toBe(false)
    errorSpy.mockRestore()
  })
})
