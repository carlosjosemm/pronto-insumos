import React from 'react'
import { Product } from '../types'
import {
  Star,
  ShoppingBag,
  ShieldCheck,
  Activity,
  Heart,
  Home,
  ShieldAlert,
  Scissors,
  Wrench,
  Sparkles,
  Layers,
  LucideIcon
} from 'lucide-react'
import { formatCLP } from '../utils/currency'
import { formatCategoryDisplayName } from '../utils/categoryAlias'

const ICON_BY_CATEGORY: Record<string, LucideIcon> = {
  'INSTRUMENTAL Y ACCESORIOS': Scissors,
  'DESECHABLES, ESTERILIZACION Y DESINFECCION': ShieldCheck,
  'OPERATORIA': Wrench,
  'ENDODONCIA': Activity,
  'HIGIENE BUCAL': Sparkles,
  'IMPRESION': Layers,
  // Legacy & fallback category keys
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
  const isLowStock = isAvailable && product.stockCount !== undefined && product.stockCount <= 5

  // Featured card accent strip
  const isFeatured = product.tag === 'Más Vendido' || product.tag === 'Recomendado' || product.tag === 'Recomendado Melipilla'

  // Discount percentage (show only when >= 5%)
  const discountPercent = (product.originalPrice && product.originalPrice > product.price)
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0
  const showDiscount = discountPercent >= 5

  // Formatted SKU code (e.g. REF: OD-101)
  const skuRef = product.id.toUpperCase().startsWith('OD-')
    ? product.id.toUpperCase()
    : product.id.replace(/^odon-?/i, 'OD-').toUpperCase()

  const [imgError, setImgError] = React.useState<boolean>(false)
  const hasPhoto = Boolean(product.images && product.images.length > 0 && !imgError)

  const handleOpenDetail = () => {
    onQuickView(product)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onQuickView(product)
    }
  }

  return (
    <article
      className={`product-card ${isFeatured ? 'product-card--featured' : ''}`}
      aria-labelledby={`product-title-${product.id}`}
      onClick={handleOpenDetail}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="article"
      title={`Ver detalles de ${product.name}`}
    >
      {/* Technical Header */}
      <div className="product-card-tech-header">
        <span className="product-ref-badge">REF: {skuRef}</span>
        {!isAvailable ? (
          <span className="product-stock-status stock-danger" style={{ color: 'var(--danger)' }}>
            <span className="product-stock-dot" style={{ background: 'var(--danger)' }} />
            <span>Sin Stock</span>
          </span>
        ) : isLowStock ? (
          <span className="product-stock-status stock-warning" style={{ color: 'var(--accent-warm)' }}>
            <span className="product-stock-dot" style={{ background: 'var(--accent-warm)' }} />
            <span>Últimas {product.stockCount} unid.</span>
          </span>
        ) : null}
      </div>

      {/* Media Presentation Box (Sterile Clinical Frame with Textured Dot-Grid) */}
      <div className={`media-placeholder-box ${product.placeholderTheme}`}>
        {hasPhoto ? (
          <img
            src={product.images![0]}
            alt={product.name}
            className="product-card-img"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="media-placeholder-content">
            <div className="placeholder-icon-frame">
              <CategoryIcon size={34} strokeWidth={1.75} />
            </div>
            <span className="placeholder-product-label">{product.name}</span>
          </div>
        )}

        {/* Media Badge (Only render when mediaBadge is provided and non-empty) */}
        {product.mediaBadge && product.mediaBadge.trim() && (
          <div className="placeholder-badge">
            <ShieldCheck size={12} />
            <span>{product.mediaBadge}</span>
          </div>
        )}

        {/* Discount Badge */}
        {showDiscount && (
          <div className="discount-badge">-{discountPercent}%</div>
        )}

        {/* Rx Badge */}
        {product.prescriptionRequired && (
          <div className="rx-badge">Uso Profesional</div>
        )}
      </div>

      {/* Product Content Body */}
      <div className="product-card-body">
        {/* Category, Brand, and Badges Header (Single Combined Line) */}
        <div className="product-meta-row">
          <div className="product-taxonomy-header">
            <span className="product-category-tag">
              {formatCategoryDisplayName(product.category)}
            </span>
            {product.manufacturer && (
              <span className="product-brand-tag">
                · {product.manufacturer}
              </span>
            )}
          </div>

          {/* Badges Group: render authentic marketing tag and regulatory chips */}
          <div className="product-badges-group">
            {product.tag && product.tag.trim() && (
              <span className="product-tag-chip">{product.tag}</span>
            )}
            {product.prescriptionRequired && (
              <span
                className="product-regulated-chip"
                title="Venta regulada por ISP - Requiere N° Registro Superintendencia de Salud"
              >
                ⚕️ Requiere SIS
              </span>
            )}
          </div>
        </div>

        <h3 className="product-title" id={`product-title-${product.id}`}>
          {product.name}
        </h3>

        {/* Rating Stars (Only rendered when verified reviews exist) */}
        {product.reviewsCount !== undefined && product.reviewsCount > 0 ? (
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
        ) : null}

        <p className="product-description-preview">{product.description}</p>

        {/* Pricing Block */}
        <div className="product-card-pricing-row">
          <div className="price-primary-row">
            <span className="current-price">{formatCLP(product.price)}</span>
            {product.originalPrice && (
              <span className="original-price">{formatCLP(product.originalPrice)}</span>
            )}
          </div>
          <span className="tax-breakdown-label">IVA incluido</span>
        </div>

        {/* Action Button Row (Full Width Agregar CTA) */}
        <div className="product-card-footer">
          <button
            className="btn-add-cart"
            onClick={(e) => {
              e.stopPropagation()
              onAddToCart(product)
            }}
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
