import { getAuth } from 'firebase-admin/auth'
import { getAdminApp } from './firebaseAdmin.js'
import type { VercelRequest } from '@vercel/node'

export interface AdminAuthResult {
  authenticated: boolean
  uid?: string
  email?: string
  error?: string
}

/**
 * Verifies the Firebase Auth Bearer ID token and confirms the custom claim `admin === true`.
 * Returns the decoded admin user identity or descriptive error.
 */
export async function verifyAdminToken(req: VercelRequest): Promise<AdminAuthResult> {
  const authHeader = req.headers.authorization
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Encabezado de autorización ausente o malformado' }
  }

  const idToken = authHeader.split('Bearer ')[1]?.trim()
  if (!idToken) {
    return { authenticated: false, error: 'Token de autorización ausente' }
  }

  const app = getAdminApp()
  if (!app) {
    return { authenticated: false, error: 'Firebase Admin no configurado en el servidor' }
  }

  try {
    const auth = getAuth(app)
    const decoded = await auth.verifyIdToken(idToken)

    if (decoded.admin !== true) {
      return { authenticated: false, error: 'Acceso denegado: permisos administrativos requeridos' }
    }

    return {
      authenticated: true,
      uid: decoded.uid,
      email: decoded.email
    }
  } catch (err: any) {
    return { authenticated: false, error: `Verificación de token fallida: ${err.message}` }
  }
}
