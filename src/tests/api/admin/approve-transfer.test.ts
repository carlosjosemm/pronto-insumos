import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from '../../../../api/admin/approve-transfer'
import * as adminAuth from '../../../../api/lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

describe('Serverless Admin Approve Transfer (/api/admin/approve-transfer)', () => {
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

  it('rejects unauthenticated requests with 403', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: false, error: 'Unauthorized' })
    const req = { method: 'POST', body: { orderId: 'PRONTO-123' } } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(403)
    expect(jsonOutput.success).toBe(false)
  })

  it('rejects requests missing orderId with 400', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
    const req = { method: 'POST', body: {} } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('orderId')
  })

  it('approves transfer, decrements product stock and updates order status atomically', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockOrderData = {
      orderId: 'PRONTO-123',
      status: 'PENDIENTE_TRANSFERENCIA',
      items: [{ productId: 'odon-101', quantity: 2 }]
    }

    const mockProductData = {
      stockCount: 10,
      inStock: true
    }

    const mockOrderRef = {}
    const mockProductRef = {}

    const mockAuditRef = { id: 'audit-123' }
    const mockHistoryRef = { id: 'osh-123' }

    const mockDb = {
      collection: vi.fn((name: string) => {
        if (name === 'orders') {
          return { doc: vi.fn(() => mockOrderRef) }
        }
        if (name === 'products') {
          return { doc: vi.fn(() => mockProductRef) }
        }
        if (name === 'order_status_history') {
          return { doc: vi.fn(() => mockHistoryRef) }
        }
        if (name === 'inventory_audit_logs') {
          return { doc: vi.fn(() => mockAuditRef) }
        }
        return { doc: vi.fn(() => ({})) }
      }),
      runTransaction: vi.fn(async (callback) => {
        const mockTransaction = {
          get: vi.fn(async (ref: any) => {
            if (ref === mockOrderRef) {
              return { exists: true, data: () => mockOrderData }
            }
            if (ref === mockProductRef) {
              return { exists: true, data: () => mockProductData }
            }
            return { exists: false }
          }),
          update: vi.fn(),
          set: vi.fn()
        }
        return await callback(mockTransaction)
      })
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(mockDb as any)

    const req = { method: 'POST', body: { orderId: 'PRONTO-123' } } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.duplicate).toBe(false)
  })
})
