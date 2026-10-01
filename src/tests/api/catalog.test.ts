import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../../api/catalog'
import * as firebaseAdminLib from '../../../api/_lib/firebaseAdmin'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { LOW_STOCK_PUBLIC_THRESHOLD } from '../../../src/config/catalog'

vi.mock('../../../api/_lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn()
}))

/** Firestore Admin double over a fixed document set. */
function mockCatalogDb(products: Record<string, Record<string, unknown>>) {
  return {
    collection: vi.fn().mockImplementation(() => ({
      doc: vi.fn().mockImplementation((id: string) => ({
        get: vi.fn().mockImplementation(async () => {
          const data = products[id]
          if (data === undefined) return { exists: false, data: () => undefined }
          return { exists: true, data: () => data }
        })
      })),
      get: vi.fn().mockImplementation(async () => ({
        docs: Object.entries(products).map(([id, data]) => ({ id, data: () => data }))
      }))
    }))
  }
}

const productFixture = (overrides: Record<string, unknown> = {}) => ({
  name: 'Turbina Odontológica LED',
  category: 'INSTRUMENTAL Y ACCESORIOS',
  price: 189990,
  rating: 4.8,
  reviewsCount: 12,
  inStock: true,
  stockCount: 25,
  isActive: true,
  prescriptionRequired: false,
  tag: 'Más Vendido',
  description: 'Pieza de mano de alta velocidad',
  specs: ['420.000 RPM'],
  placeholderTheme: 'gradient-teal',
  sku: 'OD-101',
  // Internal fields the allowlist must never disclose:
  ispRegistrationNumber: 'ISP-F-14220',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides
})

describe('Public catalog endpoint (/api/catalog)', () => {
  let mockRes: Partial<VercelResponse>
  let jsonOutput: unknown
  let statusOutput: number
  let headers: Record<string, string>

  beforeEach(() => {
    vi.clearAllMocks()
    jsonOutput = undefined
    statusOutput = 200
    headers = {}
    mockRes = {
      setHeader: vi.fn((key: string, value: string) => {
        headers[key.toLowerCase()] = value
        return mockRes as VercelResponse
      }),
      status: vi.fn((code: number) => {
        statusOutput = code
        return mockRes as VercelResponse
      }),
      json: vi.fn((data: unknown) => {
        jsonOutput = data
        return mockRes as VercelResponse
      }),
      end: vi.fn()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('answers the OPTIONS preflight with 200', async () => {
    await handler({ method: 'OPTIONS' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(200)
    expect(mockRes.end).toHaveBeenCalled()
  })

  it('refuses non-GET/POST methods with 405', async () => {
    await handler({ method: 'PUT' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(405)
  })

  it('serves only active products through the explicit public-field allowlist', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockCatalogDb({
        'odon-101': productFixture(),
        'odon-paused': productFixture({ isActive: false })
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)

    expect(statusOutput).toBe(200)
    const products = jsonOutput as Array<Record<string, unknown>>
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({ id: 'odon-101', name: 'Turbina Odontológica LED', price: 189990 })

    // Allowlist: internal fields never leave the server.
    const serialized = JSON.stringify(products)
    expect(serialized).not.toContain('ispRegistrationNumber')
    expect(serialized).not.toContain('createdAt')
    expect(serialized).not.toContain('updatedAt')
    expect(serialized).not.toContain('isActive')
  })

  it('discloses stockCount only when it is 1–3 and omits it otherwise', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockCatalogDb({
        'odon-low': productFixture({ stockCount: LOW_STOCK_PUBLIC_THRESHOLD }),
        'odon-plenty': productFixture({ stockCount: 40 }),
        'odon-depleted': productFixture({ stockCount: 0 })
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)

    const products = jsonOutput as Array<Record<string, unknown>>
    const byId = Object.fromEntries(products.map((p) => [p.id, p]))
    expect(byId['odon-low'].stockCount).toBe(LOW_STOCK_PUBLIC_THRESHOLD)
    expect('stockCount' in byId['odon-plenty']).toBe(false)
    expect('stockCount' in byId['odon-depleted']).toBe(false)
    // Availability itself stays public as the general signal.
    expect(byId['odon-plenty'].inStock).toBe(true)
  })

  it('marks GET as CDN-cacheable and POST as no-store', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockCatalogDb({}) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(200)
    // An empty catalog is an explicit empty array, never an error shape.
    expect(jsonOutput).toEqual([])
    expect(headers['cache-control']).toBe('public, s-maxage=60, stale-while-revalidate=300')

    await handler(
      { method: 'POST', body: { ids: ['odon-101'] } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )
    expect(headers['cache-control']).toBe('no-store')
  })

  it('caps the POST batch at 50 ids and each id at 64 characters', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockCatalogDb({}) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handler(
      { method: 'POST', body: { ids: Array.from({ length: 51 }, (_, i) => `odon-${i}`) } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )
    expect(statusOutput).toBe(400)

    await handler(
      { method: 'POST', body: { ids: ['o'.repeat(65)] } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )
    expect(statusOutput).toBe(400)
    consoleSpy.mockRestore()
  })

  it('answers POST { ids } with the same allowlisted shape, skipping unknown and paused products', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockCatalogDb({
        'odon-101': productFixture({ stockCount: 2 }),
        'odon-paused': productFixture({ isActive: false })
      }) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler(
      { method: 'POST', body: { ids: ['odon-101', 'odon-paused', 'odon-ghost'] } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )

    expect(statusOutput).toBe(200)
    const products = jsonOutput as Array<Record<string, unknown>>
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({ id: 'odon-101', stockCount: 2 })
  })

  it('refuses a malformed POST body with 400', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(
      mockCatalogDb({}) as unknown as ReturnType<typeof firebaseAdminLib.getAdminFirestore>
    )

    await handler({ method: 'POST', body: {} } as unknown as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(400)

    await handler({ method: 'POST', body: { ids: [] } } as unknown as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(400)

    await handler({ method: 'POST', body: { ids: [42] } } as unknown as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(400)
  })

  it('fails closed with 503 when Firestore Admin is unavailable', async () => {
    vi.mocked(firebaseAdminLib.getAdminFirestore).mockReturnValue(null)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handler({ method: 'GET' } as VercelRequest, mockRes as VercelResponse)
    expect(statusOutput).toBe(503)

    await handler(
      { method: 'POST', body: { ids: ['odon-101'] } } as unknown as VercelRequest,
      mockRes as VercelResponse
    )
    expect(statusOutput).toBe(503)
    errorSpy.mockRestore()
  })
})
