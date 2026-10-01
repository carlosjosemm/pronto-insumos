import { getAuth, type Auth } from 'firebase/auth'
import { app } from '../../services/firebase'

/**
 * The admin-only Firebase Auth accessor.
 *
 * `getAuth(app)` throws synchronously (`auth/invalid-api-key`) when
 * `VITE_FIREBASE_API_KEY` is missing or invalid, so the storefront's shared
 * init module must never call it at module scope — an eager call there
 * blanks the whole storefront at import time over a concern only this tree
 * uses. This accessor contains the failure instead: it returns `null` and
 * logs loudly, and every admin surface treats `null` as "authentication
 * unavailable" (the login form shows a configuration error; the app shell
 * stays on the login screen) rather than crashing.
 *
 * Only `src/admin/**` may import this module — a storefront import would
 * drag `firebase/auth` back into the storefront bundle.
 */
export function getAdminAuth(): Auth | null {
  try {
    return getAuth(app)
  } catch (err: unknown) {
    console.error(
      '[Admin Auth] Firebase Auth no pudo inicializarse (revisa VITE_FIREBASE_API_KEY y la configuración del proyecto):',
      err instanceof Error ? err.message : err
    )
    return null
  }
}
