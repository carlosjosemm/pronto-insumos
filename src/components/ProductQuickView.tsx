import React, { useState, useEffect } from 'react'
import { Product } from '../types'
import { X, Star, ShieldCheck, Check, ShoppingBag, Plus, Minus, AlertTriangle, FileText } from 'lucide-react'

export interface ProductQuickViewProps {
  product: Product | null
  onClose: () => void
  onAddToCart: (product: Product, quantity?: number) => void
}

export default function ProductQuickView({ product, onClose, onAddToCart }: ProductQuickViewProps) {
  const [quantity, setQuantity] = useState<number>(1)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!product) return null

  const isAvailable = product.inStock && (product.stockCount === undefined || product.stockCount > 0)
  const maxStock = product.stockCount && product.stockCount > 0 ? product.stockCount : 99

  const handleAdd = () => {
    if (!isAvailable) return
    onAddToCart(product, quantity)
    onClose()
  }

  const skuRef = product.id.replace(/^odon-/, 'OD-').toUpperCase()
  const totalPrice = product.price * quantity

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar ventana">
          <X size={18} />
        </button>

        <div className="quickview-grid" style={{ padding: '1.75rem' }}>
          {/* Left Media & Compliance Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              className={`media-placeholder-box ${product.placeholderTheme}`}
              style={{ height: '220px', borderRadius: 'var(--radius-sm)' }}
            >
              <div className="placeholder-badge">
                <ShieldCheck size={12} />
                <span>{product.mediaBadge}</span>
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--navy-900)', textAlign: 'center', padding: '1rem' }}>
                {product.name}
              </div>
            </div>

            {/* Technical Traceability Card */}
            <div style={{
              background: 'var(--surface-muted)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem 1rem',
              fontSize: '0.775rem',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700', color: 'var(--navy-900)', marginBottom: '0.35rem' }}>
                <FileText size={14} style={{ color: 'var(--teal-600)' }} />
                <span>Ficha Técnica & Homologación ISP</span>
              </div>
              <div><strong>Código REF:</strong> {skuRef}</div>
              <div><strong>Disponibilidad:</strong> {isAvailable ? 'Inmediata para despacho y retiro' : 'Sin stock inmediato'}</div>
              <div><strong>Garantía:</strong> 6 meses legal SERNAC para instrumental</div>
            </div>
          </div>

          {/* Right Product Specifications */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--teal-700)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>
              {product.category}
            </div>

            <h2 style={{ fontSize: '1.3rem', fontWeight: '800', lineHeight: '1.25', color: 'var(--navy-900)', marginBottom: '0.5rem' }}>
              {product.name}
            </h2>

            {/* Rating */}
            <div className="product-rating" style={{ marginBottom: '0.75rem' }}>
              <Star size={14} className="star-filled" />
              <span style={{ fontWeight: '700', color: 'var(--navy-900)' }}>{product.rating}</span>
              <span>({product.reviewsCount} reseñas clínicas verificadas)</span>
            </div>

            {/* Pricing */}
            <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--navy-900)' }}>
                  ${product.price.toFixed(2)}
                </span>
                {product.originalPrice && (
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                    ${product.originalPrice.toFixed(2)}
                  </span>
                )}
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>IVA incluido</span>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.5' }}>
              {product.description}
            </p>

            {/* Technical Specs List */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--navy-900)', marginBottom: '0.5rem' }}>
                Especificaciones del Instrumental / Material:
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {product.specs.map((spec, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                    <Check size={14} style={{ color: 'var(--teal-600)', flexShrink: 0 }} />
                    <span>{spec}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Rx Warning Notice */}
            {product.prescriptionRequired && (
              <div style={{
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                color: '#be123c',
                padding: '0.55rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.775rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                marginBottom: '1rem'
              }}>
                <AlertTriangle size={15} flexShrink={0} />
                <span>Dispositivo odontológico especializado de uso profesional clínico.</span>
              </div>
            )}

            {/* Quantity Selector & Add Button */}
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div className="quantity-controls">
                <button
                  className="qty-btn"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                  aria-label="Disminuir cantidad"
                >
                  <Minus size={14} />
                </button>
                <span className="qty-val">{quantity}</span>
                <button
                  className="qty-btn"
                  onClick={() => setQuantity(Math.min(maxStock, quantity + 1))}
                  disabled={quantity >= maxStock || !isAvailable}
                  aria-label="Aumentar cantidad"
                >
                  <Plus size={14} />
                </button>
              </div>

              <button
                className="btn-primary"
                style={{ flex: 1, minWidth: '160px', justifyContent: 'center' }}
                onClick={handleAdd}
                disabled={!isAvailable}
                title={isAvailable ? 'Agregar al carro' : 'Sin stock disponible en bodega'}
              >
                <ShoppingBag size={17} />
                <span>{isAvailable ? `Agregar $${totalPrice.toFixed(2)}` : 'Sin Stock Inmediato'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
