import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminOrders } from '../../admin/components/AdminOrders'
import * as adminApi from '../../admin/services/adminApi'
import type { Order } from '../../types'

function makeOrder(orderId: string, status: string, extra: Record<string, unknown> = {}): Order {
  return {
    orderId,
    status: status as Order['status'],
    paymentMethod: 'transferencia',
    totalAmount: 100000,
    createdAt: '2026-09-30T15:00:00.000Z',
    customer: {
      fullName: 'Dra. Camila Fuentes',
      email: 'contacto@fuentesdental.cl',
      phone: '+56 9 8765 4321',
      rut: '12.345.678-5',
      documentType: 'boleta',
      address: 'Av. Ortúzar 750, Of. 302',
      city: 'Melipilla',
      zip: '9500000'
    },
    items: [{ productId: 'odon-101', name: 'Turbina', quantity: 1, price: 100000 }],
    ...extra
  } as Order
}

const listOrder = makeOrder('PRONTO-998811', 'TRANSFERENCIA_COMPROBANTE_SUBIDO', {
  // List projection: existence flag only, the URL is fetched on the detail request.
  hasVoucher: true
})

const detailOrder: Order = {
  ...listOrder,
  voucherUrl:
    'https://firebasestorage.googleapis.com/v0/b/pronto-insumos.firebasestorage.app/o/vouchers%2Forders%2FPRONTO-998811%2Fa.pdf?alt=media&token=tok'
}

