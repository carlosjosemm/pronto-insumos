import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Mock firebaseAdmin before importing handler
vi.mock('../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn(() => null)
}))

import handler from '../../../api/order-confirmation'
import { getAdminFirestore } from '../../../api/_lib/firebaseAdmin'
import { THROTTLE_MESSAGE, THROTTLE_POLICIES } from '../../../api/_lib/abuseThrottle'
import { createThrottleCounters } from './helpers/throttleCounters'

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
    setHeader: ReturnType<typeof vi.fn>
  }
}

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

/**
 * Admin SDK double for the canonical order lookup: the document key
 * resolves first, the `orderId` field query only when the key is missing.
 *
 * The double also backs the `abuse_counters` collection and the
 * throttling transactions (`db.counters`), so the real counter code runs —
 * and a `fallback` routes the email-delivery claim/commit transactions to the
 * same mutable order state (`db.state.current`), with every transactional
 * `update()` payload recorded in `db.txUpdates`.
 */
function mockDbWithOrder(
  orderData: Record<string, unknown>,
  updateSpy = vi.fn().mockResolvedValue({}),
  options: { legacyFieldOnly?: boolean } = {}
) {
  const orderRef = { update: updateSpy }
  // The transaction double mutates `state.current` on every update — clone so
  // a committed write can never leak into the caller's fixture object.
  const state = { current: structuredClone(orderData) }
  const txUpdates: Array<Record<string, unknown>> = []
  const counters = createThrottleCounters({
    get: async () => ({ exists: true, ref: orderRef, data: () => state.current }),
    update: (_ref: unknown, data: Record<string, unknown>) => {
      txUpdates.push(data)
      applyOrderUpdate(state.current, data)
    }
  })
  const orderDoc = { id: 'PRONTO-123456', data: () => state.current, ref: orderRef }
  const db = {
    counters,
    state,
    txUpdates,
    collection: vi.fn().mockImplementation((name: string) =>
      String(name).includes('abuse_counters')
        ? counters.collection(name)
        : {
            doc: vi.fn().mockReturnValue({
              get: vi
                .fn()
                .mockResolvedValue(
                  options.legacyFieldOnly
                    ? { exists: false, ref: orderRef, data: () => undefined }
                    : { exists: true, ref: orderRef, data: () => state.current }
                )
            }),
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ empty: false, docs: [orderDoc] })
              })
            })
          }
    ),
    runTransaction: counters.runTransaction
  }
  return db
}

