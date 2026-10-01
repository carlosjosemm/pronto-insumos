import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AdminApp } from '../../admin/AdminApp'
import * as firebaseAuth from 'firebase/auth'
import type { NextOrObserver, User } from 'firebase/auth'

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
  // The admin auth accessor resolves the instance through getAuth; a usable
  // object keeps the happy-path tests on the real code path (the config-
  // broken case makes getAuth throw instead — see the dedicated test).
  getAuth: vi.fn(() => ({})),
  signInWithEmailAndPassword: vi.fn()
}))

describe('AdminApp Component (Auth Gating & Router)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders login screen when unauthenticated', async () => {
    vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((_auth, callback: NextOrObserver<User>) => {
      if (typeof callback === 'function') callback(null)
      return () => {}
    })

    render(<AdminApp />)

    await waitFor(() => {
      expect(screen.getByText('PRONTO')).toBeInTheDocument()
      expect(screen.getByText('ADMIN')).toBeInTheDocument()
      expect(screen.getByText('Correo Administrativo')).toBeInTheDocument()
    })
  })

  it('renders admin layout and dashboard when authenticated as admin', async () => {
    const mockUser = {
      email: 'admin@prontoinsumos.cl',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: true } })
    }

    vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((_auth, callback: NextOrObserver<User>) => {
      if (typeof callback === 'function') callback(mockUser as unknown as User)
      return () => {}
    })

    render(<AdminApp />)

    await waitFor(() => {
      expect(screen.getByText('Panel General y Métricas')).toBeInTheDocument()
      expect(screen.getByText('admin@prontoinsumos.cl')).toBeInTheDocument()
      expect(screen.getByText('Pedidos Clínicos')).toBeInTheDocument()
      expect(screen.getByText('Inventario y Stock')).toBeInTheDocument()
    })
  })

  it('stays on the login screen without registering a listener when Firebase Auth is unavailable', async () => {
    // A broken Firebase config (missing/invalid VITE_FIREBASE_API_KEY) makes
    // getAuth throw synchronously; the app must degrade to the login screen
    // instead of crashing, and no auth listener may be registered.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(firebaseAuth.getAuth).mockImplementation(() => {
      throw new Error('Firebase: Error (auth/invalid-api-key).')
    })

    render(<AdminApp />)

    await waitFor(() => {
      expect(screen.getByText('Correo Administrativo')).toBeInTheDocument()
    })
    expect(firebaseAuth.onAuthStateChanged).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
