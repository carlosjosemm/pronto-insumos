import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminLogin } from '../../admin/components/AdminLogin'
import * as firebaseAuth from 'firebase/auth'

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  getAuth: vi.fn()
}))

describe('AdminLogin Component', () => {
  it('renders login inputs and submits credentials', async () => {
    const handleSuccess = vi.fn()
    const mockUser = {
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: true } })
    }
    vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValue({
      user: mockUser
    } as any)

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
    } as any)

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
})
