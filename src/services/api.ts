import { PRODUCTS, MOCK_PROMOS } from '../data/products'
import { db } from './firebase'
import { getCollectionName } from './firestoreEnv'
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { BillingInfo, CartItem, CustomerInfo, Order, OrderStatus, PaymentMethod, Product, PromoCode, SanitaryVerification } from '../types'
import { calculateTaxBreakdown } from '../utils/tax'

export interface FetchProductsOptions {
  category?: string
  search?: string
  sortBy?: string
  inStockOnly?: boolean
}

export interface SubmitOrderOptions {
  orderId?: string
  items: CartItem[]
  total: number
  customer: CustomerInfo
  paymentMethod: PaymentMethod
  billing?: BillingInfo
  sanitaryVerification?: SanitaryVerification
}

/**
 * Generates a canonical order identifier in the format PRONTO-XXXXXX
 */
export function generateOrderId(): string {
  return 'PRONTO-' + Math.floor(100000 + Math.random() * 900000)
}

export interface SubmitOrderResult {
  success: boolean
  orderId: string
  timestamp: string
  total: number
  itemsCount: number
}

/**
 * Fetch products from Firestore with fallback to local PRODUCTS
 */
export async function fetchProducts({
  category = 'all',
  search = '',
  sortBy = 'featured',
  inStockOnly = false
}: FetchProductsOptions = {}): Promise<Product[]> {
  let result: Product[] = []

  const hasFirebaseConfig = Boolean(
    import.meta.env.VITE_FIREBASE_PROJECT_ID && 
    import.meta.env.VITE_FIREBASE_API_KEY
  )

  if (hasFirebaseConfig) {
    try {
      const fetchPromise = (async () => {
        const productsRef = collection(db, getCollectionName('products'))
        const snapshot = await getDocs(productsRef)
        if (!snapshot.empty) {
          return snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Product)
        }
        return [...PRODUCTS]
      })()

      const timeoutPromise = new Promise<Product[]>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore response timeout')), 2500)
      )

      result = await Promise.race([fetchPromise, timeoutPromise])
    } catch (err: any) {
      console.warn('Firestore catalog fallback to local products:', err.message)
      result = [...PRODUCTS]
    }
  } else {
    // If Firebase credentials are not filled yet in environment, use PRODUCTS catalog immediately
    result = [...PRODUCTS]
  }

  // Filter by category
  if (category && category !== 'all') {
    result = result.filter(p => p.category.toLowerCase() === category.toLowerCase())
  }

  // Filter by search term
  if (search.trim()) {
    const q = search.toLowerCase().trim()
    result = result.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.tag.toLowerCase().includes(q)
    )
  }

  // Filter by stock
  if (inStockOnly) {
    result = result.filter(p => p.inStock)
  }

  // Sort
  if (sortBy === 'price-low') {
    result.sort((a, b) => a.price - b.price)
  } else if (sortBy === 'price-high') {
    result.sort((a, b) => b.price - a.price)
  } else if (sortBy === 'rating') {
    result.sort((a, b) => b.rating - a.rating)
  } else if (sortBy === 'reviews') {
    result.sort((a, b) => b.reviewsCount - a.reviewsCount)
  }

  return result
}

export async function validatePromo(code: string): Promise<{ success: boolean; promo?: PromoCode; error?: string }> {
  await new Promise(resolve => setTimeout(resolve, 150))
  const clean = code.trim().toUpperCase()
  if (MOCK_PROMOS[clean]) {
    return { success: true, promo: MOCK_PROMOS[clean] }
  }
  return { success: false, error: 'Código de descuento inválido o vencido' }
}

/**
 * Submit order to Firestore
 * Orders start in pending state (e.g., PENDIENTE_PAGO_MERCADOPAGO, PENDIENTE_TRANSFERENCIA).
 * Physical stock is deducted EXCLUSIVELY by the verified serverless webhook upon payment confirmation.
 */
export async function submitOrder(orderData: SubmitOrderOptions): Promise<SubmitOrderResult> {
  const orderId = (orderData.orderId || generateOrderId()).trim().toUpperCase()

  const statusMap: Record<PaymentMethod, OrderStatus> = {
    mercadopago: 'PENDIENTE_PAGO_MERCADOPAGO',
    transferencia: 'PENDIENTE_TRANSFERENCIA',
    whatsapp: 'COTIZACION_SOLICITADA_WHATSAPP'
  }

  const billing: BillingInfo = orderData.billing || {
    documentType: orderData.customer.documentType,
    rut: orderData.customer.rut,
    razonSocial: orderData.customer.razonSocial,
    giroComercial: orderData.customer.giroComercial,
    direccionFiscal: orderData.customer.address,
    comunaFiscal: orderData.customer.city,
    taxBreakdown: calculateTaxBreakdown(orderData.total),
    status: 'PENDIENTE_EMISION_SII'
  }

  const payload: Order = {
    orderId,
    createdAt: serverTimestamp(),
    paymentMethod: orderData.paymentMethod || 'transferencia',
    status: statusMap[orderData.paymentMethod] || 'PENDIENTE_PAGO',
    totalAmount: orderData.total,
    customer: orderData.customer,
    billing,
    sanitaryVerification: orderData.sanitaryVerification || orderData.customer.sanitaryVerification,
    items: orderData.items.map(item => ({
      productId: item.product.id,
      name: item.product.name,
      quantity: item.quantity,
      price: item.product.price
    }))
  }

  try {
    const orderDocRef = doc(db, getCollectionName('orders'), orderId)
    await setDoc(orderDocRef, payload)
  } catch (err: any) {
    console.warn('Firestore order submit notice:', err.message)
  }

  return {
    success: true,
    orderId,
    timestamp: new Date().toISOString(),
    total: orderData.total,
    itemsCount: orderData.items.reduce((acc, i) => acc + i.quantity, 0)
  }
}
