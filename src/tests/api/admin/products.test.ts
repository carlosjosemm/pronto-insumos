import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../../api/_lib/admin/products'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

interface ProductsDbOptions {
  docs?: Array<{ id: string; data: Record<string, unknown> }>
  failGet?: boolean
}

/** Firestore Admin double for the products handler. */
function mockProductsDb(options: ProductsDbOptions = {}) {
  const docs = options.docs || []
  const snapshots = docs.map((d) => ({ id: d.id, data: () => d.data }))

  const db = {
    collection: vi.fn((name: string) => {
      if (name !== 'products') return { doc: vi.fn() }
      return {
        doc: vi.fn(),
        get: vi.fn(async () => {
          if (options.failGet) throw new Error('firestore down')
          return {
            empty: snapshots.length === 0,
            docs: snapshots,
            forEach: (cb: (doc: unknown) => void) => snapshots.forEach(cb)
          }
        })
      }
    })
  }

  return db
}

describe('Serverless Admin Products (/api/admin/products)', () => {
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
    const db = mockProductsDb()
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'OPTIONS' } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(mockRes.end).toHaveBeenCalledTimes(1)
  })

  it('rejects non-GET methods with 405', async () => {
    const db = mockProductsDb()
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

  it('returns the catalog with document ids and the total', async () => {
    const docs = [
      {
        id: 'odon-101',
        data: { name: 'Turbina Odontológica LED MasterTorque', category: 'OPERATORIA', price: 189990 }
      },
      {
        id: 'odon-102',
        data: { name: 'Kit Composite Nanohíbrido', category: 'OPERATORIA', price: 79990 }
      }
    ]
    const db = mockProductsDb({ docs })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET', query: {} } as unknown as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    const products = jsonOutput.products as Array<Record<string, unknown>>
    expect(products.map((p) => p.id)).toEqual(['odon-101', 'odon-102'])
    expect(products[0].name).toBe('Turbina Odontológica LED MasterTorque')
    expect(jsonOutput.total).toBe(2)
  })

  it('filters by category when one is requested', async () => {
    const docs = [
      { id: 'odon-101', data: { name: 'Turbina', category: 'OPERATORIA', price: 189990 } },
      { id: 'odon-201', data: { name: 'Lima K-File', category: 'ENDODONCIA', price: 9990 } }
    ]
    const db = mockProductsDb({ docs })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'GET', query: { category: 'ENDODONCIA' } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    const products = jsonOutput.products as Array<Record<string, unknown>>
    expect(products.map((p) => p.id)).toEqual(['odon-201'])
    expect(jsonOutput.total).toBe(1)
  })

  it('passes every product through when the category is all', async () => {
    const docs = [
      { id: 'odon-101', data: { name: 'Turbina', category: 'OPERATORIA', price: 189990 } },
      { id: 'odon-201', data: { name: 'Lima K-File', category: 'ENDODONCIA', price: 9990 } }
    ]
    const db = mockProductsDb({ docs })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET', query: { category: 'all' } } as unknown as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.total).toBe(2)
  })

  it('returns 500 when Firestore rejects the catalog read', async () => {
    const db = mockProductsDb({ failGet: true })
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
