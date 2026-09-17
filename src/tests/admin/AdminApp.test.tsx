import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AdminApp } from '../../admin/AdminApp'
import * as firebaseAuth from 'firebase/auth'

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
  getAuth: vi.fn(),
  signInWithEmailAndPassword: vi.fn()
}))

describe('AdminApp Component (Auth Gating & Router)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders login screen when unauthenticated', async () => {
    vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((_auth, callback: any) => {
      callback(null)
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

    vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((_auth, callback: any) => {
      callback(mockUser)
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
})
