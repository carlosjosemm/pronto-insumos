import React, { useState, useEffect, useRef } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import CategoryFilter from './components/CategoryFilter'
import ProductList from './components/ProductList'
import ProductQuickView from './components/ProductQuickView'
import Cart from './components/Cart'
import CheckoutModal from './components/CheckoutModal'
import PaymentReturnModal from './components/PaymentReturnModal'
import Footer from './components/Footer'
import { fetchProducts } from './services/api'
import {
  saveCartToStorage,
  loadCartFromStorage,
  clearCartFromStorage,
  revalidateCartAgainstCatalog
} from './services/cartStorage'
import { CartItem, Product, ProductCategory, PromoCode, Toast } from './types'
import { CheckCircle2 } from 'lucide-react'
import { calculateIVA } from './utils/currency'

export default function App() {
  const [search, setSearch] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('all')
  const [sortBy, setSortBy] = useState<string>('featured')
  const [inStockOnly, setInStockOnly] = useState<boolean>(false)
  
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const hasRevalidated = useRef(false)

  const [cart, setCart] = useState<CartItem[]>(() => {
    const stored = loadCartFromStorage()
    return stored ? stored.items : []
  })
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false)
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null)
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(() => {
    const stored = loadCartFromStorage()
    return stored ? stored.appliedPromo : null
  })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [paymentReturn, setPaymentReturn] = useState<{
    isOpen: boolean
    status: 'approved' | 'failure' | 'pending' | null
    orderId: string
    paymentId: string
  }>({
    isOpen: false,
    status: null,
    orderId: '',
    paymentId: ''
  })

  // Load products when filters/search change
  useEffect(() => {
    let isMounted = true
    setLoading(true)
    fetchProducts({
      category: selectedCategory,
      search,
      sortBy,
      inStockOnly
    })
      .then((res) => {
        if (isMounted) {
          setProducts(res)
        }
      })
      .catch((err) => {
        console.warn('Error fetching products:', err)
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [selectedCategory, search, sortBy, inStockOnly])

  // Revalidate cart items on initial catalog load against full inventory
  useEffect(() => {
    if (hasRevalidated.current || cart.length === 0) return

    if (products.length > 0 && selectedCategory === 'all' && !search && !inStockOnly) {
      hasRevalidated.current = true
      const reval = revalidateCartAgainstCatalog(cart, products)
      if (reval.hasChanges) {
        setCart(reval.items)
        if (reval.removedCount > 0 || reval.adjustedCount > 0) {
          addToast('Se actualizó el carro según el stock disponible en bodega')
        }
      }
    }
  }, [products, selectedCategory, search, inStockOnly])

  // Persist cart and promo code changes to localStorage
  useEffect(() => {
    saveCartToStorage(cart, appliedPromo)
  }, [cart, appliedPromo])

  const handleOrderSuccess = () => {
    setCart([])
    setAppliedPromo(null)
    clearCartFromStorage()
  }

  // Check for Mercado Pago return query parameters on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const rawStatus = (params.get('status') || params.get('collection_status') || '').toLowerCase().trim()
    const orderIdParam = params.get('orderId') || params.get('external_reference')
    const paymentIdParam = params.get('payment_id') || params.get('collection_id')

    let normalizedStatus: 'approved' | 'failure' | 'pending' | null = null
    if (rawStatus === 'approved') {
      normalizedStatus = 'approved'
    } else if (rawStatus === 'failure' || rawStatus === 'rejected' || rawStatus === 'cancelled') {
      normalizedStatus = 'failure'
    } else if (rawStatus === 'pending' || rawStatus === 'in_process') {
      normalizedStatus = 'pending'
    }

    if (normalizedStatus) {
      const cleanOrderId = orderIdParam ? orderIdParam.trim().toUpperCase() : ''
      const cleanPaymentId = paymentIdParam ? paymentIdParam.trim() : ''

      setPaymentReturn({
        isOpen: true,
        status: normalizedStatus,
        orderId: cleanOrderId,
        paymentId: cleanPaymentId
      })

      if (normalizedStatus === 'approved') {
        handleOrderSuccess()
      }

      // Clean technical query parameters from browser address bar
      try {
        const cleanUrl = window.location.pathname + window.location.hash
        window.history.replaceState({}, document.title, cleanUrl)
      } catch {
        // Fallback for non-browser or test environments
      }
    }
  }, [])

  // Toast Notification Helper
  const addToast = (message: string) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  // Cart Operations
  const handleAddToCart = (product: Product, quantity = 1) => {
    setCart((prev) => {
      const maxStock = product.stockCount && product.stockCount > 0 ? product.stockCount : 99
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        const newQty = Math.min(maxStock, existing.quantity + quantity)
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: newQty }
            : item
        )
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
  
  const subtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
  const discountAmount = appliedPromo ? Math.round((subtotal * appliedPromo.discountPercent) / 100) : 0
  const taxable = subtotal - discountAmount
  const tax = calculateIVA(taxable)
  const cartTotal = Math.max(0, taxable + tax)

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
      />

      {/* Main Container */}
      <main className="main-content">
        {/* Landing Hero */}
        <Hero onExploreClick={scrollToCatalog} />

        {/* Category & Controls Bar */}
        <CategoryFilter
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          sortBy={sortBy}
          onSortChange={setSortBy}
          inStockOnly={inStockOnly}
          onToggleInStock={setInStockOnly}
          totalResults={products.length}
        />

        {/* Product Catalog Grid */}
        <ProductList
          products={products}
          loading={loading}
          onAddToCart={handleAddToCart}
          onQuickView={setQuickViewProduct}
        />
      </main>

      {/* Footer */}
      <Footer />

      {/* Quick View Modal */}
      {quickViewProduct && (
        <ProductQuickView
          product={quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
          onAddToCart={handleAddToCart}
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
        onOrderSuccess={handleOrderSuccess}
      />

      {/* Mercado Pago Return Status Modal */}
      <PaymentReturnModal
        isOpen={paymentReturn.isOpen}
        status={paymentReturn.status}
        orderId={paymentReturn.orderId}
        paymentId={paymentReturn.paymentId}
        onClose={() => setPaymentReturn(prev => ({ ...prev, isOpen: false }))}
        onRetryPayment={() => {
          setPaymentReturn(prev => ({ ...prev, isOpen: false }))
          setIsCheckoutOpen(true)
        }}
      />

      {/* Toast Alerts */}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast-item">
            <CheckCircle2 size={18} style={{ color: 'var(--teal-600)' }} />
            <span>{toast.message}</span>
            <div className="toast-progress" />
          </div>
        ))}
      </div>
    </div>
  )
}
