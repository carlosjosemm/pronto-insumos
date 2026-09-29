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
  voucherUrl:
    'https://firebasestorage.googleapis.com/v0/b/pronto-insumos.firebasestorage.app/o/vouchers%2Forders%2FPRONTO-998811%2Fa.pdf?alt=media&token=tok'
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

  it('links a storage-backed voucher URL directly, without the legacy Blob workaround (Task 2.9)', () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const storageUrl = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/vouchers%2Fa.pdf?alt=media&token=tok'
    const storageOrder: Order = { ...mockOrder, voucherUrl: storageUrl }

    render(<OrderDetailPanel order={storageOrder} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

    const link = screen.getByText('Ver Comprobante').closest('a')
    expect(link).toHaveAttribute('href', storageUrl)
    expect(link).toHaveAttribute('target', '_blank')

    fireEvent.click(screen.getByText('Ver Comprobante'))
    expect(fetchSpy).not.toHaveBeenCalledWith(storageUrl)

    fetchSpy.mockRestore()
  })

  it('opens a legacy Base64 voucher through a Blob URL instead of navigating to data:', async () => {
    // Declared `image/jpg` on purpose: the panel must re-wrap the bytes with the
    // NORMALIZED type, so a pass-through `createObjectURL(blob)` fails this test.
    const legacyDataUrl = 'data:image/jpg;base64,/9j/4AAQSkZJRg=='
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['jpg'], { type: 'image/jpg' })
    } as Response)
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    // jsdom does not implement the object-URL API; restore it afterwards so the
    // global stays clean for the rest of the suite.
    const urlStatics = URL as unknown as Record<string, unknown>
    const originalCreateObjectURL = urlStatics.createObjectURL
    const originalRevokeObjectURL = urlStatics.revokeObjectURL
    const createObjectURLSpy = vi.fn<(blob: Blob) => string>(() => 'blob:pronto-legacy')
    Object.assign(URL, { createObjectURL: createObjectURLSpy, revokeObjectURL: vi.fn() })

    const legacyOrder: Order = { ...mockOrder, voucherUrl: legacyDataUrl }
    render(<OrderDetailPanel order={legacyOrder} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)
    fireEvent.click(screen.getByText('Ver Comprobante'))

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith('blob:pronto-legacy', '_blank', 'noopener,noreferrer')
    })
    expect(fetchSpy).toHaveBeenCalledWith(legacyDataUrl)
    // The opened Blob carries the validated, normalized MIME type (image/jpg → image/jpeg).
    const createdBlob = createObjectURLSpy.mock.calls[0][0] as Blob
    expect(createdBlob.type).toBe('image/jpeg')

    fetchSpy.mockRestore()
    openSpy.mockRestore()
    for (const [key, original] of [
      ['createObjectURL', originalCreateObjectURL],
      ['revokeObjectURL', originalRevokeObjectURL]
    ] as const) {
      if (original === undefined) delete urlStatics[key]
      else urlStatics[key] = original
    }
  })

  it('never renders a link nor opens anything for an unsafe stored URL (Task 0.13)', () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const unsafeUrls = [
      'javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'https://evil.com/comprobante.pdf',
      'https://firebasestorage.googleapis.com.evil.com/x.pdf'
    ]

    for (const unsafeUrl of unsafeUrls) {
      const { unmount } = render(
        <OrderDetailPanel order={{ ...mockOrder, voucherUrl: unsafeUrl }} onClose={vi.fn()} onOrderUpdated={vi.fn()} />
      )

      expect(screen.queryByText('Ver Comprobante')).not.toBeInTheDocument()
      expect(screen.getByText(/Enlace no verificable/i)).toBeInTheDocument()
      fireEvent.click(screen.getByText(/Enlace no verificable/i))

      unmount()
    }

    // The component's audit-history request may use fetch; the voucher URL never may.
    const fetchedUrls = fetchSpy.mock.calls.map((call) => String(call[0]))
    for (const unsafeUrl of unsafeUrls) {
      expect(fetchedUrls).not.toContain(unsafeUrl)
    }
    expect(openSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
    openSpy.mockRestore()
  })

  it('refuses a legacy voucher whose fetched body is not the declared MIME type (Task 0.13)', async () => {
    // Defensive-only case: for a `data:` URL the fetched Blob type IS the declared
    // one (already gated by classifyVoucherUrl), so this state is not reachable in a
    // browser. It pins the belt-and-braces gate should the Blob ever come from
    // another source (e.g. a storage fetch added later).
    const legacyOrder: Order = { ...mockOrder, voucherUrl: 'data:application/pdf;base64,PHNjcmlwdD4=' }
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['<script>alert(1)</script>'], { type: 'text/html' })
    } as Response)
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const urlStatics = URL as unknown as Record<string, unknown>
    const originalCreateObjectURL = urlStatics.createObjectURL
    const originalRevokeObjectURL = urlStatics.revokeObjectURL
    const createObjectURLSpy = vi.fn<(blob: Blob) => string>(() => 'blob:pronto-legacy')
    Object.assign(URL, { createObjectURL: createObjectURLSpy, revokeObjectURL: vi.fn() })

    render(<OrderDetailPanel order={legacyOrder} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)
    fireEvent.click(screen.getByText('Ver Comprobante'))

    await waitFor(() => {
      expect(screen.getByText(/no es un PDF ni una imagen/i)).toBeInTheDocument()
    })
    expect(createObjectURLSpy).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
    openSpy.mockRestore()
    for (const [key, original] of [
      ['createObjectURL', originalCreateObjectURL],
      ['revokeObjectURL', originalRevokeObjectURL]
    ] as const) {
      if (original === undefined) delete urlStatics[key]
      else urlStatics[key] = original
    }
  })
})
