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
})
