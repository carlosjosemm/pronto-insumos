import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The initialization contract of `src/services/firebase.ts`:
 *
 * 1. `ignoreUndefinedProperties: true` — the Web SDK rejects `undefined`
 *    optional fields (`razonSocial?`, `giroComercial?`, `sanitaryVerification?`)
 *    by default, which is what silently broke every checkout write (the
 *    "ghost order" root cause).
 * 2. App Check initializes BETWEEN `initializeApp` and the Firestore/Auth
 *    instances, so SDK requests carry attestation from the first call. It is
 *    abuse friction for the public `orders` create path — never authentication
 *    and never price validation.
 *
 * The module reads `import.meta.env` at module scope, so every scenario
 * re-imports it fresh (`vi.resetModules()` + dynamic import) after mutating
 * the env object — the same pattern `transferVoucher.test.ts` uses.
 */

const mocks = vi.hoisted(() => {
  const state = {
    // Captured INSIDE the initializeAppCheck mock so the debug-token ordering
    // (assignment must happen BEFORE init) is proven, not assumed.
    debugTokenAtInit: [] as unknown[],
    options: [] as unknown[]
  }
  return {
    state,
    initializeApp: vi.fn(() => ({ name: 'test-app' })),
    initializeAppCheck: vi.fn((_app: unknown, options: unknown) => {
      state.options.push(options)
      state.debugTokenAtInit.push(
        typeof self !== 'undefined'
          ? (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN
          : undefined
      )
    }),
    ReCaptchaV3Provider: vi.fn((siteKey: string) => ({ provider: 'recaptcha-v3', siteKey })),
    initializeFirestore: vi.fn((_app: unknown, settings: Record<string, unknown>) => ({ settings })),
    // Deliberately hostile: if any storefront module ever calls getAuth at
    // import time again, this throw reproduces the blank-storefront failure
    // (`auth/invalid-api-key`) and fails the import.
    getAuth: vi.fn(() => {
      throw new Error('auth/invalid-api-key')
    })
  }
})

vi.mock('firebase/app', () => ({ initializeApp: mocks.initializeApp }))
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: mocks.initializeAppCheck,
  ReCaptchaV3Provider: mocks.ReCaptchaV3Provider
}))
vi.mock('firebase/firestore', () => ({
  initializeFirestore: mocks.initializeFirestore,
  collection: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn()
}))
vi.mock('firebase/auth', () => ({ getAuth: mocks.getAuth }))

const mutableEnv = import.meta.env as unknown as Record<string, unknown>

async function importFirebase() {
  vi.resetModules()
  return await import('../../services/firebase')
}

/** First call-order index of a mock, for cross-mock ordering assertions. */
function firstCallOrder(mock: { mock: { invocationCallOrder: number[] } }): number {
  expect(mock.mock.invocationCallOrder.length, 'expected the mock to have been called').toBeGreaterThan(0)
  return mock.mock.invocationCallOrder[0]
}

