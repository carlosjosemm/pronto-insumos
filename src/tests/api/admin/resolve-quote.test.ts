import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../../api/_lib/admin/resolve-quote'
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
  onOrderUpdate?: (data: Record<string, unknown>) => void
  onProductUpdate?: (data: Record<string, unknown>) => void
  onSet?: (data: Record<string, unknown>) => void
}

/** Firestore Admin double for the quote-resolution transaction. */
function mockQuoteDb(options: MockDbOptions = {}) {
  const {
    orderData = {
      orderId: 'PRONTO-123456',
      status: 'COTIZACION_SOLICITADA_WHATSAPP',
      paymentMethod: 'whatsapp',
      totalAmount: 379980,
      items: [{ productId: 'odon-101', name: 'Turbina', quantity: 2, price: 189990 }],
      customer: { fullName: 'Dra. Camila Fuentes', email: 'contacto@fuentesdental.cl', rut: '12345678-5' }
    },
    productData = { stockCount: 10, inStock: true, name: 'Turbina', sku: 'OD-101', price: 189990 },
    directLookupMisses = false,
    onOrderUpdate,
    onProductUpdate,
    onSet
  } = options

  // The handler performs a direct doc read before entering the transaction.
  const mockOrderRef = {
    id: 'order-ref',
    get: vi.fn().mockResolvedValue(directLookupMisses ? { exists: false } : { exists: Boolean(orderData) })
  }
  const mockProductRef = { id: 'product-ref' }
  const productReads: unknown[] = []

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
            productReads.push(ref)
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

  return { db, productReads }
}

