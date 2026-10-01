import { PRODUCTS } from '../data/products'
import { MOCK_PROMOS, resolvePromoPercent } from '../config/promos'
import { computeCartTotal } from '../utils/orderTotal'
import { db } from './firebase'
import { getCollectionName } from './firestoreEnv'
import { isSimulatedFallbackAllowed } from './simulationPolicy'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
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
import { cleanRut } from '../utils/rut'

export interface FetchProductsOptions {
  category?: string
  search?: string
  sortBy?: string
  inStockOnly?: boolean
}

/**
 * Where a catalog response came from.
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
   * as soon as a filter is active.
   */
  catalog: Product[]
  source: CatalogSource
  /** Present only when `source === 'unavailable'`. */
  error?: string
}

/**
 * Bounded wait for the catalog read. Relaxed from the original 2.5 s, which a
 * first load on slow Chilean mobile data routinely exceeded — that is what served fixtures
 * to real shoppers. The Firestore SDK also retries internally, so this only bounds the wait.
 */
export const CATALOG_FETCH_TIMEOUT_MS = 10_000

const CATALOG_UNAVAILABLE_MESSAGE = 'No pudimos cargar el catálogo de insumos. Revisa tu conexión y reintenta.'

/**
 * How long an idle catalog read stays valid. The cache timestamp is refreshed
 * on every read (sliding window), so an active shopper keeps the catalog while
 * a tab that goes untouched for this long re-reads it on the next request.
 */
export const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000

interface RawCatalog {
  catalog: Product[]
  source: CatalogSource
  error?: string
}

interface CachedCatalog extends RawCatalog {
  cachedAt: number
}

/**
 * The raw (unfiltered) catalog, held for the page session. The catalog is
 * filter-independent, so `fetchProducts` re-reads it at most once across
 * category/search/sort/stock changes instead of re-requesting `/api/catalog`
 * on every toggle.
 */
let catalogCache: CachedCatalog | null = null

/** The endpoint read shared by every caller that arrives while one is in flight. */
let inFlightCatalogRead: Promise<RawCatalog> | null = null

/** Drops the cached catalog so the next read goes to the endpoint (manual retry). */
export function invalidateCatalogCache(): void {
  catalogCache = null
}

/**
 * Reads the endpoint and classifies the result. FAIL-CLOSED in a production
 * runtime: an unavailable endpoint, a rejected read, an empty catalog or a
 * timeout all resolve to `unavailable` — the prototype `PRODUCTS` fixtures are
 * never served to real shoppers. Outside production the fixtures remain the
 * offline fallback, flagged `fixtures`.
 */
async function readCatalogEndpoint(): Promise<RawCatalog> {
  let catalog: Product[]
  let source: CatalogSource

  const allowFixtureFallback = isSimulatedFallbackAllowed()

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const response = await Promise.race([
      fetch('/api/catalog', { headers: { Accept: 'application/json' } }),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Catalog endpoint timeout')), CATALOG_FETCH_TIMEOUT_MS)
      })
    ]).finally(() => clearTimeout(timeoutHandle))

    if (!response.ok) {
      throw new Error(`Catalog endpoint answered ${response.status}`)
    }
    const liveProducts = (await response.json()) as Product[]
    if (!Array.isArray(liveProducts)) {
      throw new Error('Catalog endpoint returned a non-array payload')
    }

    if (liveProducts.length > 0) {
      catalog = liveProducts
      source = 'firestore'
    } else if (allowFixtureFallback) {
      console.warn(
        'Catalog endpoint returned an empty catalog; using the local products fixture (non-production runtime).'
      )
      catalog = [...PRODUCTS]
      source = 'fixtures'
    } else {
      console.error(
        'Catalog endpoint returned an empty catalog in a production runtime; refusing to serve the local fixtures.'
      )
      return { catalog: [], source: 'unavailable', error: CATALOG_UNAVAILABLE_MESSAGE }
    }
  } catch (err: unknown) {
    if (!allowFixtureFallback) {
      console.error(
        'Catalog endpoint unavailable in a production runtime; refusing to serve the local fixtures:',
        err instanceof Error ? err.message : err
      )
      return { catalog: [], source: 'unavailable', error: CATALOG_UNAVAILABLE_MESSAGE }
    }
    console.warn('Catalog endpoint fallback to local products:', err instanceof Error ? err.message : err)
    catalog = [...PRODUCTS]
    source = 'fixtures'
  }

  return { catalog, source }
}

/**
 * Serves the raw catalog from the in-memory cache, reading the endpoint only on
 * a miss or once the idle window has elapsed. An `unavailable` result is never
 * cached, so a retry (or the next filter change) re-reads instead of pinning a
 * failure for the session.
 *
 * Overlapping calls share one in-flight read: a burst of keystrokes (each a new
 * `search` → a new request) must not fan out into one endpoint read per key.
 */
