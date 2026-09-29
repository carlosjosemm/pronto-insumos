import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const settings = vi.fn()
  return {
    settings,
    getFirestore: vi.fn(() => ({ settings })),
    initializeApp: vi.fn(() => ({ name: 'test-app' })),
    getApps: vi.fn(() => [] as unknown[]),
    cert: vi.fn(() => ({}))
  }
})

vi.mock('firebase-admin/app', () => ({
  initializeApp: mocks.initializeApp,
  getApps: mocks.getApps,
  cert: mocks.cert
}))

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: mocks.getFirestore
}))

const CREDENTIALS = {
  FIREBASE_PROJECT_ID: 'pronto-insumos-test',
  FIREBASE_CLIENT_EMAIL: 'admin@pronto-insumos-test.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkq\\n-----END PRIVATE KEY-----\\n'
}

describe('Firebase Admin initialization (api/_lib/firebaseAdmin.ts)', () => {
  const envBackup: Record<string, string | undefined> = {}

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.getApps.mockReturnValue([])
    for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
      envBackup[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('should configure the Admin Firestore instance with ignoreUndefinedProperties (Task 0.15)', async () => {
    // Root cause of the dispatch crash: the Admin SDK throws
    // `Cannot use "undefined" as a Firestore value` unless this setting is present.
    // Handlers still omit absent keys — this is the second line of defence.
    Object.assign(process.env, CREDENTIALS)
    const { getAdminFirestore } = await import('../../../api/_lib/firebaseAdmin')

    const db = getAdminFirestore()

    expect(db).not.toBeNull()
    expect(mocks.getFirestore).toHaveBeenCalledTimes(1)
    expect(mocks.settings).toHaveBeenCalledTimes(1)
    expect(mocks.settings).toHaveBeenCalledWith({ ignoreUndefinedProperties: true })
    // The settings call must land on the very instance that is returned (settings are
    // only accepted before the instance is first used).
    expect(mocks.settings.mock.instances[0]).toBe(db)
  })

  it('should return null without touching Firestore when credentials are missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getAdminFirestore } = await import('../../../api/_lib/firebaseAdmin')

    expect(getAdminFirestore()).toBeNull()
    expect(mocks.getFirestore).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('should return null and log when the Admin app cannot be initialized', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.assign(process.env, CREDENTIALS)
    mocks.initializeApp.mockImplementationOnce(() => {
      throw new Error('invalid credentials')
    })
    const { getAdminFirestore } = await import('../../../api/_lib/firebaseAdmin')

    expect(getAdminFirestore()).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
    expect(mocks.settings).not.toHaveBeenCalled()
  })
})
