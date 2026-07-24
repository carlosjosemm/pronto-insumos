import React, { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import CategoryFilter from './components/CategoryFilter'
import ProductList from './components/ProductList'
import ProductQuickView from './components/ProductQuickView'
import Cart from './components/Cart'
import CheckoutModal from './components/CheckoutModal'
import Footer from './components/Footer'
import { fetchProducts } from './services/api'
import { CartItem, Product, ProductCategory, PromoCode, Toast } from './types'
import { CheckCircle2 } from 'lucide-react'

export default function App() {
  const [search, setSearch] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('all')
  const [sortBy, setSortBy] = useState<string>('featured')
  const [inStockOnly, setInStockOnly] = useState<boolean>(false)
  
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  const [cart, setCart] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false)
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null)
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

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
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      }
      return [...prev, { product, quantity }]
    })
    addToast(`Se agregó "${product.name}" al carro`)
  }

  const handleUpdateQuantity = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveFromCart(productId)
    } else {
      setCart((prev) =>
        prev.map((item) =>
          item.product.id === productId ? { ...item, quantity: newQty } : item
        )
      )
    }
  }

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }

  const totalCartCount = cart.reduce((acc, item) => acc + item.quantity, 0)
  
  const subtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
  const discountAmount = appliedPromo ? (subtotal * appliedPromo.discountPercent) / 100 : 0
  const tax = (subtotal - discountAmount) * 0.19
  const cartTotal = Math.max(0, subtotal - discountAmount + tax)

  const handleOpenCheckout = () => {
    setIsCartOpen(false)
    setIsCheckoutOpen(true)
  }

  const handleOrderSuccess = () => {
    setCart([])
    setAppliedPromo(null)
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

      {/* Toast Alerts */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast-item">
            <CheckCircle2 size={18} style={{ color: 'var(--emerald)' }} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
