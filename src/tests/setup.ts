import '@testing-library/jest-dom'

// Mock import.meta.env for test environment
if (typeof import.meta.env === 'undefined') {
  // @ts-ignore
  import.meta.env = {}
}

// Provide fallback values for Firebase env vars so services don't crash during tests
Object.assign(import.meta.env, {
  VITE_FIREBASE_API_KEY: '',
  VITE_FIREBASE_AUTH_DOMAIN: '',
  VITE_FIREBASE_PROJECT_ID: '',
  VITE_FIREBASE_STORAGE_BUCKET: '',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '',
  VITE_FIREBASE_APP_ID: '',
  VITE_FIREBASE_MEASUREMENT_ID: '',
  VITE_WHATSAPP_NUMBER: '56912345678',
  VITE_MERCADOPAGO_PUBLIC_KEY: 'TEST-key-placeholder',
  ...import.meta.env
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
