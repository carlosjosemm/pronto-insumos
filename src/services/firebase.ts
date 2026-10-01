import { initializeApp } from 'firebase/app'
import { initializeFirestore, collection, doc, setDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { getCollectionName } from './firestoreEnv'
import { PRODUCTS } from '../data/products'

// Firebase Configuration via Vite environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ''
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig)

// App Check is abuse friction for the public `orders` create path (checkout runs
// client-side): once the Firebase Console enforces it, Firestore rejects
// unattested SDK writes. It is NOT authentication and validates no prices —
// the catalog/total authorities stay server-side. It must initialize BEFORE
// the Firestore/Auth instances so every subsequent request carries a token.
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY || ''
// A production-mode bundle (import.meta.env.PROD — true for every `vite
// build`, including one run outside Vercel) or a Vercel production runtime
// (VITE_VERCEL_ENV, the build-time define vite.config.ts injects from
// process.env.VERCEL_ENV) counts as production. PROD matters because the
// define is EMPTY on a locally-built production bundle — gating on the
// define alone would ship the debug flag there.
const isProductionRuntime = import.meta.env.PROD || import.meta.env.VITE_VERCEL_ENV === 'production'

if (appCheckSiteKey) {
  // Debug tokens let local/dev browsers through reCAPTCHA; registering one is
  // a Firebase Console action. Never set this in a production runtime: a debug
  // token mints attestation that bypasses reCAPTCHA entirely. The optional
  // env value pins a specific registered token; `true` asks the SDK to print a
  // fresh one to the console for registration.
  if (!isProductionRuntime && typeof self !== 'undefined') {
    // `self` carries no typed slot for the SDK's debug flag, hence the cast.
    ;(self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
      import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || true
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    })
  } catch (err: unknown) {
    // Any synchronous App Check initialization failure must never blank the
    // storefront — the classic case is Vite HMR re-running this module scope,
    // which the SDK answers with an already-initialized throw.
    console.warn('Firebase App Check initialization failed; continuing without a new instance.', err)
  }
} else if (isProductionRuntime) {
  // Fail-visible, not fail-fatal: with Console enforcement on but no site key,
  // order writes are rejected — this error makes the misconfiguration visible.
  console.error(
    'VITE_FIREBASE_RECAPTCHA_SITE_KEY is not configured in a production runtime; Firebase App Check is NOT active.'
  )
} else {
  console.warn('VITE_FIREBASE_RECAPTCHA_SITE_KEY is not configured; Firebase App Check is not initialized.')
}

// `ignoreUndefinedProperties` keeps the optional domain fields (`razonSocial?`,
// `giroComercial?`, `sanitaryVerification?`) writable. The Web SDK throws
// `Unsupported field value: undefined` on them by default, which made EVERY
// checkout write fail silently (the "ghost order" root cause).
//
// Auth is deliberately NOT initialized here: `getAuth(app)` throws
// synchronously (`auth/invalid-api-key`) when the API key is missing/invalid,
// and a module-scope call would blank the whole storefront at import time —
// over an admin-only concern the storefront never uses. The admin tree owns
// the guarded accessor (src/admin/services/adminFirebase.ts), which also
// keeps firebase/auth out of the storefront bundle.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true })

export interface SeedResult {
  success: boolean
  count?: number
  message?: string
  error?: string
}

/**
 * Utility to seed the initial dental product catalog into Firestore
 */
export async function seedProductsToFirestore(): Promise<SeedResult> {
  try {
    const colName = getCollectionName('products')
    const productsRef = collection(db, colName)
    const snapshot = await getDocs(productsRef)

    // Seed only if collection is empty
    if (snapshot.empty) {
      for (const product of PRODUCTS) {
        await setDoc(doc(db, colName, product.id), {
          ...product,
          createdAt: serverTimestamp()
        })
      }
      return {
        success: true,
        count: PRODUCTS.length,
        message: 'Catálogo odontológico sembrado exitosamente en Firestore.'
      }
    }
    return { success: true, count: snapshot.size, message: 'Firestore ya contiene productos sembrados.' }
  } catch (error: unknown) {
    console.error('Error al sembrar base de datos en Firestore:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' }
  }
}
