export type FirestoreCollectionKey =
  | 'products'
  | 'orders'
  | 'order_status_history'
  | 'inventory_audit_logs'

export type FirestoreEnvironment = 'production' | 'development' | 'test'

/**
 * Resolves current client-side Firestore environment.
 * Priority:
 * 1. Explicit VITE_FIRESTORE_ENV ('production' | 'development' | 'test')
 * 2. If running under Vitest ('test') -> returns 'test' (canonical collection names)
 * 3. If import.meta.env.DEV -> returns 'development' (dev_* prefixed collections)
 * 4. Default -> 'production' (canonical collection names)
 */
export function getFirestoreEnv(): FirestoreEnvironment {
  const explicit = import.meta.env?.VITE_FIRESTORE_ENV
  if (explicit === 'development' || explicit === 'dev') return 'development'
  if (explicit === 'production' || explicit === 'prod') return 'production'
  if (explicit === 'test') return 'test'

  // If Vitest test runner is executing
  if (import.meta.env?.MODE === 'test') {
    return 'test'
  }

  // Local Vite dev server
  if (import.meta.env?.DEV) {
    return 'development'
  }

  // Vercel Preview environment
  if (import.meta.env?.VITE_VERCEL_ENV === 'preview') {
    return 'development'
  }

  return 'production'
}

/**
 * Returns the environment-scoped Firestore collection name.
 * In development: 'dev_orders', 'dev_products', etc.
 * In production or test: 'orders', 'products', etc.
 */
export function getCollectionName(baseName: FirestoreCollectionKey | string): string {
  const env = getFirestoreEnv()
  if (env === 'development' && !baseName.startsWith('dev_')) {
    return `dev_${baseName}`
  }
  return baseName
}
