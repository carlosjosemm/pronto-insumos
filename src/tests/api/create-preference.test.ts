import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from '../../../api/create-preference'

function createMockRes() {
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis()
  }
  return res as VercelResponse & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
}

describe('Create Preference Serverless Endpoint (/api/create-preference)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
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
    // Set a dummy token to trigger real payload creation
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
})

