import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from '../../../../api/admin/create-product'
import * as adminAuth from '../../../../api/lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/lib/firebaseAdmin', () => ({
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
})
