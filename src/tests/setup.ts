import '@testing-library/jest-dom'

/** Writable view of the Vite env so individual keys can be deleted per suite. */
const mutableEnv = import.meta.env as unknown as Record<string, unknown>

// Mock import.meta.env for test environment
if (typeof import.meta.env === 'undefined') {
  // @ts-expect-error import.meta.env is typed as always-present, but some runners leave it undefined
  import.meta.env = {}
}

// Provide fallback values for Firebase env vars so services don't crash during tests
Object.assign(import.meta.env, {
  VITE_FIREBASE_API_KEY: 'test-api-key-placeholder-for-unit-tests',
  VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'test-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'test.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  VITE_FIREBASE_APP_ID: '1:1234567890:web:abcdef',
  VITE_FIREBASE_MEASUREMENT_ID: 'G-TEST12345',
  VITE_WHATSAPP_NUMBER: '56912345678',
  VITE_MERCADOPAGO_PUBLIC_KEY: 'TEST-key-placeholder',
  ...import.meta.env
})

// Ensure developer .env.local Firestore environment settings do not leak into unit tests
delete process.env.FIRESTORE_ENV
delete process.env.VITE_FIRESTORE_ENV
delete mutableEnv.FIRESTORE_ENV
delete mutableEnv.VITE_FIRESTORE_ENV

// The spread above lets a developer's .env.local win over the placeholders. That is desirable for
// the Firebase keys, but UI-affecting values must stay deterministic or the assertions on the
// rendered phone number break on any machine with a real .env.local. Re-pin them explicitly.
Object.assign(mutableEnv, {
  VITE_WHATSAPP_NUMBER: '56912345678'
})

// Clean in-memory Storage implementation for test environment (fixes Node 22 jsdom limitation)
class LocalStorageMock implements Storage {
  private store: Record<string, string> = {}

  get length() {
    return Object.keys(this.store).length
  }

  clear() {
    this.store = {}
  }

  getItem(key: string): string | null {
    return this.store[key] ?? null
  }

  setItem(key: string, value: string) {
    this.store[key] = String(value)
  }

  removeItem(key: string) {
    delete this.store[key]
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null
  }
}

const mockStorage = new LocalStorageMock()

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true
  })
}

Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
  configurable: true
})
