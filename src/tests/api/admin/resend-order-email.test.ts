import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../../api/_lib/admin/resend-order-email'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

/**
 * Applies a Firestore `update()` payload (dot paths + FieldValue sentinels) to
 * the in-memory order state, so compare-and-swap checks in the real
 * email-delivery code see a realistic document between transactions.
 */
function applyOrderUpdate(target: Record<string, unknown>, update: Record<string, unknown>) {
  for (const [path, value] of Object.entries(update)) {
    const keys = path.split('.')
    let node = target
    for (let i = 0; i < keys.length - 1; i += 1) {
      const next = node[keys[i]]
      node[keys[i]] = next && typeof next === 'object' ? next : {}
      node = node[keys[i]] as Record<string, unknown>
    }
    const last = keys[keys.length - 1]
    const sentinelName =
      value && typeof value === 'object'
        ? String((value as { constructor?: { name?: string } }).constructor?.name || '')
        : ''
    if (sentinelName === 'DeleteTransform') {
      delete node[last]
    } else if (sentinelName === 'NumericIncrementTransform') {
      node[last] = (Number(node[last]) || 0) + Number((value as { operand?: number }).operand || 0)
    } else {
      node[last] = value
    }
  }
}

const baseOrder = {
  orderId: 'PRONTO-123456',
  status: 'PAGADO_MERCADOPAGO',
  paymentMethod: 'mercadopago',
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

interface MockDbOptions {
  orderData?: Record<string, unknown> | null
  orderExists?: boolean
}

/** Firestore Admin double: order resolution + claim/commit transactions + history write. */
function mockResendDb(options: MockDbOptions = {}) {
  const { orderData = baseOrder, orderExists = true } = options
  // The transaction double mutates `state.current` on every update — clone so
  // a committed write can never leak into the caller's fixture object.
  const state: { current: Record<string, unknown> } = {
    current: orderData ? structuredClone(orderData) : {}
  }
  const txUpdates: Array<Record<string, unknown>> = []
  const historyWrites: Array<Record<string, unknown>> = []
  const orderRef = { id: 'order-ref' }

  const collection = vi.fn((name: string) => {
    if (name === 'orders') {
      return {
        doc: vi.fn(() => ({
          get: vi
            .fn()
            .mockResolvedValue(
              orderExists ? { exists: true, ref: orderRef, data: () => state.current } : { exists: false }
            )
        })),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ empty: true, docs: [] })
          }))
        }))
      }
    }
    // order_status_history and any other collection
    return {
      doc: vi.fn(() => ({
        id: 'history-id',
        set: vi.fn(async (data: Record<string, unknown>) => {
          historyWrites.push(data)
        })
      }))
    }
  })

  const db = {
    collection,
    runTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const transaction = {
        get: vi.fn(async () => ({
          exists: orderExists,
          data: () => state.current
        })),
        update: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
          txUpdates.push(data)
          applyOrderUpdate(state.current, data)
        }),
        set: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
          historyWrites.push(data)
        })
      }
      return await callback(transaction)
    })
  }

  return { db, state, txUpdates, historyWrites, orderRef }
}

