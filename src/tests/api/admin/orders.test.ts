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

interface OrderFixture {
  id: string
  data: Record<string, unknown>
}

/**
 * Firestore double for the admin orders handler: the list read uses `snap.forEach`,
 * the detail read uses `doc(id).get()` with a `where('orderId','==')` fallback.
 */
function createOrdersDb(fixtures: OrderFixture[], options: { whereHit?: OrderFixture | null } = {}) {
  const docs = fixtures.map((fixture) => ({ id: fixture.id, data: () => fixture.data }))
  const whereDocs = options.whereHit ? [{ id: options.whereHit.id, data: () => options.whereHit!.data }] : []

  const db = {
    collection: vi.fn((name: string) => {
      if (name !== 'orders') return { doc: vi.fn(() => ({ id: 'unused' })) }
      return {
        get: vi.fn().mockResolvedValue({
          forEach: (cb: (doc: (typeof docs)[number]) => void) => docs.forEach(cb)
        }),
        doc: vi.fn((id: string) => {
          const hit = fixtures.find((fixture) => fixture.id === id)
          return {
            get: vi
              .fn()
              .mockResolvedValue(
                hit ? { exists: true, id, data: () => hit.data } : { exists: false, id, data: () => undefined }
              )
          }
        }),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ empty: whereDocs.length === 0, docs: whereDocs })
          }))
        }))
      }
    })
  }

  return { db }
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

  it('acknowledges OPTIONS preflight with 200', async () => {
    await handler({ method: 'OPTIONS' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(200)
    expect(mockRes.end).toHaveBeenCalled()
  })

  it('rejects non-GET methods with 405', async () => {
    await handler({ method: 'POST' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(405)
  })

  it('rejects unauthenticated requests with 403', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: false, error: 'Unauthorized' })
    await handler({ method: 'GET', query: {} } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(403)
  })

  it('returns 500 when Firestore Admin is unavailable', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(null)
    await handler({ method: 'GET', query: {} } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(500)
  })

  it('omits a legacy Base64 voucherUrl from the list and reports hasVoucher instead', async () => {
    const { db } = createOrdersDb([
      {
        id: 'PRONTO-LEGACY',
        data: baseOrder({
          orderId: 'PRONTO-LEGACY',
          voucherUrl: LEGACY_DATA_URL,
          voucherFileName: 'comprobante.pdf',
          voucherUploadedAt: '2026-09-01T10:00:00.000Z'
        })
      }
    ])
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET', query: {} } as VercelRequest, mockRes as VercelResponse)

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
    expect((orders[0].customer as Record<string, unknown>).fullName).toBe('Dra. Andrea')
  })

  it('reports hasVoucher for a Storage-backed voucher and false when there is none', async () => {
    const { db } = createOrdersDb([
      {
        id: 'PRONTO-STORAGE',
        data: baseOrder({
          orderId: 'PRONTO-STORAGE',
          voucherStoragePath: 'vouchers/orders/PRONTO-STORAGE/1700000000000-abc.pdf'
        })
      },
      { id: 'PRONTO-NONE', data: baseOrder({ orderId: 'PRONTO-NONE' }) }
    ])
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET', query: {} } as VercelRequest, mockRes as VercelResponse)

    const orders = jsonOutput.orders as Record<string, unknown>[]
    const storage = orders.find((o) => o.orderId === 'PRONTO-STORAGE')
    const none = orders.find((o) => o.orderId === 'PRONTO-NONE')
    expect(storage?.hasVoucher).toBe(true)
    expect(storage).not.toHaveProperty('voucherUrl')
    expect(none?.hasVoucher).toBe(false)
  })

  it('returns the full document, voucherUrl included, for a detail request (doc-key hit)', async () => {
    const { db } = createOrdersDb([
      { id: 'PRONTO-LEGACY', data: baseOrder({ orderId: 'PRONTO-LEGACY', voucherUrl: LEGACY_DATA_URL }) }
    ])
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
    expect(order.orderId).toBe('PRONTO-LEGACY')
  })

  it('returns the full document through the orderId query fallback', async () => {
    const legacyFixture = {
      id: 'PRONTO-DECOY',
      data: baseOrder({ orderId: 'PRONTO-LEGACY', voucherUrl: LEGACY_DATA_URL })
    }
    const { db } = createOrdersDb([], { whereHit: legacyFixture })
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

  it('returns 404 for a detail request that matches no order', async () => {
    const { db } = createOrdersDb([])
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'GET', query: { orderId: 'PRONTO-GHOST' } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(404)
  })

  it('treats TRANSFERENCIA_APROBADA as the PAGADO_TRANSFERENCIA filter group', async () => {
    const { db } = createOrdersDb([
      { id: 'PRONTO-A', data: baseOrder({ orderId: 'PRONTO-A', status: 'TRANSFERENCIA_APROBADA' }) },
      { id: 'PRONTO-B', data: baseOrder({ orderId: 'PRONTO-B', status: 'PAGADO_TRANSFERENCIA' }) },
      { id: 'PRONTO-C', data: baseOrder({ orderId: 'PRONTO-C', status: 'PENDIENTE_TRANSFERENCIA' }) }
    ])
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'GET', query: { status: 'TRANSFERENCIA_APROBADA' } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )

    const orders = jsonOutput.orders as Record<string, unknown>[]
    expect(orders.map((o) => o.orderId).sort()).toEqual(['PRONTO-A', 'PRONTO-B'])
  })

  it('filters the list by customer name and RUT', async () => {
    const { db } = createOrdersDb([
      {
        id: 'PRONTO-A',
        data: baseOrder({
          orderId: 'PRONTO-A',
          customer: { fullName: 'Dra. Camila Fuentes', rut: '12.345.678-5', city: 'Melipilla' }
        })
      },
      {
        id: 'PRONTO-B',
        data: baseOrder({
          orderId: 'PRONTO-B',
          customer: { fullName: 'Dr. Juan Pérez', rut: '9.876.543-2', city: 'San Antonio' }
        })
      }
    ])
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET', query: { search: 'camila' } } as unknown as VercelRequest, mockRes as VercelResponse)
    expect((jsonOutput.orders as Record<string, unknown>[]).map((o) => o.orderId)).toEqual(['PRONTO-A'])

    await handler({ method: 'GET', query: { search: '9.876' } } as unknown as VercelRequest, mockRes as VercelResponse)
    expect((jsonOutput.orders as Record<string, unknown>[]).map((o) => o.orderId)).toEqual(['PRONTO-B'])
  })
})
