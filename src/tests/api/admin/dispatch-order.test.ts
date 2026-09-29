import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from '../../../../api/_lib/admin/dispatch-order'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

describe('Serverless Admin Dispatch Order (/api/admin/dispatch-order)', () => {
  let mockRes: Partial<VercelResponse>
  let jsonOutput: Record<string, unknown> = {}
  let statusOutput: number

  beforeEach(() => {
    vi.clearAllMocks()
    jsonOutput = {}
    statusOutput = 200

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

  /**
   * Deep scan for `undefined` values. `JSON.stringify` drops them silently, which is
   * exactly the Task 0.15 failure mode: the Admin SDK rejects the write only when the
   * raw payload still carries the key.
   */
  function containsUndefined(value: unknown): boolean {
    if (value === undefined) return true
    if (Array.isArray(value)) return value.some(containsUndefined)
    if (value !== null && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some(containsUndefined)
    }
    return false
  }

  function mockDispatchDb(status = 'PAGADO_MERCADOPAGO') {
    const mockBatch = {
      update: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue([])
    }
    const mockDb = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          id: 'auto-generated-doc-id',
          get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ status }) })
        }))
      })),
      batch: vi.fn(() => mockBatch)
    }
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )
    return mockBatch
  }

  function dispatchRequest(body: Record<string, unknown>): VercelRequest {
    return { method: 'POST', body } as VercelRequest
  }

  function historyPayloadOf(mockBatch: ReturnType<typeof mockDispatchDb>): Record<string, unknown> {
    return mockBatch.set.mock.calls[0][1] as Record<string, unknown>
  }

  it('updates order status to DESPACHADO and records carrier information', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockUpdate = vi.fn().mockResolvedValue({})
    const mockBatch = {
      update: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue([])
    }
    const mockDoc = {
      get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ status: 'PAGADO_MERCADOPAGO' }) }),
      update: mockUpdate
    }

    const mockDb = {
      collection: vi.fn(() => ({ doc: vi.fn(() => mockDoc) })),
      batch: vi.fn(() => mockBatch)
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: {
        orderId: 'PRONTO-123456',
        carrier: 'starken',
        trackingCode: 'STK-998877'
      }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.status).toBe('DESPACHADO')
    expect(mockBatch.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'DESPACHADO',
        courier: 'starken',
        trackingNumber: 'STK-998877'
      })
    )
    expect(mockBatch.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        newStatus: 'DESPACHADO',
        actorRole: 'ADMIN'
      })
    )
  })

  it('falls back to query by orderId if direct doc lookup is not found', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })

    const mockBatch = {
      update: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue([])
    }
    const directDoc = {
      get: vi.fn().mockResolvedValue({ exists: false })
    }
    const queriedDoc = {
      ref: { id: 'auto-gen-id' },
      data: () => ({ status: 'TRANSFERENCIA_APROBADA' })
    }

    const mockDb = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => directDoc),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ empty: false, docs: [queriedDoc] })
          }))
        }))
      })),
      batch: vi.fn(() => mockBatch)
    }

    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockDb as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    const req = {
      method: 'POST',
      body: {
        orderId: 'PRONTO-FALLBACK-DISPATCH',
        carrier: 'chilexpress'
      }
    } as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.success).toBe(true)
    expect(jsonOutput.status).toBe('DESPACHADO')
  })

  it('dispatches without a tracking code and never writes an undefined value (Task 0.15)', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
    const mockBatch = mockDispatchDb()

    // The local Melipilla fleet ships without a guía, and the UI omits the field
    // entirely (`trackingCode.trim() || undefined`) — this is the crash path.
    await handler(
      dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'despacho_local_melipilla' }),
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    expect(jsonOutput.status).toBe('DESPACHADO')

    const updatePayload = mockBatch.update.mock.calls[0][1] as Record<string, unknown>
    expect(containsUndefined(updatePayload)).toBe(false)
    expect(updatePayload).not.toHaveProperty('trackingNumber')
    expect(updatePayload.courier).toBe('despacho_local_melipilla')
    expect(updatePayload.dispatch).not.toHaveProperty('trackingCode')
    expect(updatePayload.dispatch).toMatchObject({ carrier: 'despacho_local_melipilla' })

    const historyPayload = historyPayloadOf(mockBatch)
    expect(containsUndefined(historyPayload)).toBe(false)
    expect(historyPayload.metadata).toMatchObject({ trackingNumber: null })
    expect(historyPayload.reason).toBe('Despachado vía despacho_local_melipilla')
  })

  it('treats a blank or whitespace-only tracking code as absent (Task 0.15)', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
    const mockBatch = mockDispatchDb()

    await handler(
      dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'starken', trackingCode: '   ' }),
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    const updatePayload = mockBatch.update.mock.calls[0][1] as Record<string, unknown>
    expect(containsUndefined(updatePayload)).toBe(false)
    expect(updatePayload).not.toHaveProperty('trackingNumber')
    expect(updatePayload.dispatch).not.toHaveProperty('trackingCode')
    expect(historyPayloadOf(mockBatch).metadata).toMatchObject({ trackingNumber: null })
  })

  it('coerces a numeric tracking code into a trimmed string (Task 0.15)', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: true, uid: 'admin-1' })
    const mockBatch = mockDispatchDb()

    await handler(
      dispatchRequest({ orderId: 'PRONTO-123456', carrier: 'chilexpress', trackingCode: 998877 }),
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    const updatePayload = mockBatch.update.mock.calls[0][1] as Record<string, unknown>
    expect(containsUndefined(updatePayload)).toBe(false)
    expect(updatePayload.trackingNumber).toBe('998877')
    expect(updatePayload.dispatch).toMatchObject({ trackingCode: '998877' })
    expect(historyPayloadOf(mockBatch).metadata).toMatchObject({ trackingNumber: '998877' })
  })
})
