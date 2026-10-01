import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Mock Firebase entirely before importing api.ts
vi.mock('../../services/firebase', () => ({
  db: {}
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  // Empty snapshot keeps the suite on the deterministic local-catalog fallback (no network, no warnings)
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn((_db, _col, id) => ({ id, path: `orders/${id}` })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => 'mock-timestamp')
}))

import {
  fetchProducts,
  validatePromo,
  submitOrder,
  generateOrderId,
  CATALOG_FETCH_TIMEOUT_MS
} from '../../services/api'
import { getDocs } from 'firebase/firestore'
import { PRODUCTS } from '../../data/products'
import { Product } from '../../types'

describe('fetchProducts - filtering', () => {
  it('should return all products when no filters applied', async () => {
    const { products } = await fetchProducts()
    expect(products.length).toBe(PRODUCTS.length)
  })

  it('should filter by category "INSTRUMENTAL Y ACCESORIOS"', async () => {
    const { products } = await fetchProducts({ category: 'INSTRUMENTAL Y ACCESORIOS' })
    expect(products.length).toBeGreaterThan(0)
    for (const p of products) {
      expect(p.category.toLowerCase()).toBe('instrumental y accesorios')
    }
  })

  it('should filter by category "OPERATORIA"', async () => {
    const { products } = await fetchProducts({ category: 'OPERATORIA' })
    expect(products.length).toBeGreaterThan(0)
    for (const p of products) {
      expect(p.category.toLowerCase()).toBe('operatoria')
    }
  })

  it('should return all products when category is "all"', async () => {
    const { products } = await fetchProducts({ category: 'all' })
    expect(products.length).toBe(PRODUCTS.length)
  })

  it('should return no products for a non-existent category', async () => {
    const { products } = await fetchProducts({ category: 'NonExistent' })
    expect(products.length).toBe(0)
  })

  it('should filter by search term matching product name', async () => {
    const { products } = await fetchProducts({ search: 'turbina' })
    expect(products.length).toBeGreaterThan(0)
    expect(products[0].name.toLowerCase()).toContain('turbina')
  })

  it('should filter by search term matching description', async () => {
    const { products } = await fetchProducts({ search: 'fotocurado' })
    expect(products.length).toBeGreaterThan(0)
  })

  it('should return no products for an unmatched search', async () => {
    const { products } = await fetchProducts({ search: 'xyznonexistenttermxyz' })
    expect(products.length).toBe(0)
  })

  it('should filter by inStockOnly', async () => {
    const { products } = await fetchProducts({ inStockOnly: true })
    for (const p of products) {
      expect(p.inStock).toBe(true)
    }
  })

  it('should combine category and search filters', async () => {
    const { products } = await fetchProducts({ category: 'INSTRUMENTAL Y ACCESORIOS', search: 'turbina' })
    expect(products.length).toBeGreaterThan(0)
    for (const p of products) {
      expect(p.category.toLowerCase()).toBe('instrumental y accesorios')
      expect(p.name.toLowerCase()).toContain('turbina')
    }
  })
})

