import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateVoucherFile, fileToDataUrl, uploadTransferVoucher } from '../../services/transferVoucher'

describe('Transfer Voucher Service (src/services/transferVoucher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('validateVoucherFile', () => {
    it('should validate PDF, PNG, and JPG files within size limit', () => {
      const validPdf = new File(['content'], 'voucher.pdf', { type: 'application/pdf' })
      const validPng = new File(['content'], 'voucher.png', { type: 'image/png' })
      const validJpg = new File(['content'], 'voucher.jpg', { type: 'image/jpeg' })

      expect(validateVoucherFile(validPdf).isValid).toBe(true)
      expect(validateVoucherFile(validPng).isValid).toBe(true)
      expect(validateVoucherFile(validJpg).isValid).toBe(true)
    })

    it('should reject files exceeding 5MB', () => {
      const largeBytes = new Uint8Array(6 * 1024 * 1024)
      const largeFile = new File([largeBytes], 'huge_voucher.pdf', { type: 'application/pdf' })

      const res = validateVoucherFile(largeFile)
      expect(res.isValid).toBe(false)
      expect(res.error).toContain('5 MB')
    })

    it('should reject unsupported file extensions like .exe or .txt', () => {
      const unsupported = new File(['bad'], 'script.exe', { type: 'application/x-msdownload' })
      const res = validateVoucherFile(unsupported)
      expect(res.isValid).toBe(false)
      expect(res.error).toContain('Formato no soportado')
    })
  })

  describe('fileToDataUrl', () => {
    it('should convert File object to Base64 data URL', async () => {
      const file = new File(['hello-voucher'], 'receipt.png', { type: 'image/png' })
      const dataUrl = await fileToDataUrl(file)
      expect(dataUrl).toContain('data:image/png;base64,')
    })
  })

  describe('uploadTransferVoucher', () => {
    const mutableEnv = import.meta.env as unknown as Record<string, unknown>

    beforeEach(() => {
      delete mutableEnv.VITE_VERCEL_ENV
      delete mutableEnv.VITE_ALLOW_SIMULATED_PAYMENTS
    })

    afterEach(() => {
      delete mutableEnv.VITE_VERCEL_ENV
      delete mutableEnv.VITE_ALLOW_SIMULATED_PAYMENTS
    })

    it('should reject missing orderId or invalid RUT', async () => {
      const file = new File(['dummy'], 'receipt.pdf', { type: 'application/pdf' })

      const noId = await uploadTransferVoucher({ orderId: '', customerRut: '12.345.678-5', file })
      expect(noId.success).toBe(false)
      expect(noId.error).toContain('Identificador de pedido')

      const badRut = await uploadTransferVoucher({ orderId: 'PRONTO-123456', customerRut: '12.345.678-0', file })
      expect(badRut.success).toBe(false)
      expect(badRut.error).toContain('RUT ingresado no es válido')
    })

    it('should call /api/upload-voucher and return success result', async () => {
      const file = new File(['comprobante-data'], 'transfer.pdf', { type: 'application/pdf' })
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          orderId: 'PRONTO-998877',
          voucherUrl: 'https://storage.googleapis.com/receipts/transfer.pdf',
          status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO'
        })
      } as Response)

      const res = await uploadTransferVoucher({
        orderId: 'PRONTO-998877',
        customerRut: '12.345.678-5',
        file
      })

      expect(res.success).toBe(true)
      expect(res.orderId).toBe('PRONTO-998877')
      expect(res.status).toBe('TRANSFERENCIA_COMPROBANTE_SUBIDO')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('surfaces a real HTTP 401 RUT mismatch as an error — never simulates success', async () => {
      const file = new File(['comprobante-data'], 'transfer.pdf', { type: 'application/pdf' })
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'RUT no coincide con el pedido' })
      } as Response)

      const res = await uploadTransferVoucher({
        orderId: 'PRONTO-998877',
        customerRut: '12.345.678-5',
        file
      })

      expect(res.success).toBe(false)
      expect(res.error).toBe('RUT no coincide con el pedido')
      expect(res.status).toBe('PENDIENTE_TRANSFERENCIA')
    })

    it('keeps the local simulation when the endpoint is unreachable outside production', async () => {
      const file = new File(['dummy'], 'receipt.pdf', { type: 'application/pdf' })
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'))

      const res = await uploadTransferVoucher({
        orderId: 'PRONTO-998877',
        customerRut: '12.345.678-5',
        file
      })

      expect(res.success).toBe(true)
      expect(res.voucherUrl).toContain('simulated-voucher://')
      expect(res.status).toBe('TRANSFERENCIA_COMPROBANTE_SUBIDO')
    })

    it('fails when the endpoint is unreachable in a production runtime', async () => {
      mutableEnv.VITE_VERCEL_ENV = 'production'
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const file = new File(['dummy'], 'receipt.pdf', { type: 'application/pdf' })
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'))

      const res = await uploadTransferVoucher({
        orderId: 'PRONTO-998877',
        customerRut: '12.345.678-5',
        file
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain('No fue posible subir el comprobante')
      expect(errorSpy).toHaveBeenCalled()
    })
  })
})
