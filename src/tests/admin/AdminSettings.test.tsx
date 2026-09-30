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
