import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import CategoryFilter from './components/CategoryFilter'
import CategoryShowcase from './components/CategoryShowcase'
import ProductList from './components/ProductList'
import ProductQuickView from './components/ProductQuickView'
import Cart from './components/Cart'
import CheckoutModal from './components/CheckoutModal'
import PaymentReturnModal from './components/PaymentReturnModal'
import OrderTrackingModal from './components/OrderTrackingModal'
import Footer from './components/Footer'
import { fetchProducts } from './services/api'
import {
  saveCartToStorage,
  loadCartFromStorage,
  clearCartFromStorage,
  revalidateCartAgainstCatalog
} from './services/cartStorage'
import { forgetSessionOrderId, isSessionOrder } from './services/orderSession'
import { CartItem, Product, ProductCategory, PromoCode, Toast } from './types'
import { CheckCircle2 } from 'lucide-react'
import { computeCartTotal } from './utils/orderTotal'
import { resolvePromoPercent } from './config/promos'
import { REVIEWS_ENABLED } from './config/features'

type PaymentReturnStatus = 'approved' | 'failure' | 'pending' | null

interface UrlBootstrap {
  /** True when the URL carried payment-return or tracking parameters to consume. */
  hasParams: boolean
  /**
   * True only when an approved return names the order THIS tab just created —
   * the URL alone is forgeable and Mercado Pago writes it before
   * the webhook verifies the payment, so it may never reset the cart on its own.
   */
  clearsCart: boolean
  paymentReturn: {
    isOpen: boolean
    status: PaymentReturnStatus
    orderId: string
    paymentId: string
  }
  tracking: {
    isOpen: boolean
    orderId: string
    rut: string
  }
}

/**
 * Reads the payment-return / tracking query parameters once, so the state they
 * seed can be created with a lazy initializer instead of being written back
 * from a mount effect (which would cause a cascading render).
 */
function parseUrlBootstrap(): UrlBootstrap {
  const empty: UrlBootstrap = {
    hasParams: false,
    clearsCart: false,
    paymentReturn: { isOpen: false, status: null, orderId: '', paymentId: '' },
    tracking: { isOpen: false, orderId: '', rut: '' }
  }
  if (typeof window === 'undefined') return empty

  const params = new URLSearchParams(window.location.search)
  const rawStatus = (params.get('status') || params.get('collection_status') || '').toLowerCase().trim()
  const orderIdParam = params.get('orderId') || params.get('external_reference')
  const paymentIdParam = params.get('payment_id') || params.get('collection_id')
  const normalizedOrderId = orderIdParam ? orderIdParam.trim().toUpperCase() : ''

  let status: PaymentReturnStatus = null
  if (rawStatus === 'approved') {
    status = 'approved'
  } else if (rawStatus === 'failure' || rawStatus === 'rejected' || rawStatus === 'cancelled') {
    status = 'failure'
  } else if (rawStatus === 'pending' || rawStatus === 'in_process') {
    status = 'pending'
  }

  const trackParam = params.get('track') || params.get('tracking')
  const shouldTrack = Boolean(trackParam) && !rawStatus

  const bootstrap: UrlBootstrap = {
    hasParams: Boolean(status) || shouldTrack,
    // An approved return only resets the cart when it names the order
    // this tab created — a forged or foreign URL must leave the cart untouched.
    clearsCart: status === 'approved' && isSessionOrder(normalizedOrderId),
    paymentReturn: {
      isOpen: Boolean(status),
      status,
      orderId: normalizedOrderId,
      paymentId: paymentIdParam ? paymentIdParam.trim() : ''
    },
    tracking: { isOpen: false, orderId: '', rut: '' }
  }

  if (shouldTrack) {
    bootstrap.tracking = {
      isOpen: true,
      orderId:
        trackParam !== 'true' ? (trackParam as string).trim().toUpperCase() : (orderIdParam || '').trim().toUpperCase(),
      rut: params.get('rut') || ''
    }
  }

  return bootstrap
}

