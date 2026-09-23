import React, { useState, useEffect } from 'react'
import { Product } from '../types'
import { formatCLP } from '../utils/currency'
import { formatCategoryDisplayName } from '../utils/categoryAlias'
import { whatsappLink } from '../config/contact'
import {
  X,
  Star,
  ShieldCheck,
  Check,
  ShoppingBag,
  Plus,
  Minus,
  AlertTriangle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Package,
  MessageCircle,
  Activity,
  Heart,
  Home,
  ShieldAlert,
  LucideIcon
} from 'lucide-react'

const ICON_BY_CATEGORY: Record<string, LucideIcon> = {
  Diagnostics: Activity,
  Instruments: Home,
  Materials: Heart,
  Sterilization: ShieldAlert
}

export interface ProductQuickViewProps {
  product: Product | null
  onClose: () => void
  onAddToCart: (product: Product, quantity?: number) => void
}

export default function ProductQuickView({ product, onClose, onAddToCart }: ProductQuickViewProps) {
  // Quantity, gallery index and failed-image state are scoped to a single
  // product: the caller keys this component by product id, so switching
  // products remounts it and resets everything without a sync effect.
  const [quantity, setQuantity] = useState<number>(1)
  const [activeImgIndex, setActiveImgIndex] = useState<number>(0)
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({})

  const photos = product?.images && product.images.length > 0 ? product.images : []
  const hasMultiplePhotos = photos.length > 1

  // Handle keyboard shortcuts: Escape to close, Left/Right arrows to navigate photos
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (hasMultiplePhotos) {
        if (e.key === 'ArrowLeft') {
          setActiveImgIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1))
        } else if (e.key === 'ArrowRight') {
          setActiveImgIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0))
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, hasMultiplePhotos, photos.length])

  if (!product) return null

  const isAvailable = product.inStock && (product.stockCount === undefined || product.stockCount > 0)
  const maxStock = product.stockCount && product.stockCount > 0 ? product.stockCount : 99

  const handleAdd = () => {
    if (!isAvailable) return
    onAddToCart(product, quantity)
    onClose()
  }

  const skuRef = product.id.toUpperCase().startsWith('OD-')
    ? product.id.toUpperCase()
    : product.id.replace(/^odon-?/i, 'OD-').toUpperCase()

  const totalPrice = product.price * quantity
  const CategoryIcon = ICON_BY_CATEGORY[product.category] || Activity
  const isCurrentImgFailed = failedImages[activeImgIndex]
  const currentPhotoUrl = photos[activeImgIndex]

  const discountPercent =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : 0
  const showDiscount = discountPercent >= 5

  const handlePrevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveImgIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1))
  }

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveImgIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0))
  }

  const handleImageError = (index: number) => {
    setFailedImages((prev) => ({ ...prev, [index]: true }))
  }

  // Generate pre-filled WhatsApp link for inquiries
  const whatsappUrl = whatsappLink(
    `Hola PRONTO Insumos, quisiera consultar sobre el producto: ${product.name} (REF: ${skuRef}).`
  )

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-product-title"
    >
      <div className="modal-card modal-card-vertical" onClick={(e) => e.stopPropagation()}>
        {/* Modal Close Button */}
        <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar ventana">
          <X size={18} />
        </button>

        <div className="product-detail-modal-body">
          {/* ================================================================
              TOP: MULTI-PHOTO GALLERY
              ================================================================ */}
          <div className="product-gallery-section">
            {/* Main Image Viewport */}
            <div className={`gallery-main-view ${product.placeholderTheme}`}>
              {currentPhotoUrl && !isCurrentImgFailed ? (
                <img
                  src={currentPhotoUrl}
                  alt={`${product.name} - Vista ${activeImgIndex + 1}`}
                  className="gallery-main-img"
                  onError={() => handleImageError(activeImgIndex)}
                />
              ) : (
                <div className="gallery-placeholder-fallback">
                  <div className="placeholder-icon-frame">
                    <CategoryIcon size={44} strokeWidth={1.75} />
                  </div>
                  <span className="gallery-placeholder-text">{product.name}</span>
                </div>
              )}

              {/* Badges Overlay */}
              <div className="placeholder-badge">
                <ShieldCheck size={12} />
                <span>{product.mediaBadge}</span>
              </div>

              {showDiscount && <div className="discount-badge">-{discountPercent}%</div>}

              {product.prescriptionRequired && <div className="rx-badge">Uso Profesional</div>}

              {/* Photo Counter Pill */}
              {hasMultiplePhotos && (
                <div className="gallery-counter-pill">
                  {activeImgIndex + 1} / {photos.length}
                </div>
              )}

              {/* Prev / Next Navigation Controls */}
              {hasMultiplePhotos && (
                <>
                  <button
                    className="gallery-nav-btn gallery-nav-prev"
                    onClick={handlePrevPhoto}
                    aria-label="Foto anterior"
                    title="Foto anterior"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    className="gallery-nav-btn gallery-nav-next"
                    onClick={handleNextPhoto}
                    aria-label="Foto siguiente"
                    title="Foto siguiente"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>

            {/* Horizontal Thumbnail Strip */}
            {hasMultiplePhotos && (
              <div className="gallery-thumbs-strip" role="tablist" aria-label="Miniaturas del producto">
                {photos.map((photoUrl, idx) => {
                  const isThumbFailed = failedImages[idx]
                  const isActive = idx === activeImgIndex

                  return (
                    <button
                      key={idx}
                      className={`gallery-thumb-btn ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveImgIndex(idx)}
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`Ver foto ${idx + 1}`}
                      title={`Foto ${idx + 1}`}
                    >
                      {!isThumbFailed ? (
                        <img
                          src={photoUrl}
                          alt=""
                          className="gallery-thumb-img"
                          onError={() => handleImageError(idx)}
                        />
                      ) : (
                        <div className="gallery-thumb-fallback">
                          <CategoryIcon size={16} />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ================================================================
              MIDDLE: CLINICAL DETAILS & SPECIFICATIONS (VERTICAL FLOW)
              ================================================================ */}
          <div className="product-detail-info-section">
            {/* Category Chip & SKU Code */}
            <div className="detail-meta-header">
              <span className="product-category-tag">{formatCategoryDisplayName(product.category)}</span>
              <span className="product-ref-badge">REF: {skuRef}</span>
              {product.tag && product.tag.trim() && <span className="product-tag-chip">{product.tag}</span>}
              {product.prescriptionRequired && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: '800',
                    color: '#b45309',
                    background: '#fef3c7',
                    border: '1px solid #fde68a',
                    borderRadius: 'var(--radius-xs)',
                    padding: '0.15rem 0.5rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  ⚕️ Venta Regulada ISP (Requiere N° SIS)
                </span>
              )}
            </div>

            {/* Brand / Manufacturer Attribution Line */}
            {product.manufacturer && (
              <div className="product-manufacturer-line">
                {formatCategoryDisplayName(product.category)} · {product.manufacturer}
              </div>
            )}

            {/* Product Title */}
            <h2 id="modal-product-title" className="detail-product-title">
              {product.name}
            </h2>

            {/* Clinical Rating (Optional - hidden when zero reviews) */}
            {product.reviewsCount !== undefined && product.reviewsCount > 0 && (
              <div className="product-rating detail-rating-row">
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
                <span style={{ fontWeight: '700', color: 'var(--navy-900)' }}>{product.rating}</span>
                <span>({product.reviewsCount} reseñas clínicas verificadas)</span>
              </div>
            )}

            {/* Pricing Row */}
            <div className="detail-pricing-box">
              <div className="detail-price-main">
                <span className="current-price" style={{ fontSize: '1.6rem' }}>
                  {formatCLP(product.price)}
                </span>
                {product.originalPrice && (
                  <span className="original-price" style={{ fontSize: '1rem' }}>
                    {formatCLP(product.originalPrice)}
                  </span>
                )}
                <span className="tax-breakdown-label" style={{ fontSize: '0.8rem' }}>
                  IVA incluido
                </span>
              </div>

              <div className="detail-stock-indicator">
                <span className="product-stock-dot" style={{ background: isAvailable ? '#059669' : '#dc2626' }} />
                <span style={{ color: isAvailable ? '#059669' : '#dc2626', fontWeight: '600', fontSize: '0.8rem' }}>
                  {isAvailable ? 'Disponible para despacho y retiro en Melipilla' : 'Sin stock inmediato en bodega'}
                </span>
              </div>
            </div>

            {product.prescriptionRequired && (
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fef3c7',
                  borderLeft: '3px solid #f59e0b',
                  borderRadius: 'var(--radius-xs)',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.775rem',
                  color: '#92400e',
                  lineHeight: '1.4'
                }}
              >
                <strong>⚠️ Dispositivo / Fármaco Regulado por ISP Chile:</strong> Para la adquisición y despacho de este
                insumo se solicitará acreditación profesional (N° de Registro SIS - Superintendencia de Salud) durante
                el checkout.
              </div>
            )}

            {/* Product Clinical Description */}
            <p className="detail-description-text">{product.description}</p>

            {/* Technical Specifications */}
            {product.specs && product.specs.length > 0 && (
              <div className="detail-section-block">
                <div className="detail-section-heading">
                  <FileText size={15} style={{ color: 'var(--brand-blue)' }} />
                  <span>Especificaciones Técnicas</span>
                </div>
                <ul className="detail-specs-list">
                  {product.specs.map((spec, idx) => (
                    <li key={idx} className="detail-spec-item">
                      <Check size={14} className="detail-check-icon" />
                      <span>{spec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Package Contents ("Contenido del Empaque") */}
            {product.packageContents && product.packageContents.length > 0 && (
              <div className="detail-section-block">
                <div className="detail-section-heading">
                  <Package size={15} style={{ color: 'var(--brand-blue)' }} />
                  <span>Contenido del Empaque</span>
                </div>
                <div className="package-contents-box">
                  <ul className="package-contents-list">
                    {product.packageContents.map((item, idx) => (
                      <li key={idx} className="package-contents-item">
                        <span className="package-bullet">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Rx Professional Notice */}
            {product.prescriptionRequired && (
              <div className="detail-rx-alert">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>Dispositivo odontológico especializado de uso profesional clínico exclusivo.</span>
              </div>
            )}

            {/* Regulatory & Warranty Note */}
            <div className="detail-guarantee-note">
              <span>Normativa ISP Homologada</span>
              <span className="divider">•</span>
              <span>Garantía Legal SERNAC 6 meses</span>
              <span className="divider">•</span>
              <span>Factura Electrónica Inmediata (19% IVA)</span>
            </div>
          </div>

          {/* ================================================================
              BOTTOM: QUANTITY STEPPER & ACTION BUTTONS
              ================================================================ */}
          <div className="detail-modal-footer">
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
              className="btn-primary detail-add-btn"
              onClick={handleAdd}
              disabled={!isAvailable}
              title={isAvailable ? 'Agregar insumo al carro' : 'Sin stock disponible'}
            >
              <ShoppingBag size={17} />
              <span>{isAvailable ? `Agregar al Carro • ${formatCLP(totalPrice)}` : 'Sin Stock Inmediato'}</span>
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp-inquiry"
              title="Consultar dudas técnicas a mesa clínica"
            >
              <MessageCircle size={16} />
              <span>Consultar</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
