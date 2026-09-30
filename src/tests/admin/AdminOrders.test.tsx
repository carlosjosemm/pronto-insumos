import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminOrders } from '../../admin/components/AdminOrders'
import * as adminApi from '../../admin/services/adminApi'
import type { Order } from '../../types'

afterEach(() => {
  vi.restoreAllMocks()
})

const listOrder: Order = {
  orderId: 'PRONTO-998811',
  status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
  paymentMethod: 'transferencia',
  totalAmount: 189990,
  createdAt: new Date().toISOString(),
  customer: {
    fullName: 'Dra. Andrea Morales',
    email: 'contacto@moralesdental.cl',
    phone: '+56 9 7777 8888',
    rut: '12.345.678-5',
    documentType: 'boleta',
    address: 'Av. Ortúzar 500',
    city: 'Melipilla',
    zip: '9500000'
  },
  items: [{ productId: 'odon-101', name: 'Turbina LED', quantity: 1, price: 189990 }],
  // List projection: existence flag only, the URL is fetched on the detail request.
  hasVoucher: true
}

const detailOrder: Order = {
  ...listOrder,
  voucherUrl:
    'https://firebasestorage.googleapis.com/v0/b/pronto-insumos.firebasestorage.app/o/vouchers%2Forders%2FPRONTO-998811%2Fa.pdf?alt=media&token=tok'
}

describe('AdminOrders detail fetch', () => {
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
})
