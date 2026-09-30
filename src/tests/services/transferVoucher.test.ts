import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveVoucherContentType, uploadTransferVoucher, validateVoucherFile } from '../../services/transferVoucher'

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response
}

const pdfFile = () => new File(['comprobante-data'], 'transfer.pdf', { type: 'application/pdf' })

const signPayload = {
  success: true,
  orderId: 'PRONTO-998877',
  uploadUrl: 'https://storage.googleapis.com/pronto-vouchers/upload?sig=abc',
  storagePath: 'vouchers/orders/PRONTO-998877/1700000000000-abcd1234.pdf',
  contentType: 'application/pdf',
  maxBytes: 5 * 1024 * 1024,
  expiresAt: '2026-09-28T10:10:00.000Z'
}

describe('Transfer Voucher Service (src/services/transferVoucher)', () => {
  const mutableEnv = import.meta.env as unknown as Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    delete mutableEnv.VITE_VERCEL_ENV
    delete mutableEnv.VITE_ALLOW_SIMULATED_PAYMENTS
  })

  afterEach(() => {
    delete mutableEnv.VITE_VERCEL_ENV
    delete mutableEnv.VITE_ALLOW_SIMULATED_PAYMENTS
  })

  describe('validateVoucherFile', () => {
    it('should validate PDF, PNG, and JPG files within size limit', () => {
      expect(validateVoucherFile(new File(['content'], 'voucher.pdf', { type: 'application/pdf' })).isValid).toBe(true)
      expect(validateVoucherFile(new File(['content'], 'voucher.png', { type: 'image/png' })).isValid).toBe(true)
      expect(validateVoucherFile(new File(['content'], 'voucher.jpg', { type: 'image/jpeg' })).isValid).toBe(true)
    })

    it('should reject files exceeding 5MB', () => {
      const largeFile = new File([new Uint8Array(6 * 1024 * 1024)], 'huge_voucher.pdf', { type: 'application/pdf' })

      const res = validateVoucherFile(largeFile)
      expect(res.isValid).toBe(false)
      expect(res.error).toContain('5 MB')
    })

    it('should reject unsupported file extensions like .exe or .txt', () => {
      const res = validateVoucherFile(new File(['bad'], 'script.exe', { type: 'application/x-msdownload' }))
      expect(res.isValid).toBe(false)
      expect(res.error).toContain('Formato no soportado')
    })
  })

  describe('resolveVoucherContentType', () => {
    it('should use the declared MIME type and normalize the jpg alias', () => {
      expect(resolveVoucherContentType(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBe('application/pdf')
      expect(resolveVoucherContentType(new File(['x'], 'a.jpg', { type: 'image/jpg' }))).toBe('image/jpeg')
    })

    it('should derive the content type from the extension when the browser reports none', () => {
      expect(resolveVoucherContentType(new File(['x'], 'a.PDF', { type: '' }))).toBe('application/pdf')
      expect(resolveVoucherContentType(new File(['x'], 'a.png', { type: '' }))).toBe('image/png')
      expect(resolveVoucherContentType(new File(['x'], 'a.jpeg', { type: '' }))).toBe('image/jpeg')
    })
  })

  describe('uploadTransferVoucher', () => {
    it('should reject missing orderId or invalid RUT before touching the network', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch')
      const file = pdfFile()

      const noId = await uploadTransferVoucher({ orderId: '', customerRut: '12.345.678-5', file })
      expect(noId.success).toBe(false)
      expect(noId.error).toContain('Identificador de pedido')

      const badRut = await uploadTransferVoucher({ orderId: 'PRONTO-123456', customerRut: '12.345.678-0', file })
      expect(badRut.success).toBe(false)
      expect(badRut.error).toContain('RUT ingresado no es válido')

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('should reject an invalid file locally without calling the endpoint', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch')

      const res = await uploadTransferVoucher({
        orderId: 'PRONTO-123456',
        customerRut: '12.345.678-5',
        file: new File(['x'], 'script.exe', { type: 'application/x-msdownload' })
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain('Formato no soportado')
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('should sign, upload the raw file and confirm (3-call contract)', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(jsonResponse(signPayload))
        .mockResolvedValueOnce(jsonResponse({}, 200))
        .mockResolvedValueOnce(
          jsonResponse({
            success: true,
            orderId: 'PRONTO-998877',
            voucherUrl:
              'https://firebasestorage.googleapis.com/v0/b/bucket/o/vouchers%2Forders%2FPRONTO-998877%2Fa.pdf?alt=media&token=tok',
            status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
            message: 'Comprobante adjuntado exitosamente. En proceso de validación contable.'
          })
        )

      const file = pdfFile()
      const res = await uploadTransferVoucher({
        orderId: ' pronto-998877 ',
        customerRut: '12.345.678-5',
        file
      })

      expect(res.success).toBe(true)
      expect(res.orderId).toBe('PRONTO-998877')
      expect(res.status).toBe('TRANSFERENCIA_COMPROBANTE_SUBIDO')
      expect(res.voucherUrl).toContain('token=tok')
      expect(fetchSpy).toHaveBeenCalledTimes(3)

      // 1. sign — metadata only, never the file bytes
      const [signUrl, signInit] = fetchSpy.mock.calls[0]
      expect(signUrl).toBe('/api/upload-voucher')
      const signBody = JSON.parse(signInit?.body as string)
      expect(signBody).toMatchObject({
        action: 'sign',
        orderId: 'PRONTO-998877',
        rut: '123456785',
        fileName: 'transfer.pdf',
        contentType: 'application/pdf',
        sizeBytes: file.size
      })
      expect(JSON.stringify(signBody)).not.toContain('data:')

      // 2. direct upload to the signed URL — the raw File, not Base64
      const [uploadUrl, uploadInit] = fetchSpy.mock.calls[1]
      expect(uploadUrl).toBe(signPayload.uploadUrl)
      expect(uploadInit?.method).toBe('PUT')
      expect(uploadInit?.body).toBe(file)
      const uploadHeaders = uploadInit?.headers as Record<string, string>
      expect(uploadHeaders['Content-Type']).toBe('application/pdf')
      // Signed into the URL — without it Storage rejects the upload
      expect(uploadHeaders['x-goog-content-length-range']).toBe(`0,${signPayload.maxBytes}`)

      // 3. confirm — the object path, no bytes
      const [confirmUrl, confirmInit] = fetchSpy.mock.calls[2]
      expect(confirmUrl).toBe('/api/upload-voucher')
      expect(JSON.parse(confirmInit?.body as string)).toMatchObject({
        action: 'confirm',
        orderId: 'PRONTO-998877',
        storagePath: signPayload.storagePath
      })
    })

    it('should surface a real HTTP error from the sign phase instead of simulating success', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          jsonResponse(
            { error: 'No es posible modificar el comprobante: el pedido está en estado "PAGADO_MERCADOPAGO".' },
            409
          )
        )

      const res = await uploadTransferVoucher({
        orderId: 'PRONTO-123456',
        customerRut: '12.345.678-5',
        file: pdfFile()
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain('PAGADO_MERCADOPAGO')
      expect(res.voucherUrl).toBeUndefined()
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('should surface the uniform 404 lookup failure from the endpoint (Task 8.8)', async () => {
      // A wrong RUT and an unknown order id are the SAME response — the
      // old 401 RUT-mismatch contract no longer exists server-side.
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        jsonResponse(
          { error: 'No encontramos un pedido con ese código y RUT. Revisa los datos o escríbenos por WhatsApp.' },
          404
        )
      )

      const res = await uploadTransferVoucher({
        orderId: 'PRONTO-123456',
        customerRut: '12.345.678-5',
        file: pdfFile()
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain('No encontramos un pedido con ese código y RUT')
    })

    it('should fail when the sign phase returns an incomplete payload', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ success: true, orderId: 'PRONTO-123456' }))

      const res = await uploadTransferVoucher({
        orderId: 'PRONTO-123456',
        customerRut: '12.345.678-5',
        file: pdfFile()
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain('Respuesta inválida del servidor')
    })

    it('should surface a rejected direct upload', async () => {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(jsonResponse(signPayload))
        .mockResolvedValueOnce(jsonResponse({}, 403))

      const res = await uploadTransferVoucher({
        orderId: 'PRONTO-998877',
        customerRut: '12.345.678-5',
        file: pdfFile()
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain('almacenamiento seguro')
    })

    it('should surface a confirm failure and a non-successful confirm payload', async () => {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(jsonResponse(signPayload))
        .mockResolvedValueOnce(jsonResponse({}, 200))
        .mockResolvedValueOnce(jsonResponse({ error: 'No pudimos registrar el comprobante en tu pedido.' }, 500))

      const failed = await uploadTransferVoucher({
        orderId: 'PRONTO-998877',
        customerRut: '12.345.678-5',
        file: pdfFile()
      })
      expect(failed.success).toBe(false)
      expect(failed.error).toContain('No pudimos registrar el comprobante')

      vi.restoreAllMocks()
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(jsonResponse(signPayload))
        .mockResolvedValueOnce(jsonResponse({}, 200))
        .mockResolvedValueOnce(jsonResponse({ success: false }))

      const invalid = await uploadTransferVoucher({
        orderId: 'PRONTO-998877',
        customerRut: '12.345.678-5',
        file: pdfFile()
      })
      expect(invalid.success).toBe(false)
      expect(invalid.error).toContain('No pudimos registrar el comprobante')
    })

    it('should honour the server-side simulation flag in a non-production runtime', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        jsonResponse({ success: true, simulated: true, orderId: 'PRONTO-123456' })
      )

      const res = await uploadTransferVoucher({
        orderId: 'PRONTO-123456',
        customerRut: '12.345.678-5',
        file: pdfFile()
      })

      expect(res.success).toBe(true)
      expect(res.voucherUrl).toContain('simulated-voucher://')
      expect(res.message).toContain('simulado')
    })

    it('keeps the local simulation when the endpoint is unreachable outside production', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

      const simulated = await uploadTransferVoucher({
        orderId: 'PRONTO-123456',
        customerRut: '12.345.678-5',
        file: pdfFile()
      })
      expect(simulated.success).toBe(true)
      expect(simulated.voucherUrl).toContain('simulated-voucher://')
    })

    it('fails when the endpoint is unreachable in a production runtime', async () => {
      mutableEnv.VITE_VERCEL_ENV = 'production'
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

      const surfaced = await uploadTransferVoucher({
        orderId: 'PRONTO-123456',
        customerRut: '12.345.678-5',
        file: pdfFile()
      })

      expect(surfaced.success).toBe(false)
      expect(surfaced.error).toContain('No pudimos conectar con el servidor')
      expect(errorSpy).toHaveBeenCalled()
    })

    it('simulates a non-JSON (endpoint absent) response outside production, never in production', async () => {
      const nonJson = {
        ok: false,
        status: 404,
        json: async () => {
          throw new SyntaxError('Unexpected token <')
        }
      } as unknown as Response

      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(nonJson)

      const simulated = await uploadTransferVoucher({
        orderId: 'PRONTO-123456',
        customerRut: '12.345.678-5',
        file: pdfFile()
      })
      expect(simulated.success).toBe(true)
      expect(simulated.message).toContain('no se almacenó')

      vi.restoreAllMocks()
      mutableEnv.VITE_VERCEL_ENV = 'production'
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(nonJson)

      const surfaced = await uploadTransferVoucher({
        orderId: 'PRONTO-123456',
        customerRut: '12.345.678-5',
        file: pdfFile()
      })
      expect(surfaced.success).toBe(false)
      expect(surfaced.error).toContain('Error del servidor (404)')
    })
  })
})
