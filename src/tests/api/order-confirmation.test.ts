import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Mock firebaseAdmin before importing handler
vi.mock('../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn(() => null)
}))

import handler from '../../../api/order-confirmation'
import { getAdminFirestore } from '../../../api/_lib/firebaseAdmin'

function createMockRes() {
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    setHeader: vi.fn(),
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

function mockDbWithOrder(orderData: Record<string, unknown>, updateSpy = vi.fn().mockResolvedValue({})) {
  const mockOrderDoc = { data: () => orderData, ref: { update: updateSpy } }
  return {
    collection: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ empty: false, docs: [mockOrderDoc] })
        })
      })
    })
  }
}

const validOrder = {
  orderId: 'PRONTO-123456',
  status: 'PENDIENTE_TRANSFERENCIA',
  paymentMethod: 'transferencia',
  totalAmount: 189990,
  items: [{ productId: 'odon-101', name: 'Turbina', quantity: 1, price: 189990 }],
  customer: {
    fullName: 'Dra. Andrea',
    email: 'andrea@clinica.cl',
    rut: '12345678-5',
    address: 'Calle 1',
    city: 'Melipilla'
  }
}

describe('Order Confirmation Email Endpoint (/api/order-confirmation)', () => {
  let keyBackup: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    keyBackup = process.env.RESEND_API_KEY
    delete process.env.RESEND_API_KEY
  })

  afterEach(() => {
    process.env.RESEND_API_KEY = keyBackup
  })

  it('should handle OPTIONS preflight with status 200', async () => {
    const req = { method: 'OPTIONS' } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.end).toHaveBeenCalled()
  })

  it('should return 405 on non-POST methods', async () => {
    const req = { method: 'GET' } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('should return 400 when orderId or rut is missing', async () => {
    const req = { method: 'POST', body: { orderId: 'PRONTO-123' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('should return 400 for malformed RUT', async () => {
    const req = { method: 'POST', body: { orderId: 'PRONTO-123', rut: 'abc' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('should return 200 without email when Firestore Admin is unavailable', async () => {
    const req = { method: 'POST', body: { orderId: 'PRONTO-123', rut: '12345678-5' } } as VercelRequest
    const res = createMockRes()
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, emailSent: false }))
  })

  it('should return 404 when order does not exist', async () => {
    vi.mocked(getAdminFirestore).mockReturnValue({
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ empty: true, docs: [] })
          })
        })
      })
    } as unknown as ReturnType<typeof getAdminFirestore>)

    const req = { method: 'POST', body: { orderId: 'PRONTO-999', rut: '12345678-5' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('should return 401 when RUT does not match the order', async () => {
    vi.mocked(getAdminFirestore).mockReturnValue(
      mockDbWithOrder(validOrder) as unknown as ReturnType<typeof getAdminFirestore>
    )

    const req = { method: 'POST', body: { orderId: 'PRONTO-123456', rut: '99999999-9' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('should skip send and return duplicate flag when confirmation was already sent', async () => {
    const updateSpy = vi.fn()
    vi.mocked(getAdminFirestore).mockReturnValue(
      mockDbWithOrder(
        { ...validOrder, confirmationEmailSentAt: '2026-09-21T10:00:00Z' },
        updateSpy
      ) as unknown as ReturnType<typeof getAdminFirestore>
    )
    const fetchSpy = vi.spyOn(global, 'fetch')

    const req = { method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12345678-5' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ duplicate: true, emailSent: false }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('should return emailSent:false when order has no customer email', async () => {
    vi.mocked(getAdminFirestore).mockReturnValue(
      mockDbWithOrder({ ...validOrder, customer: { ...validOrder.customer, email: '' } }) as unknown as ReturnType<
        typeof getAdminFirestore
      >
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const req = { method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12345678-5' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ emailSent: false, reason: 'missing_customer_email' })
    )
  })

  it('should send email via Resend and stamp confirmationEmailSentAt on success', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const updateSpy = vi.fn().mockResolvedValue({})
    vi.mocked(getAdminFirestore).mockReturnValue(
      mockDbWithOrder(validOrder, updateSpy) as unknown as ReturnType<typeof getAdminFirestore>
    )

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_xyz' })
    } as Response)

    const req = { method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12.345.678-5' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, emailSent: true, orderId: 'PRONTO-123456' })
    )

    // Resend API was called with customer as recipient
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(init?.body as string)
    expect(body.to).toEqual(['andrea@clinica.cl'])
    expect(body.subject).toContain('PRONTO-123456')

    // Idempotency stamp written
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ confirmationEmailSentAt: expect.any(String) }))
  })

  it('should not stamp the flag when Resend send fails (retry remains possible)', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const updateSpy = vi.fn()
    vi.mocked(getAdminFirestore).mockReturnValue(
      mockDbWithOrder(validOrder, updateSpy) as unknown as ReturnType<typeof getAdminFirestore>
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Resend error'
    } as Response)

    const req = { method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12345678-5' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, emailSent: false }))
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
