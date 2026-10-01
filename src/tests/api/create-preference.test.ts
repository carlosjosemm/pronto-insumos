import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Mock firebaseAdmin before importing preference handler
vi.mock('../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn(() => null)
}))

import handler from '../../../api/create-preference'
import { getAdminFirestore } from '../../../api/_lib/firebaseAdmin'
import { resolvePromoPercent } from '../../../src/config/promos'
import { computeOrderTotal, normalizeQuantity } from '../../../src/utils/orderTotal'
import { PREFERENCE_TTL_MS } from '../../../api/_lib/preferenceSnapshot'
import { createThrottleCounters } from './helpers/throttleCounters'

function createMockRes() {
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis()
  }
  return res as VercelResponse & {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
    setHeader: ReturnType<typeof vi.fn>
  }
}

/**
 * Firestore Admin double answering order + product lookups from fixture maps.
 *
 * `products` is keyed by product id, `orders` by order document id. Every order
 * fixture must carry its own `items`: the endpoint builds the
 * preference lines from the ORDER DOCUMENT, never from the request body — the
 * order is the same document the webhook later asserts the payment against.
 * Passing an explicit map also exercises the `where('orderId','==')` fallback,
 * because a fixture may key the document by an id that differs from its
 * `orderId` field.
 *
 * Order fixtures are normalized to a chargeable lifecycle by default —
 * `paymentMethod: 'mercadopago'`, `status: 'PENDIENTE_PAGO_MERCADOPAGO'`, a
 * `customer` block (Melipilla, so the zone minimum never interferes) and a
 * `totalAmount` recomputed from the fixture's own catalog lines + promo code.
 * Explicit fields on the fixture always win, so the lifecycle-guard tests can
 * override any of them to build an unchargeable order.
 */
function mockAdminDbWithProducts(
  products: Record<string, Record<string, unknown>>,
  orders: Record<string, Record<string, unknown>> = {},
  options: { failOrderUpdate?: boolean } = {}
) {
  const normalizedOrders: Record<string, Record<string, unknown>> = Object.fromEntries(
    Object.entries(orders).map(([id, order]) => {
      const items = Array.isArray(order.items) ? (order.items as Array<Record<string, unknown>>) : []
      const lines = items.map((item) => {
        const productId = String(item.productId || item.id || '')
        const price = Number(products[productId]?.price) || 0
        const quantity = normalizeQuantity(item?.quantity)
        return { price, quantity }
      })
      const defaults = {
        paymentMethod: 'mercadopago',
        status: 'PENDIENTE_PAGO_MERCADOPAGO',
        customer: {
          fullName: 'Dra. Camila Fuentes',
          email: 'camila@clinica.cl',
          rut: '12.345.678-5',
          city: 'Melipilla'
        },
        totalAmount: computeOrderTotal(lines, resolvePromoPercent(order.promoCode))
      }
      return [id, { ...defaults, ...order }]
    })
  )

  // Records every `orderRef.update(...)` so a test can assert the price snapshot
  // written at preference time (the handler updates the document it resolved, not
  // the canonical id, so the ref must carry the update method).
  const orderUpdates: Array<{ id: string; data: Record<string, unknown> }> = []
  const refFor = (id: string) => ({
    id,
    update: vi.fn(async (payload: Record<string, unknown>) => {
      if (options.failOrderUpdate) throw new Error('firestore unavailable')
      orderUpdates.push({ id, data: payload })
    })
  })

  return {
    orderUpdates,
    collection: vi.fn().mockImplementation((collectionName: string) => {
      const source = String(collectionName).includes('orders') ? normalizedOrders : products
      return {
        doc: vi.fn().mockImplementation((id: string) => ({
          get: vi.fn().mockImplementation(async () => {
            const data = source[id]
            if (data === undefined) return { exists: false, data: () => null }
            return { exists: true, data: () => data, ref: refFor(id) }
          })
        })),
        where: vi.fn().mockImplementation((field: string, _op: string, value: unknown) => ({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(async () => {
              const hit = Object.entries(source).find(([, doc]) => doc[field] === value)
              if (!hit) return { empty: true, docs: [] }
              const [id, data] = hit
              return { empty: false, docs: [{ id, data: () => data, ref: refFor(id) }] }
            })
          })
        }))
      }
    }),
    // The throttle counters are out of scope for this suite: a rejecting
    // transaction puts the real throttle code on its fail-open path, which
    // allows the request and logs loudly.
    runTransaction: vi.fn().mockRejectedValue(new Error('no counters in this double'))
  }
}