describe('fetchProducts - sorting', () => {
  it('should sort by price low to high', async () => {
    const { products } = await fetchProducts({ sortBy: 'price-low' })
    for (let i = 1; i < products.length; i++) {
      expect(products[i].price).toBeGreaterThanOrEqual(products[i - 1].price)
    }
  })

  it('should sort by price high to low', async () => {
    const { products } = await fetchProducts({ sortBy: 'price-high' })
    for (let i = 1; i < products.length; i++) {
      expect(products[i].price).toBeLessThanOrEqual(products[i - 1].price)
    }
  })

  it('should sort by rating descending', async () => {
    const { products } = await fetchProducts({ sortBy: 'rating' })
    for (let i = 1; i < products.length; i++) {
      expect(products[i].rating).toBeLessThanOrEqual(products[i - 1].rating)
    }
  })

  it('should sort by reviews descending', async () => {
    const { products } = await fetchProducts({ sortBy: 'reviews' })
    for (let i = 1; i < products.length; i++) {
      expect(products[i].reviewsCount).toBeLessThanOrEqual(products[i - 1].reviewsCount)
    }
  })

  const isAvailable = (p: Product) => Boolean(p.inStock && (p.stockCount === undefined || p.stockCount > 0))

  it('should push out-of-stock products to the bottom of the catalog list', async () => {
    const originalStock = PRODUCTS[0].inStock
    const originalCount = PRODUCTS[0].stockCount
    try {
      PRODUCTS[0].inStock = true
      PRODUCTS[0].stockCount = 10
      const { products } = await fetchProducts()

      // The seeded in-stock product must lead the catalog
      expect(products[0].id).toBe(PRODUCTS[0].id)
      expect(isAvailable(products[0])).toBe(true)

      // Every in-stock product must precede every out-of-stock product
      const firstOutOfStockIndex = products.findIndex((p) => !isAvailable(p))
      if (firstOutOfStockIndex !== -1) {
        expect(products.slice(firstOutOfStockIndex).every((p) => !isAvailable(p))).toBe(true)
      }
    } finally {
      PRODUCTS[0].inStock = originalStock
      PRODUCTS[0].stockCount = originalCount
    }
  })

  it('should preserve the requested sort order inside the in-stock partition', async () => {
    const saved = PRODUCTS.slice(0, 2).map((p) => ({ inStock: p.inStock, stockCount: p.stockCount }))
    try {
      PRODUCTS.slice(0, 2).forEach((p) => {
        p.inStock = true
        p.stockCount = 10
      })
      const { products } = await fetchProducts({ sortBy: 'price-low' })
      const inStock = products.filter(isAvailable)

      expect(inStock.length).toBe(2)
      expect(inStock[0].price).toBeLessThanOrEqual(inStock[1].price)
      expect(products[0].id).toBe(inStock[0].id)
      expect(products[1].id).toBe(inStock[1].id)
    } finally {
      PRODUCTS.slice(0, 2).forEach((p, i) => {
        p.inStock = saved[i].inStock
        p.stockCount = saved[i].stockCount
      })
    }
  })
})

