import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../../api/_lib/admin/approve-transfer'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

interface ApproveDbOptions {
  orderData?: Record<string, unknown> | null
  /** productId → catalog document (omit an id to simulate a deleted product). */
  products?: Record<string, Record<string, unknown> | null>
  directLookupMisses?: boolean
  onProductUpdate?: (data: Record<string, unknown>, productId: string) => void
  onOrderUpdate?: (data: Record<string, unknown>) => void
  onSet?: (data: Record<string, unknown>) => void
}

const DEFAULT_ORDER = {
  orderId: 'PRONTO-123',
  status: 'PENDIENTE_TRANSFERENCIA',
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

const DEFAULT_PRODUCT = {
  stockCount: 10,
  inStock: true,
  isActive: true,
  name: 'Turbina',
  sku: 'OD-101',
  price: 94995
}

/** Firestore Admin double for the transfer-approval transaction. */
function mockApproveDb(options: ApproveDbOptions = {}) {
  const {
    orderData = DEFAULT_ORDER,
    products = { 'odon-101': DEFAULT_PRODUCT },
    directLookupMisses = false,
    onProductUpdate,
    onOrderUpdate,
    onSet
  } = options

  const orderRef = {
    id: 'order-ref',
    get: vi.fn().mockResolvedValue(directLookupMisses ? { exists: false } : { exists: Boolean(orderData) })
  }

  const productRefs = new Map<string, { id: string }>()
  const refToProductId = new Map<unknown, string>()
  const productDataById = new Map<string, Record<string, unknown> | null>(Object.entries(products))

  const getProductRef = (id: string) => {
    let ref = productRefs.get(id)
    if (!ref) {
      ref = { id }
      productRefs.set(id, ref)
      refToProductId.set(ref, id)
    }
    return ref
  }
  for (const id of Object.keys(products)) getProductRef(id)

  const collection = vi.fn((name: string) => {
    if (name === 'orders') {
      return {
        doc: vi.fn(() => orderRef),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi
              .fn()
              .mockResolvedValue(
                directLookupMisses && orderData
                  ? { empty: false, docs: [{ ref: orderRef }] }
                  : { empty: true, docs: [] }
              )
          }))
        }))
      }
    }
    if (name === 'products') {
      return { doc: vi.fn((id: string) => getProductRef(id)) }
    }
    return { doc: vi.fn(() => ({ id: 'generated-id' })) }
  })

  const db = {
    collection,
    runTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const transaction = {
        get: vi.fn(async (ref: unknown) => {
          if (ref === orderRef) {
            return orderData ? { exists: true, data: () => orderData } : { exists: false }
          }
          const productId = refToProductId.get(ref)
          if (productId !== undefined) {
            const data = productDataById.get(productId)
            return data ? { exists: true, data: () => data } : { exists: false }
          }
          return { exists: false }
        }),
        update: vi.fn((ref: unknown, data: Record<string, unknown>) => {
          if (ref === orderRef) {
            onOrderUpdate?.(data)
            return
          }
          const productId = refToProductId.get(ref)
          if (productId !== undefined) onProductUpdate?.(data, productId)
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

describe('Serverless Admin Approve Transfer (/api/admin/approve-transfer)', () => {
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
    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(403)
    expect(jsonOutput.success).toBe(false)
  })

  it('rejects requests missing orderId with 400', async () => {
    const req = { method: 'POST', body: { reconciliationReference: 'cartola 30-09' } } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('orderId')
  })

  it('rejects requests missing the reconciliation reference with 400', async () => {
    const req = { method: 'POST', body: { orderId: 'PRONTO-123' } } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(400)
    expect(jsonOutput.error).toContain('reconciliationReference')
  })

  it('approves transfer, decrements stock, records the reference and updates status atomically', async () => {
    const captured: { update: Record<string, unknown> | null } = { update: null }
    const setDocs: Array<Record<string, unknown>> = []
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        onProductUpdate: (data) => (captured.update = data),
        onSet: (data) => setDocs.push(data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09, abono $189.990' }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.duplicate).toBe(false)
    expect(captured.update?.stockCount).toBe(8) // 10 − 2

    const historyDoc = setDocs.find((doc) => doc.newStatus === 'TRANSFERENCIA_APROBADA')
    expect(historyDoc?.metadata).toMatchObject({ reconciliationReference: 'cartola 30-09, abono $189.990' })
  })

  it('consolidates duplicate line items for the same product to decrement stock cumulatively', async () => {
    const captured: { update: Record<string, unknown> | null } = { update: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        orderData: {
          orderId: 'PRONTO-DUPLICATE',
          status: 'PENDIENTE_TRANSFERENCIA',
          totalAmount: 474975,
          customer: DEFAULT_ORDER.customer,
          items: [
            { productId: 'odon-101', quantity: 2 },
            { productId: 'odon-101', quantity: 3 }
          ]
        },
        onProductUpdate: (data) => (captured.update = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-DUPLICATE', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(captured.update?.stockCount).toBe(5) // 10 − (2 + 3)
  })

  it('falls back to the orderId query when the direct doc lookup misses', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({ directLookupMisses: true }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
  })

  it('rejects a WhatsApp quote order with 409 and writes nothing', async () => {
    const captured: { update: Record<string, unknown> | null } = { update: null }
    const setDocs: Array<Record<string, unknown>> = []
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        orderData: { ...DEFAULT_ORDER, status: 'COTIZACION_SOLICITADA_WHATSAPP' },
        onProductUpdate: (data) => (captured.update = data),
        onSet: (data) => setDocs.push(data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.success).toBe(false)
    expect(jsonOutput.currentStatus).toBe('COTIZACION_SOLICITADA_WHATSAPP')
    expect(captured.update).toBeNull()
    // A refused approval must not leave an audit or history event behind.
    expect(setDocs).toHaveLength(0)
  })

  it('approves a promo-discounted order when the stored total matches the discounted catalog total', async () => {
    const captured: { update: Record<string, unknown> | null } = { update: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        orderData: {
          ...DEFAULT_ORDER,
          promoCode: 'PRONTO10',
          // round(94995 × 0.90) × 2 = 170992 — the promo-aware expected total.
          totalAmount: 170992
        },
        onProductUpdate: (data) => (captured.update = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(captured.update?.stockCount).toBe(8)
  })

  it('rejects a promo order whose stored total is the undiscounted amount (409)', async () => {
    const captured: { update: Record<string, unknown> | null } = { update: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        orderData: { ...DEFAULT_ORDER, promoCode: 'PRONTO10', totalAmount: 189990 },
        onProductUpdate: (data) => (captured.update = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.error).toContain('total verificado')
    expect(captured.update).toBeNull()
  })

  it('rejects an order with no stored total (409, no writes)', async () => {
    const captured: { update: Record<string, unknown> | null } = { update: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        orderData: {
          orderId: 'PRONTO-123',
          status: 'PENDIENTE_TRANSFERENCIA',
          items: [{ productId: 'odon-101', quantity: 2 }]
        },
        onProductUpdate: (data) => (captured.update = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(captured.update).toBeNull()
  })

  it('rejects an already-dispatched order with 409 and no second deduction', async () => {
    const captured: { update: Record<string, unknown> | null } = { update: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        orderData: { ...DEFAULT_ORDER, status: 'DESPACHADO' },
        onProductUpdate: (data) => (captured.update = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(captured.update).toBeNull()
  })

  it('rejects an order carrying an approvedAt settlement marker with 409', async () => {
    const captured: { update: Record<string, unknown> | null } = { update: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        orderData: { ...DEFAULT_ORDER, approvedAt: '2026-09-01T12:00:00.000Z' },
        onProductUpdate: (data) => (captured.update = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.error).toContain('rebaja')
    expect(captured.update).toBeNull()
  })

  it('rejects an underpriced order when the stored total disagrees with the catalog (409)', async () => {
    const captured: { update: Record<string, unknown> | null } = { update: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        orderData: { ...DEFAULT_ORDER, totalAmount: 1 },
        onProductUpdate: (data) => (captured.update = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.error).toContain('total verificado')
    expect(captured.update).toBeNull()
  })

  it('fails closed with 409 when a catalog product no longer exists', async () => {
    const captured: { update: Record<string, unknown> | null } = { update: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        products: {},
        onProductUpdate: (data) => (captured.update = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.error).toContain('no existe en el catálogo')
    expect(captured.update).toBeNull()
  })

  it('refuses an out-of-zone commune with 409 and no stock movement', async () => {
    // Only a WhatsApp order may carry a commune outside the zones; a transfer
    // order with one is legacy or crafted and must never be approved.
    const captured: { update: Record<string, unknown> | null } = { update: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        orderData: {
          ...DEFAULT_ORDER,
          customer: {
            fullName: 'Dra. Andrea',
            email: 'andrea@clinica.cl',
            rut: '12345678-5',
            address: 'Calle 1',
            city: 'Curicó'
          }
        },
        onProductUpdate: (data) => (captured.update = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.error).toContain('fuera de zona')
    expect(captured.update).toBeNull()
  })

  it('rejects a San Antonio approval below the original-subtotal minimum with 409', async () => {
    // Catalog list subtotal $20.000 (2 × $10.000) — below the $60.000 San
    // Antonio minimum even though the stored total agrees with the catalog.
    const captured: { update: Record<string, unknown> | null } = { update: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        orderData: {
          orderId: 'PRONTO-SA-MIN',
          status: 'PENDIENTE_TRANSFERENCIA',
          totalAmount: 20000,
          customer: {
            fullName: 'Dra. Andrea',
            email: 'andrea@clinica.cl',
            rut: '12345678-5',
            address: 'Calle 1',
            city: 'San Antonio'
          },
          items: [{ productId: 'odon-101', name: 'Insumo Barato', quantity: 2, price: 10000 }]
        },
        products: { 'odon-101': { ...DEFAULT_PRODUCT, price: 10000 } },
        onProductUpdate: (data) => (captured.update = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-SA-MIN', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.error).toContain('compra mínima')
    expect(captured.update).toBeNull()
  })

  it('approves a San Antonio order at the minimum threshold', async () => {
    const captured: { update: Record<string, unknown> | null } = { update: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        orderData: {
          orderId: 'PRONTO-SA-OK',
          status: 'PENDIENTE_TRANSFERENCIA',
          totalAmount: 120000,
          customer: {
            fullName: 'Dra. Andrea',
            email: 'andrea@clinica.cl',
            rut: '12345678-5',
            address: 'Calle 1',
            city: 'San Antonio'
          },
          items: [{ productId: 'odon-101', name: 'Turbina', quantity: 2, price: 60000 }]
        },
        products: { 'odon-101': { ...DEFAULT_PRODUCT, price: 60000 } },
        onProductUpdate: (data) => (captured.update = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-SA-OK', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(captured.update?.stockCount).toBe(8)
  })

  it('is idempotent: an already-approved order returns duplicate with no stock movement', async () => {
    const captured: { update: Record<string, unknown> | null } = { update: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockApproveDb({
        orderData: { ...DEFAULT_ORDER, status: 'TRANSFERENCIA_APROBADA' },
        onProductUpdate: (data) => (captured.update = data)
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
    } as VercelRequest
    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.duplicate).toBe(true)
    expect(captured.update).toBeNull()
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

    const orderWithCustomer = {
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

    it('should send customer approval + warehouse alert emails after a successful approval', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockApproveDb({ orderData: orderWithCustomer }) as unknown as ReturnType<
          typeof firebaseAdminLib.getAdminFirestore
        >
      )

      const req = {
        method: 'POST',
        body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
      } as VercelRequest
      await handler(req, mockRes as VercelResponse)

      expect(statusOutput).toBe(200)
      expect(jsonOutput.success).toBe(true)

      const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))
      expect(resendCalls).toHaveLength(2)
      const recipients = resendCalls.map((c) => (JSON.parse(c[1]?.body as string).to as string[])[0])
      expect(recipients).toContain('andrea@clinica.cl')
      expect(recipients).toContain('bodega@prontoinsumos.com')
    })

    it('should record a stock shortfall in the audit/history metadata and the warehouse alert', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)

      const setDocs: Array<Record<string, unknown>> = []
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockApproveDb({
          orderData: {
            ...orderWithCustomer,
            orderId: 'PRONTO-SHORT',
            totalAmount: 284985,
            items: [{ productId: 'odon-101', name: 'Turbina', quantity: 3, price: 94995 }]
          },
          products: { 'odon-101': { stockCount: 1, inStock: true, isActive: true, name: 'Turbina', price: 94995 } },
          onSet: (data) => setDocs.push(data)
        }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
      )

      const req = {
        method: 'POST',
        body: { orderId: 'PRONTO-SHORT', reconciliationReference: 'cartola 30-09' }
      } as VercelRequest
      await handler(req, mockRes as VercelResponse)

      expect(statusOutput).toBe(200)
      expect(jsonOutput.success).toBe(true)

      const auditDoc = setDocs.find((doc) => doc.changeType === 'ORDER_FULFILLMENT_DEDUCTION')
      const historyDoc = setDocs.find((doc) => doc.newStatus === 'TRANSFERENCIA_APROBADA')
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

    it('should still return 200 when email sending fails (non-blocking)', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('resend down'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockApproveDb({ orderData: orderWithCustomer }) as unknown as ReturnType<
          typeof firebaseAdminLib.getAdminFirestore
        >
      )

      const req = {
        method: 'POST',
        body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
      } as VercelRequest
      await handler(req, mockRes as VercelResponse)

      expect(statusOutput).toBe(200)
      expect(jsonOutput.success).toBe(true)
    })

    it('stamps the payment-email sent marker on the order after the customer notice goes out', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      const orderUpdates: Array<Record<string, unknown>> = []
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockApproveDb({
          orderData: orderWithCustomer,
          onOrderUpdate: (data) => orderUpdates.push(data)
        }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
      )

      const req = {
        method: 'POST',
        body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
      } as VercelRequest
      await handler(req, mockRes as VercelResponse)

      expect(statusOutput).toBe(200)
      const stamp = orderUpdates.find((data) => 'emailDelivery.payment.sentAt' in data)
      expect(stamp?.['emailDelivery.payment.sentAt']).toEqual(expect.any(String))
    })

    it('records the payment-email failure on the order — the approval is never rolled back', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('resend down'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const orderUpdates: Array<Record<string, unknown>> = []
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockApproveDb({
          orderData: orderWithCustomer,
          onOrderUpdate: (data) => orderUpdates.push(data)
        }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
      )

      const req = {
        method: 'POST',
        body: { orderId: 'PRONTO-123', reconciliationReference: 'cartola 30-09' }
      } as VercelRequest
      await handler(req, mockRes as VercelResponse)

      // The approval stands; the failure is stamped for the operator to retry.
      expect(statusOutput).toBe(200)
      expect(jsonOutput.success).toBe(true)
      expect(orderUpdates.some((data) => data.status === 'TRANSFERENCIA_APROBADA')).toBe(true)
      const stamp = orderUpdates.find((data) => 'emailDelivery.payment.failedAt' in data)
      expect(stamp?.['emailDelivery.payment.failedAt']).toEqual(expect.any(String))
      expect(stamp?.['emailDelivery.payment.failureReason']).toEqual(expect.any(String))
    })
  })
})
