import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// Mock services
vi.mock('../../services/orderTracking', () => ({
  fetchOrderTracking: vi.fn()
}))
vi.mock('../../services/transferVoucher', () => ({
  uploadTransferVoucher: vi.fn(),
  validateVoucherFile: vi.fn(() => ({ isValid: true }))
}))

import OrderTrackingModal from '../../components/OrderTrackingModal'
import { fetchOrderTracking } from '../../services/orderTracking'
import { uploadTransferVoucher } from '../../services/transferVoucher'

describe('OrderTrackingModal Component (src/components/OrderTrackingModal)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('should render nothing when isOpen is false', () => {
    const { container } = render(<OrderTrackingModal isOpen={false} onClose={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('should render the tracking search form when open', () => {
    render(<OrderTrackingModal isOpen={true} onClose={() => {}} />)

    expect(screen.getByText('Seguimiento de Pedido en Línea')).toBeInTheDocument()
    expect(screen.getByLabelText(/N° de Pedido/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/RUT del Comprador/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Consultar/i })).toBeInTheDocument()
  })

  it('should show error when submitting with invalid RUT', async () => {
    render(<OrderTrackingModal isOpen={true} onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText(/N° de Pedido/i), { target: { value: 'PRONTO-123456' } })
    fireEvent.change(screen.getByLabelText(/RUT del Comprador/i), { target: { value: '12.345.678-0' } })
    fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))

    expect(screen.getByText(/Por favor ingresa un RUT válido/i)).toBeInTheDocument()
    expect(fetchOrderTracking).not.toHaveBeenCalled()
  })

  it('should display tracking timeline and order details upon successful lookup', async () => {
    vi.mocked(fetchOrderTracking).mockResolvedValueOnce({
      success: true,
      data: {
        orderId: 'PRONTO-789012',
        createdAt: '2026-09-17T10:00:00Z',
        status: 'EN_PREPARACION',
        paymentMethod: 'transferencia',
        totalAmount: 189990,
        items: [
          {
            productId: 'odon-101',
            name: 'Turbina Odontológica LED MasterTorque',
            quantity: 2,
            price: 189990
          }
        ],
        customer: {
          fullName: 'Dra. Andrea Morales',
          email: 'contacto@moralesdental.cl',
          rut: '12345678-5',
          address: 'Av. Ortúzar 750, Of. 302',
          city: 'Melipilla',
          documentType: 'factura',
          razonSocial: 'CLÍNICA DENTAL MORALES SPA'
        },
        fulfillment: {
          currentStep: 3,
          statusTitle: 'Preparando en Bodega',
          statusDescription:
            'Tus insumos odontológicos están siendo acondicionados en nuestra bodega central en Melipilla.',
          courier: 'Despacho Local Express Melipilla'
        }
      }
    })

    render(
      <OrderTrackingModal isOpen={true} onClose={() => {}} initialOrderId="PRONTO-789012" initialRut="12.345.678-5" />
    )

    // Form auto-submits on open if valid orderId and RUT are provided
    await waitFor(() => {
      expect(fetchOrderTracking).toHaveBeenCalledWith({
        orderId: 'PRONTO-789012',
        rut: '12.345.678-5'
      })
    })

    expect(screen.getByText('Preparando en Bodega')).toBeInTheDocument()
    expect(screen.getByText('PRONTO-789012')).toBeInTheDocument()
    expect(screen.getByText(/Dra\. Andrea Morales/i)).toBeInTheDocument()
    expect(screen.getByText(/Despacho Local Express Melipilla/i)).toBeInTheDocument()
    expect(screen.getByText('Turbina Odontológica LED MasterTorque')).toBeInTheDocument()
  })

  it('should display voucher upload box and allow uploading receipt when status is PENDIENTE_TRANSFERENCIA', async () => {
    vi.mocked(fetchOrderTracking).mockResolvedValue({
      success: true,
      data: {
        orderId: 'PRONTO-112233',
        createdAt: '2026-09-17T10:00:00Z',
        status: 'PENDIENTE_TRANSFERENCIA',
        paymentMethod: 'transferencia',
        totalAmount: 189990,
        items: [{ productId: 'odon-1', name: 'Turbina', quantity: 1, price: 189990 }],
        customer: {
          fullName: 'Dr. Test',
          email: 'test@clinica.cl',
          rut: '12345678-5',
          address: 'Av. Ortúzar 100',
          city: 'Melipilla',
          documentType: 'boleta'
        },
        fulfillment: {
          currentStep: 1,
          statusTitle: 'Pendiente de Transferencia',
          statusDescription: 'Esperando recepción y comprobante de transferencia bancaria.'
        }
      }
    })

    vi.mocked(uploadTransferVoucher).mockResolvedValueOnce({
      success: true,
      orderId: 'PRONTO-112233',
      status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
      message: 'Comprobante recibido exitosamente.'
    })

    render(
      <OrderTrackingModal isOpen={true} onClose={() => {}} initialOrderId="PRONTO-112233" initialRut="12.345.678-5" />
    )

    await waitFor(() => {
      expect(screen.getByText('Pendiente de Comprobante de Transferencia Bancaria')).toBeInTheDocument()
    })

    // Select file
    const file = new File(['voucher content'], 'receipt.pdf', { type: 'application/pdf' })
    const fileInput = document.getElementById('tracking-voucher-file') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    // Click upload
    const uploadBtn = screen.getByRole('button', { name: /Enviar Comprobante/i })
    fireEvent.click(uploadBtn)

    await waitFor(() => {
      expect(uploadTransferVoucher).toHaveBeenCalledTimes(1)
    })
  })
})
