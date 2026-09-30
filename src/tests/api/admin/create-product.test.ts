import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from '../../../../api/_lib/admin/create-product'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

describe('Serverless Admin Create Product (/api/admin/create-product)', () => {
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
  })

  it('rejects unauthenticated requests with 403', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({
      authenticated: false,
      error: 'Unauthorized'
    })
    const req = {
      method: 'POST',
      body: { name: 'Brackets Metálicos Roth 022', category: 'ORTODONCIA', price: 15990 }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(403)
    expect(jsonOutput.error).toBe('Unauthorized')
  })

  it('rejects non-admin staff with 403', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({
      authenticated: false,
      error: 'Usuario no tiene privilegios de administrador'
    })
    const req = {
      method: 'POST',
      body: { name: 'Brackets Metálicos Roth 022', category: 'ORTODONCIA', price: 15990 }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(403)
    expect(jsonOutput.error).toBe('Usuario no tiene privilegios de administrador')
  })

  it('validates required fields: name, category, positive price', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({
      authenticated: true,
      uid: 'admin-test',
      email: 'admin@prontoinsumos.cl'
    })

    const reqMissingName = {
      method: 'POST',
      body: { category: 'OPERATORIA', price: 10000 }
    } as VercelRequest

    await handler(reqMissingName, mockRes as VercelResponse)
    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('nombre')

    const reqInvalidPrice = {
      method: 'POST',
      body: { name: 'Composite Filtek Z250', category: 'OPERATORIA', price: -500 }
    } as VercelRequest

    await handler(reqInvalidPrice, mockRes as VercelResponse)
    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('precio')
  })

  it('creates product, computes priceNeto, supports dynamic category and saves audit log', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({
      authenticated: true,
      uid: 'admin-test',
      email: 'admin@prontoinsumos.cl'
    })

    const batchSetMock = vi.fn()
    const batchCommitMock = vi.fn().mockResolvedValue(undefined)

    const mockDb = {
      collection: vi.fn(() => ({
        doc: vi.fn((docId?: string) => ({
          id: docId || 'mock-audit-id-123'
        }))
      })),
      batch: vi.fn(() => ({
        set: batchSetMock,
        commit: batchCommitMock
      }))
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: {
        name: 'Guantes de Nitrilo Rosa (Caja 100 un)',
        category: 'BIOSEGURIDAD Y PROTECCION', // Dynamic custom category
        price: 8990,
        stockCount: 15,
        brand: 'Cranberry',
        tag: 'Nuevo'
      }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    const product = jsonOutput.product as Record<string, unknown>
    expect(product.name).toBe('Guantes de Nitrilo Rosa (Caja 100 un)')
    expect(product.category).toBe('BIOSEGURIDAD Y PROTECCION')
    expect(product.price).toBe(8990)
    // 8990 / 1.19 = 7554.62 -> Math.round is 7555
    expect(product.priceNeto).toBe(7555)
    expect(product.stockCount).toBe(15)
    expect(product.inStock).toBe(true)
    expect(product.isActive).toBe(true)

    expect(batchSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Guantes de Nitrilo Rosa (Caja 100 un)',
        category: 'BIOSEGURIDAD Y PROTECCION',
        price: 8990,
        priceNeto: 7555
      })
    )

    expect(batchSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        productName: 'Guantes de Nitrilo Rosa (Caja 100 un)',
        newStock: 15,
        delta: 15,
        changeType: 'STOCK_ADJUSTMENT'
      })
    )

    expect(batchCommitMock).toHaveBeenCalledTimes(1)
  })

  /** Firestore double for the create happy path (single batch write). */
  function mockCreateDb() {
    const batchSetMock = vi.fn()
    const batchCommitMock = vi.fn().mockResolvedValue(undefined)
    const mockDb = {
      collection: vi.fn(() => ({
        doc: vi.fn((docId?: string) => ({ id: docId || 'mock-audit-id-123' }))
      })),
      batch: vi.fn(() => ({ set: batchSetMock, commit: batchCommitMock }))
    }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )
    return { batchSetMock, batchCommitMock }
  }

  // The price must be a whole-peso CLP integer in range. `parseInt(String(price))`
  // used to truncate `189.99` to `189` and accept `'12abc'`/`'1e3'`, silently
  // persisting a catalog price a typo changed.
  it.each([
    ['a fractional price', 189.99],
    ['a non-finite price', Number.NaN],
    ['an infinite price', Number.POSITIVE_INFINITY],
    ['a zero price', 0],
    ['a negative price', -500],
    ['an out-of-range price', 1_000_000_000],
    ['a fractional numeric string', '189.99'],
    ['a junk numeric string', '12abc'],
    ['an exponent string', '1e3'],
    ['an empty string', '']
  ])('rejects %s with 400', async (_label, price) => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
    const req = {
      method: 'POST',
      body: { name: 'Composite Filtek Z250', category: 'OPERATORIA', price }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('precio')
  })

  it('accepts a price exactly at the MAX_CLP bound', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
    mockCreateDb()
    const req = {
      method: 'POST',
      body: { name: 'Turbina LED', category: 'OPERATORIA', price: 999_999_999 }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect((jsonOutput.product as Record<string, unknown>).price).toBe(999_999_999)
  })

  it.each([
    ['a fractional count', 3.5],
    ['a negative count', -1],
    ['an out-of-range count', 1_000_001],
    ['a non-finite count', Number.NaN],
    ['a numeric string', '15']
  ])('rejects %s for stockCount with 400', async (_label, stockCount) => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
    const req = {
      method: 'POST',
      body: { name: 'Guantes de Nitrilo', category: 'BIOSEGURIDAD', price: 8990, stockCount }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('stock')
  })

  it('accepts a stockCount exactly at the MAX_STOCK_UNITS bound', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
    mockCreateDb()
    const req = {
      method: 'POST',
      body: { name: 'Guantes de Nitrilo', category: 'BIOSEGURIDAD', price: 8990, stockCount: 1_000_000 }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect((jsonOutput.product as Record<string, unknown>).stockCount).toBe(1_000_000)
  })

  it('defaults stockCount to 10 when the field is omitted', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
    mockCreateDb()
    const req = {
      method: 'POST',
      body: { name: 'Guantes de Nitrilo', category: 'BIOSEGURIDAD', price: 8990 }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect((jsonOutput.product as Record<string, unknown>).stockCount).toBe(10)
  })
})
