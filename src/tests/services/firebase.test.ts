import { describe, it, expect, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initializeFirestore: vi.fn((_app: unknown, settings: Record<string, unknown>) => ({ settings })),
  initializeApp: vi.fn(() => ({ name: 'test-app' })),
  getAuth: vi.fn(() => ({}))
}))

vi.mock('firebase/app', () => ({ initializeApp: mocks.initializeApp }))
vi.mock('firebase/firestore', () => ({
  initializeFirestore: mocks.initializeFirestore,
  collection: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn()
}))
vi.mock('firebase/auth', () => ({ getAuth: mocks.getAuth }))

import { db } from '../../services/firebase'

describe('Firebase client initialization (src/services/firebase.ts)', () => {
  it('should initialize Firestore with ignoreUndefinedProperties so optional domain fields never reject the write', () => {
    // Root cause of the Task 0.11 "ghost order": the Web SDK throws
    // `Unsupported field value: undefined` on optional fields (`razonSocial?`,
    // `giroComercial?`, `sanitaryVerification?`) unless this setting is present.
    expect(mocks.initializeFirestore).toHaveBeenCalledWith(expect.anything(), {
      ignoreUndefinedProperties: true
    })
    // The exported `db` is exactly the configured instance — not a later default-settings call.
    expect(db).toBe(mocks.initializeFirestore.mock.results[0].value)
  })
})