function mockDbWithoutOrder() {
  const counters = createThrottleCounters()
  const db = {
    counters,
    collection: vi.fn().mockImplementation((name: string) =>
      String(name).includes('abuse_counters')
        ? counters.collection(name)
        : {
            doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ exists: false }) }),
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ empty: true, docs: [] })
              })
            })
          }
    ),
    runTransaction: counters.runTransaction
  }
  return db
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

  it('fails closed with 503 when Firestore Admin is unavailable — never reports "sent"', async () => {
    const req = { method: 'POST', body: { orderId: 'PRONTO-123', rut: '12345678-5' } } as VercelRequest
    const res = createMockRes()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, emailSent: false }))
  })

  it('returns one identical 404 for an unknown order and for a wrong RUT — no enumeration oracle (Task 8.8)', async () => {
    vi.mocked(getAdminFirestore).mockReturnValue(
      mockDbWithoutOrder() as unknown as ReturnType<typeof getAdminFirestore>
    )
    const unknownRes = createMockRes()
    await handler({ method: 'POST', body: { orderId: 'PRONTO-999', rut: '12345678-5' } } as VercelRequest, unknownRes)

    vi.mocked(getAdminFirestore).mockReturnValue(
      mockDbWithOrder(validOrder) as unknown as ReturnType<typeof getAdminFirestore>
    )
    const mismatchRes = createMockRes()
    await handler(
      { method: 'POST', body: { orderId: 'PRONTO-123456', rut: '99999999-9' } } as VercelRequest,
      mismatchRes
    )

    expect(unknownRes.status).toHaveBeenCalledWith(404)
    expect(mismatchRes.status).toHaveBeenCalledWith(404)
    const payload = unknownRes.json.mock.calls[0][0]
    expect(mismatchRes.json.mock.calls[0][0]).toEqual(payload)
    expect(payload.error).toContain('No encontramos un pedido con ese código y RUT')
    expect(JSON.stringify(payload)).not.toContain('PRONTO-999')
  })

  it('refuses with 429 once the IP budget is locked, without reading the order', async () => {
    const db = mockDbWithoutOrder()
    db.counters.seedLocked('order-confirmation', 'ip', '200.83.10.4')
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

    const res = createMockRes()
    await handler(
      {
        method: 'POST',
        headers: { 'x-real-ip': '200.83.10.4' },
        body: { orderId: 'PRONTO-123456', rut: '12345678-5' }
      } as unknown as VercelRequest,
      res
    )

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith({ error: THROTTLE_MESSAGE })
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String))
  })

  it('locks the order key after N failed lookups (Task 8.8)', async () => {
    const db = mockDbWithoutOrder()
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)
    const maxFailures = THROTTLE_POLICIES['order-confirmation'].order.maxFailures

    for (let attempt = 0; attempt < maxFailures; attempt += 1) {
      const res = createMockRes()
      await handler({ method: 'POST', body: { orderId: 'PRONTO-999', rut: '12345678-5' } } as VercelRequest, res)
      expect(res.status).toHaveBeenCalledWith(404)
    }

    expect(db.counters.read('order-confirmation', 'order', 'PRONTO-999')).toMatchObject({
      failures: maxFailures
    })

    const lockedRes = createMockRes()
    await handler({ method: 'POST', body: { orderId: 'PRONTO-999', rut: '12345678-5' } } as VercelRequest, lockedRes)
    expect(lockedRes.status).toHaveBeenCalledWith(429)
  })

  it('records no failure and sends no second email when the lookup succeeds', async () => {
    const db = mockDbWithOrder(validOrder)
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = createMockRes()
    await handler({ method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12345678-5' } } as VercelRequest, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(db.counters.read('order-confirmation', 'order', 'PRONTO-123456')).toMatchObject({
      attempts: 1,
      failures: 0
    })
  })

  it('resolves a legacy document through the orderId field fallback when the document key differs (Task 0.12)', async () => {
    vi.mocked(getAdminFirestore).mockReturnValue(
      mockDbWithOrder(validOrder, vi.fn().mockResolvedValue({}), { legacyFieldOnly: true }) as unknown as ReturnType<
        typeof getAdminFirestore
      >
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const req = { method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12345678-5' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    // No Resend key in this suite → the send is skipped, but the order was resolved.
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ emailSent: false }))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('orderId field fallback'))
    warnSpy.mockRestore()
  })

  it('should skip send and return duplicate flag when confirmation was already sent', async () => {
    const db = mockDbWithOrder({ ...validOrder, confirmationEmailSentAt: '2026-09-21T10:00:00Z' })
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)
    const fetchSpy = vi.spyOn(global, 'fetch')

    const req = { method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12345678-5' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ duplicate: true, emailSent: false }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(db.txUpdates).toHaveLength(0)
  })

  it('treats an emailDelivery.confirmation sent marker as already-sent (no legacy field needed)', async () => {
    const db = mockDbWithOrder({
      ...validOrder,
      emailDelivery: { confirmation: { sentAt: '2026-09-29T10:00:00Z' } }
    })
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)
    const fetchSpy = vi.spyOn(global, 'fetch')

    const res = createMockRes()
    await handler({ method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12345678-5' } } as VercelRequest, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ duplicate: true, emailSent: false }))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not send while a fresh claim is in flight (concurrent sends at most once)', async () => {
    const db = mockDbWithOrder({
      ...validOrder,
      emailDelivery: { confirmation: { claimedAt: new Date().toISOString() } }
    })
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)
    const fetchSpy = vi.spyOn(global, 'fetch')

    const res = createMockRes()
    await handler({ method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12345678-5' } } as VercelRequest, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ emailSent: false, inFlight: true }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(db.txUpdates).toHaveLength(0)
  })

  it('reclaims a stale claim and sends (a crashed send must not lock the order forever)', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const staleClaim = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const db = mockDbWithOrder({
      ...validOrder,
      emailDelivery: { confirmation: { claimedAt: staleClaim } }
    })
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_xyz' })
    } as Response)

    const res = createMockRes()
    await handler({ method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12345678-5' } } as VercelRequest, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, emailSent: true }))
    expect(db.state.current.emailDelivery).toMatchObject({
      confirmation: expect.objectContaining({ sentAt: expect.any(String) })
    })
  })

  it('should return emailSent:false and record the failure when order has no customer email', async () => {
    const db = mockDbWithOrder({ ...validOrder, customer: { ...validOrder.customer, email: '' } })
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const req = { method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12345678-5' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ emailSent: false, reason: 'missing_customer_email' })
    )
    // The failed outcome is recorded so the backoffice can see it.
    expect(db.state.current.emailDelivery).toMatchObject({
      confirmation: expect.objectContaining({
        failedAt: expect.any(String),
        failureReason: 'missing_customer_email'
      })
    })
  })

  it('should send email via Resend and stamp the sent markers on success', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const db = mockDbWithOrder(validOrder)
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)

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

    // Sent markers committed: the shared telemetry map AND the legacy flag.
    expect(db.state.current.emailDelivery).toMatchObject({
      confirmation: expect.objectContaining({ sentAt: expect.any(String) })
    })
    expect(
      (db.state.current.emailDelivery as Record<string, Record<string, unknown>>).confirmation.claimedAt
    ).toBeUndefined()
    expect(db.state.current.confirmationEmailSentAt).toEqual(expect.any(String))
  })

  it('releases the claim and records the failure when Resend send fails (retry stays possible)', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const db = mockDbWithOrder(validOrder)
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)
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

    // No sent marker, claim released, failure recorded for backoffice visibility.
    const delivery = db.state.current.emailDelivery as Record<string, Record<string, unknown>>
    expect(delivery.confirmation.sentAt).toBeUndefined()
    expect(delivery.confirmation.claimedAt).toBeUndefined()
    expect(delivery.confirmation.failedAt).toEqual(expect.any(String))
    expect(delivery.confirmation.failureReason).toBe('http_500')
    expect(db.state.current.confirmationEmailSentAt).toBeUndefined()
  })

  it('retries cleanly after a recorded failure (second call sends and clears the failure)', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const db = mockDbWithOrder({
      ...validOrder,
      emailDelivery: {
        confirmation: {
          failedAt: '2026-09-29T10:00:00Z',
          failureReason: 'network_error'
        }
      }
    })
    vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_xyz' })
    } as Response)

    const res = createMockRes()
    await handler({ method: 'POST', body: { orderId: 'PRONTO-123456', rut: '12345678-5' } } as VercelRequest, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ emailSent: true }))
    const delivery = db.state.current.emailDelivery as Record<string, Record<string, unknown>>
    expect(delivery.confirmation.sentAt).toEqual(expect.any(String))
    expect(delivery.confirmation.failedAt).toBeUndefined()
    expect(delivery.confirmation.failureReason).toBeUndefined()
  })
})