describe('Serverless Admin Resolve Quote (/api/admin/resolve-quote)', () => {
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

  const convertBody = {
    orderId: 'PRONTO-123456',
    resolution: 'convert',
    reconciliationReference: 'cartola 30-09 abono $379.980'
  }
  const declineBody = { orderId: 'PRONTO-123456', resolution: 'decline', notes: 'Cliente desistió' }

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

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(403)
    expect(jsonOutput.success).toBe(false)
  })

  it('rejects a missing orderId with 400', async () => {
    await handler({ method: 'POST', body: { resolution: 'convert' } } as VercelRequest, mockRes as VercelResponse)

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

  it('refuses to convert without an operator reconciliation reference (400)', async () => {
    for (const reference of [undefined, '', '   ']) {
      await handler(
        {
          method: 'POST',
          body: { orderId: 'PRONTO-123456', resolution: 'convert', reconciliationReference: reference }
        } as VercelRequest,
        mockRes as VercelResponse
      )

      expect(statusOutput, `reference ${JSON.stringify(reference)} must be refused`).toBe(400)
      expect(jsonOutput.error).toContain('reconciliationReference')
    }
  })

  it('returns 500 when Firestore Admin is unavailable', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(null)

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(500)
    expect(jsonOutput.success).toBe(false)
  })

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({ orderData: null }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'POST', body: { orderId: 'PRONTO-GHOST', resolution: 'decline' } } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(404)
    expect(jsonOutput.error).toContain('no encontrado')
  })

  it('converts: marks PAGADO_TRANSFERENCIA, stamps the resolution and decrements stock in the same transaction', async () => {
    const captured: { order: Record<string, unknown> | null; product: Record<string, unknown> | null } = {
      order: null,
      product: null
    }
    const setDocs: Array<Record<string, unknown>> = []
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        // The conversion write is the order update that carries `status` —
        // the post-commit email-telemetry stamp is a separate update.
        onOrderUpdate: (data) => {
          if (typeof data.status === 'string') captured.order = data
        },
        onProductUpdate: (data) => (captured.product = data),
        onSet: (data) => setDocs.push(data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.resolution).toBe('convert')
    expect(jsonOutput.status).toBe('PAGADO_TRANSFERENCIA')
    expect(captured.product?.stockCount).toBe(8) // 10 − 2
    expect(captured.product?.inStock).toBe(true)
    expect(captured.order?.status).toBe('PAGADO_TRANSFERENCIA')
    expect(captured.order?.quoteResolution).toBe('CONVERTIDA')
    expect(typeof captured.order?.quoteResolvedAt).toBe('string')
    expect(captured.order?.quoteResolvedBy).toBe('admin@prontoinsumos.cl')
    expect(typeof captured.order?.approvedAt).toBe('string')

    const audit = setDocs.find((d) => d.changeType === 'ORDER_FULFILLMENT_DEDUCTION')
    expect(audit?.reasonCode).toBe('venta_manual')
    expect(audit?.metadata).toMatchObject({ orderId: 'PRONTO-123456', quoteResolution: 'CONVERTIDA' })

    const history = setDocs.find((d) => d.newStatus === 'PAGADO_TRANSFERENCIA')
    expect(history?.previousStatus).toBe('COTIZACION_SOLICITADA_WHATSAPP')
    expect(history?.metadata).toMatchObject({
      quoteResolution: 'CONVERTIDA',
      reconciliationReference: 'cartola 30-09 abono $379.980',
      orderTotalAmount: 379980
    })
  })

  it('converts through the orderId query fallback when the direct doc key misses', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({ directLookupMisses: true }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
  })

  it('convert is idempotent: an already-converted quote is a duplicate with no stock movement', async () => {
    const captured: { order: Record<string, unknown> | null; product: Record<string, unknown> | null } = {
      order: null,
      product: null
    }
    const setDocs: Array<Record<string, unknown>> = []
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'PAGADO_TRANSFERENCIA',
          paymentMethod: 'whatsapp',
          totalAmount: 379980,
          items: [{ productId: 'odon-101', quantity: 2 }]
        },
        onOrderUpdate: (data) => (captured.order = data),
        onProductUpdate: (data) => (captured.product = data),
        onSet: (data) => setDocs.push(data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.duplicate).toBe(true)
    expect(captured.order).toBeNull()
    expect(captured.product).toBeNull()
    expect(setDocs).toHaveLength(0)
  })

  it('refuses with 409 when the order is not a pending quote', async () => {
    const setDocs: Array<Record<string, unknown>> = []
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'PENDIENTE_TRANSFERENCIA',
          totalAmount: 379980,
          items: [{ productId: 'odon-101', quantity: 2 }]
        },
        onSet: (data) => setDocs.push(data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.success).toBe(false)
    expect(jsonOutput.currentStatus).toBe('PENDIENTE_TRANSFERENCIA')
    expect(setDocs).toHaveLength(0)
  })

  it('refuses to convert (409) when the order already carries a settlement marker', async () => {
    const captured: { product: Record<string, unknown> | null } = { product: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'COTIZACION_SOLICITADA_WHATSAPP',
          approvedAt: '2026-09-01T12:00:00.000Z',
          totalAmount: 379980,
          items: [{ productId: 'odon-101', quantity: 2 }]
        },
        onProductUpdate: (data) => (captured.product = data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.error).toContain('no se rebaja stock por segunda vez')
    expect(captured.product).toBeNull()
  })

  it('fails closed when a quoted product no longer exists in the catalog', async () => {
    const captured: { order: Record<string, unknown> | null } = { order: null }
    const setDocs: Array<Record<string, unknown>> = []
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        productData: null,
        onOrderUpdate: (data) => (captured.order = data),
        onSet: (data) => setDocs.push(data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.error).toContain('no existe en el catálogo')
    expect(captured.order).toBeNull()
    expect(setDocs).toHaveLength(0)
  })

  it('fails closed when a quoted product has no valid catalog price', async () => {
    const captured: { order: Record<string, unknown> | null } = { order: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        productData: { stockCount: 10, inStock: true, name: 'Turbina', price: 0 },
        onOrderUpdate: (data) => (captured.order = data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.error).toContain('precio de catálogo válido')
    expect(captured.order).toBeNull()
  })

  it('refuses the conversion when the stored total disagrees with the catalog-recomputed total', async () => {
    const captured: { order: Record<string, unknown> | null; product: Record<string, unknown> | null } = {
      order: null,
      product: null
    }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'COTIZACION_SOLICITADA_WHATSAPP',
          totalAmount: 999999,
          items: [{ productId: 'odon-101', quantity: 2 }]
        },
        onOrderUpdate: (data) => (captured.order = data),
        onProductUpdate: (data) => (captured.product = data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.error).toContain('no coincide con el monto registrado')
    expect(captured.order).toBeNull()
    expect(captured.product).toBeNull()
  })

  it('prices the verified total promo-aware from the order document code', async () => {
    const captured: { product: Record<string, unknown> | null } = { product: null }
    const setDocs: Array<Record<string, unknown>> = []
    // 2 × round(189990 × 0.90) = 2 × 170991 = 341982
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'COTIZACION_SOLICITADA_WHATSAPP',
          promoCode: 'PRONTO10',
          totalAmount: 341982,
          items: [{ productId: 'odon-101', quantity: 2 }]
        },
        onProductUpdate: (data) => (captured.product = data),
        onSet: (data) => setDocs.push(data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(captured.product?.stockCount).toBe(8)
    const history = setDocs.find((d) => d.newStatus === 'PAGADO_TRANSFERENCIA')
    expect((history?.metadata as Record<string, unknown> | undefined)?.orderTotalAmount).toBe(341982)
  })

  it('consolidates duplicate lines of the same product into one deduction', async () => {
    const captured: { product: Record<string, unknown> | null } = { product: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'COTIZACION_SOLICITADA_WHATSAPP',
          totalAmount: 569970, // 3 × 189990
          items: [
            { productId: 'odon-101', name: 'Turbina', quantity: 1, price: 189990 },
            { productId: 'odon-101', name: 'Turbina', quantity: 2, price: 189990 }
          ]
        },
        onProductUpdate: (data) => (captured.product = data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(captured.product?.stockCount).toBe(7) // 10 − 3
  })

  it('refuses to convert a San Antonio quote below the original-subtotal minimum (409)', async () => {
    // Catalog list subtotal $20.000 (2 × $10.000) — below the $60.000 San
    // Antonio minimum, so the conversion is refused with no stock movement.
    const captured: { product: Record<string, unknown> | null } = { product: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'COTIZACION_SOLICITADA_WHATSAPP',
          paymentMethod: 'whatsapp',
          totalAmount: 20000,
          customer: {
            fullName: 'Dra. Camila Fuentes',
            email: 'contacto@fuentesdental.cl',
            rut: '12345678-5',
            city: 'San Antonio'
          },
          items: [{ productId: 'odon-101', name: 'Insumo Barato', quantity: 2, price: 10000 }]
        },
        productData: { stockCount: 10, inStock: true, name: 'Insumo Barato', sku: 'OD-101', price: 10000 },
        onProductUpdate: (data) => (captured.product = data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.error).toContain('compra mínima')
    expect(captured.product).toBeNull()
  })

  it('converts an out-of-zone quote normally — WhatsApp is the sanctioned path for those buyers', async () => {
    const captured: { product: Record<string, unknown> | null } = { product: null }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'COTIZACION_SOLICITADA_WHATSAPP',
          paymentMethod: 'whatsapp',
          totalAmount: 379980,
          customer: {
            fullName: 'Dra. Camila Fuentes',
            email: 'contacto@fuentesdental.cl',
            rut: '12345678-5',
            city: 'Curicó'
          },
          items: [{ productId: 'odon-101', name: 'Turbina', quantity: 2, price: 189990 }]
        },
        onProductUpdate: (data) => (captured.product = data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(captured.product?.stockCount).toBe(8)
  })

  it('records an oversell shortfall in the audit and history metadata instead of hiding it', async () => {
    const setDocs: Array<Record<string, unknown>> = []
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        productData: { stockCount: 1, inStock: true, name: 'Turbina', sku: 'OD-101', price: 189990 },
        onSet: (data) => setDocs.push(data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    const audit = setDocs.find((d) => d.changeType === 'ORDER_FULFILLMENT_DEDUCTION')
    expect(audit?.newStock).toBe(0)
    expect((audit?.metadata as Record<string, unknown> | undefined)?.stockShortfall).toBe(1)
    const history = setDocs.find((d) => d.newStatus === 'PAGADO_TRANSFERENCIA')
    expect((history?.metadata as Record<string, unknown> | undefined)?.stockShortfalls).toEqual([
      { productId: 'odon-101', name: 'Turbina', requested: 2, available: 1 }
    ])
  })

  it('carries the operator note into the conversion history reason instead of dropping it', async () => {
    const setDocs: Array<Record<string, unknown>> = []
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        onSet: (data) => setDocs.push(data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      {
        method: 'POST',
        body: { ...convertBody, notes: 'Venta cerrada tal como se cotizó' }
      } as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    const history = setDocs.find((d) => d.newStatus === 'PAGADO_TRANSFERENCIA')
    expect(String(history?.reason)).toContain('Venta cerrada tal como se cotizó')
  })

  it('declines: closes the quote as CANCELADO without reading or touching stock', async () => {
    const captured: { order: Record<string, unknown> | null; product: Record<string, unknown> | null } = {
      order: null,
      product: null
    }
    const setDocs: Array<Record<string, unknown>> = []
    const { db, productReads } = mockQuoteDb({
      onOrderUpdate: (data) => (captured.order = data),
      onProductUpdate: (data) => (captured.product = data),
      onSet: (data) => setDocs.push(data)
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: declineBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.resolution).toBe('decline')
    expect(jsonOutput.status).toBe('CANCELADO')
    expect(productReads).toHaveLength(0)
    expect(captured.product).toBeNull()
    expect(captured.order?.status).toBe('CANCELADO')
    expect(captured.order?.quoteResolution).toBe('DECLINADA')
    expect(captured.order?.approvedAt).toBeUndefined()
    expect(setDocs).toHaveLength(1)
    expect(setDocs[0].newStatus).toBe('CANCELADO')
    expect(setDocs[0].reason).toBe('Cliente desistió')
    expect(setDocs[0].metadata).toMatchObject({ quoteResolution: 'DECLINADA' })
  })

  it('decline is idempotent on an already-declined quote', async () => {
    const setDocs: Array<Record<string, unknown>> = []
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        orderData: { orderId: 'PRONTO-123456', status: 'CANCELADO', items: [] },
        onSet: (data) => setDocs.push(data)
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: declineBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.duplicate).toBe(true)
    expect(setDocs).toHaveLength(0)
  })

  it('refuses to convert an already-declined quote (409)', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        orderData: { orderId: 'PRONTO-123456', status: 'CANCELADO', items: [] }
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.currentStatus).toBe('CANCELADO')
  })

  it('refuses to decline an already-converted quote (409)', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockQuoteDb({
        orderData: {
          orderId: 'PRONTO-123456',
          status: 'PAGADO_TRANSFERENCIA',
          items: [{ productId: 'odon-101', quantity: 2 }]
        }
      }).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: declineBody } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.currentStatus).toBe('PAGADO_TRANSFERENCIA')
  })

  describe('Transactional Emails (Resend)', () => {
    let resendKeyBackup: string | undefined
    let warehouseBackup: string | undefined

    beforeEach(() => {
      resendKeyBackup = process.env.RESEND_API_KEY
      warehouseBackup = process.env.WAREHOUSE_NOTIFICATION_EMAIL
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
    })

    afterEach(() => {
      if (resendKeyBackup === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = resendKeyBackup
      if (warehouseBackup === undefined) delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
      else process.env.WAREHOUSE_NOTIFICATION_EMAIL = warehouseBackup
    })

    it('a conversion notifies the customer and the warehouse', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockQuoteDb({}).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
      )

      await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

      expect(statusOutput).toBe(200)
      const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('resend.com'))
      const recipients = resendCalls.map((c) => (JSON.parse(c[1]?.body as string).to as string[])[0])
      expect(recipients).toContain('contacto@fuentesdental.cl')
      expect(recipients).toContain('bodega@prontoinsumos.com')
    })

    it('a decline alerts only the warehouse (no customer email)', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockQuoteDb({}).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
      )

      await handler({ method: 'POST', body: declineBody } as VercelRequest, mockRes as VercelResponse)

      expect(statusOutput).toBe(200)
      const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('resend.com'))
      const recipients = resendCalls.map((c) => (JSON.parse(c[1]?.body as string).to as string[])[0])
      expect(recipients).toEqual(['bodega@prontoinsumos.com'])
    })

    it('still returns 200 when email sending fails (non-blocking)', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('resend down'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockQuoteDb({}).db as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
      )

      await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

      expect(statusOutput).toBe(200)
      expect(jsonOutput.success).toBe(true)
    })

    it('stamps the payment-email failure on the order — the conversion is never rolled back', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('resend down'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const orderUpdates: Array<Record<string, unknown>> = []
      vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
        mockQuoteDb({ onOrderUpdate: (data) => orderUpdates.push(data) }).db as unknown as ReturnType<
          typeof firebaseAdminLib.getAdminFirestore
        >
      )

      await handler({ method: 'POST', body: convertBody } as VercelRequest, mockRes as VercelResponse)

      // The conversion stands; the failure is stamped for the operator to retry.
      expect(statusOutput).toBe(200)
      expect(jsonOutput.success).toBe(true)
      expect(orderUpdates.some((data) => data.status === 'PAGADO_TRANSFERENCIA')).toBe(true)
      const stamp = orderUpdates.find((data) => 'emailDelivery.payment.failedAt' in data)
      expect(stamp?.['emailDelivery.payment.failedAt']).toEqual(expect.any(String))
      expect(stamp?.['emailDelivery.payment.failureReason']).toEqual(expect.any(String))
    })
  })
})
