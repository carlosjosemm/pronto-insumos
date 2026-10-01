import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Mock firebaseAdmin before importing webhook handler
vi.mock('../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

import handler from '../../../api/webhooks/mercadopago'
import { getAdminFirestore } from '../../../api/_lib/firebaseAdmin'

function createMockRes() {
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  }
  return res as VercelResponse & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }
}

/**
 * Orders-collection double for the canonical lookup: the document key
 * resolves to the first fixture document — mirroring `resolveOrderByCanonicalId` —
 * and the legacy `orderId` field query returns the same fixtures.
 */
function orderCollectionMock(docs: Array<{ id: string; ref: unknown; data: () => Record<string, unknown> }> = []) {
  const primary = docs[0]
  return {
    doc: vi.fn(() => ({
      get: vi
        .fn()
        .mockResolvedValue(primary ? { exists: true, ref: primary.ref, data: primary.data } : { exists: false })
    })),
    where: vi.fn(() => ({
      limit: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ empty: docs.length === 0, docs }) }))
    }))
  }
}

describe('Mercado Pago Serverless Webhook (/api/webhooks/mercadopago)', () => {
  const initialVercelEnv = process.env.VERCEL_ENV
  const initialAllowSimulated = process.env.ALLOW_SIMULATED_PAYMENTS

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    // Deterministic simulation policy: every test starts outside
    // production with no override; the production-gate tests set VERCEL_ENV explicitly.
    delete process.env.VERCEL_ENV
    delete process.env.ALLOW_SIMULATED_PAYMENTS
  })

  afterAll(() => {
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

  it('should return 200 with health message on GET request', async () => {
    const req = { method: 'GET' } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        message: expect.stringContaining('Active')
      })
    )
  })

  it('should return 405 on non-GET / non-POST methods', async () => {
    const req = { method: 'PUT' } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  it('should acknowledge 200 when no payment ID is present in payload', async () => {
    const req = {
      method: 'POST',
      body: {},
      query: {}
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        received: true,
        note: expect.stringContaining('No payment ID')
      })
    )
  })

  it('should acknowledge 200 when Mercado Pago reports the payment does not exist (404)', async () => {
    // 404 is the ONE MP failure that is safe to acknowledge — there
    // is no payment to reconcile. Every other failure is refused with 502.
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    } as Response)

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const req = {
      method: 'POST',
      body: { data: { id: 'invalid-id' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        received: true,
        note: 'Payment not found at Mercado Pago'
      })
    )
    consoleSpy.mockRestore()
  })

  it('should update order to PAGADO_MERCADOPAGO and deduct stock using firebase-admin in an atomic transaction on approved payment', async () => {
    // Mock Mercado Pago API returning approved payment matching the catalog-verified total
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        currency_id: 'CLP',
        external_reference: 'PRONTO-123456',
        id: 998877,
        transaction_amount: 189990
      })
    } as Response)

    const orderRef = { id: 'order-doc-abc' }
    const productRef = { id: 'prod-turbine-1' }

    const orderData = {
      orderId: 'PRONTO-123456',
      status: 'PENDIENTE_PAGO_MERCADOPAGO',
      totalAmount: 189990,
      items: [{ productId: 'prod-turbine-1', quantity: 2 }]
    }

    const mockTransactionUpdate = vi.fn()
    const mockTransactionGet = vi.fn().mockImplementation((ref: { id?: string }) => {
      if (ref?.id === 'order-doc-abc') {
        return Promise.resolve({
          exists: true,
          data: () => orderData
        })
      }
      return Promise.resolve({
        exists: true,
        data: () => ({ stockCount: 5, inStock: true, price: 94995 })
      })
    })

    const mockAdminDb = {
      collection: vi.fn((colName: string) => {
        if (colName === 'orders') {
          return orderCollectionMock([
            {
              id: 'order-doc-abc',
              ref: orderRef,
              data: () => ({
                orderId: 'PRONTO-123456',
                status: 'PENDIENTE_PAGO_MERCADOPAGO',
                items: [{ productId: 'prod-turbine-1', quantity: 2 }]
              })
            }
          ])
        }
        if (colName === 'products') {
          return {
            doc: vi.fn().mockReturnValue(productRef)
          }
        }
        return {
          doc: vi.fn().mockReturnValue({ id: 'audit-dummy-id' })
        }
      }),
      runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
        await cb({
          get: mockTransactionGet,
          update: mockTransactionUpdate,
          set: vi.fn()
        })
      })
    }

    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: { data: { id: '998877' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })

    // The settlement transaction commits stock+status; the second transaction
    // is the best-effort email-telemetry write (this fixture has no customer
    // email, so the failure stamp is what runs).
    expect(mockAdminDb.runTransaction).toHaveBeenCalledTimes(2)

    // Verify order update inside transaction
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      orderRef,
      expect.objectContaining({
        status: 'PAGADO_MERCADOPAGO',
        mercadopagoPaymentId: '998877',
        paidAt: expect.any(String)
      })
    )

    // An order without a customer email records the missing recipient instead
    // of silently skipping the payment notice.
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      orderRef,
      expect.objectContaining({
        'emailDelivery.payment.failureReason': 'missing_customer_email'
      })
    )

    // Verify stock deduction inside transaction: 5 - 2 = 3
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      productRef,
      expect.objectContaining({
        stockCount: 3,
        inStock: true
      })
    )
  })

  it('should acknowledge 200 with duplicate flag and skip transaction if order is already PAGADO_MERCADOPAGO (idempotency)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        currency_id: 'CLP',
        external_reference: 'PRONTO-123456',
        id: 998877
      })
    } as Response)

    const mockAdminDb = {
      collection: vi.fn((colName: string) => {
        if (colName === 'orders') {
          return orderCollectionMock([
            {
              id: 'order-doc-abc',
              ref: { id: 'order-doc-abc' },
              data: () => ({
                orderId: 'PRONTO-123456',
                status: 'PAGADO_MERCADOPAGO',
                mercadopagoPaymentId: '998877',
                items: [{ productId: 'prod-turbine-1', quantity: 2 }]
              })
            }
          ])
        }
        return {}
      }),
      runTransaction: vi.fn()
    }

    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: { data: { id: '998877' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        received: true,
        verifiedStatus: 'approved',
        duplicate: true,
        message: expect.stringContaining('already processed')
      })
    )

    // CRITICAL: Must not run transaction or decrement stock again
    expect(mockAdminDb.runTransaction).not.toHaveBeenCalled()
  })

  it('should acknowledge 200 with duplicate flag if order already recorded paymentId even if status differs', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        currency_id: 'CLP',
        external_reference: 'PRONTO-123456',
        id: 998877
      })
    } as Response)

    const mockAdminDb = {
      collection: vi.fn((colName: string) => {
        if (colName === 'orders') {
          return orderCollectionMock([
            {
              id: 'order-doc-abc',
              ref: { id: 'order-doc-abc' },
              data: () => ({
                orderId: 'PRONTO-123456',
                status: 'EN_PROCESAMIENTO',
                mercadopagoPaymentId: '998877',
                items: [{ productId: 'prod-turbine-1', quantity: 2 }]
              })
            }
          ])
        }
        return {}
      }),
      runTransaction: vi.fn()
    }

    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: { data: { id: '998877' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        received: true,
        duplicate: true
      })
    )
    expect(mockAdminDb.runTransaction).not.toHaveBeenCalled()
  })

  it('should abort transaction without writes if order was marked paid during concurrent transaction', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        currency_id: 'CLP',
        external_reference: 'PRONTO-123456',
        id: 998877
      })
    } as Response)

    const orderRef = { id: 'order-doc-abc' }
    const mockTransactionUpdate = vi.fn()
    const mockTransactionGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        status: 'PAGADO_MERCADOPAGO', // concurrently updated
        mercadopagoPaymentId: '998877'
      })
    })

    const mockAdminDb = {
      collection: vi.fn((colName: string) => {
        if (colName === 'orders') {
          return orderCollectionMock([
            {
              id: 'order-doc-abc',
              ref: orderRef,
              data: () => ({
                orderId: 'PRONTO-123456',
                status: 'PENDIENTE_PAGO_MERCADOPAGO' // initial read was pending
              })
            }
          ])
        }
        return {}
      }),
      runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
        await cb({
          get: mockTransactionGet,
          update: mockTransactionUpdate
        })
      })
    }

    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: { data: { id: '998877' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockAdminDb.runTransaction).toHaveBeenCalledTimes(1)
    // Concurrency guard inside transaction must prevent any updates
    expect(mockTransactionUpdate).not.toHaveBeenCalled()
  })

  it('should not update order or stock if payment status is rejected or pending', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'rejected',
        external_reference: 'PRONTO-123456',
        id: 112233
      })
    } as Response)

    const mockAdminDb = {
      collection: vi.fn()
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: { data: { id: '112233' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'rejected' })
    expect(mockAdminDb.collection).not.toHaveBeenCalled()
  })

  it('should handle uninitialized Firestore admin gracefully with warning response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        currency_id: 'CLP',
        external_reference: 'PRONTO-123456',
        id: 554433
      })
    } as Response)

    vi.mocked(getAdminFirestore).mockReturnValue(null)
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const req = {
      method: 'POST',
      body: { data: { id: '554433' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        received: true,
        verifiedStatus: 'approved',
        warning: 'Firestore Admin unavailable'
      })
    )
    consoleSpy.mockRestore()
  })

  it('should return 200 on OPTIONS preflight request', async () => {
    const resEnd = vi.fn()
    const req = { method: 'OPTIONS' } as VercelRequest
    const res = {
      status: vi.fn().mockReturnValue({ end: resEnd }),
      statusCode: 200
    } as unknown as VercelResponse

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(resEnd).toHaveBeenCalled()
  })

  it('persists a missing-order incident and returns 200 when the approved order is not found in Firestore (Task 0.17)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        currency_id: 'CLP',
        external_reference: 'PRONTO-NONEXISTENT',
        id: 778899,
        transaction_amount: 189990
      })
    } as Response)

    const mockCreate = vi.fn().mockResolvedValue(undefined)
    const incidentDocFn = vi.fn(() => ({ create: mockCreate }))
    const mockAdminDb = {
      collection: vi.fn((colName: string) => {
        if (colName === 'orders') return orderCollectionMock()
        if (colName === 'payment_incidents') {
          return { doc: incidentDocFn }
        }
        return { doc: vi.fn() }
      }),
      runTransaction: vi.fn()
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const req = {
      method: 'POST',
      body: { data: { id: '778899' } }
    } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        received: true,
        verifiedStatus: 'approved',
        note: 'incident',
        incident: 'PEDIDO_NO_ENCONTRADO'
      })
    )
    expect(incidentDocFn).toHaveBeenCalledWith('mp-778899')
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: '778899',
        paymentStatus: 'approved',
        transactionAmount: 189990,
        reason: 'PEDIDO_NO_ENCONTRADO',
        status: 'PENDIENTE_RECONCILIACION_MANUAL',
        resolved: false,
        source: 'MERCADOPAGO_WEBHOOK'
      })
    )
    expect(mockAdminDb.runTransaction).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Order "PRONTO-NONEXISTENT" not found in Firestore')
    )
    consoleSpy.mockRestore()
  })

  describe('Missing-order payment reconciliation (Task 0.17)', () => {
    /** Admin double whose `payment_incidents` collection records every create. */
    function incidentDb(mockCreate: ReturnType<typeof vi.fn>) {
      const incidentDocFn = vi.fn(() => ({ create: mockCreate }))
      const mockAdminDb = {
        collection: vi.fn((colName: string) => {
          if (colName === 'payment_incidents') {
            return { doc: incidentDocFn }
          }
          return { doc: vi.fn() }
        }),
        runTransaction: vi.fn()
      }
      return { mockAdminDb, incidentDocFn }
    }

    /** MP verification response for a settlement with no usable reference. */
    function paymentWithoutReference(id: string, status = 'approved') {
      return {
        ok: true,
        json: async () => ({
          status,
          id,
          transaction_amount: 189990,
          payer: { email: 'pagador@clinica.cl' }
        })
      } as Response
    }

    it('persists an incident when an approved payment carries no usable external_reference or description', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(paymentWithoutReference('555000'))
      const mockCreate = vi.fn().mockResolvedValue(undefined)
      const { mockAdminDb, incidentDocFn } = incidentDb(mockCreate)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        body: { data: { id: '555000' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true,
          verifiedStatus: 'approved',
          note: 'incident',
          incident: 'REFERENCIA_NO_UTILIZABLE'
        })
      )
      expect(incidentDocFn).toHaveBeenCalledWith('mp-555000')
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: '555000',
          paymentStatus: 'approved',
          payerEmail: 'pagador@clinica.cl',
          reason: 'REFERENCIA_NO_UTILIZABLE',
          externalReference: null,
          description: null
        })
      )
      // No usable reference ⇒ no order lookup is ever attempted.
      expect(mockAdminDb.collection).not.toHaveBeenCalledWith('orders')
      consoleSpy.mockRestore()
    })

    it('persists an incident for a refunded payment with no usable reference (reversals are in scope)', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(paymentWithoutReference('555001', 'refunded'))
      const mockCreate = vi.fn().mockResolvedValue(undefined)
      const { mockAdminDb } = incidentDb(mockCreate)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        body: { data: { id: '555001' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true,
          verifiedStatus: 'refunded',
          incident: 'REFERENCIA_NO_UTILIZABLE'
        })
      )
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'refunded', reason: 'REFERENCIA_NO_UTILIZABLE' })
      )
      consoleSpy.mockRestore()
    })

    it('is idempotent: a duplicate delivery writes no second incident and returns the duplicate flag', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(paymentWithoutReference('555002'))
      // Firestore rejects create() on an existing document with ALREADY_EXISTS.
      const mockCreate = vi.fn().mockRejectedValue({ code: 6, message: '6 ALREADY_EXISTS: Document already exists' })
      const { mockAdminDb } = incidentDb(mockCreate)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        body: { data: { id: '555002' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true,
          note: 'incident',
          incident: 'REFERENCIA_NO_UTILIZABLE',
          duplicate: true
        })
      )
      expect(mockCreate).toHaveBeenCalledTimes(1)
      consoleSpy.mockRestore()
    })

    it('refuses with 500 when the incident store fails — an unreconcilable settlement is never acked', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(paymentWithoutReference('555003'))
      const mockCreate = vi.fn().mockRejectedValue(new Error('firestore unavailable'))
      const { mockAdminDb } = incidentDb(mockCreate)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = {
        method: 'POST',
        body: { data: { id: '555003' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Webhook processing unavailable' }))
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to persist the missing-order incident for payment 555003'),
        expect.anything()
      )
      consoleSpy.mockRestore()
    })

    it('keeps the transient 500 when Firestore Admin is unavailable in production (no incident store)', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.MERCADOPAGO_WEBHOOK_SECRET = 'secret_webhook_key_12345'
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'
      delete process.env.ALLOW_SIMULATED_PAYMENTS
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(paymentWithoutReference('555004'))
      vi.mocked(getAdminFirestore).mockReturnValue(null)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Valid signature so the request reaches the incident path: the
      // production fail-closed gates refuse unsigned requests before any
      // reconciliation runs.
      const requestId = 'req-task-017-prod'
      const ts = '1710372000'
      const manifest = `id:555004;request-id:${requestId};ts:${ts};`
      const hash = (await import('crypto')).default
        .createHmac('sha256', 'secret_webhook_key_12345')
        .update(manifest)
        .digest('hex')

      const req = {
        method: 'POST',
        headers: { 'x-signature': `ts=${ts},v1=${hash}`, 'x-request-id': requestId },
        body: { data: { id: '555004' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Webhook processing unavailable' }))
      consoleSpy.mockRestore()
    })

    afterEach(() => {
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET
      delete process.env.MERCADOPAGO_ACCESS_TOKEN
      // F1: the alert test sets these — never leak them into later tests
      // (a leaked RESEND_API_KEY makes sendEmail hit the real Resend API).
      delete process.env.RESEND_API_KEY
      delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
    })

    it('alerts the warehouse (never the customer) once per persisted incident', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('api.resend.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'email_incident' })
          } as Response
        }
        return paymentWithoutReference('555005')
      })
      const mockCreate = vi.fn().mockResolvedValue(undefined)
      const { mockAdminDb } = incidentDb(mockCreate)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        body: { data: { id: '555005' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const sends = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))
      expect(sends).toHaveLength(1)
      const body = JSON.parse(((sends[0][1] as RequestInit | undefined)?.body ?? '{}') as string)
      expect(body.to).toEqual(['bodega@prontoinsumos.com'])
      expect(body.subject).toContain('555005')
      expect(body.text).toContain('Motivo')
      consoleSpy.mockRestore()
    })

    it('still acknowledges the durable incident when the warehouse alert email fails', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      // Resend is down: the email fetch rejects. sendEmail's fail-safe contract
      // swallows it — the incident document is the authority, so the delivery
      // is still acknowledged once the incident is durable.
      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        if (String(input).includes('api.resend.com')) {
          throw new Error('resend down')
        }
        return paymentWithoutReference('555006')
      })
      const mockCreate = vi.fn().mockResolvedValue(undefined)
      const { mockAdminDb } = incidentDb(mockCreate)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        body: { data: { id: '555006' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ received: true, note: 'incident', incident: 'REFERENCIA_NO_UTILIZABLE' })
      )
      expect(mockCreate).toHaveBeenCalledTimes(1)
      consoleSpy.mockRestore()
    })
  })

  it('resolves the document key first: a decoy document carrying the same orderId field cannot shadow the real order (Task 0.12)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'approved',
        currency_id: 'CLP',
        external_reference: 'PRONTO-123456',
        id: 998877,
        transaction_amount: 189990
      })
    } as Response)

    const realOrderRef = { id: 'PRONTO-123456' }
    const decoyRef = { id: 'decoy-doc' }
    const orderData = {
      orderId: 'PRONTO-123456',
      status: 'PENDIENTE_PAGO_MERCADOPAGO',
      totalAmount: 189990,
      items: [{ productId: 'prod-turbine-1', quantity: 2 }],
      customer: { email: 'andrea@clinica.cl' }
    }
    const decoyDoc = {
      id: 'decoy-doc',
      ref: decoyRef,
      data: () => ({
        orderId: 'PRONTO-123456',
        status: 'ENTREGADO',
        totalAmount: 1,
        items: [{ productId: 'prod-turbine-1', quantity: 1 }]
      })
    }

    const mockTransactionGet = vi
      .fn()
      .mockImplementation((ref: { id?: string }) =>
        ref?.id === 'PRONTO-123456'
          ? Promise.resolve({ exists: true, data: () => orderData })
          : Promise.resolve({ exists: true, data: () => ({ stockCount: 5, inStock: true, price: 94995 }) })
      )
    const mockTransactionUpdate = vi.fn()
    const whereSpy = vi.fn(() => ({
      limit: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ empty: false, docs: [decoyDoc] }) }))
    }))

    const mockAdminDb = {
      collection: vi.fn((colName: string) => {
        if (colName === 'orders') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn().mockResolvedValue({ exists: true, ref: realOrderRef, data: () => orderData })
            })),
            where: whereSpy
          }
        }
        if (colName === 'products') {
          return { doc: vi.fn().mockReturnValue({ id: 'prod-turbine-1' }) }
        }
        return { doc: vi.fn().mockReturnValue({ id: 'audit-dummy-id' }) }
      }),
      runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
        await cb({ get: mockTransactionGet, update: mockTransactionUpdate, set: vi.fn() })
      })
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})

    const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    // The REAL document is the one marked paid — never the decoy (status ENTREGADO).
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      realOrderRef,
      expect.objectContaining({ status: 'PAGADO_MERCADOPAGO', mercadopagoPaymentId: '998877' })
    )
    expect(mockTransactionUpdate).not.toHaveBeenCalledWith(decoyRef, expect.anything())
    // The decoy is only reachable through the `orderId` field query, which is never consulted.
    expect(whereSpy).not.toHaveBeenCalled()
  })

  describe('Webhook Cryptographic Signature Verification (x-signature)', () => {
    const testSecret = 'secret_webhook_key_12345'

    it('should return 401 Unauthorized when MERCADOPAGO_WEBHOOK_SECRET is set but x-signature header is missing', async () => {
      const originalSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: {},
        body: { data: { id: '998877' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Unauthorized'),
          reason: 'missing_signature_headers_or_id'
        })
      )

      consoleSpy.mockRestore()
      process.env.MERCADOPAGO_WEBHOOK_SECRET = originalSecret
    })

    it('should return 401 Unauthorized when x-signature contains invalid hash', async () => {
      const originalSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: {
          'x-signature': 'ts=1710372000,v1=bad_hash_value_1234567890abcdef',
          'x-request-id': 'req-test-uuid'
        },
        body: { data: { id: '998877' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Unauthorized')
        })
      )

      consoleSpy.mockRestore()
      process.env.MERCADOPAGO_WEBHOOK_SECRET = originalSecret
    })

    it('should proceed and return 200 when signature is cryptographically valid', async () => {
      const originalSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret

      const paymentId = '998877'
      const requestId = 'req-test-uuid-valid'
      const ts = '1710372000'
      const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`
      const validHash = (await import('crypto')).default.createHmac('sha256', testSecret).update(manifest).digest('hex')

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'rejected',
          external_reference: 'PRONTO-123456',
          id: paymentId
        })
      } as Response)

      const req = {
        method: 'POST',
        headers: {
          'x-signature': `ts=${ts},v1=${validHash}`,
          'x-request-id': requestId
        },
        body: { data: { id: paymentId } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'rejected' })

      process.env.MERCADOPAGO_WEBHOOK_SECRET = originalSecret
    })
  })

  describe('Transactional Email Notifications (Resend)', () => {
    let resendKeyBackup: string | undefined
    let warehouseBackup: string | undefined

    beforeEach(() => {
      resendKeyBackup = process.env.RESEND_API_KEY
      warehouseBackup = process.env.WAREHOUSE_NOTIFICATION_EMAIL
      delete process.env.RESEND_API_KEY
      delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
      // Signature tests above may leave the string "undefined" behind — ensure open webhook
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET
    })

    afterEach(() => {
      if (resendKeyBackup === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = resendKeyBackup
      if (warehouseBackup === undefined) delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
      else process.env.WAREHOUSE_NOTIFICATION_EMAIL = warehouseBackup
    })

    function mockSuccessfulPaymentDb() {
      const orderRef = { id: 'order-doc-abc' }
      const productRef = { id: 'prod-turbine-1' }
      const mockTransactionUpdate = vi.fn()
      const orderData = {
        orderId: 'PRONTO-123456',
        status: 'PENDIENTE_PAGO_MERCADOPAGO',
        totalAmount: 189990,
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2, price: 94995 }],
        customer: {
          fullName: 'Dra. Andrea',
          email: 'andrea@clinica.cl',
          rut: '12345678-5',
          address: 'Calle 1',
          city: 'Melipilla'
        }
      }
      const mockTransactionGet = vi.fn().mockImplementation((ref: { id?: string }) => {
        if (ref?.id === 'order-doc-abc') {
          return Promise.resolve({ exists: true, data: () => orderData })
        }
        return Promise.resolve({ exists: true, data: () => ({ stockCount: 5, inStock: true, price: 94995 }) })
      })
      const mockAdminDb = {
        collection: vi.fn((colName: string) => {
          if (colName === 'orders') {
            return orderCollectionMock([{ id: 'order-doc-abc', ref: orderRef, data: () => orderData }])
          }
          if (colName === 'products') {
            return { doc: vi.fn().mockReturnValue(productRef) }
          }
          return { doc: vi.fn().mockReturnValue({ id: 'audit-dummy-id' }) }
        }),
        runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
          await cb({ get: mockTransactionGet, update: mockTransactionUpdate, set: vi.fn() })
        })
      }
      return { mockAdminDb, mockTransactionUpdate }
    }

    /** fetch spy that answers both the Mercado Pago API call and Resend sends. */
    function mockFetchBoundaries(resendOk = true) {
      return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('api.resend.com')) {
          return {
            ok: resendOk,
            status: resendOk ? 200 : 500,
            json: async () => (resendOk ? { id: 'email_xyz' } : {}),
            text: async () => (resendOk ? '' : 'Resend error')
          } as Response
        }
        return {
          ok: true,
          json: async () => ({
            status: 'approved',
            currency_id: 'CLP',
            external_reference: 'PRONTO-123456',
            id: 998877,
            transaction_amount: 189990
          })
        } as Response
      })
    }

    const resendCalls = (fetchSpy: { mock: { calls: unknown[][] } }) =>
      fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))

    const resendRecipient = (call: unknown[]) =>
      (JSON.parse(((call[1] as RequestInit | undefined)?.body ?? '{}') as string).to as string[])[0]

    it('should send customer payment-confirmation and warehouse emails after approved payment', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = mockFetchBoundaries()
      const { mockAdminDb } = mockSuccessfulPaymentDb()
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })

      const sends = resendCalls(fetchSpy)
      expect(sends).toHaveLength(2)
      const recipients = sends.map(resendRecipient)
      expect(recipients).toContain('andrea@clinica.cl')
      expect(recipients).toContain('bodega@prontoinsumos.com')
    })

    it('should not send any email on duplicate delivery (no re-notification)', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = mockFetchBoundaries()
      const { mockAdminDb } = mockSuccessfulPaymentDb()
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      // Simulate the transaction seeing the order already paid (concurrency guard path)
      const alreadyPaidDb = {
        ...mockAdminDb,
        collection: vi.fn((colName: string) => {
          if (colName === 'orders') {
            return orderCollectionMock([
              {
                id: 'order-doc-abc',
                ref: { id: 'order-doc-abc' },
                data: () => ({
                  orderId: 'PRONTO-123456',
                  status: 'PAGADO_MERCADOPAGO',
                  mercadopagoPaymentId: '998877'
                })
              }
            ])
          }
          return {}
        })
      }
      vi.mocked(getAdminFirestore).mockReturnValue(alreadyPaidDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(resendCalls(fetchSpy)).toHaveLength(0)
    })

    it('should still return 200 when Resend is down (email outage never breaks the webhook)', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = mockFetchBoundaries(false)
      const { mockAdminDb } = mockSuccessfulPaymentDb()
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })
      expect(resendCalls(fetchSpy).length).toBeGreaterThan(0)
    })

    it('should alert the warehouse (and never the customer) on a double payment (Task 0.14b)', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        if (String(input).includes('api.resend.com')) {
          return { ok: true, status: 200, json: async () => ({ id: 'email_xyz' }), text: async () => '' } as Response
        }
        return {
          ok: true,
          json: async () => ({
            status: 'approved',
            currency_id: 'CLP',
            external_reference: 'PRONTO-123456',
            id: 111111,
            transaction_amount: 189990
          })
        } as Response
      })

      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'PAGADO_MERCADOPAGO',
        mercadopagoPaymentId: '999999',
        totalAmount: 189990,
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }],
        customer: { fullName: 'Dra. Andrea', email: 'andrea@clinica.cl', rut: '12345678-5' }
      }
      const mockAdminDb = {
        collection: vi.fn((colName: string) => {
          if (colName === 'orders') {
            return orderCollectionMock([
              { id: 'order-doc-abc', ref: { id: 'order-doc-abc' }, data: () => orderFixture }
            ])
          }
          return { doc: vi.fn().mockReturnValue({ id: 'history-dummy-id' }) }
        }),
        runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
          await cb({
            get: vi.fn().mockResolvedValue({ exists: true, data: () => orderFixture }),
            update: vi.fn(),
            set: vi.fn()
          })
        })
      }
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '111111' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      const sends = resendCalls(fetchSpy)
      expect(sends).toHaveLength(1)
      expect(resendRecipient(sends[0])).toBe('bodega@prontoinsumos.com')
      const payload = JSON.parse(((sends[0][1] as RequestInit | undefined)?.body ?? '{}') as string)
      expect(payload.subject).toContain('Doble pago detectado')
    })

    it('should surface a stock shortfall in the warehouse payment alert (Task 0.14e)', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = mockFetchBoundaries()

      const orderRef = { id: 'order-doc-abc' }
      const productRef = { id: 'prod-turbine-1' }
      const orderData = {
        orderId: 'PRONTO-123456',
        status: 'PENDIENTE_PAGO_MERCADOPAGO',
        totalAmount: 189990,
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }],
        customer: { fullName: 'Dra. Andrea', email: 'andrea@clinica.cl', rut: '12345678-5' }
      }
      const mockAdminDb = {
        collection: vi.fn((colName: string) => {
          if (colName === 'orders') {
            return orderCollectionMock([{ id: 'order-doc-abc', ref: orderRef, data: () => orderData }])
          }
          if (colName === 'products') {
            return { doc: vi.fn().mockReturnValue(productRef) }
          }
          return { doc: vi.fn().mockReturnValue({ id: 'audit-dummy-id' }) }
        }),
        runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
          await cb({
            get: vi.fn().mockImplementation((ref: { id?: string }) =>
              ref?.id === 'order-doc-abc'
                ? Promise.resolve({ exists: true, data: () => orderData })
                : Promise.resolve({
                    exists: true,
                    data: () => ({ stockCount: 1, inStock: true, price: 94995, name: 'Turbina' })
                  })
            ),
            update: vi.fn(),
            set: vi.fn()
          })
        })
      }
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      const warehouseSend = resendCalls(fetchSpy).find((call) => resendRecipient(call) === 'bodega@prontoinsumos.com')
      expect(warehouseSend).toBeDefined()
      const payload = JSON.parse(((warehouseSend?.[1] as RequestInit | undefined)?.body ?? '{}') as string)
      expect(payload.text).toContain('Stock insuficiente')
    })

    it('stamps the payment-email sent marker on the order after the customer notice goes out', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      const fetchSpy = mockFetchBoundaries()
      const { mockAdminDb, mockTransactionUpdate } = mockSuccessfulPaymentDb()
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(resendCalls(fetchSpy).length).toBeGreaterThan(0)
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'order-doc-abc' }),
        expect.objectContaining({ 'emailDelivery.payment.sentAt': expect.any(String) })
      )
    })

    it('records the payment-email failure on the order — the paid state is never rolled back', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      const fetchSpy = mockFetchBoundaries(false)
      const { mockAdminDb, mockTransactionUpdate } = mockSuccessfulPaymentDb()
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      // The ack and the paid state stand; the failure is stamped for recovery.
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })
      expect(resendCalls(fetchSpy).length).toBeGreaterThan(0)
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'order-doc-abc' }),
        expect.objectContaining({ status: 'PAGADO_MERCADOPAGO' })
      )
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'order-doc-abc' }),
        expect.objectContaining({
          'emailDelivery.payment.failedAt': expect.any(String),
          'emailDelivery.payment.failureReason': 'http_500'
        })
      )
    })
  })

  describe('Server-side amount verification (Task 0.9 — underpayment exploit)', () => {
    interface AmountFixture {
      totalAmount: number
      catalogPrice: number
      quantity: number
      transactionAmount: number
      promoCode?: string
      items?: Array<Record<string, unknown>>
      /** The server-only payable total frozen onto the order at preference time. */
      pricedTotal?: number
    }

    /** Firestore Admin double whose order/product docs carry the configured amounts. */
    function mockAmountDb(cfg: AmountFixture) {
      const orderRef = { id: 'order-doc-abc' }
      const productRef = { id: 'prod-turbine-1' }
      const mockTransactionUpdate = vi.fn()
      const orderData = {
        orderId: 'PRONTO-123456',
        status: 'PENDIENTE_PAGO_MERCADOPAGO',
        totalAmount: cfg.totalAmount,
        ...(cfg.pricedTotal !== undefined ? { pricedTotal: cfg.pricedTotal } : {}),
        ...(cfg.promoCode ? { promoCode: cfg.promoCode } : {}),
        items: cfg.items ?? [
          { productId: 'prod-turbine-1', name: 'Turbina', quantity: cfg.quantity, price: cfg.catalogPrice }
        ],
        customer: {
          fullName: 'Dra. Andrea',
          email: 'andrea@clinica.cl',
          rut: '12345678-5',
          address: 'Calle 1',
          city: 'Melipilla'
        }
      }
      const mockTransactionGet = vi.fn().mockImplementation((ref: { id?: string }) => {
        if (ref?.id === 'order-doc-abc') {
          return Promise.resolve({ exists: true, data: () => orderData })
        }
        return Promise.resolve({
          exists: true,
          data: () => ({ stockCount: 5, inStock: true, price: cfg.catalogPrice })
        })
      })
      const mockAdminDb = {
        collection: vi.fn((colName: string) => {
          if (colName === 'orders') {
            return orderCollectionMock([{ id: 'order-doc-abc', ref: orderRef, data: () => orderData }])
          }
          if (colName === 'products') {
            return { doc: vi.fn().mockReturnValue(productRef) }
          }
          return { doc: vi.fn().mockReturnValue({ id: 'audit-dummy-id' }) }
        }),
        runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
          await cb({ get: mockTransactionGet, update: mockTransactionUpdate, set: vi.fn() })
        })
      }
      return { mockAdminDb, mockTransactionUpdate, orderRef, productRef }
    }

    function mockApprovedPaymentFetch(transactionAmount: number, currencyId = 'CLP') {
      return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        if (String(input).includes('api.resend.com')) {
          return { ok: true, status: 200, json: async () => ({ id: 'email_xyz' }), text: async () => '' } as Response
        }
        return {
          ok: true,
          json: async () => ({
            status: 'approved',
            currency_id: currencyId,
            external_reference: 'PRONTO-123456',
            id: 998877,
            transaction_amount: transactionAmount
          })
        } as Response
      })
    }

    it('should mark PAGADO_MERCADOPAGO and deduct stock when the paid amount matches the catalog-verified total', async () => {
      mockApprovedPaymentFetch(189990)
      const { mockAdminDb, mockTransactionUpdate, orderRef, productRef } = mockAmountDb({
        totalAmount: 189990,
        catalogPrice: 94995,
        quantity: 2,
        transactionAmount: 189990
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({ status: 'PAGADO_MERCADOPAGO' })
      )
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        productRef,
        expect.objectContaining({ stockCount: 3, inStock: true })
      )
    })

    it('settles against the frozen snapshot when the catalog moved after the preference', async () => {
      mockApprovedPaymentFetch(189990)
      // The order was quoted 189990 and frozen at preference time; the catalog has
      // since been edited to 99999 (2 × 99999 = 199998). The shopper paid the quoted
      // amount, so the order must settle — not park in review.
      const { mockAdminDb, mockTransactionUpdate, orderRef, productRef } = mockAmountDb({
        totalAmount: 189990,
        pricedTotal: 189990,
        catalogPrice: 99999,
        quantity: 2,
        transactionAmount: 189990
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({ status: 'PAGADO_MERCADOPAGO' })
      )
      // Exactly one deduction.
      expect(mockTransactionUpdate).toHaveBeenCalledWith(productRef, expect.objectContaining({ stockCount: 3 }))
      // The divergence is a soft alert, not a failure.
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('frozen price snapshot'))
      expect(mockTransactionUpdate).not.toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({ status: 'PAGO_EN_REVISION' })
      )
      consoleSpy.mockRestore()
    })

    it('flags PAGO_EN_REVISION without stock deduction when the payment currency is not CLP', async () => {
      mockApprovedPaymentFetch(189990, 'USD')
      const { mockAdminDb, mockTransactionUpdate, orderRef, productRef } = mockAmountDb({
        totalAmount: 189990,
        pricedTotal: 189990,
        catalogPrice: 94995,
        quantity: 2,
        transactionAmount: 189990
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({ status: 'PAGO_EN_REVISION', mercadopagoPaymentId: '998877' })
      )
      expect(mockTransactionUpdate).not.toHaveBeenCalledWith(
        productRef,
        expect.objectContaining({ stockCount: expect.any(Number) })
      )
      consoleSpy.mockRestore()
    })

    it('falls back to the catalog recomputation when the order carries no snapshot', async () => {
      mockApprovedPaymentFetch(189990)
      // No `pricedTotal`: an order created before the amount was frozen, so the live
      // catalog total is the authority.
      const { mockAdminDb, mockTransactionUpdate, orderRef } = mockAmountDb({
        totalAmount: 189990,
        catalogPrice: 94995,
        quantity: 2,
        transactionAmount: 189990
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({ status: 'PAGADO_MERCADOPAGO' })
      )
    })

    it('should flag PAGO_EN_REVISION without stock deduction when transaction_amount underpays the order', async () => {
      mockApprovedPaymentFetch(100) // attacker paid $100 for a $189.990 order
      const { mockAdminDb, mockTransactionUpdate, orderRef, productRef } = mockAmountDb({
        totalAmount: 189990,
        catalogPrice: 94995,
        quantity: 2,
        transactionAmount: 100
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })

      // Order flagged for review — NOT marked paid
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({
          status: 'PAGO_EN_REVISION',
          mercadopagoPaymentId: '998877'
        })
      )
      // CRITICAL: zero stock deduction
      expect(mockTransactionUpdate).not.toHaveBeenCalledWith(
        productRef,
        expect.objectContaining({ stockCount: expect.any(Number) })
      )
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('amount verification failed'))
      consoleSpy.mockRestore()
    })

    it('should flag a review state when order.totalAmount diverges from the catalog reality', async () => {
      mockApprovedPaymentFetch(189990)
      const { mockAdminDb, mockTransactionUpdate, orderRef, productRef } = mockAmountDb({
        totalAmount: 1000, // tampered client total — catalog says 189990
        catalogPrice: 94995,
        quantity: 2,
        transactionAmount: 189990
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({ status: 'PAGO_EN_REVISION' })
      )
      expect(mockTransactionUpdate).not.toHaveBeenCalledWith(
        productRef,
        expect.objectContaining({ stockCount: expect.any(Number) })
      )
      consoleSpy.mockRestore()
    })

    it('should route orders with unresolvable item productIds to manual review instead of decrementing stock', async () => {
      mockApprovedPaymentFetch(189990)
      const { mockAdminDb, mockTransactionUpdate } = mockAmountDb({
        totalAmount: 189990,
        catalogPrice: 94995,
        quantity: 2,
        transactionAmount: 189990,
        items: [{ name: 'Línea sin productId', quantity: 2 }] // no productId/id
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'order-doc-abc' }),
        expect.objectContaining({ status: 'PAGO_EN_REVISION' })
      )
      consoleSpy.mockRestore()
    })

    it('should approve a promo-discounted order when the paid amount matches the verified total', async () => {
      // PRONTO10 on 2 × 94995 = round(94995 × 0.9) × 2 = 85496 × 2 = 170992
      mockApprovedPaymentFetch(170992)
      const { mockAdminDb, mockTransactionUpdate, orderRef, productRef } = mockAmountDb({
        totalAmount: 170992,
        catalogPrice: 94995,
        quantity: 2,
        transactionAmount: 170992,
        promoCode: 'PRONTO10'
      })
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({ status: 'PAGADO_MERCADOPAGO' })
      )
      expect(mockTransactionUpdate).toHaveBeenCalledWith(productRef, expect.objectContaining({ stockCount: 3 }))
      consoleSpy.mockRestore()
    })

    it('should treat a redelivered payment for an order already in review as a duplicate (idempotent)', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'approved',
          currency_id: 'CLP',
          external_reference: 'PRONTO-123456',
          id: 998877,
          transaction_amount: 100
        })
      } as Response)

      const mockAdminDb = {
        collection: vi.fn((colName: string) => {
          if (colName === 'orders') {
            return orderCollectionMock([
              {
                id: 'order-doc-abc',
                ref: { id: 'order-doc-abc' },
                data: () => ({
                  orderId: 'PRONTO-123456',
                  status: 'PAGO_EN_REVISION',
                  mercadopagoPaymentId: '998877',
                  items: [{ productId: 'prod-turbine-1', quantity: 2 }]
                })
              }
            ])
          }
          return {}
        }),
        runTransaction: vi.fn()
      }

      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true,
          verifiedStatus: 'approved',
          duplicate: true,
          message: expect.stringContaining('already processed')
        })
      )
      expect(mockAdminDb.runTransaction).not.toHaveBeenCalled()
    })
  })

  describe('Reconciliation guards (Task 0.14)', () => {
    let resendKeyBackup: string | undefined
    let warehouseBackup: string | undefined
    let webhookSecretBackup: string | undefined
    let accessTokenBackup: string | undefined

    beforeEach(() => {
      resendKeyBackup = process.env.RESEND_API_KEY
      warehouseBackup = process.env.WAREHOUSE_NOTIFICATION_EMAIL
      webhookSecretBackup = process.env.MERCADOPAGO_WEBHOOK_SECRET
      accessTokenBackup = process.env.MERCADOPAGO_ACCESS_TOKEN
      delete process.env.RESEND_API_KEY
      delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET
      delete process.env.MERCADOPAGO_ACCESS_TOKEN
    })

    afterEach(() => {
      if (resendKeyBackup === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = resendKeyBackup
      if (warehouseBackup === undefined) delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
      else process.env.WAREHOUSE_NOTIFICATION_EMAIL = warehouseBackup
      if (webhookSecretBackup === undefined) delete process.env.MERCADOPAGO_WEBHOOK_SECRET
      else process.env.MERCADOPAGO_WEBHOOK_SECRET = webhookSecretBackup
      if (accessTokenBackup === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN
      else process.env.MERCADOPAGO_ACCESS_TOKEN = accessTokenBackup
    })

    /** Order + product doubles with captured transaction writes. */
    function mockReconciliationDb(
      orderFixture: Record<string, unknown>,
      productFixture: Record<string, unknown> = { stockCount: 5, inStock: true, price: 94995, name: 'Turbina' }
    ) {
      const orderRef = { id: 'order-doc-abc' }
      const productRef = { id: 'prod-turbine-1' }
      const transactionUpdate = vi.fn()
      const transactionSet = vi.fn()
      const transactionGet = vi
        .fn()
        .mockImplementation((ref: { id?: string }) =>
          ref?.id === 'order-doc-abc'
            ? Promise.resolve({ exists: true, data: () => orderFixture })
            : Promise.resolve({ exists: true, data: () => productFixture })
        )
      const mockAdminDb = {
        collection: vi.fn((colName: string) => {
          if (colName === 'orders') {
            return orderCollectionMock([{ id: 'order-doc-abc', ref: orderRef, data: () => orderFixture }])
          }
          if (colName === 'products') {
            return { doc: vi.fn().mockReturnValue(productRef) }
          }
          return { doc: vi.fn().mockReturnValue({ id: 'audit-dummy-id' }) }
        }),
        runTransaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
          await cb({ get: transactionGet, update: transactionUpdate, set: transactionSet })
        })
      }
      return { mockAdminDb, orderRef, productRef, transactionUpdate, transactionSet }
    }

    /** MP API double answering an approved payment with the given id/amount. */
    function mockApprovedPayment(id: number = 998877, amount: number = 189990) {
      return vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'approved',
          currency_id: 'CLP',
          external_reference: 'PRONTO-123456',
          id,
          transaction_amount: amount
        })
      } as Response)
    }

    /** MP API double answering a non-approved payment status (refunds etc.). */
    function mockPaymentStatus(status: string, id: number = 998877, amount: number = 189990) {
      return vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status,
          external_reference: 'PRONTO-123456',
          id,
          transaction_amount: amount
        })
      } as Response)
    }

    it('should return 502 and refuse to acknowledge when Mercado Pago rejects the verification with 401', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      } as Response)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(502)
      expect(res.json).toHaveBeenCalledWith({ error: 'Mercado Pago verification unavailable' })
      expect(getAdminFirestore).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('MP verification failed'))
      consoleSpy.mockRestore()
    })

    it('should return 502 when the Mercado Pago API itself fails with a 500', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(502)
      expect(getAdminFirestore).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should use the same signed id for the signature and the Mercado Pago fetch (Task 0.14f)', async () => {
      const testSecret = 'secret_webhook_key_12345'
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret

      // The signed query id is 998877; the body carries a different id.
      const requestId = 'req-test-uuid-valid'
      const ts = '1710372000'
      const manifest = `id:998877;request-id:${requestId};ts:${ts};`
      const validHash = (await import('crypto')).default.createHmac('sha256', testSecret).update(manifest).digest('hex')

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'rejected', external_reference: 'PRONTO-123456', id: 998877 })
      } as Response)

      const req = {
        method: 'POST',
        headers: { 'x-signature': `ts=${ts},v1=${validHash}`, 'x-request-id': requestId },
        query: { 'data.id': '998877' },
        body: { data: { id: '111111' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(String(fetchSpy.mock.calls[0][0])).toContain('/v1/payments/998877')
      expect(String(fetchSpy.mock.calls[0][0])).not.toContain('111111')
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('should record a double-payment incident instead of acking a second approved payment as duplicate', async () => {
      mockApprovedPayment(111111)
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'PAGADO_MERCADOPAGO',
        mercadopagoPaymentId: '999999',
        totalAmount: 189990,
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }],
        customer: { fullName: 'Dra. Andrea', email: 'andrea@clinica.cl' }
      }
      const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '111111' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })
      // The payment that settled the order is never overwritten and no stock moves.
      expect(transactionUpdate).not.toHaveBeenCalled()
      expect(transactionSet).toHaveBeenCalledTimes(1)
      expect(transactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          previousStatus: 'PAGADO_MERCADOPAGO',
          newStatus: 'PAGADO_MERCADOPAGO',
          reason: expect.stringContaining('Segundo pago aprobado'),
          metadata: expect.objectContaining({
            event: 'PAGO_DUPLICADO',
            paymentId: '111111',
            previousPaymentId: '999999'
          })
        })
      )
      consoleSpy.mockRestore()
    })

    it('should park a CANCELADO order in PAGO_EN_REVISION without stock movement when a payment is approved', async () => {
      mockApprovedPayment()
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'CANCELADO',
        totalAmount: 189990,
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }
      const { mockAdminDb, orderRef, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      // Exactly one write: the order is parked for review. No product is touched.
      expect(transactionUpdate).toHaveBeenCalledTimes(1)
      expect(transactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({ status: 'PAGO_EN_REVISION', mercadopagoPaymentId: '998877' })
      )
      expect(transactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          previousStatus: 'CANCELADO',
          newStatus: 'PAGO_EN_REVISION',
          metadata: expect.objectContaining({ event: 'PAGO_ESTADO_INVALIDO', paymentId: '998877' })
        })
      )
      consoleSpy.mockRestore()
    })

    it('should record an incident without a status flip or stock movement for an approved payment on a DESPACHADO order', async () => {
      mockApprovedPayment()
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'DESPACHADO',
        mercadopagoPaymentId: '999999',
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }
      const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      // Fulfilment state is preserved (tracking must not regress) — incident only.
      expect(transactionUpdate).not.toHaveBeenCalled()
      expect(transactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          previousStatus: 'DESPACHADO',
          newStatus: 'DESPACHADO',
          metadata: expect.objectContaining({ event: 'PAGO_DUPLICADO' })
        })
      )
      consoleSpy.mockRestore()
    })

    it('should park a PENDIENTE_TRANSFERENCIA order in review when an approved payment arrives', async () => {
      mockApprovedPayment()
      // The amount matches the catalog exactly: only the ORDER-STATUS GUARD can
      // stop this payment — the pre-0.14 code would approve it.
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'PENDIENTE_TRANSFERENCIA',
        totalAmount: 189990,
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }
      const { mockAdminDb, orderRef, transactionUpdate } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(transactionUpdate).toHaveBeenCalledTimes(1)
      expect(transactionUpdate).toHaveBeenCalledWith(orderRef, expect.objectContaining({ status: 'PAGO_EN_REVISION' }))
      consoleSpy.mockRestore()
    })

    it('should record an incident instead of deducting stock again when the order was already settled once (R1)', async () => {
      // A refunded payment parks the order in PAGO_EN_REVISION while paidAt (and
      // the first stock deduction) survive. An order's lines are deducted AT MOST
      // ONCE, so a later approved payment must not run the deduction again.
      mockApprovedPayment()
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'PAGO_EN_REVISION',
        paidAt: '2026-09-01T12:00:00.000Z',
        mercadopagoPaymentId: '999999',
        totalAmount: 189990,
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }
      const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      // No order flip and no product update — the incident is recorded only.
      expect(transactionUpdate).not.toHaveBeenCalled()
      expect(transactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          previousStatus: 'PAGO_EN_REVISION',
          newStatus: 'PAGO_EN_REVISION',
          reason: expect.stringContaining('mercadería ya fue rebajada'),
          metadata: expect.objectContaining({ event: 'PAGO_DUPLICADO' })
        })
      )
      consoleSpy.mockRestore()
    })

    it('should record a refund incident for a payment parked in review without a status change (R5)', async () => {
      mockPaymentStatus('refunded')
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'PAGO_EN_REVISION',
        mercadopagoPaymentId: '998877',
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }
      const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(transactionUpdate).not.toHaveBeenCalled()
      expect(transactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          previousStatus: 'PAGO_EN_REVISION',
          newStatus: 'PAGO_EN_REVISION',
          metadata: expect.objectContaining({ event: 'PAGO_REEMBOLSADO' })
        })
      )
      consoleSpy.mockRestore()
    })

    it('should ignore a cancelled payment notification — a cancellation never collected money (R4)', async () => {
      mockPaymentStatus('cancelled')
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'PAGADO_MERCADOPAGO',
        mercadopagoPaymentId: '998877',
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }
      const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(transactionUpdate).not.toHaveBeenCalled()
      expect(transactionSet).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should record an incident for an approved payment on a TRANSFERENCIA_APROBADA order (R6)', async () => {
      mockApprovedPayment()
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'TRANSFERENCIA_APROBADA',
        approvedAt: '2026-09-01T12:00:00.000Z',
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }
      const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(transactionUpdate).not.toHaveBeenCalled()
      expect(transactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          previousStatus: 'TRANSFERENCIA_APROBADA',
          newStatus: 'TRANSFERENCIA_APROBADA',
          metadata: expect.objectContaining({ event: 'PAGO_DUPLICADO' })
        })
      )
      consoleSpy.mockRestore()
    })

    it('should record an incident for an approved payment on an ENTREGADO order (R6)', async () => {
      mockApprovedPayment()
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'ENTREGADO',
        mercadopagoPaymentId: '999999',
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }
      const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(transactionUpdate).not.toHaveBeenCalled()
      expect(transactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          previousStatus: 'ENTREGADO',
          newStatus: 'ENTREGADO',
          metadata: expect.objectContaining({ event: 'PAGO_DUPLICADO' })
        })
      )
      consoleSpy.mockRestore()
    })

    it('should park a PAGADO_MERCADOPAGO order in PAGO_EN_REVISION when its payment is refunded', async () => {
      mockPaymentStatus('refunded')
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'PAGADO_MERCADOPAGO',
        mercadopagoPaymentId: '998877',
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }
      const { mockAdminDb, orderRef, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'refunded' })
      expect(transactionUpdate).toHaveBeenCalledTimes(1)
      expect(transactionUpdate).toHaveBeenCalledWith(orderRef, expect.objectContaining({ status: 'PAGO_EN_REVISION' }))
      expect(transactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          previousStatus: 'PAGADO_MERCADOPAGO',
          newStatus: 'PAGO_EN_REVISION',
          reason: expect.stringContaining('reembolsado'),
          metadata: expect.objectContaining({ event: 'PAGO_REEMBOLSADO', paymentId: '998877' })
        })
      )
      consoleSpy.mockRestore()
    })

    it('should record a chargeback incident without a status flip on a DESPACHADO order', async () => {
      mockPaymentStatus('charged_back')
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'DESPACHADO',
        mercadopagoPaymentId: '998877',
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }
      const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(transactionUpdate).not.toHaveBeenCalled()
      expect(transactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          previousStatus: 'DESPACHADO',
          newStatus: 'DESPACHADO',
          reason: expect.stringContaining('contracargado'),
          metadata: expect.objectContaining({ event: 'PAGO_REEMBOLSADO' })
        })
      )
      consoleSpy.mockRestore()
    })

    it('should ignore a refund of a payment that did not settle the order', async () => {
      mockPaymentStatus('refunded', 111111)
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'PAGADO_MERCADOPAGO',
        mercadopagoPaymentId: '999999',
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }
      const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '111111' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(transactionUpdate).not.toHaveBeenCalled()
      expect(transactionSet).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should approve an oversold order but record the stock shortfall in the history and audit metadata', async () => {
      // Catalog stock is 1; the order (and the paid amount) says 3 — the sale is
      // approved (the money is taken) and the 2-unit shortfall is recorded.
      mockApprovedPayment(998877, 284985)
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'PENDIENTE_PAGO_MERCADOPAGO',
        totalAmount: 284985,
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 3 }]
      }
      const { mockAdminDb, orderRef, productRef, transactionUpdate, transactionSet } = mockReconciliationDb(
        orderFixture,
        { stockCount: 1, inStock: true, price: 94995, name: 'Turbina' }
      )
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(transactionUpdate).toHaveBeenCalledWith(
        orderRef,
        expect.objectContaining({ status: 'PAGADO_MERCADOPAGO' })
      )
      expect(transactionUpdate).toHaveBeenCalledWith(
        productRef,
        expect.objectContaining({ stockCount: 0, inStock: false })
      )
      expect(transactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: expect.objectContaining({
            stockShortfalls: [{ productId: 'prod-turbine-1', name: 'Turbina', requested: 3, available: 1 }]
          })
        })
      )
      expect(transactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: expect.objectContaining({ stockShortfall: 2 })
        })
      )
      consoleSpy.mockRestore()
    })

    it('should not attach shortfall metadata when the catalog covers the order', async () => {
      mockApprovedPayment()
      const orderFixture = {
        orderId: 'PRONTO-123456',
        status: 'PENDIENTE_PAGO_MERCADOPAGO',
        totalAmount: 189990,
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }
      const { mockAdminDb, transactionSet } = mockReconciliationDb(orderFixture)
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      const setDocs = transactionSet.mock.calls.map((call) => call[1] as Record<string, unknown>)
      const historyDoc = setDocs.find((doc) => doc.newStatus === 'PAGADO_MERCADOPAGO')
      const auditDoc = setDocs.find((doc) => doc.changeType === 'ORDER_FULFILLMENT_DEDUCTION')
      expect(historyDoc).toBeDefined()
      expect(auditDoc).toBeDefined()
      expect(historyDoc?.metadata).not.toHaveProperty('stockShortfalls')
      expect(auditDoc?.metadata).not.toHaveProperty('stockShortfall')
      consoleSpy.mockRestore()
    })

    describe('Partial-refund incident (R9)', () => {
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

      /** MP API double: an approved payment that already carries a partial refund. */
      function mockApprovedPaymentWithRefund(id: number = 998877, amount: number = 189990, refunded: number = 50000) {
        return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
          if (String(input).includes('api.resend.com')) {
            return { ok: true, status: 200, json: async () => ({ id: 'email_xyz' }), text: async () => '' } as Response
          }
          return {
            ok: true,
            json: async () => ({
              status: 'approved',
              currency_id: 'CLP',
              status_detail: 'partially_refunded',
              external_reference: 'PRONTO-123456',
              id,
              transaction_amount: amount,
              transaction_amount_refunded: refunded
            })
          } as Response
        })
      }

      const settledOrder = {
        orderId: 'PRONTO-123456',
        status: 'PAGADO_MERCADOPAGO',
        mercadopagoPaymentId: '998877',
        totalAmount: 189990,
        items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
      }

      it('records one incident (no status flip, no stock movement, no customer email) when a settled order is partially refunded', async () => {
        mockApprovedPaymentWithRefund()
        const orderFixture = { ...settledOrder }
        const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
        vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const fetchSpy = vi.spyOn(global, 'fetch')

        const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
        const res = createMockRes()

        await handler(req, res)

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({
          received: true,
          verifiedStatus: 'approved',
          note: 'incident',
          incident: 'REEMBOLSO_PARCIAL'
        })
        // The order keeps its paid status: only the marker fields are stamped.
        expect(transactionUpdate).toHaveBeenCalledTimes(1)
        const orderUpdate = transactionUpdate.mock.calls[0][1] as Record<string, unknown>
        expect(orderUpdate).toEqual({
          partialRefundPaymentId: '998877',
          partialRefundAmount: 50000,
          partialRefundAt: expect.any(String),
          updatedAt: expect.any(String)
        })
        expect(transactionSet).toHaveBeenCalledTimes(1)
        expect(transactionSet).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            previousStatus: 'PAGADO_MERCADOPAGO',
            newStatus: 'PAGADO_MERCADOPAGO',
            metadata: expect.objectContaining({
              event: 'PAGO_REEMBOLSO_PARCIAL',
              paymentId: '998877',
              refundedAmount: 50000,
              transactionAmount: 189990
            })
          })
        )
        // The warehouse is alerted; the customer is never told a refund happened.
        const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('resend.com'))
        const recipients = resendCalls.map((c) => (JSON.parse(c[1]?.body as string).to as string[])[0])
        expect(recipients).toEqual(['bodega@prontoinsumos.com'])
        consoleSpy.mockRestore()
      })

      it('is idempotent: a replay of the same refund state writes nothing and acks as duplicate', async () => {
        mockApprovedPaymentWithRefund()
        const orderFixture = {
          ...settledOrder,
          partialRefundPaymentId: '998877',
          partialRefundAmount: 50000,
          partialRefundAt: '2026-09-30T12:00:00.000Z'
        }
        const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
        vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
        const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

        const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
        const res = createMockRes()

        await handler(req, res)

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({
          received: true,
          verifiedStatus: 'approved',
          duplicate: true,
          message: 'Order already processed'
        })
        expect(transactionUpdate).not.toHaveBeenCalled()
        expect(transactionSet).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
      })

      it('records a NEW incident when a higher cumulative refunded amount arrives (successive partial refunds)', async () => {
        mockApprovedPaymentWithRefund(998877, 189990, 100000)
        const orderFixture = {
          ...settledOrder,
          partialRefundPaymentId: '998877',
          partialRefundAmount: 50000,
          partialRefundAt: '2026-09-30T12:00:00.000Z'
        }
        const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
        vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
        const res = createMockRes()

        await handler(req, res)

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({
          received: true,
          verifiedStatus: 'approved',
          note: 'incident',
          incident: 'REEMBOLSO_PARCIAL'
        })
        const orderUpdate = transactionUpdate.mock.calls[0][1] as Record<string, unknown>
        expect(orderUpdate.partialRefundAmount).toBe(100000)
        expect(transactionSet).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            metadata: expect.objectContaining({ event: 'PAGO_REEMBOLSO_PARCIAL', refundedAmount: 100000 })
          })
        )
        consoleSpy.mockRestore()
      })

      it('treats a stale delivery with a LOWER cumulative amount as a replay (monotonic dedup, nothing written)', async () => {
        // Cumulative refunds only grow: refund-2's delivery landed first
        // (marker 100000) and MP then retried refund-1's delivery (50000) —
        // necessarily a stale replay, so no spurious incident and no marker
        // regression.
        mockApprovedPaymentWithRefund(998877, 189990, 50000)
        const orderFixture = {
          ...settledOrder,
          partialRefundPaymentId: '998877',
          partialRefundAmount: 100000,
          partialRefundAt: '2026-09-30T12:00:00.000Z'
        }
        const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
        vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
        const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

        const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
        const res = createMockRes()

        await handler(req, res)

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({
          received: true,
          verifiedStatus: 'approved',
          duplicate: true,
          message: 'Order already processed'
        })
        expect(transactionUpdate).not.toHaveBeenCalled()
        expect(transactionSet).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
      })

      it('keeps the plain duplicate skip when the delivery carries no refunded amount', async () => {
        mockApprovedPayment(998877, 189990)
        const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb({ ...settledOrder })
        vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
        const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

        const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
        const res = createMockRes()

        await handler(req, res)

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({
          received: true,
          verifiedStatus: 'approved',
          duplicate: true,
          message: 'Order already processed'
        })
        expect(transactionUpdate).not.toHaveBeenCalled()
        expect(transactionSet).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
      })

      it('still records a double-payment incident (not a partial refund) for a different approved payment', async () => {
        mockApprovedPaymentWithRefund(111111, 189990, 50000)
        const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb({ ...settledOrder })
        vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const req = { method: 'POST', body: { data: { id: '111111' } } } as unknown as VercelRequest
        const res = createMockRes()

        await handler(req, res)

        expect(res.status).toHaveBeenCalledWith(200)
        expect(transactionUpdate).not.toHaveBeenCalled()
        expect(transactionSet).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            metadata: expect.objectContaining({ event: 'PAGO_DUPLICADO', paymentId: '111111' })
          })
        )
        consoleSpy.mockRestore()
      })

      it('settles a delayed approval normally AND records the refund incident in the same transaction', async () => {
        // The approval delivery was retried after the refund: the charge went
        // through, so the order settles (stock deducted, customer confirmed)
        // and the returned money is flagged for manual reconciliation.
        mockApprovedPaymentWithRefund()
        const orderFixture = {
          orderId: 'PRONTO-123456',
          status: 'PENDIENTE_PAGO_MERCADOPAGO',
          totalAmount: 189990,
          customer: {
            fullName: 'Dra. Camila Fuentes',
            email: 'contacto@fuentesdental.cl',
            rut: '12345678-5'
          },
          items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
        }
        const { mockAdminDb, orderRef, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
        vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const fetchSpy = vi.spyOn(global, 'fetch')

        const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
        const res = createMockRes()

        await handler(req, res)

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'approved' })
        expect(transactionUpdate).toHaveBeenCalledWith(
          orderRef,
          expect.objectContaining({
            status: 'PAGADO_MERCADOPAGO',
            mercadopagoPaymentId: '998877',
            paidAt: expect.any(String),
            partialRefundPaymentId: '998877',
            partialRefundAmount: 50000,
            partialRefundAt: expect.any(String)
          })
        )
        const setDocs = transactionSet.mock.calls.map((call) => call[1] as Record<string, unknown>)
        expect(setDocs.find((doc) => doc.newStatus === 'PAGADO_MERCADOPAGO')).toBeDefined()
        expect(
          setDocs.find(
            (doc) => doc.metadata && (doc.metadata as Record<string, unknown>).event === 'PAGO_REEMBOLSO_PARCIAL'
          )
        ).toBeDefined()
        expect(setDocs.find((doc) => doc.changeType === 'ORDER_FULFILLMENT_DEDUCTION')).toBeDefined()
        // Customer confirmation + settlement alert + refund alert.
        const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('resend.com'))
        expect(resendCalls.length).toBe(3)
        consoleSpy.mockRestore()
      })

      it('records the incident on a review-parked order without changing its status', async () => {
        mockApprovedPaymentWithRefund()
        const orderFixture = {
          ...settledOrder,
          status: 'PAGO_EN_REVISION'
        }
        const { mockAdminDb, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
        vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
        const res = createMockRes()

        await handler(req, res)

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({
          received: true,
          verifiedStatus: 'approved',
          note: 'incident',
          incident: 'REEMBOLSO_PARCIAL'
        })
        const orderUpdate = transactionUpdate.mock.calls[0][1] as Record<string, unknown>
        expect(orderUpdate).not.toHaveProperty('status')
        expect(orderUpdate.partialRefundPaymentId).toBe('998877')
        expect(transactionSet).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            previousStatus: 'PAGO_EN_REVISION',
            newStatus: 'PAGO_EN_REVISION',
            metadata: expect.objectContaining({ event: 'PAGO_REEMBOLSO_PARCIAL' })
          })
        )
        consoleSpy.mockRestore()
      })

      it('still settles on the original transaction_amount when the payment carries a refund', async () => {
        // The amount assertion uses transaction_amount (unchanged by Mercado
        // Pago on a partial refund), so the settlement math is unaffected.
        mockApprovedPaymentWithRefund(998877, 189990, 50000)
        const orderFixture = {
          orderId: 'PRONTO-123456',
          status: 'PENDIENTE_PAGO_MERCADOPAGO',
          totalAmount: 189990,
          items: [{ productId: 'prod-turbine-1', name: 'Turbina', quantity: 2 }]
        }
        const { mockAdminDb, transactionSet } = mockReconciliationDb(orderFixture)
        vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
        const res = createMockRes()

        await handler(req, res)

        expect(res.status).toHaveBeenCalledWith(200)
        const setDocs = transactionSet.mock.calls.map((call) => call[1] as Record<string, unknown>)
        const historyDoc = setDocs.find((doc) => doc.newStatus === 'PAGADO_MERCADOPAGO')
        expect(historyDoc?.metadata).toEqual(
          expect.objectContaining({ paymentId: '998877', transactionAmount: 189990 })
        )
        consoleSpy.mockRestore()
      })

      it('routes a fully refunded payment that also reports transaction_amount_refunded to the reversal branch only', async () => {
        // A full reversal flips `status` to `refunded`, so the reversal branch
        // handles it (PAGO_REEMBOLSADO) and the partial-refund path must not
        // double-fire: no PAGO_REEMBOLSO_PARCIAL event, no marker writes.
        mockPaymentStatus('refunded', 998877, 189990)
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'refunded',
            status_detail: 'refunded',
            external_reference: 'PRONTO-123456',
            id: 998877,
            transaction_amount: 189990,
            transaction_amount_refunded: 189990
          })
        } as Response)
        const orderFixture = { ...settledOrder }
        const { mockAdminDb, orderRef, transactionUpdate, transactionSet } = mockReconciliationDb(orderFixture)
        vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const req = { method: 'POST', body: { data: { id: '998877' } } } as unknown as VercelRequest
        const res = createMockRes()

        await handler(req, res)

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({ received: true, verifiedStatus: 'refunded' })
        // The paid order is parked in review by the reversal branch.
        expect(transactionUpdate).toHaveBeenCalledTimes(1)
        expect(transactionUpdate).toHaveBeenCalledWith(
          orderRef,
          expect.objectContaining({ status: 'PAGO_EN_REVISION' })
        )
        const setDocs = transactionSet.mock.calls.map((call) => call[1] as Record<string, unknown>)
        expect(setDocs).toHaveLength(1)
        expect(setDocs[0].metadata).toEqual(expect.objectContaining({ event: 'PAGO_REEMBOLSADO', paymentId: '998877' }))
        consoleSpy.mockRestore()
      })
    })
  })

  describe('Production fail-closed configuration gates (Task 0.10)', () => {
    const testSecret = 'secret_webhook_key_12345'
    const initialSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
    const initialToken = process.env.MERCADOPAGO_ACCESS_TOKEN

    afterEach(() => {
      if (initialSecret === undefined) {
        delete process.env.MERCADOPAGO_WEBHOOK_SECRET
      } else {
        process.env.MERCADOPAGO_WEBHOOK_SECRET = initialSecret
      }
      if (initialToken === undefined) {
        delete process.env.MERCADOPAGO_ACCESS_TOKEN
      } else {
        process.env.MERCADOPAGO_ACCESS_TOKEN = initialToken
      }
    })

    async function validSignatureHeaders(paymentId: string, secret: string) {
      const requestId = 'req-test-uuid-valid'
      const ts = '1710372000'
      const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`
      const hash = (await import('crypto')).default.createHmac('sha256', secret).update(manifest).digest('hex')
      return { 'x-signature': `ts=${ts},v1=${hash}`, 'x-request-id': requestId }
    }

    it('should fail closed with 500 when the webhook secret is missing in a production runtime', async () => {
      process.env.VERCEL_ENV = 'production'
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET

      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch should not be called'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: {},
        body: { data: { id: '998877' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('signature verification unavailable')
      })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('MERCADOPAGO_WEBHOOK_SECRET missing in a production runtime')
      )
      consoleSpy.mockRestore()
    })

    it('should fail closed with 500 when the access token is missing in a production runtime', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret
      delete process.env.MERCADOPAGO_ACCESS_TOKEN

      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch should not be called'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const paymentId = '998877'
      const req = {
        method: 'POST',
        headers: await validSignatureHeaders(paymentId, testSecret),
        body: { data: { id: paymentId } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('payment verification unavailable')
      })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('MERCADOPAGO_ACCESS_TOKEN missing in a production runtime')
      )
      consoleSpy.mockRestore()
    })

    it('should keep the permissive acknowledgement in production when ALLOW_SIMULATED_PAYMENTS=true', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.ALLOW_SIMULATED_PAYMENTS = 'true'
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: {},
        body: { data: { id: '998877' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true,
          note: 'Payment not found at Mercado Pago'
        })
      )
      consoleSpy.mockRestore()
    })

    it('should keep the 404 acknowledgement in production with real credentials (payment does not exist)', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const paymentId = '998877'
      const req = {
        method: 'POST',
        headers: await validSignatureHeaders(paymentId, testSecret),
        body: { data: { id: paymentId } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true,
          note: 'Payment not found at Mercado Pago'
        })
      )
      consoleSpy.mockRestore()
    })

    it('should refuse with 502 when the MP API fails in production with real credentials (Task 0.14a)', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const paymentId = '998877'
      const req = {
        method: 'POST',
        headers: await validSignatureHeaders(paymentId, testSecret),
        body: { data: { id: paymentId } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(502)
      expect(res.json).toHaveBeenCalledWith({ error: 'Mercado Pago verification unavailable' })
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('MP verification failed'))
      consoleSpy.mockRestore()
    })

    it('should keep the permissive acknowledgement outside production when the secret is missing (regression guard)', async () => {
      delete process.env.VERCEL_ENV
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = {
        method: 'POST',
        headers: {},
        body: { data: { id: '998877' } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      consoleSpy.mockRestore()
    })

    it('should refuse to acknowledge a verified payment when Firestore Admin is unavailable in production', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'approved',
          currency_id: 'CLP',
          external_reference: 'PRONTO-123456',
          id: '998877'
        })
      } as Response)
      vi.mocked(getAdminFirestore).mockReturnValue(null)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const paymentId = '998877'
      const req = {
        method: 'POST',
        headers: await validSignatureHeaders(paymentId, testSecret),
        body: { data: { id: paymentId } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Webhook processing unavailable' })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Firestore Admin unavailable in a production runtime')
      )
      consoleSpy.mockRestore()
    })

    it('should keep the permissive warning response in production when ALLOW_SIMULATED_PAYMENTS=true (Admin down)', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.ALLOW_SIMULATED_PAYMENTS = 'true'
      process.env.MERCADOPAGO_WEBHOOK_SECRET = testSecret
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-VALID-TOKEN-XYZ'

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'approved',
          currency_id: 'CLP',
          external_reference: 'PRONTO-123456',
          id: '998877'
        })
      } as Response)
      vi.mocked(getAdminFirestore).mockReturnValue(null)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const paymentId = '998877'
      const req = {
        method: 'POST',
        headers: await validSignatureHeaders(paymentId, testSecret),
        body: { data: { id: paymentId } }
      } as unknown as VercelRequest
      const res = createMockRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true,
          warning: 'Firestore Admin unavailable'
        })
      )
      consoleSpy.mockRestore()
    })
  })
})
