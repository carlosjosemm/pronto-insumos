import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { fetchProducts, validatePromo, submitOrder, generateOrderId } from '../../services/api'
import { PRODUCTS } from '../../data/products'
import { Product } from '../../types'

describe('fetchProducts - filtering', () => {
  it('should return all products when no filters applied', async () => {
    const result = await fetchProducts()
    expect(result.length).toBe(PRODUCTS.length)
  })

  it('should filter by category "INSTRUMENTAL Y ACCESORIOS"', async () => {
    const result = await fetchProducts({ category: 'INSTRUMENTAL Y ACCESORIOS' })
    expect(result.length).toBeGreaterThan(0)
    for (const p of result) {
      expect(p.category.toLowerCase()).toBe('instrumental y accesorios')
    }
  })

  it('should filter by category "OPERATORIA"', async () => {
    const result = await fetchProducts({ category: 'OPERATORIA' })
    expect(result.length).toBeGreaterThan(0)
    for (const p of result) {
      expect(p.category.toLowerCase()).toBe('operatoria')
    }
  })

  it('should return all products when category is "all"', async () => {
    const result = await fetchProducts({ category: 'all' })
    expect(result.length).toBe(PRODUCTS.length)
  })

  it('should return no products for a non-existent category', async () => {
    const result = await fetchProducts({ category: 'NonExistent' })
    expect(result.length).toBe(0)
  })

  it('should filter by search term matching product name', async () => {
    const result = await fetchProducts({ search: 'turbina' })
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].name.toLowerCase()).toContain('turbina')
  })

  it('should filter by search term matching description', async () => {
    const result = await fetchProducts({ search: 'fotocurado' })
    expect(result.length).toBeGreaterThan(0)
  })

  it('should return no products for an unmatched search', async () => {
    const result = await fetchProducts({ search: 'xyznonexistenttermxyz' })
    expect(result.length).toBe(0)
  })

  it('should filter by inStockOnly', async () => {
    const result = await fetchProducts({ inStockOnly: true })
    for (const p of result) {
      expect(p.inStock).toBe(true)
    }
  })

  it('should combine category and search filters', async () => {
    const result = await fetchProducts({ category: 'INSTRUMENTAL Y ACCESORIOS', search: 'turbina' })
    expect(result.length).toBeGreaterThan(0)
    for (const p of result) {
      expect(p.category.toLowerCase()).toBe('instrumental y accesorios')
      expect(p.name.toLowerCase()).toContain('turbina')
    }
  })
})

describe('fetchProducts - sorting', () => {
  it('should sort by price low to high', async () => {
    const result = await fetchProducts({ sortBy: 'price-low' })
    for (let i = 1; i < result.length; i++) {
      expect(result[i].price).toBeGreaterThanOrEqual(result[i - 1].price)
    }
  })

  it('should sort by price high to low', async () => {
    const result = await fetchProducts({ sortBy: 'price-high' })
    for (let i = 1; i < result.length; i++) {
      expect(result[i].price).toBeLessThanOrEqual(result[i - 1].price)
    }
  })

  it('should sort by rating descending', async () => {
    const result = await fetchProducts({ sortBy: 'rating' })
    for (let i = 1; i < result.length; i++) {
      expect(result[i].rating).toBeLessThanOrEqual(result[i - 1].rating)
    }
  })

  it('should sort by reviews descending', async () => {
    const result = await fetchProducts({ sortBy: 'reviews' })
    for (let i = 1; i < result.length; i++) {
      expect(result[i].reviewsCount).toBeLessThanOrEqual(result[i - 1].reviewsCount)
    }
  })

  const isAvailable = (p: Product) => Boolean(p.inStock && (p.stockCount === undefined || p.stockCount > 0))

  it('should push out-of-stock products to the bottom of the catalog list', async () => {
    const originalStock = PRODUCTS[0].inStock
    const originalCount = PRODUCTS[0].stockCount
    try {
      PRODUCTS[0].inStock = true
      PRODUCTS[0].stockCount = 10
      const result = await fetchProducts()

      // The seeded in-stock product must lead the catalog
      expect(result[0].id).toBe(PRODUCTS[0].id)
      expect(isAvailable(result[0])).toBe(true)

      // Every in-stock product must precede every out-of-stock product
      const firstOutOfStockIndex = result.findIndex((p) => !isAvailable(p))
      if (firstOutOfStockIndex !== -1) {
        expect(result.slice(firstOutOfStockIndex).every((p) => !isAvailable(p))).toBe(true)
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
      const result = await fetchProducts({ sortBy: 'price-low' })
      const inStock = result.filter(isAvailable)

      expect(inStock.length).toBe(2)
      expect(inStock[0].price).toBeLessThanOrEqual(inStock[1].price)
      expect(result[0].id).toBe(inStock[0].id)
      expect(result[1].id).toBe(inStock[1].id)
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
    expect(result.orderId).toMatch(/^PRONTO-\d{6}$/)
    expect(result.total).toBe(100000)
    expect(result.itemsCount).toBe(2)

    expect(setDoc).toHaveBeenCalledTimes(1)
    const [docRef, submittedPayload] = vi.mocked(setDoc).mock.calls[0] as any
    expect(docRef.id).toBe(result.orderId)
    expect(submittedPayload.status).toBe('PENDIENTE_PAGO_MERCADOPAGO')
    expect(submittedPayload.paymentMethod).toBe('mercadopago')
    expect(submittedPayload.orderId).toBe(result.orderId)
    expect(submittedPayload.items).toHaveLength(1)
    expect(submittedPayload.items[0].quantity).toBe(2)
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
    const submittedPayload = vi.mocked(setDoc).mock.calls[0][1] as any
    expect(submittedPayload.status).toBe('PENDIENTE_TRANSFERENCIA')
    expect(submittedPayload.paymentMethod).toBe('transferencia')
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
    const submittedPayload = vi.mocked(setDoc).mock.calls[0][1] as any
    expect(submittedPayload.status).toBe('COTIZACION_SOLICITADA_WHATSAPP')
  })

  it('should handle Firestore save error gracefully without throwing', async () => {
    const { setDoc } = await import('firebase/firestore')
    vi.mocked(setDoc).mockRejectedValueOnce(new Error('Network disconnected'))

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await submitOrder({
      items: mockItems,
      total: 50000,
      customer: mockCustomer,
      paymentMethod: 'mercadopago'
    })

    expect(result.success).toBe(true)
    expect(result.orderId).toMatch(/^PRONTO-\d{6}$/)
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
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

    const [docRef, submittedPayload] = vi.mocked(setDoc).mock.calls[0] as any
    expect(docRef.id).toBe(customId)
    expect(submittedPayload.orderId).toBe(customId)
  })

  it('generateOrderId should return unique identifiers in format PRONTO-XXXXXX', () => {
    const id1 = generateOrderId()
    const id2 = generateOrderId()

    expect(id1).toMatch(/^PRONTO-\d{6}$/)
    expect(id2).toMatch(/^PRONTO-\d{6}$/)
    expect(id1).not.toBe(id2)
  })
})
