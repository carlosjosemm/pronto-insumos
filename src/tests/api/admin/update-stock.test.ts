import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from '../../../../api/admin/update-stock'
import * as adminAuth from '../../../../api/lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

describe('Serverless Admin Update Stock (/api/admin/update-stock)', () => {
  let mockRes: Partial<VercelResponse>
  let jsonOutput: any
  let statusOutput: number

  beforeEach(() => {
    vi.clearAllMocks()
    jsonOutput = null
    statusOutput = 200

    mockRes = {
      setHeader: vi.fn(),
      status: vi.fn((code: number) => {
        statusOutput = code
        return mockRes as VercelResponse
      }),
      json: vi.fn((data: any) => {
        jsonOutput = data
        return mockRes as VercelResponse
      }),
      end: vi.fn()
    }
  })

  it('rejects negative stock counts with 400', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
    const req = {
      method: 'POST',
      body: { productId: 'odon-101', newStock: -5, reason: 'merma' }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('mayor o igual a 0')
  })

  it('updates stockCount and records audit reason note', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockBatch = {
      update: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue([])
    }
    const mockDoc = {
      get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ stockCount: 5 }) })
    }

    const mockDb = {
      collection: vi.fn(() => ({ doc: vi.fn(() => mockDoc) })),
      batch: vi.fn(() => mockBatch)
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(mockDb as any)

    const req = {
      method: 'POST',
      body: {
        productId: 'odon-101',
        newStock: 12,
        reason: 'reposicion'
      }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.stockCount).toBe(12)
    expect(mockBatch.update).toHaveBeenCalledWith(mockDoc, expect.objectContaining({
      stockCount: 12,
      inStock: true
    }))
    expect(mockBatch.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      changeType: 'STOCK_ADJUSTMENT',
      reasonCode: 'reposicion'
    }))
    expect(jsonOutput.inStock).toBe(true)
  })

  it('keeps inStock: false if a paused product (isActive: false) is restocked', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockBatch = {
      update: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue([])
    }
    const mockDoc = {
      get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ stockCount: 0, isActive: false }) })
    }

    const mockDb = {
      collection: vi.fn(() => ({ doc: vi.fn(() => mockDoc) })),
      batch: vi.fn(() => mockBatch)
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(mockDb as any)

    const req = {
      method: 'POST',
      body: {
        productId: 'odon-paused',
        newStock: 25,
        reason: 'reposicion'
      }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.stockCount).toBe(25)
    expect(jsonOutput.inStock).toBe(false)
    expect(mockBatch.update).toHaveBeenCalledWith(mockDoc, expect.objectContaining({
      stockCount: 25,
      inStock: false
    }))
  })
})
