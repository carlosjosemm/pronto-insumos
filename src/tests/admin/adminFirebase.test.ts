import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as firebaseAuth from 'firebase/auth'

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn()
}))

/**
 * The admin-only auth accessor contract. It exists so a missing/invalid
 * `VITE_FIREBASE_API_KEY` can only ever fail inside the admin flow — the
 * storefront's shared init module must never call `getAuth` at module scope
 * (that call throws `auth/invalid-api-key` synchronously and used to blank
 * the whole storefront at import time). A `null` return is the "authentication
 * unavailable" signal every admin surface degrades on.
 */
describe('Admin Firebase Auth accessor (src/admin/services/adminFirebase.ts)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the Auth instance for the initialized app', async () => {
    const authInstance = { currentUser: null }
    vi.mocked(firebaseAuth.getAuth).mockReturnValue(authInstance as unknown as ReturnType<typeof firebaseAuth.getAuth>)

    const { getAdminAuth } = await import('../../admin/services/adminFirebase')
    expect(getAdminAuth()).toBe(authInstance)
    expect(firebaseAuth.getAuth).toHaveBeenCalledTimes(1)
  })

  it('returns null and logs loudly when the Firebase config is unusable instead of throwing', async () => {
    vi.mocked(firebaseAuth.getAuth).mockImplementation(() => {
      throw new Error('Firebase: Error (auth/invalid-api-key).')
    })

    const { getAdminAuth } = await import('../../admin/services/adminFirebase')

    let returned: unknown = 'sentinel'
    expect(() => {
      returned = getAdminAuth()
    }).not.toThrow()
    expect(returned).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('keeps firebase/auth out of the storefront bundle chunk config', () => {
    // The storefront never imports the auth module anymore, and the shared
    // vendor-firebase manual chunk must not list it — listing it there would
    // merge the module into the storefront-loaded chunk and undo the split.
    const viteConfig = fs.readFileSync(path.resolve(__dirname, '../../../vite.config.ts'), 'utf8')
    const vendorChunk = viteConfig.match(/vendor-firebase'?:(?:\s*)\[([^\]]*)\]/)
    expect(vendorChunk, 'the vendor-firebase manual chunk declaration is missing').not.toBeNull()
    expect(vendorChunk![1]).not.toContain('firebase/auth')
  })

  it('lets only the admin tree import the auth accessor or firebase/auth (single-source guard)', () => {
    // A storefront file importing `firebase/auth` (or the admin-only
    // accessor) would silently drag the auth SDK back into the storefront
    // bundle — the recursive readFileSync scan pattern the WhatsApp
    // single-source guard uses, so the contract cannot regress silently.
    const root = path.resolve(__dirname, '../../..')
    const offenders: string[] = []
    const scan = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
        const full = path.join(dir, name)
        if (fs.statSync(full).isDirectory()) {
          scan(full)
        } else if (/\.(ts|tsx)$/.test(name)) {
          const rel = path.relative(root, full)
          const isAdminTree = rel.startsWith('src/admin/') || rel.startsWith('src/tests/admin/')
          const isServiceFirebase = rel === 'src/tests/services/firebase.test.ts'
          if (isAdminTree || isServiceFirebase) continue
          // Import statements only — comment prose naming the module (the
          // storefront init file explains where auth went) is not an import.
          if (
            /from ['"][^'"]*firebase\/auth['"]|from ['"][^'"]*adminFirebase['"]/.test(fs.readFileSync(full, 'utf8'))
          ) {
            offenders.push(rel)
          }
        }
      }
    }
    scan(path.join(root, 'src'))
    expect(offenders, 'storefront files importing firebase/auth or the admin auth accessor').toEqual([])
  })
})
