import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('firebase-admin/storage', () => ({
  getStorage: vi.fn()
}))
vi.mock('../../../../api/_lib/firebaseAdmin', () => ({
  getAdminApp: vi.fn(),
  getAdminFirestore: vi.fn()
}))
vi.mock('../../../../api/_lib/adminAuth', () => ({
  verifyAdminToken: vi.fn()
}))

import handler, {
  classifyVoucherObject,
  resolveSweepLimit,
  VOUCHER_ORPHAN_GRACE_MS,
  VOUCHER_SWEEP_DEFAULT_LIMIT,
  VOUCHER_SWEEP_MAX_LIMIT
} from '../../../../api/_lib/admin/voucher-housekeeping'
import * as adminAuth from '../../../../api/_lib/adminAuth'
import { getAdminApp, getAdminFirestore } from '../../../../api/_lib/firebaseAdmin'
import { getStorage } from 'firebase-admin/storage'

const HOUR_MS = 60 * 60 * 1000

/** An object older than the grace window — eligible for deletion when unreferenced. */
const oldObject = (name: string) => ({ name, timeCreated: new Date(Date.now() - 2 * HOUR_MS).toISOString() })
/** An object younger than the grace window — must always be left alone. */
const recentObject = (name: string) => ({ name, timeCreated: new Date(Date.now() - 60_000).toISOString() })

function createMockBucket(objects: Array<{ name: string; timeCreated?: string }>) {
  const deleteSpy = vi.fn().mockResolvedValue([{}])
  const fileSpy = vi.fn((path: string) => ({ path, delete: deleteSpy }))
  const getFiles = vi.fn(async ({ prefix }: { prefix: string }) => [
    objects
      .filter((object) => object.name.startsWith(prefix))
      .map((object) => ({
        name: object.name,
        metadata: object.timeCreated ? { timeCreated: object.timeCreated } : {}
      }))
  ])
  return {
    bucket: { name: 'pronto-insumos.firebasestorage.app', getFiles, file: fileSpy },
    deleteSpy,
    fileSpy,
    getFiles
  }
}

function createDb(
  fixtures: Array<{ id: string; data: Record<string, unknown> }>,
  whereHit?: { id: string; data: Record<string, unknown> }
) {
  const docs = fixtures.map((fixture) => ({ id: fixture.id, data: () => fixture.data }))
  const whereDocs = whereHit ? [{ id: whereHit.id, data: () => whereHit.data }] : []

  return {
    collection: vi.fn((name: string) => {
      if (name !== 'orders') return { doc: vi.fn(() => ({ id: 'unused' })) }
      return {
        get: vi.fn().mockResolvedValue({ docs, empty: docs.length === 0 }),
        doc: vi.fn((id: string) => {
          const hit = fixtures.find((fixture) => fixture.id === id)
          return {
            get: vi.fn().mockResolvedValue(hit ? { exists: true, data: () => hit.data } : { exists: false })
          }
        }),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ empty: whereDocs.length === 0, docs: whereDocs })
          }))
        }))
      }
    })
  }
}

function setupAdmin(db: unknown, bucket: ReturnType<typeof createMockBucket> | null) {
  vi.mocked(getAdminFirestore).mockReturnValue(db as unknown as ReturnType<typeof getAdminFirestore>)
  process.env.FIREBASE_PROJECT_ID = 'pronto-insumos'
  vi.mocked(getAdminApp).mockReturnValue({ options: {} } as unknown as ReturnType<typeof getAdminApp>)
  vi.mocked(getStorage).mockReturnValue({
    bucket: vi.fn(() => bucket?.bucket)
  } as unknown as ReturnType<typeof getStorage>)
}

