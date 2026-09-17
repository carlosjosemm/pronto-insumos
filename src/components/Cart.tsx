import React, { useState, useEffect } from 'react'
import { CartItem, PromoCode } from '../types'
import { X, ShoppingBag, Plus, Minus, Trash2, Tag, Lock, ArrowRight, ShieldCheck, Activity, Heart, Home, ShieldAlert, LucideIcon } from 'lucide-react'
import { validatePromo } from '../services/api'
import { formatCLP, calculateIVA } from '../utils/currency'

const ICON_BY_CATEGORY: Record<string, LucideIcon> = {
  Diagnostics: Activity,
  Instruments: Home,
  Materials: Heart,
  Sterilization: ShieldAlert
}

const FREE_SHIPPING_THRESHOLD = 150000

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

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const subtotal = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
  const discountAmount = appliedPromo ? Math.round((subtotal * appliedPromo.discountPercent) / 100) : 0
  const taxable = subtotal - discountAmount
  const tax = calculateIVA(taxable) // 19% IVA Chile
  const total = Math.max(0, taxable + tax)

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
      <aside className="cart-drawer" aria-label="Carro de compras">
        {/* Header */}
        <div className="cart-drawer-header">
          <div className="cart-drawer-title">
            <ShoppingBag size={20} style={{ color: 'var(--teal-600)' }} />
            <span>Carro Odontológico ({items.reduce((acc, i) => acc + i.quantity, 0)})</span>
          </div>
          <button className="modal-close-btn" style={{ position: 'static' }} onClick={onClose} aria-label="Cerrar carro">
            <X size={18} />
          </button>
        </div>

        {/* Free Shipping Progress Tracker */}
        <div className="free-shipping-bar">
          <div className="free-shipping-text">
            <span>
              {remainingForFreeShipping > 0
                ? `Agrega ${formatCLP(remainingForFreeShipping)} más para Despacho GRATIS Melipilla & RM`
                : '✓ Despacho prioritario sin costo a tu Clínica'}
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
            <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--text-muted)' }}>
              <ShoppingBag size={44} style={{ margin: '0 auto 1rem', opacity: 0.35, color: 'var(--navy-900)' }} />
              <p style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--navy-900)', marginBottom: '0.35rem' }}>
                Tu carro está vacío
              </p>
              <p style={{ fontSize: '0.85rem' }}>
                Explora el catálogo de insumos odontológicos para equipar tu consulta.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const ItemCategoryIcon = ICON_BY_CATEGORY[item.product.category] || ShoppingBag

              return (
                <div key={item.product.id} className="cart-item-row">
                  <div className="cart-item-thumb">
                    <ItemCategoryIcon size={20} style={{ color: 'var(--teal-600)' }} />
                  </div>

                  <div className="cart-item-info">
                    <div className="cart-item-title">{item.product.name}</div>
                    <div className="cart-item-price">{formatCLP(item.product.price * item.quantity)}</div>
                  </div>

                {/* Quantity Controls */}
                <div className="quantity-controls">
                  <button
                    className="qty-btn"
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                    aria-label={`Reducir cantidad de ${item.product.name}`}
                  >
                    <Minus size={12} />
                  </button>
                  <span className="qty-val">{item.quantity}</span>
                  <button
                    className="qty-btn"
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                    disabled={item.quantity >= (item.product.stockCount || 99)}
                    aria-label={`Aumentar cantidad de ${item.product.name}`}
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {/* Delete Button */}
                <button
                  onClick={() => onRemoveItem(item.product.id)}
                  style={{ color: 'var(--text-muted)', padding: '0.4rem', borderRadius: 'var(--radius-xs)' }}
                  title="Eliminar producto"
                  aria-label={`Eliminar ${item.product.name} del carro`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          }))}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleApplyPromoCode()
                  }
                }}
                aria-label="Código de convenio o cupón de descuento"
              />
              <button className="btn-apply-promo" onClick={handleApplyPromoCode}>
                Aplicar
              </button>
            </div>

            {promoError && (
              <div style={{ color: '#dc2626', fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: '600' }}>
                {promoError}
              </div>
            )}

            {appliedPromo && (
              <div style={{
                background: 'var(--teal-50)',
                color: 'var(--teal-700)',
                border: '1px solid var(--teal-100)',
                padding: '0.45rem 0.75rem',
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
                <span>{formatCLP(-discountAmount)}</span>
              </div>
            )}

            {/* Calculations Breakdown */}
            <div className="cart-summary-line">
              <span>Subtotal</span>
              <span>{formatCLP(subtotal)}</span>
            </div>

            {appliedPromo && (
              <div className="cart-summary-line" style={{ color: 'var(--teal-700)', fontWeight: '600' }}>
                <span>Descuento ({appliedPromo.discountPercent}%)</span>
                <span>{formatCLP(-discountAmount)}</span>
              </div>
            )}

            <div className="cart-summary-line">
              <span>IVA (19%) Estimado</span>
              <span>{formatCLP(tax)}</span>
            </div>

            <div className="cart-summary-total">
              <span>Total Facturado</span>
              <span>{formatCLP(total)}</span>
            </div>

            <button className="btn-checkout" onClick={onCheckout}>
              <Lock size={17} />
              <span>Proceder al Pago</span>
              <ArrowRight size={17} />
            </button>

            <div className="cart-checkout-trust">
              <ShieldCheck size={13} style={{ color: 'var(--teal-600)' }} />
              <span>Transacción Segura · Factura Electrónica B2B</span>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
