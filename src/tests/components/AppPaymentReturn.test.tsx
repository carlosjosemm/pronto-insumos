import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('../../services/api', () => ({
  fetchProducts: vi.fn().mockResolvedValue({ products: [], catalog: [], source: 'firestore' }),
  invalidateCatalogCache: vi.fn(),
  validatePromo: vi.fn().mockResolvedValue({ success: false })
}))

import App from '../../App'

describe('App Mercado Pago Return Flow Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The session order marker decides whether an approved return may reset the
    // cart — never let it leak between cases.
    window.sessionStorage.clear()
  })

  afterEach(() => {
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('should detect status=approved in URL parameters, open PaymentReturnModal, and sanitize URL', async () => {
    window.history.replaceState({}, '', '/?status=approved&orderId=PRONTO-554433&payment_id=12938475')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Recibimos tu Retorno de Pago')).toBeInTheDocument()
      expect(screen.getByText('PRONTO-554433')).toBeInTheDocument()
      expect(screen.getByText('12938475')).toBeInTheDocument()
      // The forged URL must never re-open the "confirmed payment" claim.
      expect(screen.queryByText('¡Pago Confirmado Exitosamente!')).not.toBeInTheDocument()
      expect(window.location.search).toBe('')
    })
  })

  it('should open the tracking flow from the return modal with the order id prefilled (Task 2.12)', async () => {
    window.history.replaceState({}, '', '/?status=approved&orderId=PRONTO-554433&payment_id=12938475')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Recibimos tu Retorno de Pago')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Ver estado del pedido'))

    await waitFor(() => {
      expect(screen.getByText('Seguimiento de Pedido en Línea')).toBeInTheDocument()
    })

    // The payment-return modal steps aside; the RUT stays a second factor the
    // customer types (never prefilled from the URL or from storage).
    expect(screen.queryByText('Recibimos tu Retorno de Pago')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/N° de Pedido/i)).toHaveValue('PRONTO-554433')
    expect(screen.getByLabelText(/RUT del Comprador/i)).toHaveValue('')
  })

  it('should open the tracking flow from a failure return with the order id prefilled', async () => {
    window.history.replaceState({}, '', '/?status=failure&orderId=PRONTO-998877')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Retorno de Pago No Completado')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Verificar estado antes de reintentar'))

    await waitFor(() => {
      expect(screen.getByText('Seguimiento de Pedido en Línea')).toBeInTheDocument()
    })

    // The payment-return modal steps aside; the RUT stays a second factor the
    // customer types (never prefilled from the URL or from storage).
    expect(screen.queryByText('Retorno de Pago No Completado')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/N° de Pedido/i)).toHaveValue('PRONTO-998877')
    expect(screen.getByLabelText(/RUT del Comprador/i)).toHaveValue('')
  })

  it('should detect status=failure in URL parameters and open failure modal', async () => {
    window.history.replaceState({}, '', '/?status=failure&orderId=PRONTO-998877')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Retorno de Pago No Completado')).toBeInTheDocument()
      // The forgeable failure URL must never come back as a no-charge assurance.
      expect(screen.queryByText(/No se ha realizado ningún cobro a tu tarjeta/i)).not.toBeInTheDocument()
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
      expect(screen.queryByText('Recibimos tu Retorno de Pago')).not.toBeInTheDocument()
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
      expect(screen.getByText('Retorno de Pago No Completado')).toBeInTheDocument()
    })
  })
})
