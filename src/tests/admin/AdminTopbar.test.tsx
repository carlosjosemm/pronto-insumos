import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdminTopbar } from '../../admin/components/AdminTopbar'

describe('AdminTopbar Component', () => {
  it('renders section title, email and handles sign out', () => {
    const handleSignOut = vi.fn()
    render(
      <AdminTopbar
        activeView="orders"
        userEmail="dentista@prontoinsumos.cl"
        onSignOut={handleSignOut}
      />
    )

    expect(screen.getByText('Gestión de Pedidos Clínicos')).toBeInTheDocument()
    expect(screen.getByText('dentista@prontoinsumos.cl')).toBeInTheDocument()
    expect(screen.getByText(/Melipilla/i)).toBeInTheDocument()

    const signOutBtn = screen.getByText('Salir')
    fireEvent.click(signOutBtn)
    expect(handleSignOut).toHaveBeenCalledTimes(1)
  })
})
