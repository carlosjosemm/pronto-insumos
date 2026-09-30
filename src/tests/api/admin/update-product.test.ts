import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from '../../../../api/_lib/admin/update-product'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

describe('Serverless Admin Update Product (/api/admin/update-product)', () => {
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
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: false, error: 'Unauthorized' })
    const req = { method: 'POST', body: { productId: 'odon-101' } } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(403)
    expect(jsonOutput.success).toBe(false)
  })

  it('updates price and automatically synchronizes priceNeto (19% IVA)', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockBatch = {
      update: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue([])
    }
    const mockDoc = {
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ id: 'odon-101', name: 'Turbina LED', price: 189990, priceNeto: 159655 })
      })
    }

    const mockDb = {
      collection: vi.fn(() => ({ doc: vi.fn(() => mockDoc) })),
      batch: vi.fn(() => mockBatch)
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: {
        productId: 'odon-101',
        price: 238000 // 238000 / 1.19 = 200000
      }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    const updates = jsonOutput.updates as Record<string, unknown>
    expect(updates.price).toBe(238000)
    expect(updates.priceNeto).toBe(200000)
    expect(mockBatch.update).toHaveBeenCalledWith(
      mockDoc,
      expect.objectContaining({
        price: 238000,
        priceNeto: 200000
      })
    )
  })

  it.each([
    ['a fractional price', 189990.5],
    ['a non-finite price', Number.NaN],
    ['an out-of-range price', 1_000_000_000]
  ])('rejects %s with 400', async (_label, price) => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
    const req = { method: 'POST', body: { productId: 'odon-101', price } } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('precio')
  })

  it('accepts a price exactly at the MAX_CLP bound (shared adminLimits ceiling)', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockBatch = { update: vi.fn(), set: vi.fn(), commit: vi.fn().mockResolvedValue([]) }
    const mockDoc = {
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ id: 'odon-101', name: 'Turbina LED', price: 189990 })
      })
    }
    const mockDb = {
      collection: vi.fn(() => ({ doc: vi.fn(() => mockDoc) })),
      batch: vi.fn(() => mockBatch)
    }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { productId: 'odon-101', price: 999_999_999 }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect((jsonOutput.updates as Record<string, unknown>).price).toBe(999_999_999)
  })

  it('normalizes the category and audits the price change', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockBatch = {
      update: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue([])
    }
    const mockDoc = {
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ id: 'odon-101', name: 'Turbina LED', price: 189990, stockCount: 5 })
      })
    }
    const mockDb = {
      collection: vi.fn(() => ({ doc: vi.fn(() => mockDoc) })),
      batch: vi.fn(() => mockBatch)
    }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { productId: 'odon-101', price: 238000, category: ' endodoncia ' }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    const updates = jsonOutput.updates as Record<string, unknown>
    expect(updates.category).toBe('ENDODONCIA')

    const auditEntry = mockBatch.set.mock.calls[0]?.[1] as Record<string, unknown>
    expect(auditEntry.metadata).toMatchObject({ previousPrice: 189990, newPrice: 238000 })
  })
})
