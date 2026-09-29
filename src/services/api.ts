import { PRODUCTS } from '../data/products'
import { MOCK_PROMOS, resolvePromoPercent } from '../config/promos'
import { computeCartTotal } from '../utils/orderTotal'
import { db } from './firebase'
import { getCollectionName } from './firestoreEnv'
import { isSimulatedFallbackAllowed } from './simulationPolicy'
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import {
  BillingInfo,
  CartItem,
  CustomerInfo,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  PromoCode,
  SanitaryVerification,
  SubmitOrderResult
} from '../types'
import { calculateTaxBreakdown } from '../utils/tax'

export interface FetchProductsOptions {
  category?: string
  search?: string
  sortBy?: string
  inStockOnly?: boolean
}

/**
 * Where a catalog response came from (Task 2.11).
 *
 *  - `firestore`   — the live catalog; the only source a cart may be revalidated against.
 *  - `fixtures`    — the local `PRODUCTS` prototype catalog. Development/demo only: it is
 *                    never served in a production runtime, and it is never authoritative
 *                    for the cart.
 *  - `unavailable` — the catalog could not be loaded and fabricating one is not allowed;
 *                    `error` carries a customer-safe message and the UI offers a retry.
 */
export type CatalogSource = 'firestore' | 'fixtures' | 'unavailable'

export interface CatalogResult {
  /** The filtered/sorted view the grid renders. */
  products: Product[]
  /**
   * The **unfiltered** source set (Firestore documents or the fixture catalog, before
   * `category`/`search`/`inStockOnly`/`sortBy` are applied). Facet consumers — the category
   * pills — must count from this, never from `products`, or every unselected pill reads `0`
   * as soon as a filter is active (review finding F1).
   */
  catalog: Product[]
  source: CatalogSource
  /** Present only when `source === 'unavailable'`. */
  error?: string
}

/**
 * Bounded wait for the catalog read (Task 2.11). Relaxed from the original 2.5 s, which a
 * first load on slow Chilean mobile data routinely exceeded — that is what served fixtures
 * to real shoppers. The Firestore SDK also retries internally, so this only bounds the wait.
 */
export const CATALOG_FETCH_TIMEOUT_MS = 10_000

const CATALOG_UNAVAILABLE_MESSAGE = 'No pudimos cargar el catálogo de insumos. Revisa tu conexión y reintenta.'

export interface SubmitOrderOptions {
  orderId?: string
  items: CartItem[]
  total: number
  customer: CustomerInfo
  paymentMethod: PaymentMethod
  billing?: BillingInfo
  sanitaryVerification?: SanitaryVerification
  promoCode?: string
}

/**
 * Generates a canonical order identifier in the format PRONTO-XXXXXX
 */
export function generateOrderId(): string {
  return 'PRONTO-' + Math.floor(100000 + Math.random() * 900000)
}

/**
 * Fetch products from Firestore.
 *
 * FAIL-CLOSED (Task 2.11): in a production runtime a missing configuration, a rejected read,
 * an empty snapshot or a timeout all resolve to `source: 'unavailable'` — the prototype
 * `PRODUCTS` fixtures are never served to real shoppers, and the caller must surface a
 * retryable error instead of a catalog it cannot trust. Outside production the fixtures
 * remain the offline fallback, flagged as `source: 'fixtures'` so no caller can mistake
 * them for live data (and never revalidate a persisted cart against them).
 */
