import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import PaymentReturnModal, { PaymentReturnModalProps } from '../../components/PaymentReturnModal'

/**
 * The approved-state link must come from the shared helper. The sentinel
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
    onTrackOrder: vi.fn()
  }

  it('should render nothing when isOpen is false', () => {
    const { container } = render(<PaymentReturnModal {...defaultProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('should render nothing when status is null', () => {
    const { container } = render(<PaymentReturnModal {...defaultProps} status={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('should state only what is known on an approved return, never "accredited" (Task 2.12)', () => {
    render(<PaymentReturnModal {...defaultProps} />)

    expect(screen.getByText('Recibimos tu Retorno de Pago')).toBeInTheDocument()
    expect(screen.getByText(/Estamos confirmando la acreditación/i)).toBeInTheDocument()
    expect(screen.getByText('PRONTO-982341')).toBeInTheDocument()
    expect(screen.getByText('MP-12345678')).toBeInTheDocument()
    expect(screen.getByText(/Verificando acreditación/i)).toBeInTheDocument()
    expect(screen.getByText(/Bodega Melipilla/i)).toBeInTheDocument()
    expect(screen.getByText(/Coordinar Despacho por WhatsApp/i)).toBeInTheDocument()

    // The URL is forgeable and Mercado Pago writes it before the webhook runs, so
    // the old "success" claims must never come back.
    expect(screen.queryByText('¡Pago Confirmado Exitosamente!')).not.toBeInTheDocument()
    expect(screen.queryByText(/Pago Acreditado \(PAGADO\)/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ha sido acreditada/i)).not.toBeInTheDocument()
  })

  it('builds the WhatsApp link through the shared whatsappLink helper (Task 2.10)', () => {
    render(<PaymentReturnModal {...defaultProps} />)

    const link = screen.getByText('Coordinar Despacho por WhatsApp').closest('a')
    const decodedHref = decodeURIComponent(link?.getAttribute('href') ?? '')

    expect(link).toHaveAttribute('href', expect.stringContaining('https://wa.me/56900000000'))
    expect(decodedHref).toContain('PRONTO-982341')
    // The message must claim a payment *made*, not an accredited one.
    expect(decodedHref).toContain('realicé el pago de mi pedido')
    expect(decodedHref).not.toContain('acabo de pagar')
  })

  it('should offer Ver estado del pedido on the approved state and fire onTrackOrder', () => {
    const onTrackOrder = vi.fn()
    render(<PaymentReturnModal {...defaultProps} onTrackOrder={onTrackOrder} />)

    fireEvent.click(screen.getByText('Ver estado del pedido'))
    expect(onTrackOrder).toHaveBeenCalledTimes(1)
  })

  it('should omit Ver estado del pedido when no tracking handler is supplied', () => {
    render(<PaymentReturnModal {...defaultProps} onTrackOrder={undefined} />)

    expect(screen.queryByText('Ver estado del pedido')).not.toBeInTheDocument()
  })

  it('should omit Ver estado del pedido when the return URL carried no order id', () => {
    render(<PaymentReturnModal {...defaultProps} orderId={undefined} />)

    expect(screen.queryByText('Ver estado del pedido')).not.toBeInTheDocument()
    expect(screen.queryByText('Código de Pedido:')).not.toBeInTheDocument()
  })

  it('should invoke onClose when clicking Continuar en la Tienda on approved state', () => {
    const onClose = vi.fn()
    render(<PaymentReturnModal {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByText('Continuar en la Tienda'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should render failure status view with honest advice, the verification action and no no-charge claim', () => {
    const onClose = vi.fn()
    const onTrackOrder = vi.fn()
    render(<PaymentReturnModal {...defaultProps} status="failure" onClose={onClose} onTrackOrder={onTrackOrder} />)

    expect(screen.getByText('Retorno de Pago No Completado')).toBeInTheDocument()
    expect(screen.getByText(/no confirma el resultado del cobro/i)).toBeInTheDocument()
    expect(screen.getByText(/Tus insumos continúan guardados/i)).toBeInTheDocument()
    expect(screen.getByText(/Coordinar pago por WhatsApp/i)).toBeInTheDocument()

    // The forgeable failure URL must never come back as a no-charge assurance:
    // the payment may have gone through with a delayed webhook.
    expect(screen.queryByText(/No se ha realizado ningún cobro a tu tarjeta/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no pudo procesarse o fue cancelada/i)).not.toBeInTheDocument()

    // The protected retry opens the dual-factor tracking flow instead of minting
    // a second order/charge.
    fireEvent.click(screen.getByText('Verificar estado antes de reintentar'))
    expect(onTrackOrder).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Cerrar'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should render pending status view with the tracking action and dismiss on action button', () => {
    const onClose = vi.fn()
    const onTrackOrder = vi.fn()
    render(<PaymentReturnModal {...defaultProps} status="pending" onClose={onClose} onTrackOrder={onTrackOrder} />)

    expect(screen.getByText('Pago en Proceso de Validación')).toBeInTheDocument()
    expect(screen.getByText('PRONTO-982341')).toBeInTheDocument()
    expect(screen.getByText(/validando la transacción con tu entidad bancaria/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Ver estado del pedido'))
    expect(onTrackOrder).toHaveBeenCalledTimes(1)

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