describe('Serverless Admin Resend Order Email (/api/admin/resend-order-email)', () => {
  let mockRes: Partial<VercelResponse>
  let jsonOutput: Record<string, unknown> = {}
  let statusOutput: number
  let keyBackup: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    jsonOutput = {}
    statusOutput = 200
    keyBackup = process.env.RESEND_API_KEY
    delete process.env.RESEND_API_KEY
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
    process.env.RESEND_API_KEY = keyBackup
    vi.restoreAllMocks()
  })

  const post = (body: Record<string, unknown>) => ({ method: 'POST', body }) as VercelRequest

  it('handles the OPTIONS preflight with 200', async () => {
    await handler({ method: 'OPTIONS' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(200)
    expect(mockRes.end).toHaveBeenCalled()
  })

  it('rejects non-POST methods with 405', async () => {
    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(405)
  })

  it('rejects unauthenticated requests with 403', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({
      authenticated: false,
      error: 'Token inválido'
    })
    await handler(post({ orderId: 'PRONTO-123456', kind: 'confirmation' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(403)
    expect(jsonOutput.success).toBe(false)
  })

  it('returns 400 when orderId is missing', async () => {
    await handler(post({ kind: 'confirmation' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(400)
  })

  it('returns 400 for an invalid kind', async () => {
    await handler(post({ orderId: 'PRONTO-123456', kind: 'invoice' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(400)
    expect(jsonOutput.success).toBe(false)
  })

  it('returns 500 when Firestore Admin is unavailable', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(null)
    await handler(post({ orderId: 'PRONTO-123456', kind: 'confirmation' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(500)
  })

  it('returns 404 for an unknown order', async () => {
    const { db } = mockResendDb({ orderExists: false })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(db as never)
    await handler(post({ orderId: 'PRONTO-999', kind: 'confirmation' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(404)
  })

  it('refuses the payment kind for an unpaid order (never sends a "paid" notice)', async () => {
    const { db } = mockResendDb({
      orderData: { ...baseOrder, status: 'PENDIENTE_TRANSFERENCIA', paymentMethod: 'transferencia' }
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(db as never)
    const fetchSpy = vi.spyOn(global, 'fetch')

    await handler(post({ orderId: 'PRONTO-123456', kind: 'payment' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(jsonOutput.success).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses when the order has no customer email — and records the cause', async () => {
    const { db, state } = mockResendDb({
      orderData: { ...baseOrder, customer: { ...baseOrder.customer, email: '' } }
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(db as never)
    await handler(post({ orderId: 'PRONTO-123456', kind: 'confirmation' }), mockRes as VercelResponse)
    expect(statusOutput).toBe(400)
    expect(String(jsonOutput.error)).toContain('correo')
    const delivery = state.current.emailDelivery as Record<string, Record<string, unknown>>
    expect(delivery.confirmation.failureReason).toBe('missing_customer_email')
  })

  it('refuses with 409 when the order leaves the paid set between lookup and claim', async () => {
    // The claim re-reads the document inside the transaction: a status that
    // moved in between must not send a "paid" notice. The double flips the
    // document when the first transaction runs — after the pre-claim lookup
    // already saw a paid order.
    const { db, state } = mockResendDb({
      orderData: { ...baseOrder, status: 'PAGADO_MERCADOPAGO' }
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(db as never)
    const fetchSpy = vi.spyOn(global, 'fetch')

    const innerRunTransaction = db.runTransaction as ReturnType<typeof vi.fn>
    db.runTransaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      state.current.status = 'CANCELADO'
      return innerRunTransaction(callback)
    }) as typeof db.runTransaction

    await handler(post({ orderId: 'PRONTO-123456', kind: 'payment' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(fetchSpy).not.toHaveBeenCalled()
    const delivery = state.current.emailDelivery as Record<string, Record<string, unknown>>
    expect(delivery.payment.failureReason).toBe('status_changed')
    expect(delivery.payment.claimedAt).toBeUndefined()
  })

  it('refuses with 409 while another send is in flight (no double send)', async () => {
    const { db } = mockResendDb({
      orderData: {
        ...baseOrder,
        emailDelivery: { confirmation: { claimedAt: new Date().toISOString() } }
      }
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(db as never)
    const fetchSpy = vi.spyOn(global, 'fetch')

    await handler(post({ orderId: 'PRONTO-123456', kind: 'confirmation' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(409)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses with 429 once the per-kind resend budget is exhausted', async () => {
    const { db } = mockResendDb({
      orderData: {
        ...baseOrder,
        emailDelivery: { confirmation: { sentAt: '2026-09-29T10:00:00Z', resendCount: 5 } }
      }
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(db as never)
    const fetchSpy = vi.spyOn(global, 'fetch')

    await handler(post({ orderId: 'PRONTO-123456', kind: 'confirmation' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(429)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('resends the confirmation email, stamps the entry, consumes a resend slot and audits the event', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const { db, state, historyWrites } = mockResendDb({
      orderData: { ...baseOrder, status: 'PENDIENTE_TRANSFERENCIA', paymentMethod: 'transferencia' }
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(db as never)
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_xyz' })
    } as Response)

    await handler(post({ orderId: 'PRONTO-123456', kind: 'confirmation' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput).toMatchObject({ success: true, resent: true, kind: 'confirmation' })

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(init?.body as string)
    expect(body.to).toEqual(['andrea@clinica.cl'])
    expect(body.subject).toContain('PRONTO-123456')

    const delivery = state.current.emailDelivery as Record<string, Record<string, unknown>>
    expect(delivery.confirmation.sentAt).toEqual(expect.any(String))
    expect(delivery.confirmation.claimedAt).toBeUndefined()
    expect(delivery.confirmation.resendCount).toBe(1)
    // The legacy flag is kept written for the confirmation kind.
    expect(state.current.confirmationEmailSentAt).toEqual(expect.any(String))

    expect(historyWrites).toHaveLength(1)
    expect(historyWrites[0]).toMatchObject({
      orderId: 'PRONTO-123456',
      previousStatus: 'PENDIENTE_TRANSFERENCIA',
      newStatus: 'PENDIENTE_TRANSFERENCIA',
      actorRole: 'ADMIN',
      metadata: expect.objectContaining({ event: 'CORREO_REENVIADO', emailKind: 'confirmation' })
    })
  })

  it('sends the Mercado Pago paid notice for a settled mercadopago order', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const { db } = mockResendDb()
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(db as never)
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_xyz' })
    } as Response)

    await handler(post({ orderId: 'PRONTO-123456', kind: 'payment' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
    expect(body.subject).toContain('Pago confirmado')
  })

  it('sends the transfer-approved notice for a PAGADO_TRANSFERENCIA order', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const { db } = mockResendDb({
      orderData: { ...baseOrder, status: 'PAGADO_TRANSFERENCIA', paymentMethod: 'whatsapp' }
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(db as never)
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_xyz' })
    } as Response)

    await handler(post({ orderId: 'PRONTO-123456', kind: 'payment' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
    expect(body.subject).toContain('Transferencia aprobada')
  })

  it('records the failure and returns 502 when the provider rejects the resend', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const { db, state, historyWrites } = mockResendDb({
      orderData: { ...baseOrder, status: 'PENDIENTE_TRANSFERENCIA' }
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(db as never)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Resend error'
    } as Response)

    await handler(post({ orderId: 'PRONTO-123456', kind: 'confirmation' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(502)
    expect(jsonOutput.success).toBe(false)
    const delivery = state.current.emailDelivery as Record<string, Record<string, unknown>>
    expect(delivery.confirmation.failedAt).toEqual(expect.any(String))
    expect(delivery.confirmation.failureReason).toBe('http_500')
    expect(delivery.confirmation.claimedAt).toBeUndefined()
    expect(delivery.confirmation.sentAt).toBeUndefined()
    expect(historyWrites).toHaveLength(0)
  })

  it('clears a previously recorded failure when the resend succeeds', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const { db, state } = mockResendDb({
      orderData: {
        ...baseOrder,
        status: 'PENDIENTE_TRANSFERENCIA',
        emailDelivery: {
          confirmation: { failedAt: '2026-09-29T10:00:00Z', failureReason: 'network_error' }
        }
      }
    })
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(db as never)
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_xyz' })
    } as Response)

    await handler(post({ orderId: 'PRONTO-123456', kind: 'confirmation' }), mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    const delivery = state.current.emailDelivery as Record<string, Record<string, unknown>>
    expect(delivery.confirmation.sentAt).toEqual(expect.any(String))
    expect(delivery.confirmation.failedAt).toBeUndefined()
    expect(delivery.confirmation.failureReason).toBeUndefined()
  })
})