export async function fetchProducts({
  category = 'all',
  search = '',
  sortBy = 'featured',
  inStockOnly = false
}: FetchProductsOptions = {}): Promise<CatalogResult> {
  let catalog: Product[]
  let source: CatalogSource

  const hasFirebaseConfig = Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_FIREBASE_API_KEY)
  const allowFixtureFallback = isSimulatedFallbackAllowed()

  if (!hasFirebaseConfig) {
    // No Firebase credentials: the local catalog is a development convenience only.
    // NOTE (review F3): in the browser this branch is only reachable while the Firebase
    // project id is missing but the API key is present — `src/services/firebase.ts` throws
    // `auth/invalid-api-key` at import time otherwise (known gap, TODO 8.11). It is kept as
    // defense-in-depth for the server-side/unit-test boundary.
    if (!allowFixtureFallback) {
      console.error(
        'Firebase credentials are not configured in a production runtime; refusing to serve the local catalog fixtures.'
      )
      return { products: [], catalog: [], source: 'unavailable', error: CATALOG_UNAVAILABLE_MESSAGE }
    }
    catalog = [...PRODUCTS]
    source = 'fixtures'
  } else {
    try {
      const productsRef = collection(db, getCollectionName('products'))
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      const snapshot = await Promise.race([
        getDocs(productsRef),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error('Firestore catalog timeout')), CATALOG_FETCH_TIMEOUT_MS)
        })
      ]).finally(() => clearTimeout(timeoutHandle))

      const liveProducts = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Product)
        .filter((p) => p.isActive !== false)

      if (liveProducts.length > 0) {
        catalog = liveProducts
        source = 'firestore'
      } else if (allowFixtureFallback) {
        console.warn('Firestore returned an empty catalog; using the local products fixture (non-production runtime).')
        catalog = [...PRODUCTS]
        source = 'fixtures'
      } else {
        console.error(
          'Firestore returned an empty catalog in a production runtime; refusing to serve the local fixtures.'
        )
        return { products: [], catalog: [], source: 'unavailable', error: CATALOG_UNAVAILABLE_MESSAGE }
      }
    } catch (err: unknown) {
      if (!allowFixtureFallback) {
        console.error(
          'Firestore catalog unavailable in a production runtime; refusing to serve the local fixtures:',
          err instanceof Error ? err.message : err
        )
        return { products: [], catalog: [], source: 'unavailable', error: CATALOG_UNAVAILABLE_MESSAGE }
      }
      console.warn('Firestore catalog fallback to local products:', err instanceof Error ? err.message : err)
      catalog = [...PRODUCTS]
      source = 'fixtures'
    }
  }

  let result = catalog

  // Filter by category
  if (category && category !== 'all') {
    result = result.filter((p) => (p.category || '').toLowerCase() === category.toLowerCase())
  }

  // Filter by search term
  if (search.trim()) {
    const q = search.toLowerCase().trim()
    result = result.filter(
      (p) =>
        // Guarded reads (review P3): a legacy/hand-edited document missing a text field
        // must not reject the whole catalog read and blank the storefront.
        (p.name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.tag || '').toLowerCase().includes(q)
    )
  }

  // Helper to determine physical stock availability
  const isAvailableStock = (p: Product) => Boolean(p.inStock && (p.stockCount === undefined || p.stockCount > 0))

  // Filter by stock
  if (inStockOnly) {
    result = result.filter((p) => isAvailableStock(p))
  }

  // Sort by requested criterion
  if (sortBy === 'price-low') {
    result.sort((a, b) => a.price - b.price)
  } else if (sortBy === 'price-high') {
    result.sort((a, b) => b.price - a.price)
  } else if (sortBy === 'rating') {
    result.sort((a, b) => b.rating - a.rating)
  } else if (sortBy === 'reviews') {
    result.sort((a, b) => b.reviewsCount - a.reviewsCount)
  }

  // Always push out-of-stock products to the bottom so clients see available products first
  const inStockList = result.filter((p) => isAvailableStock(p))
  const outOfStockList = result.filter((p) => !isAvailableStock(p))
  result = [...inStockList, ...outOfStockList]

  return { products: result, catalog, source }
}

export async function validatePromo(code: string): Promise<{ success: boolean; promo?: PromoCode; error?: string }> {
  await new Promise((resolve) => setTimeout(resolve, 150))
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
 * FAIL-CLOSED (Task 0.11): a rejected write returns `success: false` — callers must block
 * payment initiation and surface the error instead of continuing.
 */
export async function submitOrder(orderData: SubmitOrderOptions): Promise<SubmitOrderResult> {
  const orderId = (orderData.orderId || generateOrderId()).trim().toUpperCase()

  const statusMap: Record<PaymentMethod, OrderStatus> = {
    mercadopago: 'PENDIENTE_PAGO_MERCADOPAGO',
    transferencia: 'PENDIENTE_TRANSFERENCIA',
    whatsapp: 'COTIZACION_SOLICITADA_WHATSAPP'
  }

  // Server-verifiable amount trail: the promo percent is resolved from the shared
  // PROMO_CODES catalog (never from the client), and totalAmount is recomputed from
  // the item lines with the same pure helper the webhook uses to assert the payment.
  const discountPercent = resolvePromoPercent(orderData.promoCode)
  const totalAmount = computeCartTotal(orderData.items, discountPercent)
  const listSubtotal = orderData.items.reduce((acc, i) => acc + i.product.price * i.quantity, 0)
  const discountAmount = Math.max(0, listSubtotal - totalAmount)

  const billing: BillingInfo = orderData.billing || {
    documentType: orderData.customer.documentType,
    rut: orderData.customer.rut,
    razonSocial: orderData.customer.razonSocial,
    giroComercial: orderData.customer.giroComercial,
    direccionFiscal: orderData.customer.address,
    comunaFiscal: orderData.customer.city,
    taxBreakdown: calculateTaxBreakdown(totalAmount),
    status: 'PENDIENTE_EMISION_SII'
  }

  const payload: Order = {
    orderId,
    createdAt: serverTimestamp(),
    paymentMethod: orderData.paymentMethod || 'transferencia',
    status: statusMap[orderData.paymentMethod] || 'PENDIENTE_PAGO',
    totalAmount,
    customer: orderData.customer,
    billing,
    sanitaryVerification: orderData.sanitaryVerification || orderData.customer.sanitaryVerification,
    items: orderData.items.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      quantity: item.quantity,
      price: item.product.price
    })),
    ...(discountAmount > 0 ? { promoCode: orderData.promoCode?.trim().toUpperCase(), discountAmount } : {})
  }

  const itemsCount = orderData.items.reduce((acc, i) => acc + i.quantity, 0)

  try {
    const orderDocRef = doc(db, getCollectionName('orders'), orderId)
    await setDoc(orderDocRef, payload)
  } catch (err: unknown) {
    // FAIL-CLOSED (Task 0.11): a rejected write must never look like a persisted
    // order — checkout would otherwise initiate payment for a "ghost order".
    console.error('Firestore order submit failed:', err instanceof Error ? err.message : err)
    return {
      success: false,
      orderId,
      timestamp: new Date().toISOString(),
      total: totalAmount,
      itemsCount
    }
  }

  return {
    success: true,
    orderId,
    timestamp: new Date().toISOString(),
    total: totalAmount,
    itemsCount
  }
}
