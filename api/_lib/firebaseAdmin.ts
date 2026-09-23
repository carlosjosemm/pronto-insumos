import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let adminApp: App | null = null
let adminDb: Firestore | null = null

/**
 * Initializes and returns the singleton Firebase Admin instance.
 * Reads credentials strictly from serverless environment variables.
 */
export function getAdminApp(): App | null {
  if (adminApp) {
    return adminApp
  }

  const apps = getApps()
  if (apps.length > 0) {
    adminApp = apps[0]
    return adminApp
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const rawKey = process.env.FIREBASE_PRIVATE_KEY?.trim()
  const privateKey = rawKey
    ? rawKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n')
    : undefined

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      'Firebase Admin credentials missing. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.'
    )
    return null
  }

  try {
    adminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      })
    })
    return adminApp
  } catch (err: any) {
    console.error('Failed to initialize Firebase Admin app:', err.message)
    return null
  }
}

/**
 * Returns the Firestore database instance with administrative privileges.
 */
export function getAdminFirestore(): Firestore | null {
  if (adminDb) {
    return adminDb
  }

  const app = getAdminApp()
  if (!app) {
    return null
  }

  try {
    adminDb = getFirestore(app)
    return adminDb
  } catch (err: any) {
    console.error('Failed to get Firestore admin instance:', err.message)
    return null
  }
}
