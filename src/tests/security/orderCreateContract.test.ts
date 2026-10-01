import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Drift guard for the public `orders` create contract.
 *
 * `firestore.rules` allowlists the exact key set `submitOrder()` writes. A key added
 * to the payload without a matching rules update makes Firestore reject the WHOLE
 * document, which would break every checkout in production — and this repo has no
 * rules emulator, so nothing else would catch it. This suite drives the real
 * `submitOrder()` (Firestore mocked at the boundary) and asserts the captured
 * payload is a subset of the allowlist parsed out of firestore.rules.
 */

vi.mock('../../services/firebase', () => ({
  db: {}
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn((_db: unknown, _col: unknown, id: string) => ({ id, path: `orders/${id}` })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => 'mock-server-timestamp')
}))

import { submitOrder, type SubmitOrderOptions } from '../../services/api'
import { PRODUCTS } from '../../data/products'
import { DELIVERY_ZONES } from '../../config/delivery'
import { MAX_STOCK_UNITS } from '../../../api/_lib/admin/adminLimits'

const rulesSource = fs.readFileSync(path.resolve(__dirname, '../../../firestore.rules'), 'utf8')

/** Extract the `keys().hasOnly([...])` allowlist declared inside a rules function. */
function allowlistFor(fnName: string): string[] {
  const start = rulesSource.indexOf(`function ${fnName}(`)
  expect(start, `${fnName} is missing from firestore.rules`).toBeGreaterThan(-1)
  const closingBrace = rulesSource.indexOf('\n    }', start)
  const body = rulesSource.slice(start, closingBrace === -1 ? undefined : closingBrace)
  const match = body.match(/hasOnly\(\[([\s\S]*?)\]\)/)
  expect(match, `${fnName} declares no keys().hasOnly([...]) allowlist`).not.toBeNull()
  return [...match![1].matchAll(/'([^']+)'/g)].map((entry) => entry[1])
}

function definedKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  return Object.keys(record).filter((key) => record[key] !== undefined)
}

function expectSubsetOfRules(actual: string[], allowed: string[], label: string) {
  const rejected = actual.filter((key) => !allowed.includes(key))
  expect(
    rejected,
    `${label} writes keys the firestore.rules allowlist would reject: ${rejected.join(', ') || '(none)'}`
  ).toEqual([])
}

const ADMIN_ONLY_FIELDS = [
  'voucherUrl',
  'voucherStoragePath',
  'approvedAt',
  'approvedBy',
  'dispatch',
  'courier',
  'trackingNumber',
  'deliveredAt',
  'confirmationEmailSentAt',
  'mercadopagoPaymentId',
  'paidAt',
  // The warehouse-alert reservation is written by /api/upload-voucher only.
  'voucherAlertSentAt',
  'voucherAlertCount',
  // The price freeze written by /api/create-preference at preference time.
  'pricedTotal',
  'priceSnapshot',
  'preferenceCreatedAt',
  'preferenceExpiresAt'
]

