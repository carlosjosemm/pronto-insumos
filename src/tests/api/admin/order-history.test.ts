import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from '../../../../api/admin/order-history'
import * as adminAuth from '../../../../api/lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

describe('Serverless Admin Order History (/api/admin/order-history)', () => {
  let mockRes: Partial<VercelResponse>
  let jsonOutput: any
  let statusOutput: number

  beforeEach(() => {
    vi.clearAllMocks()
    jsonOutput = null
    statusOutput = 200

    mockRes = {
      setHeader: vi.fn(),
      status: vi.fn().mockImplementation((code: number) => {
        statusOutput = code
        return mockRes
      }),
      json: vi.fn().mockImplementation((data: any) => {
        jsonOutput = data
        return mockRes
      }),
      end: vi.fn().mockImplementation(() => mockRes)
    }
  })

  it('rejects unauthenticated requests', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({
      authenticated: false,
      error: 'Token ausente o malformado'
    })

    const req = {
      method: 'GET',
      query: { orderId: 'PRONTO-123456' }
    } as unknown as VercelRequest

    await handler(req, mockRes as VercelResponse)
    expect(statusOutput).toBe(403)
    expect(jsonOutput.success).toBe(false)
  })

  it('returns sorted order history when authenticated', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({
      authenticated: true,
      uid: 'admin_uid',
      email: 'admin@prontoinsumos.cl'
    })

    const mockDocs = [
      {
        id: 'ev-2',
        data: () => ({
          orderId: 'PRONTO-123456',
          newStatus: 'TRANSFERENCIA_APROBADA',
          timestamp: '2026-09-17T11:00:00Z',
          reason: 'Aprobado por admin'
        })
      },
      {
        id: 'ev-1',
        data: () => ({
          orderId: 'PRONTO-123456',
          newStatus: 'PENDIENTE_TRANSFERENCIA',
          timestamp: '2026-09-17T10:00:00Z',
          reason: 'Creado por cliente'
        })
      }
    ]

    const mockDb = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            docs: mockDocs
          })
        })
      })
    }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(mockDb as any)

    const req = {
      method: 'GET',
      query: { orderId: 'PRONTO-123456' }
    } as unknown as VercelRequest

    await handler(req, mockRes as VercelResponse)
    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.history).toHaveLength(2)
    // Verify sorted chronologically
    expect(jsonOutput.history[0].id).toBe('ev-1')
    expect(jsonOutput.history[1].id).toBe('ev-2')
  })
})
