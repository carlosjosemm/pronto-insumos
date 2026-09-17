export type FirestoreCollectionKey =
  | 'products'
  | 'orders'
  | 'order_status_history'
  | 'inventory_audit_logs'

export type FirestoreEnvironment = 'production' | 'development' | 'test'

/**
 * Resolves current serverless runtime Firestore environment.
 * Priority:
 * 1. Explicit FIRESTORE_ENV or VITE_FIRESTORE_ENV ('production' | 'development' | 'test')
 * 2. Vercel environment: VERCEL_ENV === 'preview' -> 'development'
 * 3. NODE_ENV === 'test' -> 'test'
 * 4. NODE_ENV === 'development' -> 'development'
 * 5. Default -> 'production'
 */
export function getFirestoreEnv(): FirestoreEnvironment {
  const explicit = process.env.FIRESTORE_ENV || process.env.VITE_FIRESTORE_ENV
  if (explicit === 'development' || explicit === 'dev') return 'development'
  if (explicit === 'production' || explicit === 'prod') return 'production'
  if (explicit === 'test') return 'test'

  if (process.env.NODE_ENV === 'test') {
    return 'test'
  }

  if (process.env.VERCEL_ENV === 'preview') {
    return 'development'
  }

  if (process.env.NODE_ENV === 'development') {
    return 'development'
  }

  return 'production'
}

/**
 * Returns the environment-scoped Firestore collection name for serverless functions.
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