describe('AdminOrders deep links, selection refresh and read failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the full order on select and renders the voucher link from the detail payload', async () => {
    vi.spyOn(adminApi, 'fetchAdminOrders').mockResolvedValue({ orders: [listOrder], total: 1 })
    const detailSpy = vi.spyOn(adminApi, 'fetchAdminOrder').mockResolvedValue(detailOrder)
    vi.spyOn(adminApi, 'fetchOrderHistory').mockResolvedValue([])

    render(<AdminOrders />)

    await waitFor(() => expect(screen.getByText('PRONTO-998811')).toBeInTheDocument())
    // The list row carries no voucherUrl, so nothing is openable before the detail fetch.
    expect(screen.queryByText('Ver Comprobante')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Ver'))

    await waitFor(() => {
      expect(detailSpy).toHaveBeenCalledWith('PRONTO-998811')
      expect(screen.getByText('Ver Comprobante')).toBeInTheDocument()
    })
  })

  it('shows the panel from the list row even when the detail fetch fails', async () => {
    vi.spyOn(adminApi, 'fetchAdminOrders').mockResolvedValue({ orders: [listOrder], total: 1 })
    vi.spyOn(adminApi, 'fetchAdminOrder').mockResolvedValue(null)
    vi.spyOn(adminApi, 'fetchOrderHistory').mockResolvedValue([])

    render(<AdminOrders />)

    await waitFor(() => expect(screen.getByText('PRONTO-998811')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Ver'))

    await waitFor(() => {
      // hasVoucher is set but no URL arrived: a neutral note, never a dead anchor.
      expect(screen.getByText(/No se pudo cargar el enlace/i)).toBeInTheDocument()
      expect(screen.queryByText('Ver Comprobante')).not.toBeInTheDocument()
    })
  })

  it('preselects the deep-linked order when it is in the first page', async () => {
    vi.spyOn(adminApi, 'fetchAdminOrders').mockResolvedValue({
      orders: [makeOrder('PRONTO-111', 'PENDIENTE_TRANSFERENCIA'), makeOrder('PRONTO-222', 'PAGADO_MERCADOPAGO')],
      total: 2
    })
    const detailSpy = vi
      .spyOn(adminApi, 'fetchAdminOrder')
      .mockResolvedValue(makeOrder('PRONTO-111', 'PENDIENTE_TRANSFERENCIA'))
    vi.spyOn(adminApi, 'fetchOrderHistory').mockResolvedValue([])

    render(<AdminOrders initialOrderId="PRONTO-111" />)

    await waitFor(() => {
      // The order id renders in the table row AND the slide-over header — two
      // occurrences pin that the inspector opened, not just the row.
      expect(screen.getAllByText('PRONTO-111').length).toBeGreaterThanOrEqual(2)
    })
    // The preselection goes through the same detail fetch as a manual open.
    expect(detailSpy).toHaveBeenCalledWith('PRONTO-111')
  })

  it('fetches the deep-linked order directly when it is beyond the first page', async () => {
    vi.spyOn(adminApi, 'fetchAdminOrders').mockResolvedValue({
      orders: [makeOrder('PRONTO-999', 'ENTREGADO')],
      total: 80
    })
    const detailSpy = vi
      .spyOn(adminApi, 'fetchAdminOrder')
      .mockResolvedValue(makeOrder('PRONTO-888', 'PENDIENTE_TRANSFERENCIA'))
    vi.spyOn(adminApi, 'fetchOrderHistory').mockResolvedValue([])

    render(<AdminOrders initialOrderId="PRONTO-888" />)

    await waitFor(() => {
      expect(detailSpy).toHaveBeenCalledWith('PRONTO-888')
      expect(screen.getAllByText('PRONTO-888').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('says so when a deep-linked order cannot be opened', async () => {
    vi.spyOn(adminApi, 'fetchAdminOrders').mockResolvedValue({
      orders: [makeOrder('PRONTO-999', 'ENTREGADO')],
      total: 80
    })
    vi.spyOn(adminApi, 'fetchAdminOrder').mockResolvedValue(null)
    vi.spyOn(adminApi, 'fetchOrderHistory').mockResolvedValue([])

    render(<AdminOrders initialOrderId="PRONTO-888" />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/No se encontró el pedido PRONTO-888/i)).toBeInTheDocument()
    })
  })

  it('re-selects the updated order when the list reloads', async () => {
    const v1 = makeOrder('PRONTO-111', 'PENDIENTE_TRANSFERENCIA')
    const v2 = makeOrder('PRONTO-111', 'TRANSFERENCIA_COMPROBANTE_SUBIDO')
    vi.spyOn(adminApi, 'fetchAdminOrders').mockResolvedValueOnce({ orders: [v1], total: 1 })
    vi.spyOn(adminApi, 'fetchAdminOrders').mockResolvedValueOnce({ orders: [v2], total: 1 })
    const detailSpy = vi.spyOn(adminApi, 'fetchAdminOrder')
    detailSpy.mockResolvedValue(v1)
    vi.spyOn(adminApi, 'fetchOrderHistory').mockResolvedValue([])

    render(<AdminOrders />)

    await waitFor(() => {
      expect(screen.getByText('PRONTO-111')).toBeInTheDocument()
    })

    // Select the order, then reload through the same path onOrderUpdated uses.
    fireEvent.click(screen.getByText('Ver'))
    fireEvent.click(screen.getByRole('button', { name: /Actualizar Lista/i }))

    await waitFor(() => {
      // The panel now renders the reloaded status badge instead of the stale
      // snapshot (StatusBadge labels the voucher-uploaded state).
      expect(screen.getByText('Comprobante Subido')).toBeInTheDocument()
    })
  })

  it('keeps the operator selection over the deep link when both are present', async () => {
    const deepLinked = makeOrder('PRONTO-111', 'PENDIENTE_TRANSFERENCIA')
    const manual = makeOrder('PRONTO-222', 'PENDIENTE_TRANSFERENCIA')
    const manualUpdated = makeOrder('PRONTO-222', 'TRANSFERENCIA_COMPROBANTE_SUBIDO')
    vi.spyOn(adminApi, 'fetchAdminOrders').mockResolvedValueOnce({ orders: [deepLinked, manual], total: 2 })
    vi.spyOn(adminApi, 'fetchAdminOrders').mockResolvedValueOnce({ orders: [deepLinked, manualUpdated], total: 2 })
    const detailSpy = vi.spyOn(adminApi, 'fetchAdminOrder')
    detailSpy.mockResolvedValue(deepLinked)
    vi.spyOn(adminApi, 'fetchOrderHistory').mockResolvedValue([])

    render(<AdminOrders initialOrderId="PRONTO-111" />)

    await waitFor(() => {
      expect(screen.getAllByText('PRONTO-111').length).toBeGreaterThanOrEqual(2)
    })

    // The operator manually selects the other order, then reloads: the selection
    // must win over the deep link re-asserting itself.
    fireEvent.click(screen.getByText('PRONTO-222'))
    fireEvent.click(screen.getByRole('button', { name: /Actualizar Lista/i }))

    await waitFor(() => {
      expect(screen.getByText('Comprobante Subido')).toBeInTheDocument()
    })
    // The mount legitimately fetched the deep link once; the reload's detail
    // refresh must follow the selection, never re-assert the deep link.
    const calls = detailSpy.mock.calls.map((c) => c[0])
    expect(calls[0]).toBe('PRONTO-111')
    expect(calls[calls.length - 1]).toBe('PRONTO-222')
  })

  it('renders a retryable banner on a read failure, distinct from an empty queue', async () => {
    vi.spyOn(adminApi, 'fetchAdminOrders').mockRejectedValueOnce(new Error('firestore down'))

    render(<AdminOrders />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/No fue posible cargar los pedidos/i)).toBeInTheDocument()
    })

    // The retry action re-runs the load.
    vi.spyOn(adminApi, 'fetchAdminOrders').mockResolvedValueOnce({
      orders: [makeOrder('PRONTO-111', 'PENDIENTE_TRANSFERENCIA')],
      total: 1
    })
    vi.spyOn(adminApi, 'fetchAdminOrder').mockResolvedValue(makeOrder('PRONTO-111', 'PENDIENTE_TRANSFERENCIA'))
    vi.spyOn(adminApi, 'fetchOrderHistory').mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('shows no banner when the queue is genuinely empty', async () => {
    vi.spyOn(adminApi, 'fetchAdminOrders').mockResolvedValue({ orders: [], total: 0 })

    render(<AdminOrders />)

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
