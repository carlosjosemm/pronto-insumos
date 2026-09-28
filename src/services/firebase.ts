import { initializeApp } from 'firebase/app'
import { initializeFirestore, collection, doc, setDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
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
const app = initializeApp(firebaseConfig)
// `ignoreUndefinedProperties` keeps the optional domain fields (`razonSocial?`,
// `giroComercial?`, `sanitaryVerification?`) writable. The Web SDK throws
// `Unsupported field value: undefined` on them by default, which made EVERY
// checkout write fail silently (the Task 0.11 "ghost order" root cause).
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true })
export const auth = getAuth(app)

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
