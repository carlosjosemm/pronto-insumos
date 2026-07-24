import { PRODUCTS, MOCK_PROMOS } from '../data/products'
import { db } from './firebase'
import { collection, getDocs, addDoc, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { CartItem, CustomerInfo, Order, OrderStatus, PaymentMethod, Product, PromoCode } from '../types'

export interface FetchProductsOptions {
  category?: string
  search?: string
  sortBy?: string
  inStockOnly?: boolean
}

export interface SubmitOrderOptions {
  items: CartItem[]
  total: number
  customer: CustomerInfo
  paymentMethod: PaymentMethod
}

export interface SubmitOrderResult {
  success: boolean
  orderId: string
  timestamp: string
  total: number
  itemsCount: number
}

/**
 * Atomic stock deduction for approved instant payments (Mercado Pago)
 */
export async function deductOrderStock(items: CartItem[]): Promise<{ success: boolean; error?: string }> {
  try {
    await runTransaction(db, async (transaction) => {
      for (const item of items) {
        const productRef = doc(db, 'products', item.product.id)
        const productDoc = await transaction.get(productRef)

        if (productDoc.exists()) {
          const currentStock = productDoc.data().stockCount || 0
          const newStock = Math.max(0, currentStock - item.quantity)
          transaction.update(productRef, {
            stockCount: newStock,
            inStock: newStock > 0
          })
        }
      }
    })
    return { success: true }
  } catch (error: any) {
    console.warn('Atomic stock deduction notice:', error.message)
    return { success: false, error: error.message }
  }
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
        const productsRef = collection(db, 'products')
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
 * Note: Stock deduction is executed ONLY if paymentMethod is 'mercadopago'
 */
export async function submitOrder(orderData: SubmitOrderOptions): Promise<SubmitOrderResult> {
  const orderId = 'PRONTO-' + Math.floor(100000 + Math.random() * 900000)
  const isPaidLocally = orderData.paymentMethod === 'mercadopago'

  const statusMap: Record<PaymentMethod, OrderStatus> = {
    mercadopago: 'PAGADO_MERCADOPAGO',
    transferencia: 'PENDIENTE_TRANSFERENCIA',
    whatsapp: 'COTIZACION_SOLICITADA_WHATSAPP'
  }

  const payload: Order = {
    orderId,
    createdAt: serverTimestamp(),
    paymentMethod: orderData.paymentMethod || 'transferencia',
    status: statusMap[orderData.paymentMethod] || 'PENDIENTE_PAGO',
    totalAmount: orderData.total,
    customer: orderData.customer,
    items: orderData.items.map(item => ({
      productId: item.product.id,
      name: item.product.name,
      quantity: item.quantity,
      price: item.product.price
    }))
  }

  try {
    const ordersRef = collection(db, 'orders')
    await addDoc(ordersRef, payload)

    // DEDUCT STOCK ONLY IF INSTANTLY PAID VIA MERCADO PAGO
    if (isPaidLocally) {
      await deductOrderStock(orderData.items)
    }
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
