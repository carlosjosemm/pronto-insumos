import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getFirestoreEnv, getCollectionName } from '../../../../api/lib/firestoreEnv'

describe('Serverless Firestore Environment Resolver (api/lib/firestoreEnv.ts)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    delete process.env.FIRESTORE_ENV
    delete process.env.VITE_FIRESTORE_ENV
    delete process.env.VERCEL_ENV
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('defaults to "test" in Vitest (NODE_ENV="test")', () => {
    expect(getFirestoreEnv()).toBe('test')
    expect(getCollectionName('orders')).toBe('orders')
    expect(getCollectionName('products')).toBe('products')
  })

  it('resolves explicit FIRESTORE_ENV="development" to prefix collections with dev_', () => {
    process.env.FIRESTORE_ENV = 'development'
    expect(getFirestoreEnv()).toBe('development')
    expect(getCollectionName('orders')).toBe('dev_orders')
    expect(getCollectionName('products')).toBe('dev_products')
    expect(getCollectionName('order_status_history')).toBe('dev_order_status_history')
    expect(getCollectionName('inventory_audit_logs')).toBe('dev_inventory_audit_logs')
  })

  it('resolves Vercel Preview deployments (VERCEL_ENV="preview") to development', () => {
    process.env.NODE_ENV = 'production'
    process.env.VERCEL_ENV = 'preview'
    expect(getFirestoreEnv()).toBe('development')
    expect(getCollectionName('orders')).toBe('dev_orders')
  })

  it('resolves explicit FIRESTORE_ENV="production" to canonical collection names', () => {
    process.env.FIRESTORE_ENV = 'production'
    expect(getFirestoreEnv()).toBe('production')
    expect(getCollectionName('orders')).toBe('orders')
    expect(getCollectionName('products')).toBe('products')
  })

  it('guarantees idempotency by not double-prefixing if string already starts with dev_', () => {
    process.env.FIRESTORE_ENV = 'development'
    expect(getCollectionName('dev_orders')).toBe('dev_orders')
    expect(getCollectionName('dev_products')).toBe('dev_products')
  })
})
