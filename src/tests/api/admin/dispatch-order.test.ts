import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from '../../../../api/_lib/admin/dispatch-order'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

describe('Serverless Admin Dispatch Order (/api/admin/dispatch-order)', () => {
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

  it('updates order status to DESPACHADO and records carrier information', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockUpdate = vi.fn().mockResolvedValue({})
    const mockBatch = {
      update: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue([])
    }
    const mockDoc = {
      get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ status: 'PAGADO_MERCADOPAGO' }) }),
      update: mockUpdate
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
        orderId: 'PRONTO-123456',
        carrier: 'starken',
        trackingCode: 'STK-998877'
      }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.status).toBe('DESPACHADO')
    expect(mockBatch.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'DESPACHADO',
        courier: 'starken',
        trackingNumber: 'STK-998877'
      })
    )
    expect(mockBatch.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        newStatus: 'DESPACHADO',
        actorRole: 'ADMIN'
      })
    )
  })

  it('falls back to query by orderId if direct doc lookup is not found', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockBatch = {
      update: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue([])
    }
    const directDoc = {
      get: vi.fn().mockResolvedValue({ exists: false })
    }
    const queriedDoc = {
      ref: { id: 'auto-gen-id' },
      data: () => ({ status: 'TRANSFERENCIA_APROBADA' })
    }

    const mockDb = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => directDoc),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ empty: false, docs: [queriedDoc] })
          }))
        }))
      })),
      batch: vi.fn(() => mockBatch)
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: {
        orderId: 'PRONTO-FALLBACK-DISPATCH',
        carrier: 'chilexpress'
      }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.status).toBe('DESPACHADO')
  })
})
