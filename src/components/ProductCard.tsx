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

  return (
    <div className="product-card">
      {/* Media Placeholder Box */}
      <div className={`media-placeholder-box ${product.placeholderTheme}`}>
        <div className="placeholder-icon-symbol">
          <CategoryIcon size={44} strokeWidth={1.5} />
        </div>
        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'rgba(255,255,255,0.9)', textAlign: 'center', padding: '0 0.5rem' }}>
          {product.name}
        </div>

        {/* Media Badge */}
        <div className="placeholder-badge">
          <ShieldCheck size={12} />
          <span>{product.mediaBadge}</span>
        </div>

        {/* Rx Badge */}
        {product.prescriptionRequired && (
          <div className="rx-badge">Receta Médica</div>
        )}
      </div>

      {/* Product Content Body */}
      <div className="product-card-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="product-category-tag">{product.category}</span>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '0.15rem 0.45rem',
              borderRadius: '4px',
              background: 'var(--slate-100)',
              color: 'var(--slate-700)'
            }}
          >
            {product.tag}
          </span>
        </div>

        <h3 className="product-title">{product.name}</h3>

        {/* Rating Stars */}
        <div className="product-rating">
          <div style={{ display: 'flex', gap: '2px' }}>
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                size={14}
                className={i < Math.floor(product.rating) ? 'star-filled' : ''}
                style={{ color: i < Math.floor(product.rating) ? '#f59e0b' : '#cbd5e1' }}
              />
            ))}
          </div>
          <span style={{ fontWeight: '700', color: 'var(--slate-800)' }}>{product.rating}</span>
          <span>({product.reviewsCount})</span>
        </div>

        <p className="product-description-preview">{product.description}</p>

        {/* Footer & Actions */}
        <div className="product-card-footer">
          <div className="product-price-block">
            <span className="current-price">${product.price.toFixed(2)}</span>
            {product.originalPrice && (
              <span className="original-price">${product.originalPrice.toFixed(2)}</span>
            )}
          </div>

          <div className="card-actions-group">
            <button
              className="btn-quickview"
              onClick={() => onQuickView(product)}
              title="Ver Especificaciones"
            >
              <Eye size={18} />
            </button>

            <button
              className="btn-add-cart"
              onClick={() => onAddToCart(product)}
            >
              <ShoppingBag size={15} />
              <span>Agregar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
