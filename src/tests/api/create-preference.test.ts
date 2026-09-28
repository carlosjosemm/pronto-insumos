import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Mock firebaseAdmin before importing preference handler
vi.mock('../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn(() => null)
}))

import handler from '../../../api/create-preference'
import { getAdminFirestore } from '../../../api/_lib/firebaseAdmin'

function createMockRes() {
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis()
  }
  return res as VercelResponse & {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
  }
}

/**
 * Firestore Admin double answering order + product lookups from fixture maps.
 *
 * `products` is keyed by product id, `orders` by order document id. When `orders`
 * is left as `'any'`, every order lookup resolves to a registered order carrying no
 * promo code (full price) — the shape the pre-promo assertions expect. Passing an
 * explicit map also exercises the `where('orderId','==')` fallback, because a
 * fixture may key the document by an id that differs from its `orderId` field.
 */
function mockAdminDbWithProducts(
  products: Record<string, Record<string, unknown>>,
  orders: Record<string, Record<string, unknown>> | 'any' = 'any'
) {
  return {
    collection: vi.fn().mockImplementation((collectionName: string) => {
      const source = String(collectionName).includes('orders') ? orders : products
      return {
        doc: vi.fn().mockImplementation((id: string) => ({
          get: vi.fn().mockImplementation(async () => {
            if (source === 'any') return { exists: true, data: () => ({ orderId: id }) }
            const data = source[id]
            if (data === undefined) return { exists: false, data: () => null }
            return { exists: true, data: () => data }
          })
        })),
        where: vi.fn().mockImplementation((field: string, _op: string, value: unknown) => ({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(async () => {
              if (source === 'any') return { empty: true, docs: [] }
              const hit = Object.entries(source).find(([, doc]) => doc[field] === value)
              if (!hit) return { empty: true, docs: [] }
              const [id, data] = hit
              return { empty: false, docs: [{ id, data: () => data }] }
            })
          })
        }))
      }
    })
  }
}

describe('Create Preference Serverless Endpoint (/api/create-preference)', () => {
  const initialEnv = process.env.MERCADOPAGO_ACCESS_TOKEN
  const initialVercelEnv = process.env.VERCEL_ENV
  const initialAllowSimulated = process.env.ALLOW_SIMULATED_PAYMENTS

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    delete process.env.MERCADOPAGO_ACCESS_TOKEN
    // Deterministic simulation policy (Task 0.10): every test starts outside
    // production with no override; the production-gate tests set VERCEL_ENV explicitly.
    delete process.env.VERCEL_ENV
    delete process.env.ALLOW_SIMULATED_PAYMENTS
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

  it('should return 400 Bad Request when orderId or items are missing', async () => {
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

    const mockAdminDb = mockAdminDbWithProducts({
      'odon-100': { name: 'Turbina LED', price: 189990, stockCount: 10, inStock: true }
    })
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      headers: { host: 'pronto-insumos.cl' },
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

    const mockAdminDb = mockAdminDbWithProducts({
      'odon-1': { name: 'Item', price: 10000, stockCount: 10, inStock: true }
    })
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      headers: { host: 'pronto-insumos.cl' },
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

    function mockHappyCatalog(orderId: string = 'PRONTO-100001', promoCode?: string) {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': catalogTurbine },
        { [orderId]: { orderId, ...(promoCode ? { promoCode } : {}) } }
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
        headers: { host: 'pronto-insumos.cl' },
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
      const fetchSpy = mockHappyCatalog('PRONTO-100003', 'PRONTO10')
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: { host: 'pronto-insumos.cl' },
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
        headers: { host: 'pronto-insumos.cl' },
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
        headers: { host: 'pronto-insumos.cl' },
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

    it('should resolve the order through the orderId field fallback when the doc key differs', async () => {
      const mockAdminDb = mockAdminDbWithProducts(
        { 'odon-101': catalogTurbine },
        { 'legacy-doc-key': { orderId: 'PRONTO-100008', promoCode: 'DENT20' } }
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
        headers: { host: 'pronto-insumos.cl' },
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
        headers: { host: 'pronto-insumos.cl' },
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
      const mockAdminDb = mockAdminDbWithProducts({
        'odon-101': { ...catalogTurbine, isActive: false }
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const fetchSpy = vi.spyOn(global, 'fetch')

      const req = {
        method: 'POST',
        headers: { host: 'pronto-insumos.cl' },
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
      const mockAdminDb = mockAdminDbWithProducts({})
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
        headers: { host: 'pronto-insumos.cl' },
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
      const mockAdminDb = mockAdminDbWithProducts({
        'odon-101': { name: 'Turbina Odontológica LED MasterTorque', price: 189990, stockCount: 3, inStock: true }
      })
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

    it('should return 400 Bad Request when requested item is marked inStock: false', async () => {
      const mockAdminDb = mockAdminDbWithProducts({
        'odon-501': { name: 'Lidocaína 2%', price: 38500, stockCount: 0, inStock: false }
      })
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
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Stock insuficiente para el producto'),
          productId: 'odon-501',
          availableStock: 0,
          requestedQuantity: 1
        })
      )
    })

    it('should return 400 Bad Request when requested item does not exist in Firestore', async () => {
      const mockAdminDb = mockAdminDbWithProducts({})
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
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('no fue encontrado en el catálogo de inventario'),
          productId: 'odon-ghost',
          availableStock: 0,
          requestedQuantity: 1
        })
      )
    })

    it('should proceed successfully when stock is available in Firestore Admin', async () => {
      const mockAdminDb = mockAdminDbWithProducts({
        'odon-101': { name: 'Turbina Odontológica LED MasterTorque', price: 189990, stockCount: 15, inStock: true }
      })
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
})
