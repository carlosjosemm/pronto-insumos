import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../../api/_lib/admin/toggle-visibility'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

/** Firestore Admin double for the visibility toggle transaction. */
function mockVisibilityDb(productData: Record<string, unknown> | null) {
  const productRef = { id: 'product-ref', get: vi.fn().mockResolvedValue({ exists: Boolean(productData) }) }
  const updates: Array<Record<string, unknown>> = []
  const sets: Array<Record<string, unknown>> = []
  let transactionUsed = false

  const db = {
    collection: vi.fn(() => ({ doc: vi.fn(() => productRef) })),
    runTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      transactionUsed = true
      const transaction = {
        get: vi.fn(async () => (productData ? { exists: true, data: () => productData } : { exists: false })),
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

  return { db, updates, sets, transactionUsed: () => transactionUsed }
}

describe('Serverless Admin Toggle Visibility (/api/admin/toggle-visibility)', () => {
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

  it('rejects a non-boolean visibility flag with 400', async () => {
    await handler(
      { method: 'POST', body: { productId: 'odon-101', visible: 'yes' } } as VercelRequest,
      mockRes as VercelResponse
    )
    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('visible')
  })

  it('activates a product with stock inside a transaction', async () => {
    const store = mockVisibilityDb({ stockCount: 5, name: 'Turbina', sku: 'OD-101' })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'POST', body: { productId: 'odon-101', visible: true } } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(jsonOutput.isActive).toBe(true)
    expect(jsonOutput.inStock).toBe(true)
    expect(store.transactionUsed()).toBe(true)
    expect(store.updates[0]).toMatchObject({ isActive: true, inStock: true })
    expect(store.sets[0]).toMatchObject({ changeType: 'VISIBILITY_TOGGLE', reasonCode: 'activacion_catalogo' })
  })

  it('pauses a product with stock, keeping inStock false', async () => {
    const store = mockVisibilityDb({ stockCount: 5, name: 'Turbina' })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'POST', body: { productId: 'odon-101', visible: false } } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(jsonOutput.inStock).toBe(false)
    expect(store.updates[0]).toMatchObject({ isActive: false, inStock: false })
  })

  it('returns 404 when the product does not exist', async () => {
    const store = mockVisibilityDb(null)
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      store.db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'POST', body: { productId: 'odon-ghost', visible: true } } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(404)
    expect(store.updates).toHaveLength(0)
  })
})
