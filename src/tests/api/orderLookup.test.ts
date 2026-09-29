import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import type { VercelResponse } from '@vercel/node'
import {
  ORDER_LOOKUP_FAILED_MESSAGE,
  ORDER_LOOKUP_FAILED_STATUS,
  resolveOrderByCanonicalId,
  respondOrderLookupFailed
} from '../../../api/_lib/orderLookup'

const ORDER_ID = 'PRONTO-123456'

function createDb(options: { direct?: Record<string, unknown> | null; byField?: Record<string, unknown> | null }) {
  const directRef = { id: ORDER_ID }
  const fallbackRef = { id: 'legacy-doc' }

  const directGet = vi
    .fn()
    .mockResolvedValue(
      options.direct
        ? { exists: true, ref: directRef, data: () => options.direct }
        : { exists: false, ref: directRef, data: () => undefined }
    )
  const whereGet = vi
    .fn()
    .mockResolvedValue(
      options.byField
        ? { empty: false, docs: [{ id: 'legacy-doc', ref: fallbackRef, data: () => options.byField }] }
        : { empty: true, docs: [] }
    )
  const whereSpy = vi.fn(() => ({ limit: vi.fn(() => ({ get: whereGet })) }))
  const docSpy = vi.fn(() => ({ get: directGet }))

  const db = { collection: vi.fn(() => ({ doc: docSpy, where: whereSpy })) } as unknown as Firestore
  return { db, docSpy, whereSpy, directRef, fallbackRef }
}

describe('resolveOrderByCanonicalId (Task 0.12)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves the canonical document key without ever consulting the orderId field query', async () => {
    const order = { orderId: ORDER_ID, status: 'PENDIENTE_TRANSFERENCIA' }
    const { db, docSpy, whereSpy, directRef } = createDb({ direct: order })

    const resolved = await resolveOrderByCanonicalId(db, ORDER_ID)

    expect(docSpy).toHaveBeenCalledWith(ORDER_ID)
    expect(resolved?.ref).toBe(directRef)
    expect(resolved?.data).toBe(order)
    expect(whereSpy).not.toHaveBeenCalled()
  })

  it('falls back to the orderId field query for legacy documents and logs the resolution', async () => {
    const legacy = { orderId: ORDER_ID, status: 'ENTREGADO' }
    const { db, fallbackRef } = createDb({ direct: null, byField: legacy })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const resolved = await resolveOrderByCanonicalId(db, ORDER_ID)

    expect(resolved?.ref).toBe(fallbackRef)
    expect(resolved?.data).toBe(legacy)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('orderId field fallback'))
    warnSpy.mockRestore()
  })

  it('returns null when neither the document key nor the field query resolves', async () => {
    const { db } = createDb({ direct: null, byField: null })

    await expect(resolveOrderByCanonicalId(db, ORDER_ID)).resolves.toBeNull()
  })

  it('prefers the document key when a decoy document also matches the orderId field', async () => {
    const real = { orderId: ORDER_ID, status: 'PENDIENTE_TRANSFERENCIA' }
    const decoy = { orderId: ORDER_ID, status: 'ENTREGADO' }
    const { db, whereSpy } = createDb({ direct: real, byField: decoy })

    const resolved = await resolveOrderByCanonicalId(db, ORDER_ID)

    expect(resolved?.data).toBe(real)
    expect(whereSpy).not.toHaveBeenCalled()
  })

  it('never calls doc() for an id that cannot be a document path (malformed input degrades to not-found)', async () => {
    const { db, docSpy, whereSpy } = createDb({ direct: null, byField: null })

    // `CollectionReference.doc()` throws on these — a public endpoint must answer
    // "not found", not 500 with SDK internals.
    await expect(resolveOrderByCanonicalId(db, 'PRONTO-123456/2024')).resolves.toBeNull()
    await expect(resolveOrderByCanonicalId(db, '')).resolves.toBeNull()

    expect(docSpy).not.toHaveBeenCalled()
    expect(whereSpy).toHaveBeenCalledTimes(2)
  })
})

describe('Uniform lookup-failure contract (Task 8.8)', () => {
  it('answers one 404 with a single message and never echoes the probed id', () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    } as unknown as VercelResponse & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }

    respondOrderLookupFailed(res)

    expect(ORDER_LOOKUP_FAILED_STATUS).toBe(404)
    expect(res.status).toHaveBeenCalledWith(ORDER_LOOKUP_FAILED_STATUS)
    expect(res.json).toHaveBeenCalledWith({ error: ORDER_LOOKUP_FAILED_MESSAGE })
    expect(ORDER_LOOKUP_FAILED_MESSAGE).not.toMatch(/PRONTO-|\d{4,}/)
  })
})
