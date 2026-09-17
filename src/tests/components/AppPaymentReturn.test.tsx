import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../services/api', () => ({
  fetchProducts: vi.fn().mockResolvedValue([]),
  validatePromo: vi.fn().mockResolvedValue({ success: false })
}))

import App from '../../App'

describe('App Mercado Pago Return Flow Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('should detect status=approved in URL parameters, open PaymentReturnModal, and sanitize URL', async () => {
    window.history.replaceState({}, '', '/?status=approved&orderId=PRONTO-554433&payment_id=12938475')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('¡Pago Confirmado Exitosamente!')).toBeInTheDocument()
      expect(screen.getByText('PRONTO-554433')).toBeInTheDocument()
      expect(screen.getByText('12938475')).toBeInTheDocument()
      expect(window.location.search).toBe('')
    })
  })

  it('should detect status=failure in URL parameters and open failure modal', async () => {
    window.history.replaceState({}, '', '/?status=failure&orderId=PRONTO-998877')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Pago No Completado o Rechazado')).toBeInTheDocument()
      expect(screen.getByText(/No se ha realizado ningún cobro a tu tarjeta/i)).toBeInTheDocument()
      expect(window.location.search).toBe('')
    })
  })

  it('should detect status=pending in URL parameters and open pending modal', async () => {
    window.history.replaceState({}, '', '/?status=pending&orderId=PRONTO-112233')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Pago en Proceso de Validación')).toBeInTheDocument()
      expect(screen.getByText('PRONTO-112233')).toBeInTheDocument()
      expect(window.location.search).toBe('')
    })
  })

  it('should not open PaymentReturnModal when no status query parameter is present', async () => {
    window.history.replaceState({}, '', '/')

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('¡Pago Confirmado Exitosamente!')).not.toBeInTheDocument()
      expect(screen.queryByText('Pago No Completado o Rechazado')).not.toBeInTheDocument()
      expect(screen.queryByText('Pago en Proceso de Validación')).not.toBeInTheDocument()
    })
  })

  it('should normalize collection_status=in_process to pending modal', async () => {
    window.history.replaceState({}, '', '/?collection_status=in_process&external_reference=PRONTO-INPROC')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Pago en Proceso de Validación')).toBeInTheDocument()
      expect(screen.getByText('PRONTO-INPROC')).toBeInTheDocument()
    })
  })

  it('should normalize collection_status=rejected to failure modal', async () => {
    window.history.replaceState({}, '', '/?collection_status=rejected&external_reference=PRONTO-REJECT')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Pago No Completado o Rechazado')).toBeInTheDocument()
    })
  })
})