function currentDebugToken(): unknown {
  return (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.debugTokenAtInit.length = 0
  mocks.state.options.length = 0
  delete mutableEnv.VITE_FIREBASE_RECAPTCHA_SITE_KEY
  delete mutableEnv.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN
  delete mutableEnv.VITE_VERCEL_ENV
  delete (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN
})

afterEach(() => {
  vi.restoreAllMocks()
  delete mutableEnv.VITE_FIREBASE_RECAPTCHA_SITE_KEY
  delete mutableEnv.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN
  delete mutableEnv.VITE_VERCEL_ENV
  delete (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN
})

describe('Firebase client initialization (src/services/firebase.ts)', () => {
  it('should initialize Firestore with ignoreUndefinedProperties so optional domain fields never reject the write', async () => {
    mutableEnv.VITE_FIREBASE_RECAPTCHA_SITE_KEY = 'test-site-key'
    const { db } = await importFirebase()

    expect(mocks.initializeFirestore).toHaveBeenCalledWith(expect.anything(), {
      ignoreUndefinedProperties: true
    })
    // The exported `db` is exactly the configured instance — not a later default-settings call.
    expect(db).toBe(mocks.initializeFirestore.mock.results[mocks.initializeFirestore.mock.calls.length - 1].value)
  })

  it('should initialize App Check after the app but before Firestore, with the reCAPTCHA v3 provider', async () => {
    mutableEnv.VITE_FIREBASE_RECAPTCHA_SITE_KEY = 'test-site-key'
    await importFirebase()

    expect(mocks.ReCaptchaV3Provider).toHaveBeenCalledWith('test-site-key')
    expect(mocks.initializeAppCheck).toHaveBeenCalledTimes(1)
    expect(mocks.initializeAppCheck).toHaveBeenCalledWith(expect.anything(), {
      provider: mocks.ReCaptchaV3Provider.mock.results[0].value,
      isTokenAutoRefreshEnabled: true
    })

    // Order: initializeApp → initializeAppCheck → initializeFirestore.
    expect(firstCallOrder(mocks.initializeApp)).toBeLessThan(firstCallOrder(mocks.initializeAppCheck))
    expect(firstCallOrder(mocks.initializeAppCheck)).toBeLessThan(firstCallOrder(mocks.initializeFirestore))
  })

  it('must never call getAuth at import time — a broken auth config cannot blank the storefront', async () => {
    // The getAuth mock is deliberately hostile (it throws the
    // auth/invalid-api-key error). Auth init now lives behind the admin-only
    // accessor, so importing the storefront's Firebase module must succeed
    // no matter what the auth layer would do.
    const { db } = await importFirebase()

    expect(mocks.getAuth).not.toHaveBeenCalled()
    expect(mocks.initializeFirestore).toHaveBeenCalledWith(expect.anything(), {
      ignoreUndefinedProperties: true
    })
    expect(db).toBeDefined()
  })

  it('should enable the App Check debug flag outside a production runtime, before initialization', async () => {
    mutableEnv.VITE_FIREBASE_RECAPTCHA_SITE_KEY = 'test-site-key'
    // VITE_VERCEL_ENV unset — local dev / Vitest runtime.
    await importFirebase()

    expect(currentDebugToken()).toBe(true)
    // The value captured at init time proves the assignment precedes init.
    expect(mocks.state.debugTokenAtInit[0]).toBe(true)
  })

  it('should pass a specific registered debug token through when provided', async () => {
    mutableEnv.VITE_FIREBASE_RECAPTCHA_SITE_KEY = 'test-site-key'
    mutableEnv.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN = 'a-registered-debug-token'
    await importFirebase()

    expect(mocks.state.debugTokenAtInit[0]).toBe('a-registered-debug-token')
  })

  it('must never set the App Check debug flag in a production runtime', async () => {
    mutableEnv.VITE_FIREBASE_RECAPTCHA_SITE_KEY = 'test-site-key'
    mutableEnv.VITE_VERCEL_ENV = 'production'
    await importFirebase()

    expect(currentDebugToken()).toBeUndefined()
    expect(mocks.state.debugTokenAtInit[0]).toBeUndefined()
  })

  it('should skip App Check with a warning when no site key is configured (non-production)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { db } = await importFirebase()

    expect(mocks.initializeAppCheck).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    // The storefront survives: Firestore still initializes with its load-bearing setting.
    expect(mocks.initializeFirestore).toHaveBeenCalledWith(expect.anything(), {
      ignoreUndefinedProperties: true
    })
    expect(db).toBeDefined()
  })

  it('should log a loud error when the site key is missing in a production runtime', async () => {
    mutableEnv.VITE_VERCEL_ENV = 'production'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await importFirebase()

    expect(mocks.initializeAppCheck).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    // Still not fatal — the storefront must not blank over a missing key.
    expect(mocks.initializeFirestore).toHaveBeenCalled()
  })

  it('should tolerate an initializeAppCheck throw (Vite HMR double registration) without blanking the storefront', async () => {
    mutableEnv.VITE_FIREBASE_RECAPTCHA_SITE_KEY = 'test-site-key'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.initializeAppCheck.mockImplementationOnce(() => {
      throw new Error('app-check/already-initialized')
    })

    const { db } = await importFirebase()

    expect(mocks.initializeAppCheck).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalled()
    expect(mocks.initializeFirestore).toHaveBeenCalledWith(expect.anything(), {
      ignoreUndefinedProperties: true
    })
    expect(db).toBeDefined()
  })
})