export default function App() {
  const [search, setSearch] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('all')
  const [sortBy, setSortBy] = useState<string>('featured')
  const [inStockOnly, setInStockOnly] = useState<boolean>(false)

  // A `sortBy` value of 'rating' | 'reviews' (a legacy or future persisted
  // value — the state is not persisted today) has no selector option while
  // reviews are disabled, so it must resolve to the default ordering instead
  // of a sort the shopper cannot see or switch back.
  const effectiveSortBy = !REVIEWS_ENABLED && (sortBy === 'rating' || sortBy === 'reviews') ? 'featured' : sortBy

  const bootstrap = useMemo(() => parseUrlBootstrap(), [])

  const [products, setProducts] = useState<Product[]>([])
  // Unfiltered catalog for the category pills — counting the filtered `products` would
  // drop every unselected pill to 0 as soon as a filter is applied.
  const [catalog, setCatalog] = useState<Product[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogRetryKey, setCatalogRetryKey] = useState(0)
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null)
  const hasRevalidated = useRef(false)

  // `loading` is derived from which request has completed, so a filter change
  // flips it to true during render instead of via a state-setting effect. The retry
  // key re-arms both the request and the loading state after a failure.
  const catalogRequestKey = `${selectedCategory}|${search}|${effectiveSortBy}|${inStockOnly}|${catalogRetryKey}`
  const loading = loadedRequestKey !== catalogRequestKey

  const [cart, setCart] = useState<CartItem[]>(() => {
    if (bootstrap.clearsCart) return []
    const stored = loadCartFromStorage()
    return stored ? stored.items : []
  })
  // Mirrors `cart` so the catalog effect can read the latest cart without
  // taking it as a dependency (which would re-fetch on every cart change).
  const cartRef = useRef(cart)
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false)
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null)
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(() => {
    if (bootstrap.clearsCart) return null
    const stored = loadCartFromStorage()
    return stored ? stored.appliedPromo : null
  })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [paymentReturn, setPaymentReturn] = useState(() => bootstrap.paymentReturn)
  const [isTrackingOpen, setIsTrackingOpen] = useState<boolean>(bootstrap.tracking.isOpen)
  const [trackingInitialOrderId, setTrackingInitialOrderId] = useState<string>(bootstrap.tracking.orderId)
  const [trackingInitialRut, setTrackingInitialRut] = useState<string>(bootstrap.tracking.rut)

  // Toast Notification Helper
  const addToast = useCallback((message: string) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  useEffect(() => {
    cartRef.current = cart
  }, [cart])

  // Load products when filters/search change, then revalidate the stored cart
  // against the freshly loaded inventory.
  useEffect(() => {
    let isMounted = true

    const load = async () => {
      try {
        const res = await fetchProducts({
          category: selectedCategory,
          search,
          sortBy: effectiveSortBy,
          inStockOnly
        })
        if (!isMounted) return

        setProducts(res.products)
        setCatalog(res.catalog)
        setCatalogError(res.source === 'unavailable' ? res.error || 'No pudimos cargar el catálogo.' : null)

        // Only the live catalog may revalidate the persisted cart — fixture
        // data (or an unavailable catalog) would otherwise classify every saved line as
        // "discontinued" and empty the cart. The one-shot flag is consumed only by a
        // trustworthy load, so a later success still revalidates.
        if (
          res.source === 'firestore' &&
          !hasRevalidated.current &&
          cartRef.current.length > 0 &&
          selectedCategory === 'all' &&
          !search &&
          !inStockOnly
        ) {
          hasRevalidated.current = true
          const reval = revalidateCartAgainstCatalog(cartRef.current, res.products)
          if (reval.hasChanges) {
            setCart(reval.items)
            if (reval.removedCount > 0 || reval.adjustedCount > 0) {
              addToast('Se actualizó el carro según el stock disponible en bodega')
            }
          }
        }
      } catch (err) {
        // An unexpected failure (e.g. a malformed catalog document) must surface the same
        // retryable card as a known failure — never the misleading "no results" empty state.
        console.warn('Error fetching products:', err)
        if (isMounted) {
          setProducts([])
          setCatalog([])
          setCatalogError('No pudimos cargar el catálogo de insumos. Revisa tu conexión y reintenta.')
        }
      } finally {
        if (isMounted) setLoadedRequestKey(catalogRequestKey)
      }
    }

    load()

    return () => {
      isMounted = false
    }
  }, [selectedCategory, search, effectiveSortBy, inStockOnly, catalogRequestKey, addToast])

  // Persist cart and promo code changes to localStorage
  useEffect(() => {
    saveCartToStorage(cart, appliedPromo)
  }, [cart, appliedPromo])

  /** Re-arms the catalog request after an unavailable/failed load. */
  const handleRetryCatalog = useCallback(() => {
    setCatalogRetryKey((key) => key + 1)
  }, [])

  const handleOrderSuccess = () => {
    setCart([])
    setAppliedPromo(null)
    clearCartFromStorage()
  }

  // Consume the payment-return / tracking parameters. The state they seed was
  // already created by the lazy initializers above; this effect only performs
  // the external side effects of resetting the matched cart and tidying the
  // address bar. The session marker is dropped with it so a replayed
  // return URL cannot wipe a cart the shopper refilled after paying.
  useEffect(() => {
    if (!bootstrap.hasParams || typeof window === 'undefined') return
    if (bootstrap.clearsCart) {
      clearCartFromStorage()
      forgetSessionOrderId()
    }
    try {
      const cleanUrl = window.location.pathname + window.location.hash
      window.history.replaceState({}, document.title, cleanUrl)
    } catch {
      // Fallback for non-browser or test environments
    }
  }, [bootstrap])

  const handleOpenTracking = (initialId = '', initialRut = '') => {
    setTrackingInitialOrderId(initialId)
    setTrackingInitialRut(initialRut)
    setIsTrackingOpen(true)
  }

  // Cart Operations
  const handleAddToCart = (product: Product, quantity = 1) => {
    setCart((prev) => {
      const maxStock = product.stockCount && product.stockCount > 0 ? product.stockCount : 99
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        const newQty = Math.min(maxStock, existing.quantity + quantity)
        return prev.map((item) => (item.product.id === product.id ? { ...item, quantity: newQty } : item))
      }
      return [...prev, { product, quantity: Math.min(maxStock, quantity) }]
    })
    addToast(`Se agregó "${product.name}" al carro`)
  }

  const handleUpdateQuantity = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveFromCart(productId)
    } else {
      setCart((prev) =>
        prev.map((item) => {
          if (item.product.id === productId) {
            const maxStock = item.product.stockCount && item.product.stockCount > 0 ? item.product.stockCount : 99
            return { ...item, quantity: Math.min(maxStock, newQty) }
          }
          return item
        })
      )
    }
  }

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }

  const totalCartCount = cart.reduce((acc, item) => acc + item.quantity, 0)

  // Units per product, so cards can swap their CTA for a quantity stepper
  const cartQuantityById = useMemo(() => Object.fromEntries(cart.map((i) => [i.product.id, i.quantity])), [cart])

  // Payable total: IVA-inclusive catalog prices minus the verified promo discount.
  // Same helper the webhook uses to assert the Mercado Pago charge.
  // The percent is re-resolved from the code on every render — never read off the
  // `appliedPromo` object, so a tampered/stale persisted entry cannot diverge from
  // the amount the serverless payment layer charges.
  const cartTotal = computeCartTotal(cart, resolvePromoPercent(appliedPromo?.code))

  const handleOpenCheckout = () => {
    setIsCartOpen(false)
    setIsCheckoutOpen(true)
  }

  const scrollToCatalog = () => {
    const elem = document.getElementById('catalog-section')
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="app-container">
      {/* Navbar */}
      <Navbar
        search={search}
        setSearch={setSearch}
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTracking={() => handleOpenTracking()}
        onSearchSubmit={scrollToCatalog}
      />

      {/* Landing Hero — full-bleed navy band, so it sits outside the content container */}
      <Hero onExploreClick={scrollToCatalog} />

      {/* Main Container */}
      <main className="main-content">
        {/* Category & Controls Bar */}
        <CategoryFilter
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          sortBy={effectiveSortBy}
          onSortChange={setSortBy}
          inStockOnly={inStockOnly}
          onToggleInStock={setInStockOnly}
          totalResults={products.length}
          catalog={catalog}
        />

        {/* Visual Category Showcase Hub / Contextual Category Banner */}
        <CategoryShowcase selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />

        {/* Product Catalog Grid — keyed by the catalog control signature so a
            filter/category/search/sort change remounts the list and resets the
            progressive reveal to page 1 (no reset effects). */}
        <ProductList
          key={catalogRequestKey}
          products={products}
          loading={loading}
          catalogError={catalogError}
          onRetry={handleRetryCatalog}
          onAddToCart={handleAddToCart}
          onQuickView={setQuickViewProduct}
          cartQuantityById={cartQuantityById}
          onUpdateQuantity={handleUpdateQuantity}
        />
      </main>

      {/* Footer */}
      <Footer onOpenTracking={() => handleOpenTracking()} />

      {/* Quick View Modal — keyed by product so its gallery/quantity state resets per product */}
      {quickViewProduct && (
        <ProductQuickView
          key={quickViewProduct.id}
          product={quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
          onAddToCart={handleAddToCart}
          cartQuantity={cartQuantityById[quickViewProduct.id] ?? 0}
        />
      )}

      {/* Slide-Over Cart Drawer */}
      <Cart
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveFromCart}
        onCheckout={handleOpenCheckout}
        appliedPromo={appliedPromo}
        onApplyPromo={setAppliedPromo}
      />

      {/* Multi-Step Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartItems={cart}
        totalAmount={cartTotal}
        appliedPromo={appliedPromo}
        onOrderSuccess={handleOrderSuccess}
        onOpenTracking={(orderId, rut) => handleOpenTracking(orderId, rut)}
      />

      {/* Mercado Pago Return Status Modal */}
      <PaymentReturnModal
        isOpen={paymentReturn.isOpen}
        status={paymentReturn.status}
        orderId={paymentReturn.orderId}
        paymentId={paymentReturn.paymentId}
        onClose={() => setPaymentReturn((prev) => ({ ...prev, isOpen: false }))}
        onTrackOrder={() => {
          setPaymentReturn((prev) => ({ ...prev, isOpen: false }))
          handleOpenTracking(paymentReturn.orderId)
        }}
      />

      {/* Customer Order Tracking Modal — mounted only while open so its form
          state initializes from the initial* props on every open */}
      {isTrackingOpen && (
        <OrderTrackingModal
          isOpen={isTrackingOpen}
          onClose={() => setIsTrackingOpen(false)}
          initialOrderId={trackingInitialOrderId}
          initialRut={trackingInitialRut}
        />
      )}

      {/* Toast Alerts */}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast-item">
            <CheckCircle2 size={18} style={{ color: 'var(--ink-800)' }} />
            <span>{toast.message}</span>
            <div className="toast-progress" />
          </div>
        ))}
      </div>
    </div>
  )
}
