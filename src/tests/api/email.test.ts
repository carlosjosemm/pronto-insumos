import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendEmail, getEmailFrom, getWarehouseEmail } from '../../../api/_lib/email'
import {
  buildOrderConfirmationEmail,
  buildPaymentConfirmedEmail,
  buildTransferApprovedEmail,
  buildPaymentReviewResolvedEmail,
  buildWarehouseAlertEmail,
  toOrderEmailData,
  OrderEmailData
} from '../../../api/_lib/emailTemplates'

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
    documentType: 'factura'
  }
}

describe('Transactional Email Sender (api/_lib/email.ts)', () => {
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

describe('Email Templates (api/_lib/emailTemplates.ts)', () => {
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

  it('should label the amount as referencial on the pre-verification confirmation (transfer and quote)', () => {
    // This send goes out before any server-side catalog/payment verification —
    // the customer still needs the amount to transfer, but it must not read as
    // a settled fiscal figure.
    const transfer = buildOrderConfirmationEmail(sampleOrderData)
    expect(transfer.html).toContain('Total referencial (IVA incluido)')
    expect(transfer.html).toContain('Monto referencial')
    expect(transfer.text).toContain('Total referencial (IVA incluido)')
    expect(transfer.text).toContain('monto sujeto a confirmación')
    expect(transfer.html).not.toContain('>Total (IVA incluido)<')

    const quote = buildOrderConfirmationEmail({ ...sampleOrderData, paymentMethod: 'whatsapp' })
    expect(quote.html).toContain('Total referencial (IVA incluido)')
    expect(quote.html).toContain('Monto referencial')
  })

  it('should render the authoritative total label on post-verification emails', () => {
    // These send after a server-side verification (webhook amount assertion,
    // admin transfer approval, operator reconciliation), so the amount is final.
    const postVerification = [
      buildPaymentConfirmedEmail({ ...sampleOrderData, paymentMethod: 'mercadopago' }),
      buildTransferApprovedEmail(sampleOrderData),
      buildPaymentReviewResolvedEmail(sampleOrderData),
      buildWarehouseAlertEmail(sampleOrderData, 'PAGADO_MERCADOPAGO')
    ]

    for (const tpl of postVerification) {
      expect(tpl.html).toContain('Total (IVA incluido)')
      expect(tpl.html).not.toContain('referencial')
      expect(tpl.text).toContain('Total (IVA incluido)')
    }
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

  it('should build warehouse alerts for the Task 0.14 reconciliation events', () => {
    const duplicate = buildWarehouseAlertEmail(sampleOrderData, 'PAGO_DUPLICADO')
    expect(duplicate.subject).toContain('Doble pago detectado')
    expect(duplicate.text).toContain('reembolso')

    const invalidStatus = buildWarehouseAlertEmail(sampleOrderData, 'PAGO_ESTADO_INVALIDO')
    expect(invalidStatus.subject).toContain('no admite pago')

    const refunded = buildWarehouseAlertEmail(sampleOrderData, 'PAGO_REEMBOLSADO')
    expect(refunded.subject).toContain('reembolsado')
    expect(refunded.text).toContain('contracargado')
  })

  it('should append the stock shortfall sentence to the warehouse alert (Task 0.14e)', () => {
    const tpl = buildWarehouseAlertEmail(sampleOrderData, 'PAGADO_MERCADOPAGO', [
      { productId: 'odon-101', name: 'Turbina', requested: 3, available: 1 }
    ])

    expect(tpl.text).toContain('Stock insuficiente')
    expect(tpl.text).toContain('2× «Turbina»')
    expect(tpl.html).toContain('Stock insuficiente')
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

  it('should derive neto/IVA/total from the order amount, never from a forged stored taxBreakdown', () => {
    // A crafted order document can persist `billing.taxBreakdown = { total: 1,
    // iva: 0 }` alongside a correct `totalAmount`. Every rendered fiscal figure
    // must come from the order amount — never from the stored billing map.
    const forged = toOrderEmailData('PRONTO-FORGED', {
      status: 'PAGADO_MERCADOPAGO',
      paymentMethod: 'mercadopago',
      totalAmount: 189990,
      items: [{ name: 'Turbina', quantity: 1, price: 189990 }],
      customer: {
        fullName: 'Dra. Andrea Morales',
        email: 'andrea@clinica.cl',
        rut: '12.345.678-5',
        address: 'Av. Ortúzar 750',
        city: 'Melipilla',
        documentType: 'boleta'
      },
      billing: { documentType: 'boleta', taxBreakdown: { neto: 1, iva: 0, total: 1 } }
    })

    // The sanitized payload deliberately does not carry the stored breakdown.
    expect(forged.billing).toEqual({ documentType: 'boleta' })

    const customerEmails = [
      buildPaymentConfirmedEmail(forged),
      buildTransferApprovedEmail(forged),
      buildPaymentReviewResolvedEmail(forged),
      buildOrderConfirmationEmail(forged)
    ]

    for (const tpl of customerEmails) {
      // Derived from 189990: neto 159655 + iva 30335 = 189990.
      expect(tpl.html).toContain('$159.655')
      expect(tpl.html).toContain('$30.335')
      expect(tpl.html).toContain('$189.990')
      expect(tpl.text).toContain('$189.990')
      // The forged figures never leak into a money cell.
      expect(tpl.html).not.toContain('>$0<')
      expect(tpl.html).not.toContain('>$1<')
    }

    const warehouse = buildWarehouseAlertEmail(forged, 'PAGADO_MERCADOPAGO')
    expect(warehouse.html).toContain('$159.655')
    expect(warehouse.html).toContain('$30.335')
    expect(warehouse.text).toContain('$189.990')
  })

  it('should compute the integer breakdown identity for odd totals', () => {
    // 99991 → neto 84026 + iva 15965 = 99991 (neto + iva === total always holds).
    const odd = toOrderEmailData('PRONTO-ODD', {
      totalAmount: 99991,
      items: [],
      customer: { rut: '12345678-5' },
      billing: { documentType: 'boleta', taxBreakdown: { neto: 0, iva: 0, total: 0 } }
    })

    const tpl = buildPaymentConfirmedEmail(odd)
    expect(tpl.html).toContain('$84.026')
    expect(tpl.html).toContain('$15.965')
    expect(tpl.html).toContain('$99.991')
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
