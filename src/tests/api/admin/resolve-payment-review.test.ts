import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../../api/_lib/admin/resolve-payment-review'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

interface MockDbOptions {
  orderData?: Record<string, unknown> | null
  productData?: Record<string, unknown> | null
  directLookupMisses?: boolean
  onProductUpdate?: (data: Record<string, unknown>) => void
  onOrderUpdate?: (data: Record<string, unknown>) => void
  onSet?: (data: Record<string, unknown>) => void
}

/** Firestore Admin double for the review-resolution transaction. */
function mockReviewDb(options: MockDbOptions = {}) {
  const {
    orderData = {
      orderId: 'PRONTO-123456',
      status: 'PAGO_EN_REVISION',
      items: [{ productId: 'odon-101', quantity: 2 }]
    },
    productData = { stockCount: 10, inStock: true, name: 'Turbina', sku: 'OD-101' },
    directLookupMisses = false,
    onProductUpdate,
    onOrderUpdate,
    onSet
  } = options

  // The handler performs a direct doc read before entering the transaction.
  const mockOrderRef = {
    id: 'order-ref',
    get: vi.fn().mockResolvedValue(directLookupMisses ? { exists: false } : { exists: Boolean(orderData) })
  }
  const mockProductRef = { id: 'product-ref' }

  const collection = vi.fn((name: string) => {
    if (name === 'orders') {
      return {
        doc: vi.fn(() => mockOrderRef),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi
              .fn()
              .mockResolvedValue(
                directLookupMisses && orderData
                  ? { empty: false, docs: [{ ref: mockOrderRef }] }
                  : { empty: true, docs: [] }
              )
          }))
        }))
      }
    }
    if (name === 'products') return { doc: vi.fn(() => mockProductRef) }
    return { doc: vi.fn(() => ({ id: 'generated-id' })) }
  })

  const db = {
    collection,
    runTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const transaction = {
        get: vi.fn(async (ref: unknown) => {
          if (ref === mockOrderRef) {
            return orderData ? { exists: true, data: () => orderData } : { exists: false }
          }
          if (ref === mockProductRef) {
            return productData ? { exists: true, data: () => productData } : { exists: false }
          }
          return { exists: false }
        }),
        update: vi.fn((ref: unknown, data: Record<string, unknown>) => {
          if (ref === mockOrderRef) onOrderUpdate?.(data)
          if (ref === mockProductRef) onProductUpdate?.(data)
        }),
        set: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
          onSet?.(data)
        })
      }
      return await callback(transaction)
    })
  }

  return db
}

