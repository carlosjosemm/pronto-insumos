import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import PaymentReturnModal, { PaymentReturnModalProps } from '../../components/PaymentReturnModal'

/**
 * The approved-state link must come from the shared helper (Task 2.10). The sentinel
 * number proves the component no longer builds its own wa.me URL — with the old inline
 * build this mock is bypassed and the href carries the env placeholder instead.
 */
vi.mock('../../config/contact', () => ({
  whatsappLink: (text?: string) => `https://wa.me/56900000000${text ? `?text=${encodeURIComponent(text)}` : ''}`
}))

describe('PaymentReturnModal Component', () => {
  const defaultProps: PaymentReturnModalProps = {
    isOpen: true,
    status: 'approved',
    orderId: 'PRONTO-982341',
    paymentId: 'MP-12345678',
    onClose: vi.fn(),
    onRetryPayment: vi.fn()
  }

  it('should render nothing when isOpen is false', () => {
    const { container } = render(<PaymentReturnModal {...defaultProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('should render nothing when status is null', () => {
    const { container } = render(<PaymentReturnModal {...defaultProps} status={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('should render approved status view with order and payment IDs', () => {
    render(<PaymentReturnModal {...defaultProps} />)

    expect(screen.getByText('¡Pago Confirmado Exitosamente!')).toBeInTheDocument()
    expect(screen.getByText('PRONTO-982341')).toBeInTheDocument()
    expect(screen.getByText('MP-12345678')).toBeInTheDocument()
    expect(screen.getByText(/Pago Acreditado \(PAGADO\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Bodega Melipilla/i)).toBeInTheDocument()
    expect(screen.getByText(/Coordinar Despacho por WhatsApp/i)).toBeInTheDocument()
  })

  it('builds the WhatsApp link through the shared whatsappLink helper (Task 2.10)', () => {
    render(<PaymentReturnModal {...defaultProps} />)

    const link = screen.getByText('Coordinar Despacho por WhatsApp').closest('a')

    expect(link).toHaveAttribute('href', expect.stringContaining('https://wa.me/56900000000'))
    expect(decodeURIComponent(link?.getAttribute('href') ?? '')).toContain('PRONTO-982341')
  })

  it('should invoke onClose when clicking Continuar en la Tienda on approved state', () => {
    const onClose = vi.fn()
    render(<PaymentReturnModal {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByText('Continuar en la Tienda'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should render failure status view with error advice and retry button', () => {
    const onRetryPayment = vi.fn()
    const onClose = vi.fn()
    render(<PaymentReturnModal {...defaultProps} status="failure" onRetryPayment={onRetryPayment} onClose={onClose} />)

    expect(screen.getByText('Pago No Completado o Rechazado')).toBeInTheDocument()
    expect(screen.getByText(/No se ha realizado ningún cobro a tu tarjeta/i)).toBeInTheDocument()
    expect(screen.getByText(/Transferencia Bancaria Directa/i)).toBeInTheDocument()

    const retryBtn = screen.getByText('Reintentar / Opciones de Pago')
    fireEvent.click(retryBtn)
    expect(onRetryPayment).toHaveBeenCalledTimes(1)

    const closeBtn = screen.getByText('Cerrar')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should render pending status view and dismiss on action button', () => {
    const onClose = vi.fn()
    render(<PaymentReturnModal {...defaultProps} status="pending" onClose={onClose} />)

    expect(screen.getByText('Pago en Proceso de Validación')).toBeInTheDocument()
    expect(screen.getByText('PRONTO-982341')).toBeInTheDocument()
    expect(screen.getByText(/validando la transacción con tu entidad bancaria/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Entendido, Volver a la Tienda'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should close when pressing Escape key', () => {
    const onClose = vi.fn()
    render(<PaymentReturnModal {...defaultProps} onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should close when clicking the top-right close button', () => {
    const onClose = vi.fn()
    render(<PaymentReturnModal {...defaultProps} onClose={onClose} />)

    const closeBtn = screen.getByLabelText('Cerrar modal')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
