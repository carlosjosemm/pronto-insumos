import React, { useState } from 'react'
import { Product } from '../types'
import { X, Star, ShieldCheck, Check, ShoppingBag, Plus, Minus, AlertTriangle } from 'lucide-react'

export interface ProductQuickViewProps {
  product: Product | null
  onClose: () => void
  onAddToCart: (product: Product, quantity?: number) => void
}

export default function ProductQuickView({ product, onClose, onAddToCart }: ProductQuickViewProps) {
  const [quantity, setQuantity] = useState<number>(1)

  if (!product) return null

  const handleAdd = () => {
    onAddToCart(product, quantity)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar ventana">
          <X size={18} />
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', padding: '1.5rem' }}>
          {/* Left Media Preview */}
          <div className={`media-placeholder-box ${product.placeholderTheme}`} style={{ height: '100%', minHeight: '260px', borderRadius: 'var(--radius-md)' }}>
            <div className="placeholder-badge">
              <ShieldCheck size={12} />
              <span>{product.mediaBadge}</span>
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: '800', color: 'white', textAlign: 'center', padding: '1rem' }}>
              {product.name}
            </div>
          </div>

          {/* Right Product Details */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--emerald-dark)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              {product.category}
            </div>

            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', lineHeight: '1.25', marginBottom: '0.5rem' }}>
              {product.name}
            </h2>

            {/* Rating */}
            <div className="product-rating" style={{ marginBottom: '1rem' }}>
              <Star size={16} className="star-filled" />
              <span style={{ fontWeight: '700', color: 'var(--slate-900)' }}>{product.rating}</span>
              <span>({product.reviewsCount} reseñas odontológicas)</span>
            </div>

            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--slate-900)' }}>
                ${product.price.toFixed(2)}
              </span>
              {product.originalPrice && (
                <span style={{ fontSize: '1rem', color: 'var(--slate-400)', textDecoration: 'line-through' }}>
                  ${product.originalPrice.toFixed(2)}
                </span>
              )}
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--slate-600)', marginBottom: '1rem', lineHeight: '1.5' }}>
              {product.description}
            </p>

            {/* Technical Specs List */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--slate-700)', marginBottom: '0.5rem' }}>
                Especificaciones Técnicas:
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {product.specs.map((spec, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', color: 'var(--slate-700)' }}>
                    <Check size={14} style={{ color: 'var(--emerald)', flexShrink: 0 }} />
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
                padding: '0.6rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1.25rem'
              }}>
                <AlertTriangle size={16} />
                <span>Dispositivo odontológico especializado. Verificación según normativa ISP.</span>
              </div>
            )}

            {/* Quantity Selector & Add Button */}
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="quantity-controls">
                <button className="qty-btn" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                  <Minus size={14} />
                </button>
                <span className="qty-val">{quantity}</span>
                <button className="qty-btn" onClick={() => setQuantity(quantity + 1)}>
                  <Plus size={14} />
                </button>
              </div>

              <button className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleAdd}>
                <ShoppingBag size={18} />
                <span>Agregar ${ (product.price * quantity).toFixed(2) }</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