describe('Serverless Admin Resolve Payment Review (/api/admin/resolve-payment-review)', () => {
  let mockRes: Partial<VercelResponse>
  let jsonOutput: Record<string, unknown> = {}
  let statusOutput: number

  beforeEach(() => {
    vi.clearAllMocks()
    jsonOutput = {}
    statusOutput = 200
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({
      authenticated: true,
      uid: 'admin-1',
      email: 'admin@prontoinsumos.cl'
    })

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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('handles the OPTIONS preflight with 200', async () => {
    await handler({ method: 'OPTIONS' } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(mockRes.end).toHaveBeenCalled()
  })

  it('rejects non-POST methods with 405', async () => {
    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(405)
    expect(jsonOutput.success).toBe(false)
  })

  it('rejects unauthenticated requests with 403', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: false, error: 'Unauthorized' })

    await handler(
      {
        method: 'POST',
        body: { orderId: 'PRONTO-1', resolution: 'approve', notes: 'Conciliado contra cartola' }
      } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(403)
    expect(jsonOutput.success).toBe(false)
  })

  it('rejects a missing orderId with 400', async () => {
    await handler({ method: 'POST', body: { resolution: 'approve' } } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('orderId')
  })

  it('rejects an unknown resolution with 400', async () => {
    await handler(
      { method: 'POST', body: { orderId: 'PRONTO-1', resolution: 'refund' } } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('resolution')
  })

  it('refuses to approve without an operator note (400)', async () => {
    await handler(
      { method: 'POST', body: { orderId: 'PRONTO-123456', resolution: 'approve' } } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('nota de conciliación')
  })

  it('returns 500 when Firestore Admin is unavailable', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(null)

    await handler(
      {
        method: 'POST',
        body: { orderId: 'PRONTO-1', resolution: 'approve', notes: 'Conciliado contra cartola' }
      } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(500)
    expect(jsonOutput.success).toBe(false)
  })

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockReviewDb({ orderData: null }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      {
        method: 'POST',
        body: { orderId: 'PRONTO-GHOST', resolution: 'approve', notes: 'Conciliado contra cartola' }
      } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(404)
    expect(jsonOutput.error).toContain('no encontrado')
  })

  it('approves: marks PAGADO_MERCADOPAGO and decrements stock in the same transaction', async () => {
    const captured: { current: Record<string, unknown> | null } = { current: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockReviewDb({ onProductUpdate: (data) => (captured.current = data) }) as unknown as ReturnType<
        typeof firebaseAdminLib.getAdminFirestore
      >
    )

    await handler(
      {
        method: 'POST',
        body: { orderId: 'PRONTO-123456', resolution: 'approve', notes: 'Conciliado contra cartola' }
      } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.resolution).toBe('approve')
    expect(captured.current?.stockCount).toBe(8) // 10 − 2
    expect(captured.current?.inStock).toBe(true)
  })

  it.each([
    ['a fractional quantity', 2.5, 7],
    ['a NaN quantity', Number.NaN, 9]
  ])('normalizes %s instead of writing a corrupt stock count', async (_label, quantity, expectedStock) => {
    const captured: { current: Record<string, unknown> | null } = { current: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockReviewDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'PAGO_EN_REVISION',
          items: [{ productId: 'odon-101', quantity }]
        },
        onProductUpdate: (data) => (captured.current = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      {
        method: 'POST',
        body: { orderId: 'PRONTO-123456', resolution: 'approve', notes: 'Conciliado' }
      } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(captured.current?.stockCount).toBe(expectedStock)
    expect(Number.isInteger(captured.current?.stockCount)).toBe(true)
  })

  it('approves through the orderId query fallback when the direct doc key misses', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockReviewDb({ directLookupMisses: true }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      {
        method: 'POST',
        body: { orderId: 'PRONTO-123456', resolution: 'approve', notes: 'Conciliado contra cartola' }
      } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
  })

  it('approve is idempotent: an already-paid order is a duplicate with no stock movement', async () => {
    const captured: { current: Record<string, unknown> | null } = { current: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockReviewDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'PAGADO_MERCADOPAGO',
          items: [{ productId: 'odon-101', quantity: 2 }]
        },
        onProductUpdate: (data) => (captured.current = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      {
        method: 'POST',
        body: { orderId: 'PRONTO-123456', resolution: 'approve', notes: 'Conciliado contra cartola' }
      } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(jsonOutput.duplicate).toBe(true)
    expect(captured.current).toBeNull()
  })

  it('cancels: closes the order as CANCELADO without touching stock', async () => {
    const captured: { current: Record<string, unknown> | null } = { current: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockReviewDb({ onProductUpdate: (data) => (captured.current = data) }) as unknown as ReturnType<
        typeof firebaseAdminLib.getAdminFirestore
      >
    )

    await handler(
      {
        method: 'POST',
        body: { orderId: 'PRONTO-123456', resolution: 'cancel', notes: 'Cliente solicitó anulación' }
      } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.resolution).toBe('cancel')
    expect(jsonOutput.status).toBe('CANCELADO')
    expect(captured.current).toBeNull()
  })

  it('cancel is idempotent on an already-cancelled order', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockReviewDb({
        orderData: { orderId: 'PRONTO-123456', status: 'CANCELADO', items: [] }
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'POST', body: { orderId: 'PRONTO-123456', resolution: 'cancel' } } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(jsonOutput.duplicate).toBe(true)
  })

  it('refuses with 409 when the order is not in payment review', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockReviewDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'PENDIENTE_TRANSFERENCIA',
          items: [{ productId: 'odon-101', quantity: 1 }]
        }
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      {
        method: 'POST',
        body: { orderId: 'PRONTO-123456', resolution: 'approve', notes: 'Conciliado contra cartola' }
      } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(409)
    expect(jsonOutput.success).toBe(false)
    expect(jsonOutput.currentStatus).toBe('PENDIENTE_TRANSFERENCIA')
  })

  it('never cancels a paid order (409, no writes)', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockReviewDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'PAGADO_MERCADOPAGO',
          items: [{ productId: 'odon-101', quantity: 1 }]
        }
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'POST', body: { orderId: 'PRONTO-123456', resolution: 'cancel' } } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(409)
    expect(jsonOutput.currentStatus).toBe('PAGADO_MERCADOPAGO')
  })

  it('refuses to approve (409) when the order already carries a settlement marker (R1)', async () => {
    // A refunded payment parks the order in review while paidAt survives: the
    // stock was already deducted once, so approving must never deduct again.
    const captured: { current: Record<string, unknown> | null } = { current: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockReviewDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'PAGO_EN_REVISION',
          paidAt: '2026-09-01T12:00:00.000Z',
          items: [{ productId: 'odon-101', quantity: 2 }]
        },
        onProductUpdate: (data) => (captured.current = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      {
        method: 'POST',
        body: { orderId: 'PRONTO-123456', resolution: 'approve', notes: 'Conciliado contra cartola' }
      } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(409)
    expect(jsonOutput.success).toBe(false)
    expect(jsonOutput.error).toContain('stock rebajado')
    expect(captured.current).toBeNull()
  })

  it('still cancels a settled-in-review order — the correct resolution for a refund (R1)', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockReviewDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'PAGO_EN_REVISION',
          paidAt: '2026-09-01T12:00:00.000Z',
          items: [{ productId: 'odon-101', quantity: 2 }]
        }
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'POST', body: { orderId: 'PRONTO-123456', resolution: 'cancel' } } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.status).toBe('CANCELADO')
  })

  describe('Transactional emails (Resend)', () => {
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

    const orderWithCustomer = {
      orderId: 'PRONTO-123456',
      status: 'PAGO_EN_REVISION',
      totalAmount: 379980,
      items: [{ productId: 'odon-101', name: 'Turbina', quantity: 2, price: 189990 }],
      customer: {
        fullName: 'Dra. Andrea',
        email: 'andrea@clinica.cl',
        rut: '12345678-5',
        address: 'Calle 1',
        city: 'Melipilla'
      }
    }

    it('approve notifies the customer and the warehouse', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockReviewDb({ orderData: orderWithCustomer }) as unknown as ReturnType<
          typeof firebaseAdminLib.getAdminFirestore
        >
      )

      await handler(
        {
          method: 'POST',
          body: { orderId: 'PRONTO-123456', resolution: 'approve', notes: 'Conciliado contra cartola' }
        } as VercelRequest,
        mockRes as VercelResponse
      )

      expect(statusOutput).toBe(200)
      const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))
      expect(resendCalls).toHaveLength(2)
      const recipients = resendCalls.map((c) => (JSON.parse(c[1]?.body as string).to as string[])[0])
      expect(recipients).toContain('andrea@clinica.cl')
      expect(recipients).toContain('bodega@prontoinsumos.com')
    })

    it('cancel alerts the warehouse only — the customer contact stays manual', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockReviewDb({ orderData: orderWithCustomer }) as unknown as ReturnType<
          typeof firebaseAdminLib.getAdminFirestore
        >
      )

      await handler(
        { method: 'POST', body: { orderId: 'PRONTO-123456', resolution: 'cancel' } } as VercelRequest,
        mockRes as VercelResponse
      )

      expect(statusOutput).toBe(200)
      const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))
      expect(resendCalls).toHaveLength(1)
      const recipients = resendCalls.map((c) => (JSON.parse(c[1]?.body as string).to as string[])[0])
      expect(recipients).toEqual(['bodega@prontoinsumos.com'])
    })

    it('approve records a stock shortfall in the audit/history metadata and the warehouse alert (Task 0.14e)', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)

      const setDocs: Array<Record<string, unknown>> = []
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockReviewDb({
          orderData: {
            ...orderWithCustomer,
            totalAmount: 569970,
            items: [{ productId: 'odon-101', name: 'Turbina', quantity: 3, price: 189990 }]
          },
          productData: { stockCount: 1, inStock: true, name: 'Turbina', sku: 'OD-101' },
          onSet: (data) => setDocs.push(data)
        }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
      )

      await handler(
        {
          method: 'POST',
          body: { orderId: 'PRONTO-123456', resolution: 'approve', notes: 'Conciliado contra cartola' }
        } as VercelRequest,
        mockRes as VercelResponse
      )

      expect(statusOutput).toBe(200)
      expect(jsonOutput.success).toBe(true)

      const auditDoc = setDocs.find((doc) => doc.changeType === 'ORDER_FULFILLMENT_DEDUCTION')
      const historyDoc = setDocs.find((doc) => doc.newStatus === 'PAGADO_MERCADOPAGO')
      expect(auditDoc?.metadata).toMatchObject({ stockShortfall: 2 })
      expect(historyDoc?.metadata).toMatchObject({
        stockShortfalls: [{ productId: 'odon-101', name: 'Turbina', requested: 3, available: 1 }]
      })

      const warehouseSend = fetchSpy.mock.calls
        .filter((c) => String(c[0]).includes('api.resend.com'))
        .find((c) => (JSON.parse(c[1]?.body as string).to as string[])[0] === 'bodega@prontoinsumos.com')
      expect(warehouseSend).toBeDefined()
      const payload = JSON.parse(warehouseSend?.[1]?.body as string)
      expect(payload.text).toContain('Stock insuficiente')
    })

    it('still returns 200 when the email provider is down', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('resend down'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockReviewDb({ orderData: orderWithCustomer }) as unknown as ReturnType<
          typeof firebaseAdminLib.getAdminFirestore
        >
      )

      await handler(
        {
          method: 'POST',
          body: { orderId: 'PRONTO-123456', resolution: 'approve', notes: 'Conciliado contra cartola' }
        } as VercelRequest,
        mockRes as VercelResponse
      )

      expect(statusOutput).toBe(200)
      expect(jsonOutput.success).toBe(true)
    })

    it('stamps the payment-email result on the order — a failed send is recorded, the resolution stands', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('resend down'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const orderUpdates: Array<Record<string, unknown>> = []
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockReviewDb({
          orderData: orderWithCustomer,
          onOrderUpdate: (data) => orderUpdates.push(data)
        }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
      )

      await handler(
        {
          method: 'POST',
          body: { orderId: 'PRONTO-123456', resolution: 'approve', notes: 'Conciliado contra cartola' }
        } as VercelRequest,
        mockRes as VercelResponse
      )

      expect(statusOutput).toBe(200)
      expect(jsonOutput.success).toBe(true)
      expect(orderUpdates.some((data) => data.status === 'PAGADO_MERCADOPAGO')).toBe(true)
      const stamp = orderUpdates.find((data) => 'emailDelivery.payment.failedAt' in data)
      expect(stamp?.['emailDelivery.payment.failedAt']).toEqual(expect.any(String))
      expect(stamp?.['emailDelivery.payment.failureReason']).toEqual(expect.any(String))
    })
  })
})
