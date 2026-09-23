import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from '../../../../api/admin/dashboard-stats'
import * as adminAuth from '../../../../api/lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

describe('Serverless Admin Dashboard Stats (/api/admin/dashboard-stats)', () => {
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
    const req = { method: 'GET' } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(403)
    expect(jsonOutput.success).toBe(false)
  })

  it('aggregates daily sales matching Chilean calendar date (America/Santiago)', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    // Determine current Chilean date
    const todayChile = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())

    const mockOrders = [
      {
        data: () => ({
          status: 'PAGADO_MERCADOPAGO',
          totalAmount: 150000,
          createdAt: `${todayChile}T15:00:00-03:00`,
          paidAt: `${todayChile}T15:05:00-03:00`
        })
      },
      {
        data: () => ({
          status: 'PENDIENTE_TRANSFERENCIA',
          totalAmount: 80000,
          createdAt: `${todayChile}T10:00:00-03:00`
        })
      }
    ]

    const mockProducts = [
      {
        data: () => ({
          stockCount: 2,
          inStock: true,
          isActive: true
        })
      }
    ]

    const mockDb = {
      collection: vi.fn((name: string) => ({
        get: vi.fn().mockResolvedValue({
          forEach: (cb: (doc: unknown) => void) => {
            if (name === 'orders') mockOrders.forEach(cb)
            if (name === 'products') mockProducts.forEach(cb)
          }
        })
      }))
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = { method: 'GET' } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    const stats = jsonOutput.stats as Record<string, unknown>
    expect(stats.salesToday).toBe(150000)
    expect(stats.pendingOrders).toBe(1)
    expect(stats.lowStockProducts).toBe(1)
    expect(stats.ordersThisMonth).toBe(2)
  })
})