describe('Voucher housekeeping pure helpers', () => {
  it('clamps a requested order limit into the bounded range', () => {
    expect(resolveSweepLimit(undefined)).toBe(VOUCHER_SWEEP_DEFAULT_LIMIT)
    expect(resolveSweepLimit('abc')).toBe(VOUCHER_SWEEP_DEFAULT_LIMIT)
    expect(resolveSweepLimit(0)).toBe(VOUCHER_SWEEP_DEFAULT_LIMIT)
    expect(resolveSweepLimit(-5)).toBe(VOUCHER_SWEEP_DEFAULT_LIMIT)
    expect(resolveSweepLimit(25)).toBe(25)
    expect(resolveSweepLimit(10_000)).toBe(VOUCHER_SWEEP_MAX_LIMIT)
  })

  it('keeps the referenced object, skips recent or unreadable ones, and deletes stale orphans', () => {
    const now = Date.now()
    const old = new Date(now - 2 * HOUR_MS).toISOString()
    const recent = new Date(now - 60_000).toISOString()

    expect(
      classifyVoucherObject(
        'vouchers/orders/A/keep.pdf',
        old,
        'vouchers/orders/A/keep.pdf',
        now,
        VOUCHER_ORPHAN_GRACE_MS
      )
    ).toBe('keep')
    expect(
      classifyVoucherObject(
        'vouchers/orders/A/orphan.pdf',
        old,
        'vouchers/orders/A/keep.pdf',
        now,
        VOUCHER_ORPHAN_GRACE_MS
      )
    ).toBe('delete')
    expect(classifyVoucherObject('vouchers/orders/A/fresh.pdf', recent, undefined, now, VOUCHER_ORPHAN_GRACE_MS)).toBe(
      'skip-recent'
    )
    // Unknown age: never delete blindly.
    expect(
      classifyVoucherObject('vouchers/orders/A/unknown.pdf', undefined, undefined, now, VOUCHER_ORPHAN_GRACE_MS)
    ).toBe('skip-recent')
    expect(
      classifyVoucherObject('vouchers/orders/A/bad.pdf', 'not-a-date', undefined, now, VOUCHER_ORPHAN_GRACE_MS)
    ).toBe('skip-recent')
  })
})