describe('validatePromo', () => {
  it('should accept PRONTO10 and return 10% discount', async () => {
    const result = await validatePromo('PRONTO10')
    expect(result.success).toBe(true)
    expect(result.promo?.discountPercent).toBe(10)
    expect(result.promo?.code).toBe('PRONTO10')
  })

  it('should accept DENT20 and return 20% discount', async () => {
    const result = await validatePromo('DENT20')
    expect(result.success).toBe(true)
    expect(result.promo?.discountPercent).toBe(20)
  })

  it('should be case-insensitive (accept lowercase)', async () => {
    const result = await validatePromo('pronto10')
    expect(result.success).toBe(true)
  })

  it('should trim whitespace around the code', async () => {
    const result = await validatePromo('  DENT20  ')
    expect(result.success).toBe(true)
  })

  it('should reject an invalid promo code', async () => {
    const result = await validatePromo('INVALIDCODE')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('should reject an empty string', async () => {
    const result = await validatePromo('')
    expect(result.success).toBe(false)
  })
})

describe('submitOrder', () => {
  const mockCustomer = {
    fullName: 'Dr. Test',
    email: 'test@clinic.cl',
    phone: '+56912345678',
    rut: '12.345.678-5',
    documentType: 'boleta' as const,
    address: 'Av. Ortuzar 100',
    city: 'Melipilla',
    zip: '9500000'
  }

  const mockItems = [
    {
      product: PRODUCTS[0],
      quantity: 2
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize Mercado Pago orders with status PENDIENTE_PAGO_MERCADOPAGO and write with orderId as document ID', async () => {
    const { setDoc } = await import('firebase/firestore')
    const result = await submitOrder({
      items: mockItems,
      total: 100000,
      customer: mockCustomer,
      paymentMethod: 'mercadopago'
    })

    expect(result.success).toBe(true)
    expect(result.orderId).toMatch(/^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$/)
    // The persisted/returned total is recomputed from the item lines (IVA incluido),
    // not the client-supplied figure — PRODUCTS[0] at 189990 × 2 = 379980.
    expect(result.total).toBe(379980)
    expect(result.itemsCount).toBe(2)

    expect(setDoc).toHaveBeenCalledTimes(1)
    const [docRef, submittedPayload] = vi.mocked(setDoc).mock.calls[0] as unknown as [
      { id: string },
      Record<string, unknown>
    ]
    expect(docRef.id).toBe(result.orderId)
    expect(submittedPayload.status).toBe('PENDIENTE_PAGO_MERCADOPAGO')
    expect(submittedPayload.paymentMethod).toBe('mercadopago')
    expect(submittedPayload.orderId).toBe(result.orderId)
    expect(submittedPayload.totalAmount).toBe(379980)
    const items = submittedPayload.items as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(2)
  })

  it('should persist promoCode and discountAmount when a promo code is provided', async () => {
    const { setDoc } = await import('firebase/firestore')
    const result = await submitOrder({
      items: mockItems,
      total: 100000,
      customer: mockCustomer,
      paymentMethod: 'mercadopago',
      promoCode: ' pronto10 '
    })

    expect(result.success).toBe(true)
    const submittedPayload = vi.mocked(setDoc).mock.calls[0][1] as unknown as Record<string, unknown>
    expect(submittedPayload.promoCode).toBe('PRONTO10')
    // 2 × 189990 list = 379980; 10% off per line: round(189990 × 0.9) = 170991 × 2 = 341982
    expect(submittedPayload.totalAmount).toBe(341982)
    expect(submittedPayload.discountAmount).toBe(37998)
    expect(result.total).toBe(341982)
  })

  it('should not write promo fields when no promo code is provided', async () => {
    const { setDoc } = await import('firebase/firestore')
    await submitOrder({
      items: mockItems,
      total: 50000,
      customer: mockCustomer,
      paymentMethod: 'mercadopago'
    })

    const submittedPayload = vi.mocked(setDoc).mock.calls[0][1] as unknown as Record<string, unknown>
    expect('promoCode' in submittedPayload).toBe(false)
    expect('discountAmount' in submittedPayload ? submittedPayload.discountAmount : undefined).toBeUndefined()
  })

  it('should initialize Transferencia orders with status PENDIENTE_TRANSFERENCIA', async () => {
    const { setDoc } = await import('firebase/firestore')
    const result = await submitOrder({
      items: mockItems,
      total: 50000,
      customer: mockCustomer,
      paymentMethod: 'transferencia'
    })

    expect(result.success).toBe(true)
    expect(setDoc).toHaveBeenCalledTimes(1)
    const submittedPayload = vi.mocked(setDoc).mock.calls[0][1] as unknown as Record<string, unknown>
    expect(submittedPayload.status).toBe('PENDIENTE_TRANSFERENCIA')
    expect(submittedPayload.paymentMethod).toBe('transferencia')
  })

  it('derives billing taxBreakdown, RUT and SII status instead of trusting the caller', async () => {
    const { setDoc } = await import('firebase/firestore')
    await submitOrder({
      items: mockItems,
      total: 100000,
      customer: mockCustomer,
      paymentMethod: 'transferencia',
      billing: {
        documentType: 'boleta',
        rut: '99.999.999-9',
        direccionFiscal: 'Otra Calle 1',
        comunaFiscal: 'San Antonio',
        taxBreakdown: { neto: 1, iva: 0, total: 1 },
        status: 'EMITIDO'
      }
    })

    const payload = vi.mocked(setDoc).mock.calls[0][1] as unknown as Record<string, unknown>
    const billing = payload.billing as Record<string, unknown>
    // 2 × 189990 = 379980 → neto round(379980 / 1.19) = 319311, iva = 60669.
    // The caller's forged breakdown, RUT and EMITIDO state are all discarded.
    expect(billing.taxBreakdown).toEqual({ neto: 319311, iva: 60669, total: 379980 })
    // The purchaser's RUT is stored in the canonical cleaned shape the
    // firestore.rules create contract pins (`12345678-5`), whatever format
    // the customer typed.
    expect(billing.rut).toBe('12345678-5')
    expect((payload.customer as Record<string, unknown>).rut).toBe('12345678-5')
    expect(billing.status).toBe('PENDIENTE_EMISION_SII')
    // Fiscal identity fields the caller legitimately supplies are preserved.
    expect(billing.direccionFiscal).toBe('Otra Calle 1')
    expect(billing.comunaFiscal).toBe('San Antonio')
  })

  it('should initialize WhatsApp orders with status COTIZACION_SOLICITADA_WHATSAPP', async () => {
    const { setDoc } = await import('firebase/firestore')
    const result = await submitOrder({
      items: mockItems,
      total: 75000,
      customer: mockCustomer,
      paymentMethod: 'whatsapp'
    })

    expect(result.success).toBe(true)
    expect(setDoc).toHaveBeenCalledTimes(1)
    const submittedPayload = vi.mocked(setDoc).mock.calls[0][1] as unknown as Record<string, unknown>
    expect(submittedPayload.status).toBe('COTIZACION_SOLICITADA_WHATSAPP')
  })

  it('should surface Firestore write failures instead of reporting success (Task 0.11)', async () => {
    const { setDoc } = await import('firebase/firestore')
    vi.mocked(setDoc).mockRejectedValueOnce(new Error('Missing or insufficient permissions.'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await submitOrder({
        items: mockItems,
        total: 50000,
        customer: mockCustomer,
        paymentMethod: 'mercadopago'
      })

      // Rules denial: the write was attempted, and checkout must see the failure
      // (`success: false`) so it can block payment initiation.
      expect(setDoc).toHaveBeenCalledTimes(1)
      const [docRef] = vi.mocked(setDoc).mock.calls[0] as unknown as [{ id: string }, unknown]
      expect(docRef.id).toBe(result.orderId)
      expect(result.success).toBe(false)
      expect(result.orderId).toMatch(/^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$/)
      expect(result.total).toBe(379980)
      expect(result.itemsCount).toBe(2)
      expect(consoleSpy).toHaveBeenCalled()
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('should accept and persist a custom canonical orderId', async () => {
    const { setDoc } = await import('firebase/firestore')
    const customId = 'PRONTO-999888'
    const result = await submitOrder({
      orderId: customId,
      items: mockItems,
      total: 50000,
      customer: mockCustomer,
      paymentMethod: 'mercadopago'
    })

    expect(result.success).toBe(true)
    expect(result.orderId).toBe(customId)

    const [docRef, submittedPayload] = vi.mocked(setDoc).mock.calls[0] as unknown as [
      { id: string },
      Record<string, unknown>
    ]
    expect(docRef.id).toBe(customId)
    expect(submittedPayload.orderId).toBe(customId)
  })

  it('generateOrderId should return unique identifiers in format PRONTO-XXXXXXXX', () => {
    const id1 = generateOrderId()
    const id2 = generateOrderId()

    expect(id1).toMatch(/^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$/)
    expect(id2).toMatch(/^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$/)
    expect(id1).not.toBe(id2)
  })
})

describe('Canonical order id entropy (Task 8.8)', () => {
  const orderIdPattern = /^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$/

  it('never reuses an id across 200 consecutive draws', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateOrderId()))

    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(orderIdPattern)
  })

  it('uses only the unambiguous Crockford base32 alphabet (no I, L, O, U)', () => {
    const chars = new Set(
      Array.from({ length: 200 }, () => generateOrderId()).flatMap((id) => id.replace('PRONTO-', '').split(''))
    )

    for (const char of chars) expect('0123456789ABCDEFGHJKMNPQRSTVWXYZ').toContain(char)
    expect([...chars].some((char) => 'ILOU'.includes(char))).toBe(false)
  })

  it('draws from crypto.getRandomValues, never Math.random', () => {
    // Content guard (same pattern as the bankDetails / firestore-rules suites): the
    // 900 000-value Math.random space is what made the tracking oracle walkable, so a
    // future "simplification" back to Math.random must fail here. The slice is bounded
    // to the function body so unrelated code in the same module cannot trip it.
    const source = fs.readFileSync(path.resolve(__dirname, '../../services/api.ts'), 'utf8')
    const start = source.indexOf('export function generateOrderId')
    const nextExport = source.indexOf('\nexport ', start + 1)
    const body = source.slice(start, nextExport === -1 ? undefined : nextExport)

    expect(start).toBeGreaterThan(-1)
    expect(body).toContain('crypto.getRandomValues')
    expect(body).not.toContain('Math.random')
  })
})

describe('fetchProducts - catalog source (Task 2.11)', () => {
  beforeEach(() => {
    vi.mocked(getDocs).mockResolvedValue({ empty: true, docs: [] } as never)
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    // The console spies below must never leak into a later suite: the production
    // fail-closed paths are asserted through exactly that channel.
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('serves the local fixture catalog outside production, flagged as fixtures', async () => {
    vi.stubEnv('VITE_VERCEL_ENV', 'preview')

    const res = await fetchProducts()

    expect(res.source).toBe('fixtures')
    expect(res.products).toHaveLength(PRODUCTS.length)
    expect(res.catalog).toHaveLength(PRODUCTS.length)
  })

  it('reports the unfiltered catalog separately from the filtered products', async () => {
    vi.stubEnv('VITE_VERCEL_ENV', 'preview')

    const res = await fetchProducts({ category: 'INSTRUMENTAL Y ACCESORIOS' })

    expect(res.source).toBe('fixtures')
    expect(res.products.length).toBeGreaterThan(0)
    expect(res.products.length).toBeLessThan(res.catalog.length)
    expect(res.catalog).toHaveLength(PRODUCTS.length)
  })

  it('refuses to fabricate a catalog in production when the snapshot is empty', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('VITE_VERCEL_ENV', 'production')

    const res = await fetchProducts()

    expect(res.source).toBe('unavailable')
    expect(res.products).toEqual([])
    expect(res.error).toBeTruthy()
    expect(errorSpy).toHaveBeenCalled()
    // The prototype fixtures must never reach a production payload.
    expect(JSON.stringify(res)).not.toContain('odon-')
  })

  it('refuses to fabricate a catalog in production when the read rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('VITE_VERCEL_ENV', 'production')
    vi.mocked(getDocs).mockRejectedValue(new Error('network down'))

    const res = await fetchProducts()

    expect(res.source).toBe('unavailable')
    expect(res.products).toEqual([])
    expect(JSON.stringify(res)).not.toContain('odon-')
  })

  it('refuses to fabricate a catalog in production when the read exceeds the timeout bound', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    vi.stubEnv('VITE_VERCEL_ENV', 'production')
    vi.mocked(getDocs).mockReturnValue(new Promise(() => {}) as never)

    const pending = fetchProducts()
    await vi.advanceTimersByTimeAsync(CATALOG_FETCH_TIMEOUT_MS)
    const res = await pending

    expect(res.source).toBe('unavailable')
    expect(res.products).toEqual([])
  })

  it('keeps the fixture fallback in production only with the explicit VITE_ALLOW_SIMULATED_PAYMENTS opt-in', async () => {
    vi.stubEnv('VITE_VERCEL_ENV', 'production')
    vi.stubEnv('VITE_ALLOW_SIMULATED_PAYMENTS', 'true')

    const res = await fetchProducts()

    expect(res.source).toBe('fixtures')
    expect(res.products).toHaveLength(PRODUCTS.length)
  })

  it('refuses to fabricate a catalog in production when Firebase credentials are absent', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('VITE_VERCEL_ENV', 'production')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '')
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')

    const res = await fetchProducts()

    expect(res.source).toBe('unavailable')
    expect(res.products).toEqual([])
  })

  it('does not reject the catalog when a document is missing its text fields (review P3)', async () => {
    vi.stubEnv('VITE_VERCEL_ENV', 'preview')
    vi.mocked(getDocs).mockResolvedValue({
      empty: false,
      docs: [
        { id: 'pronto-900', data: () => ({ id: 'pronto-900', category: 'OPERATORIA', isActive: true, inStock: true }) }
      ]
    } as never)

    const res = await fetchProducts({ search: 'turbina' })

    expect(res.source).toBe('firestore')
    expect(res.products).toEqual([])
    expect(res.catalog).toHaveLength(1)
  })

  it('returns the live catalog with the firestore source and drops paused documents', async () => {
    vi.mocked(getDocs).mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'pronto-001',
          data: () => ({ ...PRODUCTS[0], id: 'pronto-001', isActive: true, inStock: true, stockCount: 5 })
        },
        { id: 'pronto-002', data: () => ({ ...PRODUCTS[1], id: 'pronto-002', isActive: false }) }
      ]
    } as never)

    const res = await fetchProducts()

    expect(res.source).toBe('firestore')
    expect(res.products.map((p) => p.id)).toEqual(['pronto-001'])
  })
})
