import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Firestore Security Rules (firestore.rules & firebase.json)', () => {
  const rootDir = path.resolve(__dirname, '../../../')
  const rulesPath = path.join(rootDir, 'firestore.rules')
  const configPath = path.join(rootDir, 'firebase.json')

  it('should have a firestore.rules file at repository root with rules_version 2', () => {
    expect(fs.existsSync(rulesPath)).toBe(true)
    const content = fs.readFileSync(rulesPath, 'utf8')
    expect(content).toContain("rules_version = '2';")
    expect(content).toContain('service cloud.firestore')
  })

  it('should have firebase.json referencing firestore.rules', () => {
    expect(fs.existsSync(configPath)).toBe(true)
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    expect(config.firestore).toBeDefined()
    expect(config.firestore.rules).toBe('firestore.rules')
  })

  it('should restrict products catalog reads to admins (stock-free public catalog)', () => {
    const content = fs.readFileSync(rulesPath, 'utf8')

    // Find products block — client reads are denied; the storefront loads the
    // catalog through /api/catalog (Admin SDK) and the console through
    // /api/admin/products, so exact stockCount and paused documents are no
    // longer public.
    expect(content).toMatch(/match\s+\/products\/\{productId\}\s*\{/)
    expect(content).toMatch(/allow\s+read:\s*if\s+isAdmin\(\);/)
    expect(content).toMatch(/allow\s+write:\s*if\s+isAdmin\(\);/)
  })

  it('should forbid client-side read, update, and delete on orders collection', () => {
    const content = fs.readFileSync(rulesPath, 'utf8')

    // Find orders block
    expect(content).toMatch(/match\s+\/orders\/\{orderId\}\s*\{/)
    // Client SDKs must never read, update, or delete orders directly
    expect(content).toMatch(/allow\s+read,\s*update,\s*delete:\s*if\s+false;/)
  })

  it('should strictly limit order creation to pending statuses and never allow client-side approved status', () => {
    const content = fs.readFileSync(rulesPath, 'utf8')

    // Validate isValidOrderCreate function (the path variable is a parameter)
    expect(content).toContain('function isValidOrderCreate(orderId)')
    expect(content).toContain('PENDIENTE_PAGO_MERCADOPAGO')
    expect(content).toContain('PENDIENTE_TRANSFERENCIA')
    expect(content).toContain('COTIZACION_SOLICITADA_WHATSAPP')

    // Ensure PAGADO_MERCADOPAGO is NOT permitted in client creation
    const pendingStatusMatch = content.match(/data\.status\s+in\s+\[([\s\S]*?)\]/)
    expect(pendingStatusMatch).not.toBeNull()
    const allowedStatuses = pendingStatusMatch![1]
    expect(allowedStatuses).not.toContain('PAGADO_MERCADOPAGO')
    expect(allowedStatuses).not.toContain('PAGADO')

    // Validate required fields
    expect(content).toContain('data.totalAmount is int && data.totalAmount > 0')
    expect(content).toContain('data.orderId is string')
    expect(content).toContain('data.customer is map')
    expect(content).toContain('data.items is list')
    expect(content).toContain('data.items.size() > 0')

    // Per-line shape guards (productId / quantity / price) on ALL 25 lines —
    // rules cannot loop over a list, so every index is guarded explicitly.
    expect(content).toContain('function isValidOrderItem(item)')
    expect(content).toContain('item.productId is string && item.productId.size() > 0')
    expect(content).toContain('item.quantity is int && item.quantity >= 1 && item.quantity <= 1000000')
    expect(content).toContain('item.price is int && item.price >= 0')
    for (let index = 0; index < 25; index += 1) {
      expect(content, `line guard for items[${index}] is missing`).toContain(`isValidOrderItem(data.items[${index}])`)
    }
    expect(content).toContain('data.items.size() <= 25')

    // Ensure client cannot inject payment confirmation attributes upon creation
    expect(content).toContain("!('mercadopagoPaymentId' in data)")
    expect(content).toContain("!('paidAt' in data)")
  })

  it('should bind the order document to its own id and allowlist the create shape (Task 0.12)', () => {
    const content = fs.readFileSync(rulesPath, 'utf8')

    // The path variable is passed in — a rules function cannot see the capture
    // variables of the match block that calls it.
    expect(content).toContain('function isValidOrderCreate(orderId)')
    expect(content).toContain('data.orderId == orderId')
    expect(content).toContain("data.orderId.matches('^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$')")

    // Both the canonical and the isolated dev collections enforce the same contract.
    for (const collection of ['orders', 'dev_orders']) {
      const block = content.split(`match /${collection}/{orderId}`)[1].split('}')[0]
      expect(block).toContain('allow create: if isValidOrderCreate(orderId);')
    }

    // Top-level allowlist: exactly the shape submitOrder() writes.
    const rootAllowMatch = content.match(/function isValidOrderCreate\(orderId\)[\s\S]*?hasOnly\(\[([\s\S]*?)\]\)/)
    expect(rootAllowMatch).not.toBeNull()
    const rootAllow = [...rootAllowMatch![1].matchAll(/'([^']+)'/g)].map((entry) => entry[1])
    for (const expected of [
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
    ]) {
      expect(rootAllow).toContain(expected)
    }

    // Admin-only fields can no longer be pre-injected at create time.
    for (const adminOnly of [
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
    ]) {
      expect(rootAllow).not.toContain(adminOnly)
    }

    // Nested allowlists and length caps.
    expect(content).toContain('function isBoundedString(value, maxLength)')
    expect(content).toMatch(/function isValidCustomer\(c, paymentMethod\)[\s\S]*?hasOnly\(\[/)
    expect(content).toMatch(/function isValidBilling\(b, orderTotal, customerRut\)[\s\S]*?hasOnly\(\[/)
    expect(content).toMatch(/function isValidSanitaryVerification\(s\)[\s\S]*?hasOnly\(\[/)
    expect(content).toContain("t.keys().hasOnly(['neto', 'iva', 'total'])")
    expect(content).toContain("item.keys().hasOnly(['productId', 'name', 'quantity', 'price'])")
    expect(content).toContain('isBoundedString(c.fullName, 120)')
    expect(content).toContain('isBoundedString(data.promoCode, 32)')
    // Documented CustomerInfo field: allowlisted (bounded) so a future writer
    // cannot make its whole payload fail at the rules boundary.
    expect(content).toContain("'transferReceipt'")
    expect(content).toContain('isBoundedString(c.transferReceipt, 120)')

    // paymentMethod ↔ status consistency and the server-owned SII emission state.
    expect(content).toContain("data.paymentMethod == 'mercadopago' && data.status == 'PENDIENTE_PAGO_MERCADOPAGO'")
    expect(content).toContain("data.paymentMethod == 'transferencia' && data.status == 'PENDIENTE_TRANSFERENCIA'")
    expect(content).toContain("data.paymentMethod == 'whatsapp' && data.status == 'COTIZACION_SOLICITADA_WHATSAPP'")
    expect(content).toContain("b.status == 'PENDIENTE_EMISION_SII'")

    // The persisted fiscal breakdown is bound to the order's own verified
    // figures: neto === round(total / 1.19) and neto + iva === total internally
    // (the exact calculateTaxBreakdown decomposition, so no other split can be
    // stored), total === totalAmount against the document, and the billing RUT
    // identical to the purchaser's.
    expect(content).toContain('t.neto == math.round(t.total / 1.19)')
    expect(content).toContain('t.neto + t.iva == t.total')
    expect(content).toContain('b.taxBreakdown.total == orderTotal')
    expect(content).toContain('b.rut == customerRut')
    expect(content).toContain('isValidBilling(data.billing, data.totalAmount, data.customer.rut)')
  })

  it('pins the delivery zone, Boleta-only document type, canonical RUT and commit-time createdAt', () => {
    const content = fs.readFileSync(rulesPath, 'utf8')

    // Delivery zones: the two communes checkout's `Comuna de Despacho` select
    // offers (mirrored from DELIVERY_ZONES in src/config/delivery.ts).
    expect(content).toContain("c.city in ['Melipilla', 'San Antonio']")

    // Out-of-zone exception: a free-text commune is accepted ONLY for a
    // WhatsApp order — its delivery and payment are settled in a direct chat,
    // so an online-payment order (Mercado Pago / transfer) can never carry a
    // commune outside the two configured zones. The method reaches the
    // customer validator as a parameter (the create-contract wiring).
    expect(content).toContain("(paymentMethod == 'whatsapp' && isBoundedString(c.city, 80) && c.city.size() > 0)")

    // Boleta-only as built: the Factura checkout path is disabled
    // (FACTURA_ENABLED = false); both the customer and the billing document
    // type are pinned, and the old two-value allowlist must not return.
    expect(content).toContain("c.documentType == 'boleta'")
    expect(content).toContain("b.documentType == 'boleta'")
    expect(content).not.toContain("documentType in ['boleta', 'factura']")

    // Canonical RUT storage: `12345678-5`. Rules cannot express Modulo 11
    // (no loops, no string arithmetic) — this is the shape pin; checkout's
    // validateRut() stays the check-digit authority.
    expect(content).toContain("c.rut.matches('^[0-9]{7,8}-[0-9K]$')")

    // createdAt is serverTimestamp()-sourced and bound to the request's own
    // commit time; a caller-chosen literal timestamp falls outside the window.
    expect(content).toContain('data.createdAt is timestamp')
    expect(content).toContain("data.createdAt > request.time - duration.value(15, 'm')")
    expect(content).toContain("data.createdAt < request.time + duration.value(15, 'm')")
  })

  it('pins the order-id format, line bounds, e-mail shape and the WhatsApp zone exception (Task 0.19)', () => {
    const content = fs.readFileSync(rulesPath, 'utf8')

    // The document id must carry the generator's exact shape — `PRONTO-` plus 8
    // Crockford base32 characters. A crafted id with a strippable character (which
    // used to sanitize into another order's voucher folder) is rejected at create.
    expect(content).toContain("data.orderId.matches('^PRONTO-[0-9A-HJKMNP-TV-Z]{8}$')")
    // The old length-only bound must not return as the id guard.
    expect(content).not.toContain('data.orderId.size() <= 32')

    // Line bounds: quantity has a ceiling (it must never be tighter than what the
    // cart can offer — the cart caps a line at stockCount, itself admin-capped at
    // MAX_STOCK_UNITS, so this figure mirrors that cap), and price is an integer
    // CLP amount.
    expect(content).toContain('item.quantity <= 1000000')
    expect(content).toContain('item.price is int && item.price >= 0')
    expect(content).not.toContain('item.price is number')

    // E-mail shape (delivery itself is the mail provider's authority). The pattern
    // is no stricter than the checkout's own type="email" validity, so it cannot
    // reject an address the form accepted.
    expect(content).toContain("c.email.matches('^[^@]+@[^@]+$')")
    expect(content).not.toContain('[.][^@]+$')

    // The delivery zone is pinned to the two communes checkout delivers to, EXCEPT
    // for a WhatsApp quote order (out-of-zone buyers settle delivery in a direct
    // chat), which needs a non-empty bounded free-text commune.
    expect(content).toContain('function isValidCustomer(c, paymentMethod)')
    expect(content).toContain("c.city in ['Melipilla', 'San Antonio']")
    expect(content).toContain("(paymentMethod == 'whatsapp' && isBoundedString(c.city, 80) && c.city.size() > 0)")
    expect(content).toContain('isValidCustomer(data.customer, data.paymentMethod)')
  })

  it('should enforce read-only for admins and write-deny on audit log collections', () => {
    const content = fs.readFileSync(rulesPath, 'utf8')

    // order_status_history rules
    expect(content).toMatch(/match\s+\/order_status_history\/\{historyId\}\s*\{/)
    expect(content).toMatch(/match\s+\/inventory_audit_logs\/\{auditId\}\s*\{/)

    // Ensure client-side writes are forbidden
    const historyBlock = content.split('match /order_status_history/{historyId}')[1].split('}')[0]
    expect(historyBlock).toContain('allow read: if isAdmin();')
    expect(historyBlock).toContain('allow write: if false;')

    const inventoryAuditBlock = content.split('match /inventory_audit_logs/{auditId}')[1].split('}')[0]
    expect(inventoryAuditBlock).toContain('allow read: if isAdmin();')
    expect(inventoryAuditBlock).toContain('allow write: if false;')
  })

  it('should enforce a default-deny rule on all unspecified collections', () => {
    const content = fs.readFileSync(rulesPath, 'utf8')
    expect(content).toMatch(/match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/)
  })

  it('should enforce symmetric security rules on isolated development dev_* collections', () => {
    const content = fs.readFileSync(rulesPath, 'utf8')

    // dev_products rules (admin-only reads and writes — the public catalog
    // lives behind /api/catalog)
    expect(content).toMatch(/match\s+\/dev_products\/\{productId\}\s*\{/)
    const devProductsBlock = content.split('match /dev_products/{productId}')[1].split('}')[0]
    expect(devProductsBlock).toContain('allow read: if isAdmin();')
    expect(devProductsBlock).toContain('allow write: if isAdmin();')

    // dev_orders rules (valid create only, client read/update/delete blocked)
    expect(content).toMatch(/match\s+\/dev_orders\/\{orderId\}\s*\{/)
    const devOrdersBlock = content.split('match /dev_orders/{orderId}')[1].split('}')[0]
    expect(devOrdersBlock).toContain('allow create: if isValidOrderCreate(orderId);')
    expect(devOrdersBlock).toContain('allow read, update, delete: if false;')

    // dev_order_status_history rules (admin read-only, write denied)
    expect(content).toMatch(/match\s+\/dev_order_status_history\/\{historyId\}\s*\{/)
    const devHistoryBlock = content.split('match /dev_order_status_history/{historyId}')[1].split('}')[0]
    expect(devHistoryBlock).toContain('allow read: if isAdmin();')
    expect(devHistoryBlock).toContain('allow write: if false;')

    // dev_inventory_audit_logs rules (admin read-only, write denied)
    expect(content).toMatch(/match\s+\/dev_inventory_audit_logs\/\{auditId\}\s*\{/)
    const devInventoryBlock = content.split('match /dev_inventory_audit_logs/{auditId}')[1].split('}')[0]
    expect(devInventoryBlock).toContain('allow read: if isAdmin();')
    expect(devInventoryBlock).toContain('allow write: if false;')
  })

  it('should have deploy:rules script configured in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
    expect(pkg.scripts['deploy:rules']).toBe('pnpm dlx firebase-tools deploy --only firestore:rules')
  })
})
