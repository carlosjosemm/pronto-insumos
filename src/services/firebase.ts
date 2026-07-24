import { initializeApp } from 'firebase/app'
import { getFirestore, collection, doc, setDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { PRODUCTS } from '../data/products'

// Firebase Configuration via Vite environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ""
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

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
    const productsRef = collection(db, 'products')
    const snapshot = await getDocs(productsRef)
    
    // Seed only if collection is empty
    if (snapshot.empty) {
      for (const product of PRODUCTS) {
        await setDoc(doc(db, 'products', product.id), {
          ...product,
          createdAt: serverTimestamp()
        })
      }
      return { success: true, count: PRODUCTS.length, message: 'Catálogo odontológico sembrado exitosamente en Firestore.' }
    }
    return { success: true, count: snapshot.size, message: 'Firestore ya contiene productos sembrados.' }
  } catch (error: any) {
    console.error('Error al sembrar base de datos en Firestore:', error)
    return { success: false, error: error.message || 'Error desconocido' }
  }
}
