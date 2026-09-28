import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OrderDetailPanel } from '../../admin/components/OrderDetailPanel'
import * as adminApi from '../../admin/services/adminApi'
import type { Order } from '../../types'

const mockOrder: Order = {
  orderId: 'PRONTO-998811',
  status: 'PENDIENTE_TRANSFERENCIA',
  paymentMethod: 'transferencia',
  totalAmount: 189990,
  createdAt: new Date().toISOString(),
  customer: {
    fullName: 'Dra. Andrea Morales',
    email: 'contacto@moralesdental.cl',
    phone: '+56 9 7777 8888',
    rut: '12.345.678-5',
    documentType: 'factura',
    razonSocial: 'Centro Odontológico Morales SpA',
    giroComercial: 'Servicios Odontológicos',
    address: 'Av. Ortúzar 500, Of. 201',
    city: 'Melipilla',
    zip: '9500000',
    sanitaryVerification: {
      sisRegistryNumber: 'SIS-19284',
      verified: true,
      regulatoryNote: 'Registro SIS verificado'
    }
  },
  items: [{ productId: 'odon-101', name: 'Turbina LED Push Button', quantity: 1, price: 189990 }],
  voucherUrl: 'https://example.com/receipt.pdf'
}

describe('OrderDetailPanel Component', () => {
  it('renders order details, Factura legal attributes, and triggers transfer approval', async () => {
    const approveSpy = vi.spyOn(adminApi, 'approveBankTransfer').mockResolvedValue({ success: true })
    const handleClose = vi.fn()
    const handleUpdated = vi.fn()

    render(<OrderDetailPanel order={mockOrder} onClose={handleClose} onOrderUpdated={handleUpdated} />)

    expect(screen.getByText('PRONTO-998811')).toBeInTheDocument()
    expect(screen.getByText('Dra. Andrea Morales')).toBeInTheDocument()
    expect(screen.getByText(/Centro Odontológico Morales SpA/i)).toBeInTheDocument()
    expect(screen.getByText('Servicios Odontológicos')).toBeInTheDocument()
    expect(screen.getByText(/SIS-19284/i)).toBeInTheDocument()
    expect(screen.getByText('Ver Comprobante')).toBeInTheDocument()

    const approveBtn = screen.getByText(/Aprobar Transferencia y Rebajar Stock/i)
    fireEvent.click(approveBtn)

    await waitFor(() => {
      expect(approveSpy).toHaveBeenCalledWith('PRONTO-998811')
      expect(handleUpdated).toHaveBeenCalledTimes(1)
    })

    approveSpy.mockRestore()
  })

  it('renders the reconciliation panel for a PAGO_EN_REVISION order and approves it with a note', async () => {
    const resolveSpy = vi.spyOn(adminApi, 'resolvePaymentReview').mockResolvedValue({ success: true })
    const handleUpdated = vi.fn()
    const reviewOrder: Order = { ...mockOrder, status: 'PAGO_EN_REVISION', paymentMethod: 'mercadopago' }

    render(<OrderDetailPanel order={reviewOrder} onClose={vi.fn()} onOrderUpdated={handleUpdated} />)

    expect(screen.getByText(/No despachar hasta conciliar/i)).toBeInTheDocument()
    // The transfer-approval path must not be offered for a flagged gateway payment.
    expect(screen.queryByText(/Aprobar Transferencia y Rebajar Stock/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/pago confirmado en cartola/i), {
      target: { value: 'Verificado en cartola Mercado Pago' }
    })
    fireEvent.click(screen.getByText(/Confirmar Pago y Rebajar Stock/i))

    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith('PRONTO-998811', 'approve', 'Verificado en cartola Mercado Pago')
      expect(handleUpdated).toHaveBeenCalledTimes(1)
    })

    resolveSpy.mockRestore()
  })

  it('cancels a flagged order without offering the approve path', async () => {
    const resolveSpy = vi.spyOn(adminApi, 'resolvePaymentReview').mockResolvedValue({ success: true })
    const reviewOrder: Order = { ...mockOrder, status: 'PAGO_EN_REVISION', paymentMethod: 'mercadopago' }

    render(<OrderDetailPanel order={reviewOrder} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

    fireEvent.click(screen.getByText(/Cancelar Pedido \(sin rebajar stock\)/i))

    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith('PRONTO-998811', 'cancel', undefined)
    })

    resolveSpy.mockRestore()
  })
})
