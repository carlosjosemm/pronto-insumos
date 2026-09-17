import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '../../admin/components/StatusBadge'
import type { OrderStatus } from '../../types'

describe('Admin StatusBadge Component', () => {
  it('renders correct labels for all Chilean dental order statuses', () => {
    const cases: { status: OrderStatus; expected: string }[] = [
      { status: 'PENDIENTE_PAGO_MERCADOPAGO', expected: 'Pendiente MP' },
      { status: 'PENDIENTE_TRANSFERENCIA', expected: 'Pend. Transferencia' },
      { status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO', expected: 'Comprobante Subido' },
      { status: 'PAGADO_MERCADOPAGO', expected: 'Pagado Mercado Pago' },
      { status: 'TRANSFERENCIA_APROBADA', expected: 'Transferencia Aprobada' },
      { status: 'EN_PREPARACION', expected: 'En Preparación' },
      { status: 'DESPACHADO', expected: 'Despachado' },
      { status: 'ENTREGADO', expected: 'Entregado' },
      { status: 'CANCELADO', expected: 'Cancelado' },
      { status: 'COTIZACION_SOLICITADA_WHATSAPP', expected: 'Cotización WhatsApp' }
    ]

    for (const c of cases) {
      const { unmount } = render(<StatusBadge status={c.status} />)
      expect(screen.getByText(c.expected)).toBeInTheDocument()
      unmount()
    }
  })
})
