import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OrderTable } from '../../admin/components/OrderTable'
import type { Order } from '../../types'

const mockOrders: Order[] = [
  {
    orderId: 'PRONTO-100001',
    status: 'PENDIENTE_TRANSFERENCIA',
    paymentMethod: 'transferencia',
    totalAmount: 50000,
    createdAt: new Date().toISOString(),
    customer: {
      fullName: 'Dr. Felipe Rios',
      email: 'felipe@rios.cl',
      phone: '+56 9 1234 5678',
      rut: '11.222.333-4',
      documentType: 'boleta',
      address: 'Calle Real 100',
      city: 'Melipilla',
      zip: '9500000'
    },
    items: [{ productId: 'odon-101', name: 'Insumo 1', quantity: 1, price: 50000 }]
  },
  {
    orderId: 'PRONTO-100002',
    status: 'PAGADO_MERCADOPAGO',
    paymentMethod: 'mercadopago',
    totalAmount: 120000,
    createdAt: new Date().toISOString(),
    customer: {
      fullName: 'Dra. Claudia Soto',
      email: 'claudia@soto.cl',
      phone: '+56 9 9999 8888',
      rut: '15.666.777-8',
      documentType: 'factura',
      razonSocial: 'Clinica Soto SpA',
      giroComercial: 'Salud',
      address: 'Av. Central 200',
      city: 'Talagante',
      zip: '9500000'
    },
    items: [{ productId: 'odon-102', name: 'Insumo 2', quantity: 2, price: 60000 }]
  }
]

describe('OrderTable Component', () => {
  it('renders order rows and filters by search text', () => {
    const handleSelect = vi.fn()
    render(
      <OrderTable
        orders={mockOrders}
        onSelectOrder={handleSelect}
      />
    )

    expect(screen.getByText('PRONTO-100001')).toBeInTheDocument()
    expect(screen.getByText('PRONTO-100002')).toBeInTheDocument()
    expect(screen.getByText('Dr. Felipe Rios')).toBeInTheDocument()
    expect(screen.getByText('Clinica Soto SpA')).toBeInTheDocument()

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Buscar por ID de pedido/i)
    fireEvent.change(searchInput, { target: { value: 'Soto' } })

    expect(screen.queryByText('PRONTO-100001')).not.toBeInTheDocument()
    expect(screen.getByText('PRONTO-100002')).toBeInTheDocument()
  })
})
