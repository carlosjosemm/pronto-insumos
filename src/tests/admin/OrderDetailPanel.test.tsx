import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OrderDetailPanel } from '../../admin/components/OrderDetailPanel'
import * as adminApi from '../../admin/services/adminApi'
import type { Order } from '../../types'

// A test that throws mid-assertion must not leak its spies (e.g. a mocked
// `resolveQuote` resolving success) into the next case in this file.
afterEach(() => {
  vi.restoreAllMocks()
})

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

    fireEvent.change(screen.getByPlaceholderText(/cartola 30-09/i), {
      target: { value: 'cartola 30-09, abono $189.990' }
    })
    const approveBtn = screen.getByText(/Aprobar Transferencia y Rebajar Stock/i)
    fireEvent.click(approveBtn)

    await waitFor(() => {
      expect(approveSpy).toHaveBeenCalledWith('PRONTO-998811', 'cartola 30-09, abono $189.990')
      expect(handleUpdated).toHaveBeenCalledTimes(1)
    })

    approveSpy.mockRestore()
  })

  it('keeps transfer approval disabled until a reconciliation reference is entered', () => {
    const approveSpy = vi.spyOn(adminApi, 'approveBankTransfer').mockResolvedValue({ success: true })

    render(<OrderDetailPanel order={mockOrder} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

    const approveBtn = screen.getByText(/Aprobar Transferencia y Rebajar Stock/i).closest('button')
    expect(approveBtn).toBeDisabled()
    if (approveBtn) fireEvent.click(approveBtn)
    expect(approveSpy).not.toHaveBeenCalled()

    approveSpy.mockRestore()
  })

  it('renders the incident-specific reason for a PAGO_EN_REVISION order', async () => {
    vi.spyOn(adminApi, 'fetchOrderHistory').mockResolvedValue([
      {
        id: 'h1',
        orderId: 'PRONTO-998811',
        previousStatus: 'PAGADO_MERCADOPAGO',
        newStatus: 'PAGO_EN_REVISION',
        changedBy: 'MERCADOPAGO_WEBHOOK',
        actorRole: 'SYSTEM_WEBHOOK',
        timestamp: new Date().toISOString(),
        reason: 'Segundo pago aprobado para un pedido ya resuelto.',
        metadata: { event: 'PAGO_DUPLICADO' }
      }
    ])
    const reviewOrder: Order = { ...mockOrder, status: 'PAGO_EN_REVISION', paymentMethod: 'mercadopago' }

    render(<OrderDetailPanel order={reviewOrder} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

    expect(await screen.findByText(/Posible doble cobro detectado/i)).toBeInTheDocument()
    // The reason shows both in the incident block and in the audit timeline.
    expect(screen.getAllByText(/Segundo pago aprobado para un pedido ya resuelto/i).length).toBeGreaterThan(0)
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

  it('shows a neutral note when the list reports a voucher but the detail URL has not loaded', () => {
    const orderWithoutUrl: Order = { ...mockOrder, hasVoucher: true }
    delete orderWithoutUrl.voucherUrl

    render(<OrderDetailPanel order={orderWithoutUrl} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

    expect(screen.getByText('Comprobante de Transferencia Adjunto')).toBeInTheDocument()
    expect(screen.queryByText('Ver Comprobante')).not.toBeInTheDocument()
    expect(screen.getByText(/No se pudo cargar el enlace/i)).toBeInTheDocument()
  })

  it('renders no voucher block when the order has neither a URL nor the existence flag', () => {
    const orderWithoutUrl: Order = { ...mockOrder }
    delete orderWithoutUrl.voucherUrl

    render(<OrderDetailPanel order={orderWithoutUrl} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

    expect(screen.queryByText('Comprobante de Transferencia Adjunto')).not.toBeInTheDocument()
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

  describe('Dispatch record (Task 2.13)', () => {
    it('renders the generated route code as an internal dispatch reference, never as a guía', () => {
      const dispatched: Order = {
        ...mockOrder,
        status: 'DESPACHADO',
        courier: 'Despacho Local Melipilla (Flota Directa)',
        dispatch: {
          carrier: 'despacho_local_melipilla',
          reference: 'MEL-260929-07',
          referenceSource: 'generated',
          dispatchedAt: '2026-09-29T14:00:00.000Z',
          dispatchedBy: 'bodega@pronto.cl'
        }
      }

      render(<OrderDetailPanel order={dispatched} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

      expect(screen.getByText('Despacho Registrado')).toBeInTheDocument()
      expect(screen.getByText('Ref. Despacho:')).toBeInTheDocument()
      expect(screen.getByText('MEL-260929-07')).toBeInTheDocument()
      expect(screen.getByText('(código interno)')).toBeInTheDocument()
      expect(screen.getByText('Despacho Local Melipilla (Flota Directa)')).toBeInTheDocument()
    })

    it('renders a typed courier guía as a guía and never labels it an internal code', () => {
      const dispatched: Order = {
        ...mockOrder,
        status: 'DESPACHADO',
        courier: 'Starken (Courier Regional)',
        trackingNumber: 'STK-998877',
        dispatch: {
          carrier: 'starken',
          trackingCode: 'STK-998877',
          reference: 'STK-998877',
          referenceSource: 'manual',
          dispatchedAt: '2026-09-29T14:00:00.000Z',
          dispatchedBy: 'bodega@pronto.cl'
        }
      }

      render(<OrderDetailPanel order={dispatched} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

      expect(screen.getByText('N° Guía:')).toBeInTheDocument()
      expect(screen.getByText('STK-998877')).toBeInTheDocument()
      expect(screen.queryByText('(código interno)')).not.toBeInTheDocument()
    })

    it('renders a pre-2.13 dispatch (tracking number only) as a guía', () => {
      const dispatched: Order = {
        ...mockOrder,
        status: 'DESPACHADO',
        courier: 'Starken (Courier Regional)',
        trackingNumber: 'STK-0001'
      }

      render(<OrderDetailPanel order={dispatched} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

      expect(screen.getByText('Despacho Registrado')).toBeInTheDocument()
      expect(screen.getByText('N° Guía:')).toBeInTheDocument()
      expect(screen.getByText('STK-0001')).toBeInTheDocument()
      expect(screen.queryByText('(código interno)')).not.toBeInTheDocument()
    })

    it('renders no dispatch block for an order that was never dispatched', () => {
      render(<OrderDetailPanel order={mockOrder} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

      expect(screen.queryByText('Despacho Registrado')).not.toBeInTheDocument()
    })

    it('surfaces the minted reference in the success banner after dispatching', async () => {
      const dispatchSpy = vi.spyOn(adminApi, 'dispatchAdminOrder').mockResolvedValue({
        success: true,
        dispatchReference: 'MEL-260929-07',
        referenceSource: 'generated'
      })
      const dispatchable: Order = { ...mockOrder, status: 'PAGADO_MERCADOPAGO', paymentMethod: 'mercadopago' }

      render(<OrderDetailPanel order={dispatchable} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

      fireEvent.click(screen.getByText(/Marcar como Despachado/i))

      await waitFor(() => {
        expect(dispatchSpy).toHaveBeenCalledWith({
          orderId: 'PRONTO-998811',
          carrier: 'despacho_local_melipilla',
          trackingCode: undefined
        })
        expect(screen.getByText(/Ref\. Despacho: MEL-260929-07/)).toBeInTheDocument()
      })

      dispatchSpy.mockRestore()
    })

    it('labels the success banner as a guía when the warehouse typed a real code', async () => {
      const dispatchSpy = vi.spyOn(adminApi, 'dispatchAdminOrder').mockResolvedValue({
        success: true,
        dispatchReference: 'STK-998877',
        referenceSource: 'manual'
      })
      const dispatchable: Order = { ...mockOrder, status: 'PAGADO_MERCADOPAGO', paymentMethod: 'mercadopago' }

      render(<OrderDetailPanel order={dispatchable} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

      fireEvent.change(screen.getByPlaceholderText(/STK-948124/i), { target: { value: 'STK-998877' } })
      fireEvent.click(screen.getByText(/Marcar como Despachado/i))

      await waitFor(() => {
        expect(dispatchSpy).toHaveBeenCalledWith({
          orderId: 'PRONTO-998811',
          carrier: 'despacho_local_melipilla',
          trackingCode: 'STK-998877'
        })
        expect(screen.getByText(/N° Guía: STK-998877/)).toBeInTheDocument()
      })

      dispatchSpy.mockRestore()
    })
  })

  describe('WhatsApp quote resolution', () => {
    const quoteOrder: Order = {
      ...mockOrder,
      status: 'COTIZACION_SOLICITADA_WHATSAPP',
      paymentMethod: 'whatsapp'
    }

    it('renders the resolution block for a quote order and keeps convert disabled until a reference is typed', () => {
      const quoteSpy = vi.spyOn(adminApi, 'resolveQuote').mockResolvedValue({ success: true })

      render(<OrderDetailPanel order={quoteOrder} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

      expect(screen.getByText(/verifica la venta fuera de la plataforma/i)).toBeInTheDocument()
      const convertBtn = screen.getByText(/Confirmar Venta y Rebajar Stock/i).closest('button')
      expect(convertBtn).toBeDisabled()
      fireEvent.click(convertBtn as HTMLElement)
      expect(quoteSpy).not.toHaveBeenCalled()

      const declineBtn = screen.getByText(/Declinar Cotización \(sin rebajar stock\)/i).closest('button')
      expect(declineBtn).toBeEnabled()

      quoteSpy.mockRestore()
    })

    it('offers no quote block for non-quote orders', () => {
      render(<OrderDetailPanel order={mockOrder} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

      expect(screen.queryByText(/verifica la venta fuera de la plataforma/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Confirmar Venta y Rebajar Stock/i)).not.toBeInTheDocument()
    })

    it('converts a quote with the typed reconciliation reference and refreshes the audit trail', async () => {
      const quoteSpy = vi.spyOn(adminApi, 'resolveQuote').mockResolvedValue({ success: true })
      const handleUpdated = vi.fn()

      render(<OrderDetailPanel order={quoteOrder} onClose={vi.fn()} onOrderUpdated={handleUpdated} />)

      fireEvent.change(screen.getByPlaceholderText(/cartola 30-09/i), {
        target: { value: 'cartola 30-09, abono $379.980' }
      })
      fireEvent.click(screen.getByText(/Confirmar Venta y Rebajar Stock/i))

      await waitFor(() => {
        expect(quoteSpy).toHaveBeenCalledWith('PRONTO-998811', 'convert', 'cartola 30-09, abono $379.980', undefined)
        expect(handleUpdated).toHaveBeenCalledTimes(1)
        expect(screen.getByText(/Cotización convertida en venta verificada/i)).toBeInTheDocument()
      })

      quoteSpy.mockRestore()
    })

    it('declines a quote without requiring a reference, carrying the closing note', async () => {
      const quoteSpy = vi.spyOn(adminApi, 'resolveQuote').mockResolvedValue({ success: true })

      render(<OrderDetailPanel order={quoteOrder} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

      fireEvent.change(screen.getByPlaceholderText(/sin respuesta tras 7 días/i), {
        target: { value: 'Venta registrada en PRONTO-77777777' }
      })
      fireEvent.click(screen.getByText(/Declinar Cotización \(sin rebajar stock\)/i))

      await waitFor(() => {
        expect(quoteSpy).toHaveBeenCalledWith(
          'PRONTO-998811',
          'decline',
          undefined,
          'Venta registrada en PRONTO-77777777'
        )
        expect(screen.getByText(/Cotización cerrada sin venta/i)).toBeInTheDocument()
      })

      quoteSpy.mockRestore()
    })

    it('surfaces a server refusal in the error banner', async () => {
      const quoteSpy = vi
        .spyOn(adminApi, 'resolveQuote')
        .mockResolvedValue({ success: false, error: 'El pedido no es una cotización WhatsApp pendiente' })

      render(<OrderDetailPanel order={quoteOrder} onClose={vi.fn()} onOrderUpdated={vi.fn()} />)

      fireEvent.click(screen.getByText(/Declinar Cotización \(sin rebajar stock\)/i))

      await waitFor(() => {
        expect(screen.getByText(/no es una cotización WhatsApp pendiente/i)).toBeInTheDocument()
      })

      quoteSpy.mockRestore()
    })
  })
})
