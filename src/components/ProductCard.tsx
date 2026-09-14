import React from 'react'
import { Product } from '../types'
import { Star, Eye, ShoppingBag, ShieldCheck, Activity, Heart, Home, ShieldAlert, LucideIcon } from 'lucide-react'

const ICON_BY_CATEGORY: Record<string, LucideIcon> = {
  Diagnostics: Activity,
  Instruments: Home,
  Materials: Heart,
  Sterilization: ShieldAlert
}

export interface ProductCardProps {
  product: Product
  onAddToCart: (product: Product) => void
  onQuickView: (product: Product) => void
}

export default function ProductCard({ product, onAddToCart, onQuickView }: ProductCardProps) {
  const CategoryIcon = ICON_BY_CATEGORY[product.category] || Activity

  // Defensive stock check
  const isAvailable = product.inStock && (product.stockCount === undefined || product.stockCount > 0)

  // Formatted SKU code (e.g. REF: OD-101)
  const skuRef = product.id.toUpperCase().startsWith('OD-')
    ? product.id.toUpperCase()
    : product.id.replace(/^odon-?/i, 'OD-').toUpperCase()

  return (
    <article className="product-card" aria-labelledby={`product-title-${product.id}`}>
      {/* Technical Header */}
      <div className="product-card-tech-header">
        <span className="product-ref-badge">REF: {skuRef}</span>
        {!isAvailable && (
          <span className="product-stock-status" style={{ color: '#dc2626' }}>
            <span className="product-stock-dot" style={{ background: '#dc2626' }} />
            <span>Sin Stock</span>
          </span>
        )}
      </div>

      {/* Media Presentation Box (Sterile Clinical Frame) */}
      <div className={`media-placeholder-box ${product.placeholderTheme}`}>
        <div className="placeholder-icon-symbol">
          <CategoryIcon size={42} strokeWidth={1.5} />
        </div>

        {/* Media Badge */}
        <div className="placeholder-badge">
          <ShieldCheck size={12} />
          <span>{product.mediaBadge}</span>
        </div>

        {/* Rx Badge */}
        {product.prescriptionRequired && (
          <div className="rx-badge">Uso Profesional</div>
        )}
      </div>

      {/* Product Content Body */}
      <div className="product-card-body">
        <div className="product-meta-row">
          <span className="product-category-tag">{product.category}</span>
          <span className="product-tag-chip">{product.tag}</span>
        </div>

        <h3 className="product-title" id={`product-title-${product.id}`}>
          {product.name}
        </h3>

        {/* Rating Stars */}
        <div className="product-rating">
          <div style={{ display: 'flex', gap: '2px' }}>
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                size={13}
                className={i < Math.floor(product.rating) ? 'star-filled' : ''}
                style={{ color: i < Math.floor(product.rating) ? '#f59e0b' : '#cbd5e1' }}
              />
            ))}
          </div>
          <span style={{ fontWeight: '700', color: 'var(--navy-900)' }}>{product.rating}</span>
          <span>({product.reviewsCount})</span>
        </div>

        <p className="product-description-preview">{product.description}</p>

        {/* Pricing Block */}
        <div className="product-card-pricing-row">
          <div className="price-primary-row">
            <span className="current-price">${product.price.toFixed(2)}</span>
            {product.originalPrice && (
              <span className="original-price">${product.originalPrice.toFixed(2)}</span>
            )}
          </div>
          <span className="tax-breakdown-label">IVA incluido</span>
        </div>

        {/* Action Buttons Row */}
        <div className="product-card-footer">
          <button
            className="btn-quickview"
            onClick={() => onQuickView(product)}
            title="Ver Especificaciones"
            aria-label={`Ver especificaciones de ${product.name}`}
          >
            <Eye size={17} />
          </button>

          <button
            className="btn-add-cart"
            onClick={() => onAddToCart(product)}
            disabled={!isAvailable}
            aria-label={`Agregar ${product.name} al carro`}
            title={isAvailable ? 'Agregar al carro' : 'Sin stock disponible en bodega'}
          >
            <ShoppingBag size={15} />
            <span>{isAvailable ? 'Agregar' : 'Agotado'}</span>
          </button>
        </div>
      </div>
    </article>
  )
}
