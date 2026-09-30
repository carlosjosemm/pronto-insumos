import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../../api/_lib/admin/update-stock'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

interface StockDb {
  db: Record<string, unknown>
  updates: Array<{ ref: unknown; data: Record<string, unknown> }>
  sets: Array<Record<string, unknown>>
  transactionUsed: () => boolean
}

/** Firestore Admin double for the transactional stock adjustment. */
function mockStockDb(productData: Record<string, unknown> | null): StockDb {
  const productRef = { id: 'product-ref', get: vi.fn().mockResolvedValue({ exists: Boolean(productData) }) }
  const updates: Array<{ ref: unknown; data: Record<string, unknown> }> = []
  const sets: Array<Record<string, unknown>> = []
  let transactionUsed = false

  const db = {
    collection: vi.fn(() => ({ doc: vi.fn(() => productRef) })),
    runTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      transactionUsed = true
      const transaction = {
        get: vi.fn(async () => (productData ? { exists: true, data: () => productData } : { exists: false })),
        update: vi.fn((ref: unknown, data: Record<string, unknown>) => {
          updates.push({ ref, data })
        }),
        set: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
          sets.push(data)
        })
      }
      return await callback(transaction)
    })
  }

  return { db, updates, sets, transactionUsed: () => transactionUsed }
}

describe('Serverless Admin Update Stock (/api/admin/update-stock)', () => {
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

  it.each([
    ['a negative count', -5],
    ['a fractional count', 3.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an out-of-range count', 1_000_001]
  ])('rejects %s with 400', async (_label, newStock) => {
    const req = {
      method: 'POST',
      body: { productId: 'odon-101', newStock, reason: 'merma' }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('newStock')
  })

  it('accepts a count exactly at the MAX_STOCK_UNITS bound (shared adminLimits ceiling)', async () => {
    const store = mockStockDb({ stockCount: 5, isActive: true, sku: 'OD-101', name: 'Turbina' })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { productId: 'odon-101', newStock: 1_000_000, reason: 'reposicion' }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.stockCount).toBe(1_000_000)
  })

  it('adjusts the stock inside a transaction and records the audit reason', async () => {
    const store = mockStockDb({ stockCount: 5, isActive: true, sku: 'OD-101', name: 'Turbina' })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { productId: 'odon-101', newStock: 12, reason: 'reposicion' }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.stockCount).toBe(12)
    expect(jsonOutput.inStock).toBe(true)
    expect(store.transactionUsed()).toBe(true)
    expect(store.updates[0]?.data).toMatchObject({ stockCount: 12, inStock: true })
    expect(store.sets[0]).toMatchObject({ changeType: 'STOCK_ADJUSTMENT', reasonCode: 'reposicion', delta: 7 })
  })

  it('keeps inStock: false when a paused product (isActive: false) is restocked', async () => {
    const store = mockStockDb({ stockCount: 0, isActive: false })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { productId: 'odon-paused', newStock: 25, reason: 'reposicion' }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.stockCount).toBe(25)
    expect(jsonOutput.inStock).toBe(false)
    expect(store.updates[0]?.data).toMatchObject({ stockCount: 25, inStock: false })
  })

  it('returns 404 when the product does not exist', async () => {
    const store = mockStockDb(null)
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { productId: 'odon-ghost', newStock: 5 }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(404)
    expect(store.updates).toHaveLength(0)
  })
})