describe('Order-create contract: submitOrder() payload vs firestore.rules allowlist (Task 0.12)', () => {
  const rootAllow = allowlistFor('isValidOrderCreate')
  const customerAllow = allowlistFor('isValidCustomer')
  const billingAllow = allowlistFor('isValidBilling')
  const taxAllow = allowlistFor('isValidTaxBreakdown')
  const itemAllow = allowlistFor('isValidOrderItem')
  const sanitaryAllow = allowlistFor('isValidSanitaryVerification')

  const customer = {
    fullName: 'Dra. Andrea Morales',
    email: 'contacto@moralesdental.cl',
    phone: '+56 9 7777 8888',
    rut: '12.345.678-5',
    documentType: 'boleta' as const,
    address: 'Av. Ortúzar 500, Of. 201',
    city: 'Melipilla',
    zip: '9500000'
  }
  const items = [{ product: PRODUCTS[0], quantity: 2 }]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function capturePayload(options: SubmitOrderOptions): Promise<Record<string, unknown>> {
    const { setDoc } = await import('firebase/firestore')
    const result = await submitOrder(options)
    expect(result.success).toBe(true)
    return vi.mocked(setDoc).mock.calls[0][1] as unknown as Record<string, unknown>
  }

  function assertPayloadFitsAllowlist(payload: Record<string, unknown>) {
    expectSubsetOfRules(definedKeys(payload), rootAllow, 'order')
    expectSubsetOfRules(definedKeys(payload.customer), customerAllow, 'customer')
    expectSubsetOfRules(definedKeys(payload.billing), billingAllow, 'billing')

    const billing = payload.billing as Record<string, unknown> | undefined
    expectSubsetOfRules(definedKeys(billing?.taxBreakdown), taxAllow, 'billing.taxBreakdown')

    for (const item of (payload.items as Array<Record<string, unknown>>) ?? []) {
      expectSubsetOfRules(definedKeys(item), itemAllow, 'items[]')
    }
    if (payload.sanitaryVerification) {
      expectSubsetOfRules(definedKeys(payload.sanitaryVerification), sanitaryAllow, 'sanitaryVerification')
    }
  }

  it('accepts the boleta payload carrying the CheckoutModal billing block', async () => {
    const payload = await capturePayload({
      items,
      total: 0,
      customer,
      paymentMethod: 'transferencia',
      billing: {
        documentType: 'boleta',
        rut: customer.rut,
        razonSocial: undefined,
        giroComercial: undefined,
        direccionFiscal: customer.address,
        comunaFiscal: customer.city,
        taxBreakdown: { neto: 159655, iva: 30335, total: 189990 },
        status: 'PENDIENTE_EMISION_SII'
      }
    })

    assertPayloadFitsAllowlist(payload)
    expect(payload.status).toBe('PENDIENTE_TRANSFERENCIA')
    expect(payload.paymentMethod).toBe('transferencia')
    expect(payload.createdAt).toBeDefined()
  })

  it('accepts the factura payload with sanitary verification, using the submitOrder billing default', async () => {
    // Shape-only regression: the payload keys must still fit every allowlist.
    // The rules now REJECT this payload at the Firestore boundary — the
    // create contract is Boleta-only — because the Factura checkout path is
    // disabled via `FACTURA_ENABLED = false` in CheckoutModal.tsx and Factura
    // requests route through the WhatsApp quotation flow. Re-enabling
    // Factura means flipping that flag AND the rules pin together.
    const sanitaryVerification = {
      sisRegistryNumber: 'SIS-19284',
      credentialFileName: 'credencial.pdf',
      verified: true,
      regulatoryNote: 'Registro SIS verificado'
    }

    const payload = await capturePayload({
      items,
      total: 0,
      customer: {
        ...customer,
        documentType: 'factura',
        razonSocial: 'Clínica Odontológica Los Andes SpA',
        giroComercial: 'Servicios Odontológicos',
        sanitaryVerification
      },
      paymentMethod: 'mercadopago',
      sanitaryVerification
    })

    assertPayloadFitsAllowlist(payload)
    expectSubsetOfRules(
      definedKeys((payload.customer as Record<string, unknown>).sanitaryVerification),
      sanitaryAllow,
      'customer.sanitaryVerification'
    )
    expect(payload.status).toBe('PENDIENTE_PAGO_MERCADOPAGO')
  })

  it('accepts the promo payload', async () => {
    const payload = await capturePayload({
      items,
      total: 0,
      customer,
      paymentMethod: 'whatsapp',
      promoCode: 'PRONTO10'
    })

    assertPayloadFitsAllowlist(payload)
    expect(payload.promoCode).toBe('PRONTO10')
    expect(payload.discountAmount).toBeGreaterThan(0)
    expect(payload.status).toBe('COTIZACION_SOLICITADA_WHATSAPP')
  })

  it('pins the root allowlist to the documented key set and never admits admin-only fields', () => {
    expect([...rootAllow].sort()).toEqual(
      [
        'orderId',
        'createdAt',
        'paymentMethod',
        'status',
        'totalAmount',
        'customer',
        'billing',
        'sanitaryVerification',
        'items',
        'promoCode',
        'discountAmount'
      ].sort()
    )

    for (const adminOnly of ADMIN_ONLY_FIELDS) {
      expect(rootAllow).not.toContain(adminOnly)
    }
  })

  it('satisfies the billing math and identity bindings the rules enforce', async () => {
    // Rules side: the bindings must exist in the source (there is no emulator).
    expect(rulesSource).toContain('t.neto == math.round(t.total / 1.19)')
    expect(rulesSource).toContain('t.neto + t.iva == t.total')
    expect(rulesSource).toContain('b.taxBreakdown.total == orderTotal')
    expect(rulesSource).toContain('b.rut == customerRut')
    expect(rulesSource).toContain('isValidBilling(data.billing, data.totalAmount, data.customer.rut)')

    // Payload side: the real submitOrder() output must satisfy them — the
    // breakdown is derived from the recomputed total and the billing RUT is the
    // purchaser's, regardless of what the caller passed.
    const payload = await capturePayload({
      items,
      total: 0,
      customer,
      paymentMethod: 'mercadopago',
      billing: {
        documentType: 'boleta',
        rut: '99.999.999-9',
        direccionFiscal: customer.address,
        comunaFiscal: customer.city,
        taxBreakdown: { neto: 1, iva: 0, total: 1 },
        status: 'EMITIDO'
      }
    })

    const billing = payload.billing as Record<string, unknown>
    const tax = billing.taxBreakdown as { neto: number; iva: number; total: number }
    expect(tax.neto + tax.iva).toBe(tax.total)
    expect(tax.total).toBe(payload.totalAmount)
    expect(billing.rut).toBe((payload.customer as Record<string, unknown>).rut)
    expect(billing.status).toBe('PENDIENTE_EMISION_SII')
  })

  it('normalizes the stored RUT to the canonical shape the rules pin', async () => {
    // Rules side: the create contract accepts only `12345678-5`-shaped RUTs.
    expect(rulesSource).toContain("c.rut.matches('^[0-9]{7,8}-[0-9K]$')")

    // Payload side: the real submitOrder() stores the purchaser's RUT cleaned,
    // whatever free-format punctuation the customer typed.
    const payload = await capturePayload({ items, total: 0, customer, paymentMethod: 'transferencia' })
    expect((payload.customer as Record<string, unknown>).rut).toBe('12345678-5')
    const billing = payload.billing as Record<string, unknown>
    expect(billing.rut).toBe('12345678-5')
  })

  it('pins the delivery zone, Boleta-only document type and all item-line guards', async () => {
    // Rules side: the enumerated create-contract pins.
    expect(rulesSource).toContain("c.city in ['Melipilla', 'San Antonio']")
    // Out-of-zone exception: a free-text commune only for a WhatsApp order,
    // capped at the same 80 chars the checkout input mirrors; the method
    // reaches the customer validator as a parameter.
    expect(rulesSource).toContain("(paymentMethod == 'whatsapp' && isBoundedString(c.city, 80) && c.city.size() > 0)")
    expect(rulesSource).toContain("c.documentType == 'boleta'")
    expect(rulesSource).toContain("b.documentType == 'boleta'")
    expect(rulesSource).toContain('data.createdAt is timestamp')
    expect(rulesSource).toContain("data.createdAt > request.time - duration.value(15, 'm')")
    expect(rulesSource).toContain("data.createdAt < request.time + duration.value(15, 'm')")
    const lineGuards = rulesSource.match(/isValidOrderItem\(data\.items\[\d+\]\)/g) ?? []
    expect(lineGuards, 'every one of the 25 possible item lines must be shape-checked').toHaveLength(25)

    // Payload side: the real submitOrder() output satisfies the pins — the
    // checkout fixture writes a comuna from the canonical zone list only.
    const payload = await capturePayload({ items, total: 0, customer, paymentMethod: 'mercadopago' })
    const storedCustomer = payload.customer as Record<string, unknown>
    expect(DELIVERY_ZONES).toContain(storedCustomer.city)
    expect(storedCustomer.documentType).toBe('boleta')
    expect((payload.billing as Record<string, unknown>).documentType).toBe('boleta')

    // The Factura checkout path stays disabled — the Boleta-only rules pin
    // and the component flag must never drift apart silently.
    const checkoutSource = fs.readFileSync(path.resolve(__dirname, '../../components/CheckoutModal.tsx'), 'utf8')
    expect(checkoutSource).toContain('FACTURA_ENABLED = false')
  })

  it('pins the order-id format, line bounds, e-mail shape and WhatsApp zone exception (Task 0.19)', async () => {
    // Rules side: the hardened create contract.
    expect(rulesSource).toContain("data.orderId.matches('^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$')")
    expect(rulesSource).toContain('item.quantity <= 1000000')
    expect(rulesSource).toContain('item.price is int && item.price >= 0')
    expect(rulesSource).toContain("c.email.matches('^[^@]+@[^@]+$')")
    expect(rulesSource).toContain('function isValidCustomer(c, paymentMethod)')
    expect(rulesSource).toContain("(paymentMethod == 'whatsapp' && isBoundedString(c.city, 80) && c.city.size() > 0)")

    // The quantity ceiling must equal the admin stock cap: the cart offers at most
    // the product's `stockCount`, so a rule tighter than MAX_STOCK_UNITS could
    // reject a legitimate line and dead-end checkout with a generic error. Rules
    // cannot import the constant, so this assertion is the sync guard.
    expect(rulesSource).toContain(`item.quantity <= ${MAX_STOCK_UNITS}`)

    // Payload side: the real submitOrder() output satisfies the new pins — the
    // generated id is exactly `PRONTO-` + 8 Crockford characters, quantities are
    // integers within the ceiling and prices are integer CLP.
    const payload = await capturePayload({ items, total: 0, customer, paymentMethod: 'mercadopago' })
    expect(payload.orderId).toMatch(/^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$/)
    const storedItems = payload.items as Array<{ quantity: number; price: number }>
    for (const line of storedItems) {
      expect(Number.isInteger(line.quantity)).toBe(true)
      expect(line.quantity).toBeGreaterThanOrEqual(1)
      expect(line.quantity).toBeLessThanOrEqual(MAX_STOCK_UNITS)
      expect(Number.isInteger(line.price)).toBe(true)
    }
    expect((payload.customer as Record<string, unknown>).email).toMatch(/^[^@]+@[^@]+$/)
  })

  it('keeps the checkout input caps in sync with the rules length caps', () => {
    const checkoutSource = fs.readFileSync(path.resolve(__dirname, '../../components/CheckoutModal.tsx'), 'utf8')

    // [field, cap] — every free-text field a customer types, mirrored by
    // CheckoutModal's FIELD_MAX_LENGTH (`maxLength` attributes, file-name clamp).
    // Firestore rejects the whole document when one value exceeds its cap, and
    // submitOrder can only report a generic failure, so a missing mirror is a
    // dead-end on the money path.
    const mirroredCaps: Array<[string, number]> = [
      ['fullName', 120],
      ['email', 160],
      ['phone', 32],
      ['rut', 16],
      ['address', 200],
      ['city', 80],
      ['zip', 16],
      ['razonSocial', 160],
      ['giroComercial', 160],
      ['sisRegistryNumber', 40],
      ['credentialFileName', 200]
    ]

    for (const [field, cap] of mirroredCaps) {
      // rules side: `isBoundedString(c.fullName, 120)` / `isBoundedString(s.sisRegistryNumber, 40)`
      expect(rulesSource, `firestore.rules no longer caps ${field} at ${cap}`).toContain(`${field}, ${cap})`)
      // client side: the FIELD_MAX_LENGTH entry that feeds the input's maxLength
      expect(checkoutSource, `CheckoutModal is missing the ${field}: ${cap} cap`).toContain(`${field}: ${cap}`)
    }
  })
})