async function loadRawCatalog(): Promise<RawCatalog> {
  const now = Date.now()
  if (catalogCache && now - catalogCache.cachedAt < CATALOG_CACHE_TTL_MS) {
    catalogCache.cachedAt = now
    return catalogCache
  }

  if (!inFlightCatalogRead) {
    inFlightCatalogRead = readCatalogEndpoint()
      .then((fresh) => {
        if (fresh.source !== 'unavailable') {
          catalogCache = { ...fresh, cachedAt: Date.now() }
        }
        return fresh
      })
      .finally(() => {
        inFlightCatalogRead = null
      })
  }
  return inFlightCatalogRead
}

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
 * Crockford base32 alphabet (no I, L, O, U — the characters people mistype).
 * 32 symbols, so `byte % 32` is exact: `getRandomValues` fills bytes uniformly and
 * 256 is a multiple of 32, hence zero modulo bias.
 */
const ORDER_ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ORDER_ID_LENGTH = 8

/**
 * Generates the canonical order identifier: `PRONTO-` + 8 Crockford base32 characters
 * (40 bits of CSPRNG entropy ≈ 1.1 × 10¹² ids).
 *
 * The previous `PRONTO-` + six `Math.random()` digits covered only 900 000 values,
 * which the public tracking endpoint's 404/401 split made walkable. Legacy
 * `PRONTO-NNNNNN` ids keep resolving: nothing parses the format server-side.
 */
export function generateOrderId(): string {
  const bytes = new Uint8Array(ORDER_ID_LENGTH)
  crypto.getRandomValues(bytes)
  return 'PRONTO-' + Array.from(bytes, (byte) => ORDER_ID_ALPHABET[byte % ORDER_ID_ALPHABET.length]).join('')
}

/**
 * Fetch products from the public catalog endpoint (`/api/catalog`).
 *
 * The storefront never reads the `products` collection directly — Firestore
 * rules deny client reads, and the endpoint is the sole catalog authority
 * (active products only, explicit public-field allowlist, `stockCount`
 * disclosed only at 1–3; everything else is "plenty, the server verifies" at
 * payment time).
 *
 * FAIL-CLOSED: in a production runtime an unavailable endpoint, a rejected
 * read, an empty catalog or a timeout all resolve to `source: 'unavailable'` —
 * the prototype `PRODUCTS` fixtures are never served to real shoppers, and the
 * caller must surface a retryable error instead of a catalog it cannot trust.
 * Outside production the fixtures remain the offline fallback, flagged as
 * `source: 'fixtures'` so no caller can mistake them for live data (and never
 * revalidate a persisted cart against them).
 */
export async function fetchProducts({
  category = 'all',
  search = '',
  sortBy = 'featured',
  inStockOnly = false
}: FetchProductsOptions = {}): Promise<CatalogResult> {
  const raw = await loadRawCatalog()
  if (raw.source === 'unavailable') {
    return { products: [], catalog: [], source: 'unavailable', error: raw.error }
  }
  const { catalog, source } = raw

  // Copy before sorting: the cached array must never be mutated in place, or
  // one shopper's sort order would leak into the next read of the same cache.
  let result = catalog.slice()

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

  // `catalog` is copied too: it is the shared cache array, and a consumer that
  // sorted it in place would corrupt the cache for every later read.
  return { products: result, catalog: catalog.slice(), source }
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
 * FAIL-CLOSED: a rejected write returns `success: false` — callers must block
 * payment initiation and surface the error instead of continuing.
 */
export async function submitOrder(orderData: SubmitOrderOptions): Promise<SubmitOrderResult> {
  const orderId = (orderData.orderId || generateOrderId()).trim().toUpperCase()

  // Canonical RUT storage: `12345678-5` (digits + hyphen + check digit) — the
  // same shape `firestore.rules` pins with `matches('^[0-9]{7,8}-[0-9K]$')`.
  // Checkout already Modulo-11-validates the input, so this only strips the
  // free-format punctuation a customer may type; an uncleanable value passes
  // through unchanged and the rules reject the write (fail-closed).
  const normalizeStoredRut = (rut: string): string => {
    const cleaned = cleanRut(rut)
    if (cleaned.length < 8 || cleaned.length > 9) return rut
    return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`
  }
  const customer: CustomerInfo = { ...orderData.customer, rut: normalizeStoredRut(orderData.customer.rut) }

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

  // The tax math, the billing RUT and the SII emission state are derived here —
  // never taken from the caller. A crafted `billing` payload could otherwise
  // persist a fiscal breakdown that disagrees with the recomputed total (e.g.
  // iva: 0), or a tax RUT different from the purchaser's, and that stored map is
  // what admin portals and manual issuance would read later.
  const billing: BillingInfo = {
    ...(orderData.billing || {
      documentType: customer.documentType,
      razonSocial: customer.razonSocial,
      giroComercial: customer.giroComercial,
      direccionFiscal: customer.address,
      comunaFiscal: customer.city
    }),
    rut: customer.rut,
    taxBreakdown: calculateTaxBreakdown(totalAmount),
    status: 'PENDIENTE_EMISION_SII'
  }

  const payload: Order = {
    orderId,
    createdAt: serverTimestamp(),
    paymentMethod: orderData.paymentMethod || 'transferencia',
    status: statusMap[orderData.paymentMethod] || 'PENDIENTE_PAGO',
    totalAmount,
    customer,
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
    // FAIL-CLOSED: a rejected write must never look like a persisted
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
