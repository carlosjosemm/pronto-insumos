import React from 'react'
import ProductCard from './ProductCard'
import { Product } from '../types'
import { AlertCircle } from 'lucide-react'

export interface ProductListProps {
  products: Product[]
  loading: boolean
  onAddToCart: (product: Product) => void
  onQuickView: (product: Product) => void
  /** Map of productId → units already in the cart, threaded to the cards. */
  cartQuantityById?: Record<string, number>
  onUpdateQuantity?: (productId: string, qty: number) => void
}

export default function ProductList({
  products,
  loading,
  onAddToCart,
  onQuickView,
  cartQuantityById,
  onUpdateQuantity
}: ProductListProps) {
  if (loading) {
    return (
      <div className="products-grid" aria-busy="true">
        <span className="visually-hidden">Cargando catálogo</span>
        {[...Array(8)].map((_, i) => (
          <div className="skeleton-card" key={i} aria-hidden="true">
            <div className="skeleton-block skeleton-media" />
            <div className="skeleton-block skeleton-line skeleton-line--medium" />
            <div className="skeleton-block skeleton-line skeleton-line--wide" />
            <div className="skeleton-block skeleton-line skeleton-line--short" />
          </div>
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div
        style={{
          background: 'white',
          borderRadius: 'var(--radius-lg)',
          padding: '3.5rem 1.5rem',
          textAlign: 'center',
          border: '1px solid var(--slate-200)'
        }}
      >
        <AlertCircle size={48} style={{ color: 'var(--slate-400)', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '0.5rem' }}>
          No se encontraron insumos odontológicos
        </h3>
        <p style={{ color: 'var(--slate-600)', maxWidth: '420px', margin: '0 auto' }}>
          Intenta cambiar el término de búsqueda o selecciona otra categoría odontológica.
        </p>
      </div>
    )
  }

  return (
    <div className="products-grid">
      {products.map((product, index) => (
        <div key={product.id} className="product-card-entrance" style={{ animationDelay: `${(index % 4) * 60}ms` }}>
          <ProductCard
            product={product}
            onAddToCart={onAddToCart}
            onQuickView={onQuickView}
            cartQuantity={cartQuantityById?.[product.id] ?? 0}
            onUpdateQuantity={onUpdateQuantity}
          />
        </div>
      ))}
    </div>
  )
}
