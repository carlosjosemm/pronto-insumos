import React, { useState } from 'react'
import { CartItem, PromoCode } from '../types'
import { X, ShoppingBag, Plus, Minus, Trash2, Tag, Lock, ArrowRight } from 'lucide-react'
import { validatePromo } from '../services/api'

const FREE_SHIPPING_THRESHOLD = 150.00

export interface CartProps {
  isOpen: boolean
  onClose: () => void
  items: CartItem[]
  onUpdateQuantity: (productId: string, quantity: number) => void
  onRemoveItem: (productId: string) => void
  onCheckout: () => void
  appliedPromo: PromoCode | null
  onApplyPromo: (promo: PromoCode) => void
}

export default function Cart({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  appliedPromo,
  onApplyPromo
}: CartProps) {
  const [promoInput, setPromoInput] = useState<string>('')
  const [promoError, setPromoError] = useState<string>('')

  if (!isOpen) return null

  const subtotal = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
  const discountAmount = appliedPromo ? (subtotal * appliedPromo.discountPercent) / 100 : 0
  const tax = (subtotal - discountAmount) * 0.19 // 19% IVA Chile
  const total = Math.max(0, subtotal - discountAmount + tax)

  const progressPercent = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100)
  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal)

  const handleApplyPromoCode = async () => {
    if (!promoInput.trim()) return
    setPromoError('')
    const res = await validatePromo(promoInput)
    if (res.success && res.promo) {
      onApplyPromo(res.promo)
      setPromoInput('')
    } else if (res.error) {
      setPromoError(res.error)
    }
  }

  return (
    <>
      <div className="cart-drawer-overlay" onClick={onClose}></div>
      <div className="cart-drawer">
        {/* Header */}
        <div className="cart-drawer-header">
          <div className="cart-drawer-title">
            <ShoppingBag size={20} style={{ color: 'var(--emerald-dark)' }} />
            <span>Carro Odontológico ({items.reduce((acc, i) => acc + i.quantity, 0)})</span>
          </div>
          <button className="modal-close-btn" style={{ position: 'static' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Free Shipping Progress Tracker */}
        <div className="free-shipping-bar">
          <div className="free-shipping-text">
            <span>
              {remainingForFreeShipping > 0
                ? `Agrega $${remainingForFreeShipping.toFixed(2)} más para Despacho GRATIS Melipilla & RM`
                : '🎉 ¡Desbloqueaste Despacho GRATIS a tu Clínica!'}
            </span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>

        {/* Scrollable Items List */}
        <div className="cart-items-scroll">
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--slate-500)' }}>
              <ShoppingBag size={48} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
              <p style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '0.25rem' }}>Tu carro está vacío</p>
              <p style={{ fontSize: '0.85rem' }}>Explora el catálogo odontológico para agregar insumos.</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.product.id} className="cart-item-row">
                <div
                  className={`cart-item-thumb ${item.product.placeholderTheme}`}
                  style={{ backgroundSize: 'cover' }}
                >
                  <ShoppingBag size={20} />
                </div>

                <div className="cart-item-info">
                  <div className="cart-item-title">{item.product.name}</div>
                  <div className="cart-item-price">${(item.product.price * item.quantity).toFixed(2)}</div>
                </div>

                {/* Quantity Controls */}
                <div className="quantity-controls">
                  <button
                    className="qty-btn"
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                  >
                    <Minus size={12} />
                  </button>
                  <span className="qty-val">{item.quantity}</span>
                  <button
                    className="qty-btn"
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {/* Delete Button */}
                <button
                  onClick={() => onRemoveItem(item.product.id)}
                  style={{ color: 'var(--slate-400)', padding: '0.35rem', transition: 'var(--transition)' }}
                  title="Eliminar producto"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Cart Drawer Footer */}
        {items.length > 0 && (
          <div className="cart-drawer-footer">
            {/* Promo Code Entry */}
            <div className="promo-code-input-row">
              <input
                type="text"
                placeholder="Código Convenio (ej: DENT20)"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
              />
              <button className="btn-apply-promo" onClick={handleApplyPromoCode}>
                Aplicar
              </button>
            </div>

            {promoError && (
              <div style={{ color: '#e11d48', fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: '600' }}>
                {promoError}
              </div>
            )}

            {appliedPromo && (
              <div style={{
                background: '#ecfdf5',
                color: '#047857',
                padding: '0.4rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Tag size={14} />
                  <span>{appliedPromo.label} ({appliedPromo.code})</span>
                </div>
                <span>-${discountAmount.toFixed(2)}</span>
              </div>
            )}

            {/* Calculations Breakdown */}
            <div className="cart-summary-line">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>

            {appliedPromo && (
              <div className="cart-summary-line" style={{ color: '#047857', fontWeight: '600' }}>
                <span>Descuento ({appliedPromo.discountPercent}%)</span>
                <span>-${discountAmount.toFixed(2)}</span>
              </div>
            )}

            <div className="cart-summary-line">
              <span>IVA Estimado (19%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>

            <div className="cart-summary-total">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>

            <button className="btn-checkout" onClick={onCheckout}>
              <Lock size={18} />
              <span>Proceder al Pago</span>
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
