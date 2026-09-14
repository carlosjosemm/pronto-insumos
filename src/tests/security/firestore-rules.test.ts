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

  it('should enforce public read and admin-only write on products catalog', () => {
    const content = fs.readFileSync(rulesPath, 'utf8')

    // Find products block
    expect(content).toMatch(/match\s+\/products\/\{productId\}\s*\{/)
    expect(content).toMatch(/allow\s+read:\s*if\s+true;/)
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

    // Validate isValidOrderCreate function
    expect(content).toContain('function isValidOrderCreate()')
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
    expect(content).toContain('totalAmount is number && data.totalAmount > 0')
    expect(content).toContain('orderId is string && data.orderId.size() > 0')
    expect(content).toContain('customer is map')
    expect(content).toContain('data.items is list')
    expect(content).toContain('data.items.size() > 0')

    // Ensure client cannot inject payment confirmation attributes upon creation
    expect(content).toContain("!('mercadopagoPaymentId' in data)")
    expect(content).toContain("!('paidAt' in data)")
  })

  it('should enforce a default-deny rule on all unspecified collections', () => {
    const content = fs.readFileSync(rulesPath, 'utf8')
    expect(content).toMatch(/match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/)
  })

  it('should have deploy:rules script configured in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
    expect(pkg.scripts['deploy:rules']).toBe('firebase deploy --only firestore:rules')
  })
})
