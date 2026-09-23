import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendEmail, getEmailFrom, getWarehouseEmail } from '../../../api/lib/email'
import {
  buildOrderConfirmationEmail,
  buildPaymentConfirmedEmail,
  buildTransferApprovedEmail,
  buildWarehouseAlertEmail,
  toOrderEmailData,
  OrderEmailData
} from '../../../api/lib/emailTemplates'

const sampleOrderData: OrderEmailData = {
  orderId: 'PRONTO-ABC123',
  status: 'PENDIENTE_TRANSFERENCIA',
  paymentMethod: 'transferencia',
  totalAmount: 189990,
  items: [{ name: 'Turbina Odontológica LED', quantity: 1, price: 189990 }],
  customer: {
    fullName: 'Dra. Andrea Morales',
    email: 'andrea@clinica.cl',
    rut: '12.345.678-5',
    address: 'Av. Ortúzar 750',
    city: 'Melipilla',
    documentType: 'factura',
    razonSocial: 'CLÍNICA DENTAL MORALES SPA'
  },
  billing: {
    documentType: 'factura',
    taxBreakdown: { neto: 159656, iva: 30334, total: 189990 }
  }
}

describe('Transactional Email Sender (api/lib/email.ts)', () => {
  const envBackup: Record<string, string | undefined> = {}

  beforeEach(() => {
    envBackup.RESEND_API_KEY = process.env.RESEND_API_KEY
    envBackup.EMAIL_FROM = process.env.EMAIL_FROM
    envBackup.WAREHOUSE_NOTIFICATION_EMAIL = process.env.WAREHOUSE_NOTIFICATION_EMAIL
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env.RESEND_API_KEY = envBackup.RESEND_API_KEY
    process.env.EMAIL_FROM = envBackup.EMAIL_FROM
    process.env.WAREHOUSE_NOTIFICATION_EMAIL = envBackup.WAREHOUSE_NOTIFICATION_EMAIL
  })

  it('should POST to Resend API with bearer auth and email payload', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.EMAIL_FROM = 'PRONTO Insumos <pedidos@prontoinsumos.com>'

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_abc123' })
    } as Response)

    const result = await sendEmail({
      to: 'andrea@clinica.cl',
      subject: 'Test subject',
      html: '<p>Hola</p>',
      text: 'Hola'
    })

    expect(result).toEqual({ sent: true, id: 'email_abc123' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key')

    const body = JSON.parse(init?.body as string)
    expect(body.from).toBe('PRONTO Insumos <pedidos@prontoinsumos.com>')
    expect(body.to).toEqual(['andrea@clinica.cl'])
    expect(body.subject).toBe('Test subject')
    expect(body.html).toBe('<p>Hola</p>')
    expect(body.text).toBe('Hola')
  })

  it('should return sent:false without calling fetch when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY
    const fetchSpy = vi.spyOn(global, 'fetch')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await sendEmail({
      to: 'a@b.cl',
      subject: 'x',
      html: 'h',
      text: 't'
    })

    expect(result).toEqual({ sent: false, reason: 'missing_api_key' })
    expect(fetchSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('should return sent:false when no recipient is provided', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const fetchSpy = vi.spyOn(global, 'fetch')
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await sendEmail({
      to: '',
      subject: 'x',
      html: 'h',
      text: 't'
    })

    expect(result).toEqual({ sent: false, reason: 'missing_recipient' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('should return sent:false (not throw) when Resend API rejects the request', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden'
    } as Response)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await sendEmail({
      to: 'a@b.cl',
      subject: 'x',
      html: 'h',
      text: 't'
    })

    expect(result).toEqual({ sent: false, reason: 'http_403' })
  })

  it('should return sent:false (not throw) on network failure', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await sendEmail({
      to: 'a@b.cl',
      subject: 'x',
      html: 'h',
      text: 't'
    })

    expect(result).toEqual({ sent: false, reason: 'network_error' })
  })

  it('should expose email config getters with sensible defaults', () => {
    delete process.env.EMAIL_FROM
    delete process.env.WAREHOUSE_NOTIFICATION_EMAIL

    expect(getEmailFrom()).toContain('prontoinsumos.com')
    expect(getWarehouseEmail()).toBe('')

    process.env.WAREHOUSE_NOTIFICATION_EMAIL = '  bodega@test.cl  '
    expect(getWarehouseEmail()).toBe('bodega@test.cl')
  })
})

