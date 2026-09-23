import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Mock firebaseAdmin before importing handler
vi.mock('../../../api/lib/firebaseAdmin', () => ({
  getAdminFirestore: vi.fn(() => null)
}))

import handler from '../../../api/upload-voucher'
import { getAdminFirestore } from '../../../api/lib/firebaseAdmin'

function createMockRes() {
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis()
  }
  return res as VercelResponse & {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
  }
}

describe('Voucher Upload Serverless Endpoint (/api/upload-voucher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('should handle OPTIONS preflight with status 200', async () => {
    const req = { method: 'OPTIONS' } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.end).toHaveBeenCalled()
  })

  it('should return 405 Method Not Allowed on non-POST requests', async () => {
    const req = { method: 'GET' } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  it('should return 400 when required fields are missing', async () => {
    const req = { method: 'POST', body: { orderId: 'PRONTO-123' } } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Faltan parámetros') })
    )
  })

  it('should return 404 when order is not found', async () => {
    const mockAdminDb = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ empty: true, docs: [] })
          })
        })
      })
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: {
        orderId: 'PRONTO-000000',
        rut: '12.345.678-5',
        dataUrl: 'data:image/png;base64,dummy'
      }
    } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('No se encontró') }))
  })

  it('should return 401 when purchaser RUT does not match order record', async () => {
    const mockOrderDoc = {
      data: () => ({
        orderId: 'PRONTO-123456',
        customer: { rut: '99.999.999-9' }
      }),
      ref: { update: vi.fn() }
    }
    const mockAdminDb = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ empty: false, docs: [mockOrderDoc] })
          })
        })
      })
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: {
        orderId: 'PRONTO-123456',
        rut: '12.345.678-5',
        dataUrl: 'data:image/png;base64,dummy'
      }
    } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('no coincide') }))
  })

  it('should update order document with voucherUrl and transition status to TRANSFERENCIA_COMPROBANTE_SUBIDO', async () => {
    const updateSpy = vi.fn().mockResolvedValue({})
    const mockOrderDoc = {
      data: () => ({
        orderId: 'PRONTO-123456',
        customer: { rut: '12345678-5' },
        status: 'PENDIENTE_TRANSFERENCIA'
      }),
      ref: { update: updateSpy }
    }
    const batchSetSpy = vi.fn()
    const batchCommitSpy = vi.fn().mockResolvedValue([])

    const mockAdminDb = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ empty: false, docs: [mockOrderDoc] })
          })
        }),
        doc: vi.fn().mockReturnValue({ id: 'osh-123' })
      }),
      batch: vi.fn().mockReturnValue({
        update: updateSpy,
        set: batchSetSpy,
        commit: batchCommitSpy
      })
    }
    vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

    const req = {
      method: 'POST',
      body: {
        orderId: 'PRONTO-123456',
        rut: '12.345.678-5',
        fileName: 'comprobante_banco_chile.pdf',
        contentType: 'application/pdf',
        dataUrl: 'data:application/pdf;base64,samplepdfcontent'
      }
    } as VercelRequest
    const res = createMockRes()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(updateSpy).toHaveBeenCalledWith(
      mockOrderDoc.ref,
      expect.objectContaining({
        voucherUrl: 'data:application/pdf;base64,samplepdfcontent',
        voucherFileName: 'comprobante_banco_chile.pdf',
        status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO'
      })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        orderId: 'PRONTO-123456',
        status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO'
      })
    )
  })

  describe('Warehouse Email Alert (Resend)', () => {
    let resendKeyBackup: string | undefined
    let warehouseBackup: string | undefined

    beforeEach(() => {
      resendKeyBackup = process.env.RESEND_API_KEY
      warehouseBackup = process.env.WAREHOUSE_NOTIFICATION_EMAIL
      delete process.env.RESEND_API_KEY
      delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
    })

    afterEach(() => {
      if (resendKeyBackup === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = resendKeyBackup
      if (warehouseBackup === undefined) delete process.env.WAREHOUSE_NOTIFICATION_EMAIL
      else process.env.WAREHOUSE_NOTIFICATION_EMAIL = warehouseBackup
    })

    function mockSuccessfulVoucherDb() {
      const updateSpy = vi.fn().mockResolvedValue({})
      const mockOrderDoc = {
        data: () => ({
          orderId: 'PRONTO-123456',
          status: 'PENDIENTE_TRANSFERENCIA',
          totalAmount: 189990,
          items: [{ productId: 'odon-101', name: 'Turbina', quantity: 1, price: 189990 }],
          customer: {
            fullName: 'Dra. Andrea',
            email: 'andrea@clinica.cl',
            rut: '12345678-5',
            address: 'Calle 1',
            city: 'Melipilla'
          }
        }),
        ref: { update: updateSpy }
      }
      const mockAdminDb = {
        collection: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ empty: false, docs: [mockOrderDoc] })
            })
          }),
          doc: vi.fn().mockReturnValue({ id: 'osh-123' })
        }),
        batch: vi.fn().mockReturnValue({ update: updateSpy, set: vi.fn(), commit: vi.fn().mockResolvedValue([]) })
      }
      return { mockAdminDb, updateSpy }
    }

    const voucherReq = () =>
      ({
        method: 'POST',
        body: {
          orderId: 'PRONTO-123456',
          rut: '12.345.678-5',
          fileName: 'comprobante.pdf',
          contentType: 'application/pdf',
          dataUrl: 'data:application/pdf;base64,samplepdfcontent'
        }
      }) as VercelRequest

    it('should send a warehouse alert email after the voucher is stored', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) } as Response)
      const { mockAdminDb } = mockSuccessfulVoucherDb()
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const res = createMockRes()
      await handler(voucherReq(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.resend.com'))
      expect(resendCalls).toHaveLength(1)
      const body = JSON.parse(resendCalls[0][1]?.body as string)
      expect(body.to).toEqual(['bodega@prontoinsumos.com'])
      expect(body.subject).toContain('PRONTO-123456')
    })

    it('should still return 200 when the warehouse alert fails (non-blocking)', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.WAREHOUSE_NOTIFICATION_EMAIL = 'bodega@prontoinsumos.com'
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { mockAdminDb } = mockSuccessfulVoucherDb()
      vi.mocked(getAdminFirestore).mockReturnValue(mockAdminDb as unknown as ReturnType<typeof getAdminFirestore>)

      const res = createMockRes()
      await handler(voucherReq(), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })
  })
})