describe('Create Preference Serverless Endpoint (/api/create-preference)', () => {
  const initialEnv = process.env.MERCADOPAGO_ACCESS_TOKEN
  const initialVercelEnv = process.env.VERCEL_ENV
  const initialAllowSimulated = process.env.ALLOW_SIMULATED_PAYMENTS
  const initialSiteUrl = process.env.SITE_URL

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    delete process.env.MERCADOPAGO_ACCESS_TOKEN
    // Deterministic simulation policy: every test starts outside
    // production with no override; the production-gate tests set VERCEL_ENV explicitly.
    delete process.env.VERCEL_ENV
    delete process.env.ALLOW_SIMULATED_PAYMENTS
    // Canonical origin by default, so the lifecycle tests never depend on the
    // Host header; the origin-behavior tests delete/override it explicitly.
    process.env.SITE_URL = 'https://prontoinsumos.com'
  })

  afterAll(() => {
    if (initialEnv) {
      process.env.MERCADOPAGO_ACCESS_TOKEN = initialEnv
    } else {
      delete process.env.MERCADOPAGO_ACCESS_TOKEN
    }
    if (initialVercelEnv === undefined) {
      delete process.env.VERCEL_ENV
    } else {
      process.env.VERCEL_ENV = initialVercelEnv
    }
    if (initialAllowSimulated === undefined) {
      delete process.env.ALLOW_SIMULATED_PAYMENTS
    } else {
      process.env.ALLOW_SIMULATED_PAYMENTS = initialAllowSimulated
    }
    if (initialSiteUrl === undefined) {
      delete process.env.SITE_URL
    } else {
      process.env.SITE_URL = initialSiteUrl
    }
  })

  it('should handle OPTIONS preflight request with status 200', async () => {
    const req = { method: 'OPTIONS' } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.end).toHaveBeenCalled()
  })

  it('should return 405 Method Not Allowed for non-POST requests', async () => {
    const req = { method: 'GET' } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  it('should return 400 Bad Request when orderId is missing', async () => {
    // The request `items` are ignored (the order document owns
    // the lines), so the only required parameter is the order id.
    const req = {
      method: 'POST',
      body: { items: [] }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('Missing required parameters')
      })
    )
  })

  it('should return simulated fallback URL with synchronized orderId when token is not configured', async () => {
    const originalToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    delete process.env.MERCADOPAGO_ACCESS_TOKEN

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const req = {
      method: 'POST',
      headers: { host: 'localhost:5173' },
      body: {
        orderId: 'PRONTO-654321',
        items: [{ product: { id: 'odon-1', name: 'Turbina', price: 189990 }, quantity: 1 }],
        customer: { fullName: 'Dr. Test' }
      }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        isSimulated: true,
        initPoint: expect.stringContaining('orderId=PRONTO-654321')
      })
    )

    consoleSpy.mockRestore()
    if (originalToken) process.env.MERCADOPAGO_ACCESS_TOKEN = originalToken
  })

  it('should map external_reference strictly to the canonical orderId in the Mercado Pago payload', async () => {
    const originalToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'PREF-REAL-12345',
        init_point: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=12345',
        sandbox_init_point: 'https://sandbox.mercadopago.cl/checkout/v1/redirect?pref_id=12345'
      })
    } as Response)

    const mockAdminDb = mockAdminDbWithProducts(
      { 'odon-100': { name: 'Turbina LED', price: 189990, stockCount: 10, inStock: true } },
      { 'PRONTO-777888': { orderId: 'PRONTO-777888', items: [{ productId: 'odon-100', quantity: 2 }] } }
    )
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      headers: { host: 'localhost:5173' },
      body: {
        orderId: 'PRONTO-777888',
        items: [
          {
            product: { id: 'odon-100', name: 'Turbina LED', price: 189990 },
            quantity: 2
          }
        ],
        customer: {
          fullName: 'Dra. Camila Fuentes',
          email: 'camila@clinica.cl',
          rut: '12.345.678-5'
        }
      }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [fetchUrl, fetchOptions] = fetchSpy.mock.calls[0]
    expect(fetchUrl).toBe('https://api.mercadopago.com/checkout/preferences')

    const sentPayload = JSON.parse(fetchOptions?.body as string)
    // CRITICAL ASSERTION: external_reference MUST strictly match the canonical orderId
    expect(sentPayload.external_reference).toBe('PRONTO-777888')
    expect(sentPayload.back_urls.success).toContain('orderId=PRONTO-777888')
    expect(sentPayload.back_urls.failure).toContain('orderId=PRONTO-777888')
    expect(sentPayload.back_urls.pending).toContain('orderId=PRONTO-777888')

    process.env.MERCADOPAGO_ACCESS_TOKEN = originalToken
  })

  it('freezes the charged amount on the order and expires the preference', async () => {
    const originalToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=1' })
    } as Response)

    const mockAdminDb = mockAdminDbWithProducts(
      { 'odon-100': { name: 'Turbina LED', price: 189990, stockCount: 10, inStock: true } },
      { 'PRONTO-777888': { orderId: 'PRONTO-777888', items: [{ productId: 'odon-100', quantity: 2 }] } }
    )
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      headers: { host: 'localhost:5173' },
      body: { orderId: 'PRONTO-777888' }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)

    // The snapshot is written onto the resolved order document.
    expect(mockAdminDb.orderUpdates).toHaveLength(1)
    const update = mockAdminDb.orderUpdates[0]
    expect(update.id).toBe('PRONTO-777888')
    expect(update.data.pricedTotal).toBe(379980)
    expect(update.data.priceSnapshot).toEqual([{ productId: 'odon-100', quantity: 2, unitPrice: 189990 }])
    expect(typeof update.data.preferenceCreatedAt).toBe('string')
    expect(typeof update.data.preferenceExpiresAt).toBe('string')
    // The stored span is exactly the shared TTL.
    const created = new Date(String(update.data.preferenceCreatedAt)).getTime()
    const expires = new Date(String(update.data.preferenceExpiresAt)).getTime()
    expect(expires - created).toBe(PREFERENCE_TTL_MS)

    // The Mercado Pago preference carries the same window, in the offset form MP
    // documents, and the strings are byte-identical to the stored snapshot.
    const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
    expect(sentPayload.expires).toBe(true)
    expect(sentPayload.expiration_date_from).toBe(update.data.preferenceCreatedAt)
    expect(sentPayload.expiration_date_to).toBe(update.data.preferenceExpiresAt)
    expect(sentPayload.expiration_date_to).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000[+-]\d{2}:\d{2}$/)

    process.env.MERCADOPAGO_ACCESS_TOKEN = originalToken
  })

  it('still mints the preference when the snapshot write fails, logging loudly', async () => {
    const originalToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'PREF-REAL-2', init_point: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=2' })
    } as Response)

    // The snapshot write rejects: the sale must not be blocked — the webhook falls
    // back to the live catalog.
    const mockAdminDb = mockAdminDbWithProducts(
      { 'odon-100': { name: 'Turbina LED', price: 189990, stockCount: 10, inStock: true } },
      { 'PRONTO-777888': { orderId: 'PRONTO-777888', items: [{ productId: 'odon-100', quantity: 2 }] } },
      { failOrderUpdate: true }
    )
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      headers: { host: 'localhost:5173' },
      body: { orderId: 'PRONTO-777888' }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not write the price snapshot'),
      expect.anything()
    )

    warnSpy.mockRestore()
    process.env.MERCADOPAGO_ACCESS_TOKEN = originalToken
  })

  it('should normalize and trim orderId to uppercase in external_reference', async () => {
    const originalToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'PREF-REAL-12345',
        init_point: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=12345'
      })
    } as Response)

    const mockAdminDb = mockAdminDbWithProducts(
      { 'odon-1': { name: 'Item', price: 10000, stockCount: 10, inStock: true } },
      { 'PRONTO-LOWERCASE-123': { orderId: 'PRONTO-LOWERCASE-123', items: [{ productId: 'odon-1', quantity: 1 }] } }
    )
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      headers: { host: 'localhost:5173' },
      body: {
        orderId: '  pronto-lowercase-123  ',
        items: [{ product: { id: 'odon-1', name: 'Item', price: 10000 }, quantity: 1 }],
        customer: { fullName: 'Dr. Test' }
      }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    const [, fetchOptions] = fetchSpy.mock.calls[0]
    const sentPayload = JSON.parse(fetchOptions?.body as string)
    expect(sentPayload.external_reference).toBe('PRONTO-LOWERCASE-123')

    process.env.MERCADOPAGO_ACCESS_TOKEN = originalToken
  })

  describe('Server-side price rebuild (Task 0.9 — never trust client prices)', () => {
    const catalogTurbine = {
      name: 'Turbina Odontológica LED MasterTorque',
      price: 189990,
      stockCount: 15,
      inStock: true
    }

    function mockHappyCatalog(orderId: string = 'PRONTO-100001', promoCode?: string, quantity: number = 1) {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': catalogTurbine },
        {
          [orderId]: {
            orderId,
            ...(promoCode ? { promoCode } : {}),
            items: [{ productId: 'odon-101', quantity }]
          }
        }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      return vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
    }

    it('should charge the CATALOG price when the client tampers unit_price downward (underpayment exploit)', async () => {
      const fetchSpy = mockHappyCatalog('PRONTO-100001')
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-100001',
          items: [{ product: { id: 'odon-101', name: 'Turbina', price: 100 }, quantity: 1 }],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.items[0].unit_price).toBe(189990)
      consoleSpy.mockRestore()
    })

    it('should apply the discount stored on the ORDER document, not the request body', async () => {
      const fetchSpy = mockHappyCatalog('PRONTO-100003', 'PRONTO10', 2)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-100003',
          items: [{ product: { id: 'odon-101', name: 'Turbina', price: 189990 }, quantity: 2 }],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.items[0].unit_price).toBe(170991) // 189990 × 0.9
      consoleSpy.mockRestore()
    })

    it('should ignore a forged promoCode in the body and charge the order price', async () => {
      const fetchSpy = mockHappyCatalog('PRONTO-100005') // order carries no promo code
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-100005',
          items: [{ product: { id: 'odon-101', name: 'Turbina', price: 189990 }, quantity: 1 }],
          customer: { fullName: 'Dr. Test' },
          promoCode: 'HACKED100'
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.items[0].unit_price).toBe(189990)
      consoleSpy.mockRestore()
    })

    it('should not let a body promoCode override the discount stored on the order', async () => {
      // The order earned 10%; the body claims 20%. The order must win, otherwise the
      // charge would undercut the amount the webhook recomputes and the customer's
      // legitimate payment would be flagged for manual review.
      const fetchSpy = mockHappyCatalog('PRONTO-100007', 'PRONTO10')
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-100007',
          items: [{ product: { id: 'odon-101', name: 'Turbina', price: 189990 }, quantity: 1 }],
          customer: { fullName: 'Dr. Test' },
          promoCode: 'DENT20'
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.items[0].unit_price).toBe(170991) // PRONTO10, not DENT20
      consoleSpy.mockRestore()
    })

    it('should charge the ORDER DOCUMENT lines even when the request body diverges (Task 0.14g)', async () => {
      // The order says 2 units of odon-101; the body claims 1 unit of a different
      // (cheaper) product. Before 0.14g the body priced the preference, which the
      // webhook then refused as an amount mismatch; now the order wins outright.
      const fetchSpy = mockHappyCatalog('PRONTO-100010', undefined, 2)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-100010',
          items: [{ product: { id: 'odon-999', name: 'Otro insumo', price: 1 }, quantity: 1 }],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.items).toHaveLength(1)
      expect(sentPayload.items[0]).toMatchObject({ id: 'odon-101', quantity: 2, unit_price: 189990 })
      consoleSpy.mockRestore()
    })

    it('should build the preference from the order document when the request omits items entirely', async () => {
      const fetchSpy = mockHappyCatalog('PRONTO-100011')
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-100011',
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.items[0]).toMatchObject({ id: 'odon-101', quantity: 1, unit_price: 189990 })
      consoleSpy.mockRestore()
    })

    it('should refuse with 400 when the order document has no registered items', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': catalogTurbine },
        { 'PRONTO-100012': { orderId: 'PRONTO-100012' } }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const fetchSpy = vi.spyOn(global, 'fetch')

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-100012',
          items: [{ product: { id: 'odon-101', name: 'Turbina', price: 189990 }, quantity: 1 }],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('no tiene insumos registrados')
        })
      )
      expect(fetchSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should resolve the order through the orderId field fallback when the doc key differs', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': catalogTurbine },
        {
          'legacy-doc-key': {
            orderId: 'PRONTO-100008',
            promoCode: 'DENT20',
            items: [{ productId: 'odon-101', quantity: 1 }]
          }
        }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-100008',
          items: [{ product: { id: 'odon-101', name: 'Turbina', price: 189990 }, quantity: 1 }],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.items[0].unit_price).toBe(151992) // 189990 × 0.8 (DENT20)
      consoleSpy.mockRestore()
    })

    it('should refuse with 400 when the order is not registered in Firestore', async () => {
      const mockAdminDb = mockAdminDbWithProducts({ 'odon-101': catalogTurbine }, {})
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const fetchSpy = vi.spyOn(global, 'fetch')

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-999999',
          items: [{ product: { id: 'odon-101', name: 'Turbina', price: 189990 }, quantity: 1 }],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('no está registrado en el sistema'),
          orderId: 'PRONTO-999999'
        })
      )
      expect(fetchSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should refuse with 400 when the product is paused (isActive: false)', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': { ...catalogTurbine, isActive: false } },
        { 'PRONTO-100009': { orderId: 'PRONTO-100009', items: [{ productId: 'odon-101', quantity: 1 }] } }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const fetchSpy = vi.spyOn(global, 'fetch')

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-100009',
          items: [{ product: { id: 'odon-101', name: 'Turbina', price: 189990 }, quantity: 1 }],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('no está disponible para la venta'),
          productId: 'odon-101'
        })
      )
      expect(fetchSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should return 400 when a line carries no resolvable productId (Task 2.3 bypass closed)', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const mockAdminDb = mockAdminDbWithProducts(
        {},
        { 'PRONTO-100005': { orderId: 'PRONTO-100005', items: [{ name: 'Insumo anónimo', quantity: 1 }] } }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-100005',
          items: [{ product: { name: 'Insumo anónimo', price: 100 }, quantity: 1 }],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('identificador de producto')
        })
      )
      consoleSpy.mockRestore()
    })

    it('should fail closed with 503 when Firestore Admin is unavailable and a real token exists', async () => {
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      vi.mocked(getAdminFirestore).mockReturnValue(null)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const fetchSpy = vi.spyOn(global, 'fetch')

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-100006',
          items: [{ product: { id: 'odon-101', name: 'Turbina', price: 189990 }, quantity: 1 }],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(503)
      expect(fetchSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('Pre-flight inventory validation (Firestore Admin)', () => {
    it('should return 400 Bad Request when requested item quantity exceeds available stock', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': { name: 'Turbina Odontológica LED MasterTorque', price: 189990, stockCount: 3, inStock: true } },
        { 'PRONTO-112233': { orderId: 'PRONTO-112233', items: [{ productId: 'odon-101', quantity: 5 }] } }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-112233',
          items: [
            { product: { id: 'odon-101', name: 'Turbina Odontológica LED MasterTorque', price: 189990 }, quantity: 5 }
          ],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Stock insuficiente para el producto'),
          productId: 'odon-101',
          availableStock: 3,
          requestedQuantity: 5
        })
      )
    })

    it('keeps the exact stock figures in the refusal body only when the disclosed count is within the public threshold', async () => {
      // A refusal against a well-stocked product must not hand out the exact
      // inventory: the generic message carries no numbers and the body omits
      // availableStock — the same disclosure bound the public catalog uses.
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': { name: 'Turbina', price: 189990, stockCount: 12, inStock: true } },
        {
          'PRONTO-112239': {
            orderId: 'PRONTO-112239',
            items: [{ productId: 'odon-101', quantity: 20 }]
          }
        }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch')
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(
        {
          method: 'POST',
          headers: { host: 'localhost:5173' },
          body: { orderId: 'PRONTO-112239' }
        } as unknown as VercelRequest,
        res
      )

      expect(res.status).toHaveBeenCalledWith(400)
      const body = res.json as ReturnType<typeof vi.fn>
      const payload = body.mock.calls[0][0] as Record<string, unknown>
      expect(String(payload.error)).toContain('Stock insuficiente')
      expect(String(payload.error)).not.toContain('disponible:')
      expect('availableStock' in payload).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should return 400 Bad Request when requested item quantity exceeds available stock', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': { name: 'Turbina Odontológica LED MasterTorque', price: 189990, stockCount: 3, inStock: true } },
        { 'PRONTO-112233': { orderId: 'PRONTO-112233', items: [{ productId: 'odon-101', quantity: 5 }] } }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-112233',
          items: [
            { product: { id: 'odon-101', name: 'Turbina Odontológica LED MasterTorque', price: 189990 }, quantity: 5 }
          ],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Stock insuficiente para el producto'),
          productId: 'odon-101',
          availableStock: 3,
          requestedQuantity: 5
        })
      )
    })

    it('refuses duplicate lines of the same product whose consolidated quantity oversells (400)', async () => {
      // Each line alone (5 + 5) passes the per-line check against a stock of 8,
      // but the order asks for 10 in total — the consolidated check refuses.
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': { name: 'Turbina', price: 189990, stockCount: 8, inStock: true } },
        {
          'PRONTO-112236': {
            orderId: 'PRONTO-112236',
            items: [
              { productId: 'odon-101', quantity: 5 },
              { productId: 'odon-101', quantity: 5 }
            ]
          }
        }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch')
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(
        {
          method: 'POST',
          headers: { host: 'localhost:5173' },
          body: { orderId: 'PRONTO-112236' }
        } as unknown as VercelRequest,
        res
      )

      expect(res.status).toHaveBeenCalledWith(400)
      // Stock 8 sits above the public disclosure bound, so the refusal is
      // generic — the exact figures would let anyone probe inventory.
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Stock insuficiente'),
          productId: 'odon-101'
        })
      )
      const body = res.json as ReturnType<typeof vi.fn>
      const payload = body.mock.calls[0][0] as Record<string, unknown>
      expect('availableStock' in payload).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('builds ONE preference line with the consolidated quantity for duplicate lines within stock', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': { name: 'Turbina', price: 189990, stockCount: 10, inStock: true } },
        {
          'PRONTO-112237': {
            orderId: 'PRONTO-112237',
            items: [
              { productId: 'odon-101', quantity: 2 },
              { productId: 'odon-101', quantity: 3 }
            ]
          }
        }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(
        {
          method: 'POST',
          headers: { host: 'localhost:5173' },
          body: { orderId: 'PRONTO-112237' }
        } as unknown as VercelRequest,
        res
      )

      expect(res.status).toHaveBeenCalledWith(200)
      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.items).toHaveLength(1)
      expect(sentPayload.items[0]).toMatchObject({ id: 'odon-101', quantity: 5, unit_price: 189990 })
      consoleSpy.mockRestore()
    })

    it('rounds a fractional legacy quantity through normalizeQuantity for pricing and stock alike', async () => {
      // quantity 2.5 prices and stock-checks as 3 — the same figure the webhook
      // deducts, so the deduction can never disagree with the charge.
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': { name: 'Turbina', price: 189990, stockCount: 3, inStock: true } },
        {
          'PRONTO-112238': {
            orderId: 'PRONTO-112238',
            items: [{ productId: 'odon-101', quantity: 2.5 }]
          }
        }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(
        {
          method: 'POST',
          headers: { host: 'localhost:5173' },
          body: { orderId: 'PRONTO-112238' }
        } as unknown as VercelRequest,
        res
      )

      expect(res.status).toHaveBeenCalledWith(200)
      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.items[0].quantity).toBe(3)
      consoleSpy.mockRestore()
    })

    it('should return 400 Bad Request when requested item is marked inStock: false', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-501': { name: 'Lidocaína 2%', price: 38500, stockCount: 0, inStock: false } },
        { 'PRONTO-112234': { orderId: 'PRONTO-112234', items: [{ productId: 'odon-501', quantity: 1 }] } }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-112234',
          items: [{ product: { id: 'odon-501', name: 'Lidocaína 2%', price: 38500 }, quantity: 1 }],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      // A zero stock sits outside the 1–3 public disclosure bound, so the
      // refusal stays generic — no exact figures in the body.
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Stock insuficiente para el producto'),
          productId: 'odon-501'
        })
      )
      const body = res.json as ReturnType<typeof vi.fn>
      const payload = body.mock.calls[0][0] as Record<string, unknown>
      expect('availableStock' in payload).toBe(false)
    })

    it('should return 400 Bad Request when requested item does not exist in Firestore', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        {},
        { 'PRONTO-112235': { orderId: 'PRONTO-112235', items: [{ productId: 'odon-ghost', quantity: 1 }] } }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-112235',
          items: [{ product: { id: 'odon-ghost', name: 'Insumo Fantasma', price: 10000 }, quantity: 1 }],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      // No stock figures on a missing product — any number would be fabricated.
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('no fue encontrado en el catálogo de inventario'),
          productId: 'odon-ghost'
        })
      )
    })

    it('should proceed successfully when stock is available in Firestore Admin', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': { name: 'Turbina Odontológica LED MasterTorque', price: 189990, stockCount: 15, inStock: true } },
        { 'PRONTO-112236': { orderId: 'PRONTO-112236', items: [{ productId: 'odon-101', quantity: 2 }] } }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: {
          orderId: 'PRONTO-112236',
          items: [
            { product: { id: 'odon-101', name: 'Turbina Odontológica LED MasterTorque', price: 189990 }, quantity: 2 }
          ],
          customer: { fullName: 'Dr. Test' }
        }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          isSimulated: true
        })
      )
    })
  })

  describe('Production fail-closed policy (Task 0.10)', () => {
    const validBody = {
      orderId: 'PRONTO-654321',
      items: [{ product: { id: 'odon-1', name: 'Turbina', price: 189990 }, quantity: 1 }],
      customer: { fullName: 'Dr. Test' }
    }

    it('should fail closed with 500 when the access token is missing in a production runtime', async () => {
      process.env.VERCEL_ENV = 'production'
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: { host: 'pronto-insumos.vercel.app' },
        body: validBody
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('no configurado')
      })
      expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ isSimulated: true }))
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('MERCADOPAGO_ACCESS_TOKEN missing in a production runtime')
      )
      consoleSpy.mockRestore()
    })

    it('should fail closed before any catalog work when the token is missing in production', async () => {
      process.env.VERCEL_ENV = 'production'
      const mockAdminDb = mockAdminDbWithProducts({
        'odon-1': { name: 'Turbina', price: 189990, stockCount: 10, inStock: true }
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: { host: 'pronto-insumos.vercel.app' },
        body: validBody
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(mockAdminDb.collection).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should keep the simulated fallback in production when ALLOW_SIMULATED_PAYMENTS=true (escape hatch)', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.ALLOW_SIMULATED_PAYMENTS = 'true'
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-1': { name: 'Turbina', price: 189990, stockCount: 10, inStock: true } },
        { 'PRONTO-654321': { orderId: 'PRONTO-654321', items: [{ productId: 'odon-1', quantity: 1 }] } }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: validBody
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          isSimulated: true,
          initPoint: expect.stringContaining('orderId=PRONTO-654321')
        })
      )
      consoleSpy.mockRestore()
    })

    it('should stay fail-closed in production when ALLOW_SIMULATED_PAYMENTS is not exactly "true"', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.ALLOW_SIMULATED_PAYMENTS = 'TRUE'
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: { host: 'pronto-insumos.vercel.app' },
        body: validBody
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      consoleSpy.mockRestore()
    })
  })

  describe('Preference lifecycle guards', () => {
    const catalogTurbine = {
      name: 'Turbina Odontológica LED MasterTorque',
      price: 189990,
      stockCount: 15,
      inStock: true
    }

    function lifecycleDb(orderOverrides: Record<string, unknown>, orderId = 'PRONTO-200001') {
      return mockAdminDbWithProducts(
        { 'odon-101': catalogTurbine },
        { [orderId]: { orderId, items: [{ productId: 'odon-101', quantity: 1 }], ...orderOverrides } }
      )
    }

    function mpRequest(orderId = 'PRONTO-200001', body: Record<string, unknown> = {}) {
      return {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: { orderId, ...body }
      } as unknown as VercelRequest
    }

    /** Asserts an order fixture is refused with `status` and no MP call is made. */
    async function expectRefused(status: number, orderOverrides: Record<string, unknown>, errorFragment: string) {
      const mockAdminDb = lifecycleDb(orderOverrides)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch')
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(mpRequest(), res)

      expect(res.status).toHaveBeenCalledWith(status)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining(errorFragment) }))
      expect(fetchSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    }

    it('refuses a settled order with 409', async () => {
      await expectRefused(409, { status: 'PAGADO_MERCADOPAGO' }, 'no admite un nuevo pago')
    })

    it('refuses a transfer-pending order with 409', async () => {
      await expectRefused(409, { status: 'PENDIENTE_TRANSFERENCIA' }, 'no admite un nuevo pago')
    })

    it('refuses a WhatsApp quote order with 409', async () => {
      await expectRefused(409, { status: 'COTIZACION_SOLICITADA_WHATSAPP' }, 'no admite un nuevo pago')
    })

    it('refuses a cancelled order with 409', async () => {
      await expectRefused(409, { status: 'CANCELADO' }, 'no admite un nuevo pago')
    })

    it('refuses an order parked in payment review with 409', async () => {
      await expectRefused(409, { status: 'PAGO_EN_REVISION' }, 'no admite un nuevo pago')
    })

    it('refuses a non-Mercado-Pago order with 409 even while pending', async () => {
      await expectRefused(409, { paymentMethod: 'transferencia' }, 'no admite un nuevo pago')
    })

    it('still creates a preference for a valid Mercado Pago pending order (regression pin)', async () => {
      const mockAdminDb = lifecycleDb({})
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(mpRequest(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      consoleSpy.mockRestore()
    })

    it('refuses with 409 when the stored total disagrees with the catalog-recomputed total', async () => {
      await expectRefused(409, { totalAmount: 999 }, 'no coincide con el catálogo actual')
    })

    it('refuses a San Antonio order below the original-subtotal minimum with 400', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-cheap': { name: 'Insumo Barato', price: 10000, stockCount: 10, inStock: true } },
        {
          'PRONTO-200006': {
            orderId: 'PRONTO-200006',
            customer: { fullName: 'Dra. Test', email: 't@clinica.cl', rut: '12.345.678-5', city: 'San Antonio' },
            items: [{ productId: 'odon-cheap', quantity: 1 }]
          }
        }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch')
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(mpRequest('PRONTO-200006'), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('compra mínima') })
      )
      expect(fetchSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('applies the minimum to the ORIGINAL subtotal: a discounted San Antonio order at the threshold passes', async () => {
      // Catalog subtotal $60.000 exactly; the PRONTO10 promo discounts the
      // payable total to $54.000 — the minimum is checked BEFORE the discount,
      // the same way checkout gates it, so the preference is still created.
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-min': { name: 'Insumo Umbral', price: 60000, stockCount: 10, inStock: true } },
        {
          'PRONTO-200002': {
            orderId: 'PRONTO-200002',
            promoCode: 'PRONTO10',
            customer: { fullName: 'Dra. Test', email: 't@clinica.cl', rut: '12.345.678-5', city: 'San Antonio' },
            items: [{ productId: 'odon-min', quantity: 1 }]
          }
        }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(mpRequest('PRONTO-200002'), res)

      expect(res.status).toHaveBeenCalledWith(200)
      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.items[0].unit_price).toBe(54000) // 60000 × 0.9 — below the minimum, yet approved
      consoleSpy.mockRestore()
    })

    it('applies no minimum to a Melipilla order', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-cheap': { name: 'Insumo Barato', price: 10000, stockCount: 10, inStock: true } },
        {
          'PRONTO-200003': {
            orderId: 'PRONTO-200003',
            customer: { fullName: 'Dra. Test', email: 't@clinica.cl', rut: '12.345.678-5', city: 'Melipilla' },
            items: [{ productId: 'odon-cheap', quantity: 1 }]
          }
        }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(mpRequest('PRONTO-200003'), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      consoleSpy.mockRestore()
    })

    it('refuses an out-of-zone commune with 400 — online payment never serves it', async () => {
      // The rules deny the create, but Admin SDK writes bypass rules and
      // legacy documents exist: the endpoint is the last gate, so a crafted
      // non-WhatsApp order with a foreign commune must not get a preference.
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-cheap': { name: 'Insumo Barato', price: 10000, stockCount: 10, inStock: true } },
        {
          'PRONTO-200007': {
            orderId: 'PRONTO-200007',
            customer: { fullName: 'Dra. Test', email: 't@clinica.cl', rut: '12.345.678-5', city: 'Curicó' },
            items: [{ productId: 'odon-cheap', quantity: 1 }]
          }
        }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch')
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(mpRequest('PRONTO-200007'), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('cotiza y coordina tu compra por WhatsApp') })
      )
      expect(fetchSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('no longer lets a lowercase commune dodge the San Antonio minimum', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-cheap': { name: 'Insumo Barato', price: 10000, stockCount: 10, inStock: true } },
        {
          'PRONTO-200008': {
            orderId: 'PRONTO-200008',
            customer: { fullName: 'Dra. Test', email: 't@clinica.cl', rut: '12.345.678-5', city: 'san antonio' },
            items: [{ productId: 'odon-cheap', quantity: 1 }]
          }
        }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch')
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(mpRequest('PRONTO-200008'), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('compra mínima') })
      )
      expect(fetchSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('builds the payer from the order document, ignoring the request body', async () => {
      const mockAdminDb = lifecycleDb({})
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(
        mpRequest('PRONTO-200001', {
          customer: { fullName: 'Identidad Falsa', email: 'falso@evil.cl', rut: '99999999-9' }
        }),
        res
      )

      expect(res.status).toHaveBeenCalledWith(200)
      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.payer).toMatchObject({
        name: 'Dra. Camila Fuentes',
        email: 'camila@clinica.cl',
        identification: { type: 'RUT', number: '12.345.678-5' }
      })
      consoleSpy.mockRestore()
    })

    it('refuses an unsafe request Host outside production with 400', async () => {
      delete process.env.SITE_URL
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const fetchSpy = vi.spyOn(global, 'fetch')
      const req = {
        method: 'POST',
        headers: { host: 'evil.example.com' },
        body: { orderId: 'PRONTO-200004' }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Origen de la solicitud no válido') })
      )
      expect(fetchSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('refuses public hostnames that merely share a private-IP prefix', async () => {
      // `10.evil.com` starts with a private-octet prefix but is a public DNS
      // name — the safe-shape check must not be fooled by the prefix.
      delete process.env.SITE_URL
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const fetchSpy = vi.spyOn(global, 'fetch')
      const req = {
        method: 'POST',
        headers: { host: '10.evil.com' },
        body: { orderId: 'PRONTO-200007' }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(fetchSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('accepts a private LAN IPv4 host over plain http (LAN-testing shape)', async () => {
      delete process.env.SITE_URL
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const mockAdminDb = lifecycleDb({})
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
      const req = {
        method: 'POST',
        headers: { host: '192.168.1.50:5173' },
        body: { orderId: 'PRONTO-200001' }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.notification_url).toBe('http://192.168.1.50:5173/api/webhooks/mercadopago')
      consoleSpy.mockRestore()
    })

    it('fails closed with 500 in a production runtime without SITE_URL', async () => {
      delete process.env.SITE_URL
      process.env.VERCEL_ENV = 'production'
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const fetchSpy = vi.spyOn(global, 'fetch')
      const req = {
        method: 'POST',
        headers: { host: 'pronto-insumos.vercel.app' },
        body: { orderId: 'PRONTO-200005' }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SITE_URL missing or not a valid http(s) origin'))
      consoleSpy.mockRestore()
    })

    it('builds every preference URL from SITE_URL in production and ignores the Host header', async () => {
      process.env.VERCEL_ENV = 'production'
      const mockAdminDb = lifecycleDb({})
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(mpRequest('PRONTO-200001', {}), res)

      expect(res.status).toHaveBeenCalledWith(200)
      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.back_urls.success).toBe('https://prontoinsumos.com/?status=approved&orderId=PRONTO-200001')
      expect(sentPayload.back_urls.failure).toBe('https://prontoinsumos.com/?status=failure&orderId=PRONTO-200001')
      expect(sentPayload.back_urls.pending).toBe('https://prontoinsumos.com/?status=pending&orderId=PRONTO-200001')
      expect(sentPayload.notification_url).toBe('https://prontoinsumos.com/api/webhooks/mercadopago')
      consoleSpy.mockRestore()
    })

    it('ignores a leaked SITE_URL outside production — a preview must never repoint at the production origin', async () => {
      // SITE_URL is set by the suite's beforeEach, VERCEL_ENV is unset: the
      // Host-derived origin wins, so a value synced to the wrong Vercel target
      // cannot deliver preview webhooks to the production function.
      const mockAdminDb = lifecycleDb({})
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const res = createMockRes()

      await handler(mpRequest('PRONTO-200001', {}), res)

      expect(res.status).toHaveBeenCalledWith(200)
      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(sentPayload.notification_url).toBe('http://localhost:5173/api/webhooks/mercadopago')
      expect(sentPayload.back_urls.success).toContain('http://localhost:5173')
      consoleSpy.mockRestore()
    })

    it('locks repeat preference creation after the per-order budget (429 + Retry-After)', async () => {
      const counters = createThrottleCounters()
      const orderDb = lifecycleDb({})
      const mockAdminDb = {
        collection: vi.fn((name: string) =>
          String(name).includes('abuse_counters') ? counters.collection(name) : orderDb.collection(name)
        ),
        runTransaction: counters.runTransaction
      }
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // The per-order budget allows 15 attempts per window; the 16th is locked.
      for (let attempt = 1; attempt <= 15; attempt++) {
        const res = createMockRes()
        await handler(mpRequest(), res)
        expect(res.status).toHaveBeenCalledWith(200)
      }
      const lockedRes = createMockRes()
      await handler(mpRequest(), lockedRes)

      expect(lockedRes.status).toHaveBeenCalledWith(429)
      expect(lockedRes.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String))
      consoleSpy.mockRestore()
    })

    it('stays fail-open when the throttle counter is unavailable', async () => {
      const mockAdminDb = lifecycleDb({})
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'PREF-REAL-1', init_point: 'https://mp.cl/checkout' })
      } as Response)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const res = createMockRes()

      await handler(mpRequest(), res)

      // The double's runTransaction rejects, the throttle logs loudly and the
      // request proceeds — a counter outage never takes checkout down.
      expect(res.status).toHaveBeenCalledWith(200)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      errorSpy.mockRestore()
    })
  })
})
