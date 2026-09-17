import { describe, it, expect } from 'vitest'
import {
  validateProductSchema,
  validateOrderSchema,
  validateOrderStatusHistorySchema,
  validateInventoryAuditLogSchema
} from '../../utils/schemaValidation'

describe('Firestore Schema Validation Utility (src/utils/schemaValidation.ts)', () => {
  describe('Product Schema Validation', () => {
    it('approves a fully conforming product document', () => {
      const validProduct = {
        id: 'odon-001',
        sku: 'REF-NSK-001',
        name: 'Turbina LED Push Button Triple Spray',
        brand: 'NSK Dental',
        category: 'Instrumental Rotatorio',
        price: 189990,
        stockCount: 15,
        inStock: true,
        prescriptionRequired: false,
        images: ['https://example.com/turbina.jpg'],
        specs: ['350.000 RPM', 'Triple Spray']
      }

      const res = validateProductSchema(validProduct)
      expect(res.valid).toBe(true)
      expect(res.errors).toHaveLength(0)
    })

    it('rejects product with decimal pricing or negative stock', () => {
      const invalidProduct = {
        id: 'odon-002',
        name: 'Producto Invalido',
        category: 'Instrumental',
        price: 199.99, // Non-integer
        stockCount: -5, // Negative
        inStock: 'true', // Not a boolean
        prescriptionRequired: false
      }

      const res = validateProductSchema(invalidProduct)
      expect(res.valid).toBe(false)
      expect(res.errors.some(e => e.includes('entero positivo en CLP'))).toBe(true)
      expect(res.errors.some(e => e.includes('mayor o igual a 0'))).toBe(true)
      expect(res.errors.some(e => e.includes('booleano'))).toBe(true)
    })
  })

  describe('Order Schema Validation', () => {
    it('approves a conforming order with Chilean Factura Electrónica attributes', () => {
      const validOrder = {
        orderId: 'PRONTO-123456',
        status: 'PENDIENTE_TRANSFERENCIA',
        totalAmount: 189990,
        paymentMethod: 'transferencia',
        customer: {
          fullName: 'Dr. Roberto Gomez',
          email: 'contacto@gomezdental.cl',
          phone: '+56 9 1234 5678',
          rut: '12345678-5', // Valid Chilean Modulo 11
          documentType: 'factura',
          razonSocial: 'Sociedad Odontológica Gomez Limitada',
          giroComercial: 'Servicios Odontológicos',
          address: 'Av. Ortúzar 1000',
          city: 'Melipilla'
        },
        items: [
          {
            productId: 'odon-001',
            name: 'Turbina LED Push Button',
            quantity: 1,
            price: 189990
          }
        ]
      }

      const res = validateOrderSchema(validOrder)
      expect(res.valid).toBe(true)
      expect(res.errors).toHaveLength(0)
    })

    it('rejects order with invalid RUT or missing Factura attributes', () => {
      const invalidOrder = {
        orderId: 'PRONTO-999',
        status: 'PENDIENTE_TRANSFERENCIA',
        totalAmount: 50000,
        paymentMethod: 'transferencia',
        customer: {
          fullName: 'Dr. Falso',
          email: 'invalido',
          phone: '123',
          rut: '12345678-9', // Invalid Modulo 11 (real check digit is 5)
          documentType: 'factura',
          address: 'Melipilla',
          city: 'Melipilla'
          // Missing razonSocial & giroComercial
        },
        items: []
      }

      const res = validateOrderSchema(invalidOrder)
      expect(res.valid).toBe(false)
      expect(res.errors.some(e => e.includes('Módulo 11'))).toBe(true)
      expect(res.errors.some(e => e.includes('razonSocial'))).toBe(true)
      expect(res.errors.some(e => e.includes('items'))).toBe(true)
    })
  })

  describe('Audit Log Schemas Validation', () => {
    it('validates OrderStatusHistory schema', () => {
      const historyRecord = {
        orderId: 'PRONTO-123456',
        previousStatus: 'PENDIENTE_TRANSFERENCIA',
        newStatus: 'TRANSFERENCIA_APROBADA',
        changedBy: 'admin_uid_123',
        actorRole: 'ADMIN',
        timestamp: new Date().toISOString(),
        reason: 'Aprobación de transferencia'
      }

      const res = validateOrderStatusHistorySchema(historyRecord)
      expect(res.valid).toBe(true)
    })

    it('validates InventoryAuditLog schema', () => {
      const auditRecord = {
        productId: 'odon-001',
        changeType: 'STOCK_ADJUSTMENT',
        changedBy: 'admin_uid_123',
        actorRole: 'ADMIN',
        timestamp: new Date().toISOString()
      }

      const res = validateInventoryAuditLogSchema(auditRecord)
      expect(res.valid).toBe(true)
    })
  })
})
