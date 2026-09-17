import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from '../../../../api/admin/dispatch-order'
import * as adminAuth from '../../../../api/lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

describe('Serverless Admin Dispatch Order (/api/admin/dispatch-order)', () => {
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

  it('updates order status to DESPACHADO and records carrier information', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockUpdate = vi.fn().mockResolvedValue({})
    const mockDoc = {
      get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ status: 'PAGADO_MERCADOPAGO' }) }),
      update: mockUpdate
    }

    const mockDb = {
      collection: vi.fn(() => ({ doc: vi.fn(() => mockDoc) }))
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(mockDb as any)

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
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'DESPACHADO',
      courier: 'starken',
      trackingNumber: 'STK-998877'
    }))
  })
})
