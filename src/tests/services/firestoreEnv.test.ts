import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getFirestoreEnv, getCollectionName } from '../../services/firestoreEnv'

/** Writable view of the Vite env so individual keys can be deleted per test. */
const mutableEnv = import.meta.env as unknown as Record<string, unknown>

describe('Client Firestore Environment Resolver (src/services/firestoreEnv.ts)', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    vi.resetModules()
    delete mutableEnv.VITE_FIRESTORE_ENV
    delete mutableEnv.FIRESTORE_ENV
    delete mutableEnv.VITE_VERCEL_ENV
  })

  afterEach(() => {
    // Restore original env
    Object.assign(import.meta.env, originalEnv)
  })

  it('defaults to "test" mode when running under Vitest runner (MODE="test")', () => {
    expect(getFirestoreEnv()).toBe('test')
    // In test mode, base collection names are preserved for mock predictability
    expect(getCollectionName('orders')).toBe('orders')
    expect(getCollectionName('products')).toBe('products')
    expect(getCollectionName('order_status_history')).toBe('order_status_history')
    expect(getCollectionName('inventory_audit_logs')).toBe('inventory_audit_logs')
  })

  it('resolves explicit VITE_FIRESTORE_ENV="development" to prefix collections with dev_', () => {
    import.meta.env.VITE_FIRESTORE_ENV = 'development'
    expect(getFirestoreEnv()).toBe('development')
    expect(getCollectionName('orders')).toBe('dev_orders')
    expect(getCollectionName('products')).toBe('dev_products')
    expect(getCollectionName('order_status_history')).toBe('dev_order_status_history')
    expect(getCollectionName('inventory_audit_logs')).toBe('dev_inventory_audit_logs')
  })

  it('resolves explicit VITE_FIRESTORE_ENV="production" to canonical collection names', () => {
    import.meta.env.VITE_FIRESTORE_ENV = 'production'
    expect(getFirestoreEnv()).toBe('production')
    expect(getCollectionName('orders')).toBe('orders')
    expect(getCollectionName('products')).toBe('products')
  })

  it('supports shorthand "dev" for development', () => {
    import.meta.env.VITE_FIRESTORE_ENV = 'dev'
    expect(getFirestoreEnv()).toBe('development')
    expect(getCollectionName('orders')).toBe('dev_orders')
  })

  it('resolves VITE_VERCEL_ENV="preview" to development environment when mode is not test', () => {
    import.meta.env.VITE_FIRESTORE_ENV = undefined
    const prevMode = import.meta.env.MODE
    delete mutableEnv.MODE
    mutableEnv.VITE_VERCEL_ENV = 'preview'

    expect(getFirestoreEnv()).toBe('development')
    expect(getCollectionName('products')).toBe('dev_products')

    // Restore
    import.meta.env.MODE = prevMode
    delete mutableEnv.VITE_VERCEL_ENV
  })

  it('guarantees idempotency by not double-prefixing if string already starts with dev_', () => {
    import.meta.env.VITE_FIRESTORE_ENV = 'development'
    expect(getCollectionName('dev_products')).toBe('dev_products')
    expect(getCollectionName('dev_orders')).toBe('dev_orders')
  })
})
