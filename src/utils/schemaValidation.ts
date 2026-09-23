import { validateRut } from './rut'
import type { OrderStatus, PaymentMethod } from '../types'

/**
 * Loose view of an unvalidated Firestore document. Validators receive `unknown`
 * and narrow through this shape so every field access stays type-checked.
 */
type SchemaDoc = Record<string, unknown>

const VALID_ORDER_STATUSES: OrderStatus[] = [
  'PENDIENTE_PAGO_MERCADOPAGO',
  'PAGADO_MERCADOPAGO',
  'PENDIENTE_TRANSFERENCIA',
  'TRANSFERENCIA_COMPROBANTE_SUBIDO',
  'TRANSFERENCIA_APROBADA',
  'PAGADO_TRANSFERENCIA',
  'EN_PREPARACION',
  'DESPACHADO',
  'ENTREGADO',
  'CANCELADO',
  'COTIZACION_SOLICITADA_WHATSAPP',
  'PENDIENTE_PAGO'
]

const VALID_PAYMENT_METHODS: PaymentMethod[] = ['transferencia', 'mercadopago', 'whatsapp']

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validates that a document strictly conforms to the frozen ProductDocument schema.
 */
export function validateProductSchema(input: unknown): ValidationResult {
  const errors: string[] = []

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['El documento debe ser un objeto válido'] }
  }

  const doc = input as SchemaDoc

  if (!doc.id || typeof doc.id !== 'string' || doc.id.trim() === '') {
    errors.push('Campo "id" es requerido y debe ser string no vacío')
  }

  if (!doc.name || typeof doc.name !== 'string' || doc.name.trim() === '') {
    errors.push('Campo "name" es requerido y debe ser string no vacío')
  }

  if (!doc.category || typeof doc.category !== 'string') {
    errors.push('Campo "category" es requerido y debe ser string')
  }

  if (typeof doc.price !== 'number' || !Number.isInteger(doc.price) || doc.price <= 0) {
    errors.push('Campo "price" debe ser un entero positivo en CLP (sin centavos)')
  }

  if (typeof doc.stockCount !== 'number' || !Number.isInteger(doc.stockCount) || doc.stockCount < 0) {
    errors.push('Campo "stockCount" debe ser un entero mayor o igual a 0')
  }

  if (typeof doc.inStock !== 'boolean') {
    errors.push('Campo "inStock" debe ser booleano')
  }

  if (doc.isActive !== undefined && typeof doc.isActive !== 'boolean') {
    errors.push('Campo "isActive" debe ser booleano si está presente')
  }

  if (typeof doc.prescriptionRequired !== 'boolean') {
    errors.push('Campo "prescriptionRequired" debe ser booleano')
  }

  if (doc.images && !Array.isArray(doc.images)) {
    errors.push('Campo "images" debe ser un arreglo de URLs')
  }

  if (doc.specs && !Array.isArray(doc.specs)) {
    errors.push('Campo "specs" debe ser un arreglo de strings')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validates that a document strictly conforms to the frozen OrderDocument schema.
 */
export function validateOrderSchema(input: unknown): ValidationResult {
  const errors: string[] = []

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['El documento debe ser un objeto válido'] }
  }

  const doc = input as SchemaDoc

  if (!doc.orderId || typeof doc.orderId !== 'string' || doc.orderId.trim() === '') {
    errors.push('Campo "orderId" es requerido y debe ser string no vacío')
  }

  if (!VALID_ORDER_STATUSES.includes(doc.status as OrderStatus)) {
    errors.push(`Estado "${doc.status}" no es un OrderStatus válido`)
  }

  if (typeof doc.totalAmount !== 'number' || !Number.isInteger(doc.totalAmount) || doc.totalAmount <= 0) {
    errors.push('Campo "totalAmount" debe ser un entero positivo en CLP')
  }

  if (!VALID_PAYMENT_METHODS.includes(doc.paymentMethod as PaymentMethod)) {
    errors.push(`Método de pago "${doc.paymentMethod}" no es válido`)
  }

  // Customer validation
  if (!doc.customer || typeof doc.customer !== 'object') {
    errors.push('Campo "customer" es requerido y debe ser un objeto')
  } else {
    const c = doc.customer as SchemaDoc
    if (!c.fullName || typeof c.fullName !== 'string') errors.push('customer.fullName es requerido')
    if (!c.email || typeof c.email !== 'string' || !c.email.includes('@'))
      errors.push('customer.email debe ser un correo válido')
    if (typeof c.rut !== 'string' || !validateRut(c.rut))
      errors.push('customer.rut no es un RUT chileno válido (Módulo 11)')
    if (!c.address || typeof c.address !== 'string') errors.push('customer.address es requerido')
    if (!c.city || typeof c.city !== 'string') errors.push('customer.city es requerido')

    if (c.documentType === 'factura') {
      if (!c.razonSocial || typeof c.razonSocial !== 'string' || c.razonSocial.trim() === '') {
        errors.push('customer.razonSocial es obligatorio para Factura Electrónica')
      }
      if (!c.giroComercial || typeof c.giroComercial !== 'string' || c.giroComercial.trim() === '') {
        errors.push('customer.giroComercial es obligatorio para Factura Electrónica')
      }
    }
  }

  // Items validation
  if (!Array.isArray(doc.items) || doc.items.length === 0) {
    errors.push('Campo "items" debe ser un arreglo con al menos un producto')
  } else {
    ;(doc.items as SchemaDoc[]).forEach((item, idx: number) => {
      const pid = item.productId || item.id
      if (!pid || typeof pid !== 'string') errors.push(`item[${idx}]: productId es requerido`)
      if (!item.name || typeof item.name !== 'string') errors.push(`item[${idx}]: name es requerido`)
      if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1) {
        errors.push(`item[${idx}]: quantity debe ser un entero >= 1`)
      }
      if (typeof item.price !== 'number' || !Number.isInteger(item.price) || item.price < 0) {
        errors.push(`item[${idx}]: price debe ser un entero CLP >= 0`)
      }
    })
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validates that an OrderStatusHistory record is complete and valid.
 */