describe('Serverless Admin Voucher Housekeeping (/api/admin/voucher-housekeeping)', () => {
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
    delete process.env.FIREBASE_PROJECT_ID
  })

  it('acknowledges OPTIONS preflight with 200', async () => {
    await handler({ method: 'OPTIONS' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(200)
    expect(mockRes.end).toHaveBeenCalled()
  })

  it('rejects non-POST methods with 405', async () => {
    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(405)
  })

  it('rejects unauthenticated requests with 403', async () => {
    vi.mocked(adminAuth.verifyAdminToken).mockResolvedValue({ authenticated: false, error: 'Unauthorized' })
    await handler({ method: 'POST', body: {} } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(403)
  })

  it('returns 500 when Firestore Admin or the bucket is unavailable', async () => {
    setupAdmin(createDb([]), null)
    await handler({ method: 'POST', body: {} } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(500)

    vi.mocked(getAdminFirestore).mockReturnValue(null)
    await handler({ method: 'POST', body: {} } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(500)
  })

  it('deletes only unreferenced objects older than the grace window', async () => {
    const bucket = createMockBucket([
      oldObject('vouchers/orders/PRONTO-A/keep.pdf'),
      oldObject('vouchers/orders/PRONTO-A/orphan.pdf'),
      recentObject('vouchers/orders/PRONTO-A/fresh.pdf')
    ])
    const db = createDb([
      {
        id: 'PRONTO-A',
        data: { orderId: 'PRONTO-A', voucherStoragePath: 'vouchers/orders/PRONTO-A/keep.pdf' }
      }
    ])
    setupAdmin(db, bucket)

    await handler({ method: 'POST', body: {} } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput).toMatchObject({
      success: true,
      dryRun: false,
      scannedOrders: 1,
      scannedObjects: 3,
      deletedCount: 1,
      keptReferenced: 1,
      skippedRecent: 1
    })
    expect(jsonOutput.deletedSample).toEqual(['vouchers/orders/PRONTO-A/orphan.pdf'])
    // Only the orphan was ever handed to the bucket for deletion.
    expect(bucket.fileSpy.mock.calls.map((call) => call[0])).toEqual(['vouchers/orders/PRONTO-A/orphan.pdf'])
  })

  it('reports what would be deleted without touching Storage in a dry run', async () => {
    const bucket = createMockBucket([oldObject('vouchers/orders/PRONTO-A/orphan.pdf')])
    const db = createDb([{ id: 'PRONTO-A', data: { orderId: 'PRONTO-A' } }])
    setupAdmin(db, bucket)

    await handler({ method: 'POST', body: { dryRun: true } } as VercelRequest, mockRes as VercelResponse)

    expect(jsonOutput).toMatchObject({ success: true, dryRun: true, deletedCount: 1 })
    expect(bucket.fileSpy).not.toHaveBeenCalled()
  })

  it('scopes the sweep to one order when orderId is provided', async () => {
    const bucket = createMockBucket([
      oldObject('vouchers/orders/PRONTO-A/orphan-a.pdf'),
      oldObject('vouchers/orders/PRONTO-B/orphan-b.pdf')
    ])
    const db = createDb([
      { id: 'PRONTO-A', data: { orderId: 'PRONTO-A' } },
      { id: 'PRONTO-B', data: { orderId: 'PRONTO-B' } }
    ])
    setupAdmin(db, bucket)

    await handler({ method: 'POST', body: { orderId: 'PRONTO-A' } } as VercelRequest, mockRes as VercelResponse)

    expect(jsonOutput).toMatchObject({ scannedOrders: 1, deletedCount: 1 })
    expect(bucket.getFiles.mock.calls.map((call) => call[0].prefix)).toEqual(['vouchers/orders/PRONTO-A/'])
    expect(jsonOutput.deletedSample).toEqual(['vouchers/orders/PRONTO-A/orphan-a.pdf'])
  })

  it('resolves the order through the orderId query fallback', async () => {
    const bucket = createMockBucket([oldObject('vouchers/orders/PRONTO-A/orphan.pdf')])
    const db = createDb([], { id: 'PRONTO-DOC', data: { orderId: 'PRONTO-A' } })
    setupAdmin(db, bucket)

    await handler({ method: 'POST', body: { orderId: 'PRONTO-A' } } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.deletedCount).toBe(1)
  })

  it('returns 404 when the requested order does not exist', async () => {
    setupAdmin(createDb([]), createMockBucket([]))
    await handler({ method: 'POST', body: { orderId: 'PRONTO-GHOST' } } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(404)
  })

  it('records a listing failure instead of aborting the whole sweep', async () => {
    const bucket = createMockBucket([])
    bucket.getFiles.mockRejectedValueOnce(new Error('storage unavailable'))
    const db = createDb([{ id: 'PRONTO-A', data: { orderId: 'PRONTO-A' } }])
    setupAdmin(db, bucket)

    await handler({ method: 'POST', body: {} } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.deletedCount).toBe(0)
    expect((jsonOutput.failures as string[])[0]).toContain('storage unavailable')
  })

  it('records a failed delete without aborting the run', async () => {
    const bucket = createMockBucket([oldObject('vouchers/orders/PRONTO-A/orphan.pdf')])
    bucket.deleteSpy.mockRejectedValueOnce(new Error('permission denied'))
    const db = createDb([{ id: 'PRONTO-A', data: { orderId: 'PRONTO-A' } }])
    setupAdmin(db, bucket)

    await handler({ method: 'POST', body: {} } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.deletedCount).toBe(0)
    expect(jsonOutput.failures).toContain('vouchers/orders/PRONTO-A/orphan.pdf')
  })

  it('never deletes an object outside the voucher prefix, even if it is listed', async () => {
    // Defensive case: a real listing is always scoped to `vouchers/…`, but the delete
    // helper must still refuse anything else rather than trusting the listing.
    const bucket = createMockBucket([])
    bucket.getFiles.mockResolvedValueOnce([
      [{ name: 'secrets/leak.pdf', metadata: { timeCreated: new Date(Date.now() - 2 * HOUR_MS).toISOString() } }]
    ])
    const db = createDb([{ id: 'PRONTO-A', data: { orderId: 'PRONTO-A' } }])
    setupAdmin(db, bucket)

    await handler({ method: 'POST', body: {} } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    expect(jsonOutput.deletedCount).toBe(0)
    expect(bucket.fileSpy).not.toHaveBeenCalled()
    expect(jsonOutput.failures).toContain('secrets/leak.pdf')
  })

  it('returns 500 when the order read fails outright', async () => {
    const db = createDb([])
    db.collection = vi.fn(() => ({
      get: vi.fn().mockRejectedValue(new Error('firestore down')),
      doc: vi.fn(() => ({ get: vi.fn() })),
      where: vi.fn()
    }))
    setupAdmin(db, createMockBucket([]))

    await handler({ method: 'POST', body: {} } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(500)
    expect(jsonOutput.success).toBe(false)
  })
})
