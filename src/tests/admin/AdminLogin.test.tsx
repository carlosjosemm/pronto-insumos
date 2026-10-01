import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminLogin } from '../../admin/components/AdminLogin'
import * as firebaseAuth from 'firebase/auth'

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  // The admin auth accessor resolves the instance through getAuth; a usable
  // object keeps the happy-path tests on the real code path (the config-
  // broken case makes getAuth throw instead — see the dedicated test).
  getAuth: vi.fn(() => ({}))
}))

describe('AdminLogin Component', () => {
  it('renders login inputs and submits credentials', async () => {
    const handleSuccess = vi.fn()
    const mockUser = {
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: true } })
    }
    vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValue({
      user: mockUser
    } as unknown as Awaited<ReturnType<typeof firebaseAuth.signInWithEmailAndPassword>>)

    render(<AdminLogin onLoginSuccess={handleSuccess} />)

    expect(screen.getByText('PRONTO')).toBeInTheDocument()
    expect(screen.getByText('ADMIN')).toBeInTheDocument()

    const emailInput = screen.getByPlaceholderText('admin@prontoinsumos.cl')
    const passInput = screen.getByPlaceholderText('••••••••••••')

    fireEvent.change(emailInput, { target: { value: 'admin@prontoinsumos.cl' } })
    fireEvent.change(passInput, { target: { value: 'secret123' } })

    const submitBtn = screen.getByText('Ingresar al Panel')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(firebaseAuth.signInWithEmailAndPassword).toHaveBeenCalledTimes(1)
      expect(handleSuccess).toHaveBeenCalledTimes(1)
    })
  })

  it('rejects users without admin claim and shows error', async () => {
    const handleSuccess = vi.fn()
    const mockUser = {
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: false } })
    }
    vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValue({
      user: mockUser
    } as unknown as Awaited<ReturnType<typeof firebaseAuth.signInWithEmailAndPassword>>)

    render(<AdminLogin onLoginSuccess={handleSuccess} />)

    const emailInput = screen.getByPlaceholderText('admin@prontoinsumos.cl')
    const passInput = screen.getByPlaceholderText('••••••••••••')

    fireEvent.change(emailInput, { target: { value: 'dentist@prontoinsumos.cl' } })
    fireEvent.change(passInput, { target: { value: 'secret123' } })

    const submitBtn = screen.getByText('Ingresar al Panel')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(firebaseAuth.signOut).toHaveBeenCalledTimes(1)
      expect(
        screen.getByText(/Acceso denegado: esta cuenta no cuenta con permisos administrativos/i)
      ).toBeInTheDocument()
      expect(handleSuccess).not.toHaveBeenCalled()
    })
  })

  it('surfaces a configuration error and never calls sign-in when Firebase Auth is unavailable', async () => {
    // A broken Firebase config (missing/invalid VITE_FIREBASE_API_KEY) makes
    // getAuth throw synchronously; the form must degrade to a visible
    // configuration error instead of crashing or attempting the sign-in.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Earlier cases in this file share the module-level mock registry —
    // clear their call history so "never called" means this test's clicks.
    vi.clearAllMocks()
    vi.mocked(firebaseAuth.getAuth).mockImplementation(() => {
      throw new Error('Firebase: Error (auth/invalid-api-key).')
    })

    const handleSuccess = vi.fn()
    render(<AdminLogin onLoginSuccess={handleSuccess} />)

    fireEvent.change(screen.getByPlaceholderText('admin@prontoinsumos.cl'), {
      target: { value: 'admin@prontoinsumos.cl' }
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByText('Ingresar al Panel'))

    await waitFor(() => {
      expect(screen.getByText(/La autenticación administrativa no está disponible/i)).toBeInTheDocument()
    })
    expect(firebaseAuth.signInWithEmailAndPassword).not.toHaveBeenCalled()
    expect(handleSuccess).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