export function validateOrderStatusHistorySchema(input: unknown): ValidationResult {
  const errors: string[] = []

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['El registro debe ser un objeto válido'] }
  }

  const doc = input as SchemaDoc

  if (!doc.orderId || typeof doc.orderId !== 'string') errors.push('orderId es requerido')
  if (!VALID_ORDER_STATUSES.includes(doc.newStatus as OrderStatus))
    errors.push(`newStatus "${doc.newStatus}" no es válido`)
  if (!doc.changedBy || typeof doc.changedBy !== 'string') errors.push('changedBy es requerido')
  if (!doc.actorRole || typeof doc.actorRole !== 'string') errors.push('actorRole es requerido')
  if (!doc.timestamp || typeof doc.timestamp !== 'string') errors.push('timestamp ISO es requerido')
  if (!doc.reason || typeof doc.reason !== 'string') errors.push('reason es requerido')

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validates that an InventoryAuditLog record is complete and valid.
 */
export function validateInventoryAuditLogSchema(input: unknown): ValidationResult {
  const errors: string[] = []

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['El registro debe ser un objeto válido'] }
  }

  const doc = input as SchemaDoc

  if (!doc.productId || typeof doc.productId !== 'string') errors.push('productId es requerido')
  if (!doc.changeType || typeof doc.changeType !== 'string') errors.push('changeType es requerido')
  if (!doc.changedBy || typeof doc.changedBy !== 'string') errors.push('changedBy es requerido')
  if (!doc.actorRole || typeof doc.actorRole !== 'string') errors.push('actorRole es requerido')
  if (!doc.timestamp || typeof doc.timestamp !== 'string') errors.push('timestamp ISO es requerido')

  return {
    valid: errors.length === 0,
    errors
  }
}
