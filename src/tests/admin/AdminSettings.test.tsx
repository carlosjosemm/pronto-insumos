import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminSettings } from '../../admin/components/AdminSettings'
import * as adminApi from '../../admin/services/adminApi'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AdminSettings voucher maintenance', () => {
  it('runs a dry-run review and reports what would be removed', async () => {
    const sweepSpy = vi.spyOn(adminApi, 'runVoucherHousekeeping').mockResolvedValue({
      success: true,
      dryRun: true,
      scannedOrders: 4,
      scannedObjects: 6,
      deletedCount: 2,
      keptReferenced: 3,
      skippedRecent: 1
    })

    render(<AdminSettings />)
    fireEvent.click(screen.getByText(/Revisar huérfanos/i))

    await waitFor(() => {
      expect(sweepSpy).toHaveBeenCalledWith({ dryRun: true, limit: 100 })
      expect(screen.getByText(/se eliminarían 2/i)).toBeInTheDocument()
    })
  })

  it('deletes for real when the clean button is used, carrying the operator limit', async () => {
    const sweepSpy = vi.spyOn(adminApi, 'runVoucherHousekeeping').mockResolvedValue({
      success: true,
      dryRun: false,
      scannedOrders: 1,
      scannedObjects: 2,
      deletedCount: 1,
      keptReferenced: 1,
      skippedRecent: 0
    })

    render(<AdminSettings />)
    fireEvent.change(screen.getByLabelText(/Pedidos a revisar/i), { target: { value: '250' } })
    fireEvent.click(screen.getByText(/Eliminar huérfanos/i))

    await waitFor(() => {
      expect(sweepSpy).toHaveBeenCalledWith({ dryRun: false, limit: 250 })
      expect(screen.getByText(/se eliminaron 1/i)).toBeInTheDocument()
    })
  })

  it('surfaces a server refusal instead of a fabricated result', async () => {
    vi.spyOn(adminApi, 'runVoucherHousekeeping').mockResolvedValue({
      success: false,
      error: 'Almacenamiento no inicializado'
    })

    render(<AdminSettings />)
    fireEvent.click(screen.getByText(/Revisar huérfanos/i))

    await waitFor(() => {
      expect(screen.getByText(/Almacenamiento no inicializado/i)).toBeInTheDocument()
    })
  })
})

describe('AdminSettings stale pending-order maintenance', () => {
  it('reviews in the dry run by default, reporting closes and manual-review referrals', async () => {
    const sweepSpy = vi.spyOn(adminApi, 'closeStalePendingOrders').mockResolvedValue({
      success: true,
      dryRun: true,
      olderThanHours: 48,
      scannedOrders: 5,
      pendingTotal: 5,
      staleOrders: 3,
      closedCount: 2,
      parkedCount: 1
    })

    render(<AdminSettings />)
    fireEvent.click(screen.getByText(/Revisar pendientes antiguos/i))

    await waitFor(() => {
      expect(sweepSpy).toHaveBeenCalledWith({ dryRun: true, olderThanHours: 48 })
      expect(screen.getByText(/se cerrarían 2/i)).toBeInTheDocument()
      // The dry run must not claim it already referred anything to manual review.
      expect(screen.getByText(/1 con pago ya acreditado se enviarían a revisión manual/i)).toBeInTheDocument()
    })
  })

  it('closes for real only when the close button is used, carrying the operator window', async () => {
    const sweepSpy = vi.spyOn(adminApi, 'closeStalePendingOrders').mockResolvedValue({
      success: true,
      dryRun: false,
      olderThanHours: 12,
      scannedOrders: 2,
      pendingTotal: 2,
      staleOrders: 2,
      closedCount: 2,
      parkedCount: 0
    })

    render(<AdminSettings />)
    fireEvent.change(screen.getByLabelText(/Horas sin pago/i), { target: { value: '12' } })
    fireEvent.click(screen.getByText(/Cerrar pendientes antiguos/i))

    await waitFor(() => {
      expect(sweepSpy).toHaveBeenCalledWith({ dryRun: false, olderThanHours: 12 })
      expect(screen.getByText(/se cerraron 2/i)).toBeInTheDocument()
    })
  })

  it('surfaces unverifiable orders and a saturated scan instead of hiding them', async () => {
    vi.spyOn(adminApi, 'closeStalePendingOrders').mockResolvedValue({
      success: true,
      dryRun: true,
      olderThanHours: 48,
      scannedOrders: 25,
      pendingTotal: 100,
      staleOrders: 4,
      closedCount: 3,
      parkedCount: 0,
      truncated: true,
      failures: ['PRONTO-AAAAAAAA: no se pudo verificar la cartola (Mercado Pago respondió 500)']
    })

    render(<AdminSettings />)
    fireEvent.click(screen.getByText(/Revisar pendientes antiguos/i))

    await waitFor(() => {
      expect(screen.getByText(/1 pedido\(s\) sin verificar/i)).toBeInTheDocument()
      expect(screen.getByText(/vuelve a ejecutarlo/i)).toBeInTheDocument()
      expect(screen.getByText(/de 100 pedido\(s\) pendiente\(s\)/i)).toBeInTheDocument()
    })
  })

  it('surfaces a server refusal instead of a fabricated result', async () => {
    vi.spyOn(adminApi, 'closeStalePendingOrders').mockResolvedValue({
      success: false,
      error: 'Base de datos no inicializada'
    })

    render(<AdminSettings />)
    fireEvent.click(screen.getByText(/Cerrar pendientes antiguos/i))

    await waitFor(() => {
      expect(screen.getByText(/Base de datos no inicializada/i)).toBeInTheDocument()
    })
  })
})
