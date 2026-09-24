import React from 'react'
import ProductCard from './ProductCard'
import { Product } from '../types'
import { AlertCircle, ChevronDown } from 'lucide-react'
import { useIncrementalReveal } from '../hooks/useIncrementalReveal'

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
  const { visibleCount, hasMore, revealMore } = useIncrementalReveal(products.length)

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
          border: '1px solid var(--border-subtle)'
        }}
      >
        <AlertCircle size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '0.5rem' }}>
          No se encontraron insumos odontológicos
        </h3>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto' }}>
          Intenta cambiar el término de búsqueda o selecciona otra categoría odontológica.
        </p>
      </div>
    )
  }

  const visibleProducts = products.slice(0, visibleCount)

  return (
    <>
      <div className="products-grid">
        {visibleProducts.map((product, index) => (
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
      {hasMore && (
        <div className="load-more-row">
          <button type="button" className="btn-load-more" onClick={revealMore}>
            Cargar más insumos
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <p className="load-more-count" role="status" aria-live="polite">
            Mostrando {visibleProducts.length} de {products.length}
          </p>
        </div>
      )}
    </>
  )
}