describe('Email Templates (api/lib/emailTemplates.ts)', () => {
  it('should build order confirmation with items, CLP totals, IVA and bank details for transferencia', () => {
    const tpl = buildOrderConfirmationEmail(sampleOrderData)

    expect(tpl.subject).toContain('PRONTO-ABC123')
    expect(tpl.subject).toContain('Pedido')
    expect(tpl.html).toContain('PRONTO-ABC123')
    expect(tpl.html).toContain('Turbina Odontológica LED')
    expect(tpl.html).toContain('$189.990')
    expect(tpl.html).toContain('IVA (19%)')
    // Bank transfer block present
    expect(tpl.html).toContain('Banco de Chile')
    expect(tpl.html).toContain('849-01284-01')
    expect(tpl.text).toContain('PRONTO-ABC123')
  })

  it('should render cotización variant for whatsapp orders without bank block', () => {
    const tpl = buildOrderConfirmationEmail({
      ...sampleOrderData,
      paymentMethod: 'whatsapp'
    })

    expect(tpl.subject).toContain('Cotización')
    expect(tpl.html).not.toContain('Datos para Transferencia Bancaria')
  })

  it('should build payment confirmed email for Mercado Pago orders', () => {
    const tpl = buildPaymentConfirmedEmail({
      ...sampleOrderData,
      paymentMethod: 'mercadopago'
    })

    expect(tpl.subject).toContain('Pago confirmado')
    expect(tpl.subject).toContain('PRONTO-ABC123')
    expect(tpl.html).toContain('Mercado Pago')
  })

  it('should build transfer approved email', () => {
    const tpl = buildTransferApprovedEmail(sampleOrderData)

    expect(tpl.subject).toContain('Transferencia aprobada')
    expect(tpl.html).toContain('verificada')
  })

  it('should build warehouse alert with event label and action hint', () => {
    const tpl = buildWarehouseAlertEmail(sampleOrderData, 'TRANSFERENCIA_COMPROBANTE_SUBIDO')

    expect(tpl.subject).toContain('[Bodega]')
    expect(tpl.subject).toContain('PRONTO-ABC123')
    expect(tpl.html).toContain('Comprobante de transferencia recibido')
    expect(tpl.html).toContain('Banco de Chile')
  })

  it('should HTML-escape malicious customer-supplied values', () => {
    const malicious: OrderEmailData = {
      ...sampleOrderData,
      items: [{ name: '<script>alert(1)</script>', quantity: 1, price: 1000 }],
      customer: {
        ...sampleOrderData.customer,
        fullName: '<img src=x onerror=alert(1)>'
      }
    }
    const tpl = buildOrderConfirmationEmail(malicious)

    expect(tpl.html).not.toContain('<script>')
    expect(tpl.html).not.toContain('<img')
    expect(tpl.html).toContain('&lt;script&gt;')
    expect(tpl.html).toContain('&lt;img')
  })

  it('should map raw Firestore order data defensively via toOrderEmailData', () => {
    const data = toOrderEmailData('PRONTO-X1', {
      status: 'PENDIENTE_TRANSFERENCIA',
      paymentMethod: 'transferencia',
      totalAmount: '59990',
      items: [{ name: 'Kit Composite', quantity: '2', price: '29995' }],
      customer: {
        fullName: 'Dr. Test',
        email: 't@t.cl',
        rut: '11111111-1',
        address: 'Calle 1',
        city: 'Melipilla'
      }
    })

    expect(data.orderId).toBe('PRONTO-X1')
    expect(data.totalAmount).toBe(59990)
    expect(data.items[0].quantity).toBe(2)
    expect(data.items[0].price).toBe(29995)
    expect(data.customer.rut).toBe('11111111-1')
  })

  it('should handle missing items and customer fields in toOrderEmailData', () => {
    const data = toOrderEmailData('PRONTO-EMPTY', {})

    expect(data.items).toEqual([])
    expect(data.totalAmount).toBe(0)
    expect(data.customer.fullName).toBe('')
  })
})
