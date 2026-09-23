import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

    const mockOrderRef = {
      get: vi.fn().mockResolvedValue({ exists: true })
    }
    const mockProductRef = {}

    const mockAuditRef = { id: 'audit-123' }
    const mockHistoryRef = { id: 'osh-123' }

    let updateMock: ReturnType<typeof vi.fn> | undefined

    const mockDb = {
      collection: vi.fn((name: string) => {
        if (name === 'orders') {
          return {
            doc: vi.fn(() => mockOrderRef),
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn().mockResolvedValue({ empty: false, docs: [{ ref: mockOrderRef }] })
              }))
            }))
          }
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
        updateMock = vi.fn()
        const mockTransaction = {
          get: vi.fn(async (ref: unknown) => {
            if (ref === mockOrderRef) {
              return { exists: true, data: () => mockOrderData }
            }
            if (ref === mockProductRef) {
              return { exists: true, data: () => mockProductData }
            }
            return { exists: false }
          }),
          update: updateMock,
          set: vi.fn()
        }
        return await callback(mockTransaction)
      })
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = { method: 'POST', body: { orderId: 'PRONTO-123' } } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.duplicate).toBe(false)
  })

  it('consolidates duplicate line items for the same product to decrement stock cumulatively', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockOrderData = {
      orderId: 'PRONTO-DUPLICATE',
      status: 'PENDIENTE_TRANSFERENCIA',
      items: [
        { productId: 'odon-101', quantity: 2 },
        { productId: 'odon-101', quantity: 3 }
      ]
    }

    const mockProductData = {
      stockCount: 10,
      inStock: true
    }

    const mockOrderRef = {
      get: vi.fn().mockResolvedValue({ exists: true })
    }
    const mockProductRef = {}
    const capturedProductUpdate: { current: Record<string, unknown> | null } = { current: null }

    const mockDb = {
      collection: vi.fn((name: string) => {
        if (name === 'orders') return { doc: vi.fn(() => mockOrderRef) }
        if (name === 'products') return { doc: vi.fn(() => mockProductRef) }
        return { doc: vi.fn(() => ({ id: 'mock-id' })) }
      }),
      runTransaction: vi.fn(async (callback) => {
        const mockTransaction = {
          get: vi.fn(async (ref: unknown) => {
            if (ref === mockOrderRef) return { exists: true, data: () => mockOrderData }
            if (ref === mockProductRef) return { exists: true, data: () => mockProductData }
            return { exists: false }
          }),
          update: vi.fn((ref, data) => {
            if (ref === mockProductRef) {
              capturedProductUpdate.current = data
            }
          }),
          set: vi.fn()
        }
        return await callback(mockTransaction)
      })
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = { method: 'POST', body: { orderId: 'PRONTO-DUPLICATE' } } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    // Initial 10 stock minus (2 + 3) = 5
    expect(capturedProductUpdate.current).not.toBeNull()
    expect(capturedProductUpdate.current?.stockCount).toBe(5)
  })

  it('falls back to query by orderId if direct doc lookup returns exists: false', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockOrderData = {
      orderId: 'PRONTO-FALLBACK',
      status: 'PENDIENTE_TRANSFERENCIA',
      items: [{ productId: 'odon-101', quantity: 1 }]
    }

    const directDocRef = {
      get: vi.fn().mockResolvedValue({ exists: false })
    }
    const queriedDocRef = {
      get: vi.fn().mockResolvedValue({ exists: true })
    }

    const mockDb = {
      collection: vi.fn((name: string) => {
        if (name === 'orders') {
          return {
            doc: vi.fn(() => directDocRef),
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn().mockResolvedValue({
                  empty: false,
                  docs: [{ ref: queriedDocRef }]
                })
              }))
            }))
          }
        }
        return { doc: vi.fn(() => ({ id: 'mock-id' })) }
      }),
      runTransaction: vi.fn(async (callback) => {
        const mockTransaction = {
          get: vi.fn(async (ref: unknown) => {
            if (ref === queriedDocRef) return { exists: true, data: () => mockOrderData }
            return { exists: true, data: () => ({ stockCount: 5, inStock: true }) }
          }),
          update: vi.fn(),
          set: vi.fn()
        }
        return await callback(mockTransaction)
      })
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = { method: 'POST', body: { orderId: 'PRONTO-FALLBACK' } } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
  })

  describe('Transactional Emails on Approval (Resend)', () => {
    let resendKeyBackup: string | undefined
    let warehouseBackup: string | undefined

    beforeEach(() => {
      resendKeyBackup = process.env.RESEND_API_KEY
      warehouseBackup = process.env.WAREHOUSE_NOTIFICATION_EMAIL
      delete process.env.RESEND_API_KEY
      delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
    })

    afterEach(() => {
      if (resendKeyBackup === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = resendKeyBackup
      if (warehouseBackup === undefined) delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
      else process.env.WAREHOUSE_NOTIFICATION_EMAIL = warehouseBackup
    })

    function mockApprovableOrderDb() {
      const mockOrderData = {
        orderId: 'PRONTO-123',
        status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
        totalAmount: 189990,
        items: [{ productId: 'odon-101', name: 'Turbina', quantity: 2, price: 94995 }],
        customer: {
          fullName: 'Dra. Andrea',
          email: 'andrea@clinica.cl',
          rut: '12345678-5',
          address: 'Calle 1',
          city: 'Melipilla'
        }
      }
      const mockOrderRef = { get: vi.fn().mockResolvedValue({ exists: true }) }
      const mockProductRef = {}
      const mockDb = {
        collection: vi.fn((name: string) => {
          if (name === 'orders') return { doc: vi.fn(() => mockOrderRef) }
          if (name === 'products') return { doc: vi.fn(() => mockProductRef) }
          return { doc: vi.fn(() => ({ id: 'mock-id' })) }
        }),
        runTransaction: vi.fn(async (callback) => {
          const mockTransaction = {
            get: vi.fn(async (ref: unknown) => {
              if (ref === mockOrderRef) return { exists: true, data: () => mockOrderData }
              if (ref === mockProductRef) return { exists: true, data: () => ({ stockCount: 10, inStock: true }) }
              return { exists: false }
            }),
            update: vi.fn(),
            set: vi.fn()
          }
          return await callback(mockTransaction)
        })
      }
      return mockDb
    }

    it('should send customer approval + warehouse alert emails after a successful approval', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockApprovableOrderDb() as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
      )

      const req = { method: 'POST', body: { orderId: 'PRONTO-123' } } as VercelRequest
      await handler(req, mockRes as VercelResponse)

      expect(statusOutput).toBe(200)
      expect(jsonOutput.success).toBe(true)

      const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))
      expect(resendCalls).toHaveLength(2)
      const recipients = resendCalls.map((c) => (JSON.parse(c[1]?.body as string).to as string[])[0])
      expect(recipients).toContain('andrea@clinica.cl')
      expect(recipients).toContain('bodega@prontoinsumos.com')
    })

    it('should still return 200 when email sending fails (non-blocking)', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('resend down'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockApprovableOrderDb() as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
      )

      const req = { method: 'POST', body: { orderId: 'PRONTO-123' } } as VercelRequest
      await handler(req, mockRes as VercelResponse)

      expect(statusOutput).toBe(200)
      expect(jsonOutput.success).toBe(true)
    })
  })
})
