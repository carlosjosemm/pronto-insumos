import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendOrderConfirmationEmail } from '../../services/orderConfirmation'

describe('Order Confirmation Client Adapter (sendOrderConfirmationEmail)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should POST orderId and normalized RUT to /api/order-confirmation', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, emailSent: true })
    } as Response)

    const result = await sendOrderConfirmationEmail('pronto-abc123', '12.345.678-5')

    expect(result).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/order-confirmation',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ orderId: 'PRONTO-ABC123', rut: '123456785' })
      })
    )
  })

  it('should return false when the endpoint responds with an error status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 } as Response)

    const result = await sendOrderConfirmationEmail('PRONTO-ABC123', '12345678-5')

    expect(result).toBe(false)
  })

  it('should return false (never throw) on network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await sendOrderConfirmationEmail('PRONTO-ABC123', '12345678-5')

    expect(result).toBe(false)
  })

  it('should return false immediately for missing orderId or RUT', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')

    expect(await sendOrderConfirmationEmail('', '12345678-5')).toBe(false)
    expect(await sendOrderConfirmationEmail('PRONTO-ABC123', '')).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
