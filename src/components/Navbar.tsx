import React from 'react'
import { Search, ShoppingBag, MapPin, FileCheck, Phone, Truck } from 'lucide-react'
import { WHATSAPP_DISPLAY, whatsappLink } from '../config/contact'

export interface NavbarProps {
  search: string
  setSearch: (value: string) => void
  cartCount: number
  onOpenCart: () => void
  onOpenTracking?: () => void
}

export default function Navbar({ search, setSearch, cartCount, onOpenCart, onOpenTracking }: NavbarProps) {
  const [isPulsing, setIsPulsing] = React.useState(false)
  const prevCount = React.useRef(cartCount)

  React.useEffect(() => {
    if (cartCount > prevCount.current) {
      setIsPulsing(true)
      const timer = setTimeout(() => setIsPulsing(false), 300)
      prevCount.current = cartCount
      return () => clearTimeout(timer)
    }
    prevCount.current = cartCount
  }, [cartCount])
  return (
    <>
      {/* Top Commercial Utility Bar */}
      <div className="top-utility-bar">
        <div className="top-utility-container">
          <div className="top-utility-left">
            <span className="top-utility-link">
              <MapPin size={13} style={{ color: 'var(--accent-on-dark)' }} />
              <span>Despacho a clínicas en Melipilla y San Antonio</span>
            </span>
          </div>
          <div className="top-utility-right">
            {onOpenTracking && (
              <>
                <button
                  type="button"
                  onClick={onOpenTracking}
                  className="top-utility-link"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    font: 'inherit',
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                  aria-label="Abrir Seguimiento de Pedido"
                >
                  <Truck size={13} style={{ color: 'var(--accent-on-dark)' }} />
                  <span>Seguimiento de Pedido</span>
                </button>
                <span className="top-utility-divider">|</span>
              </>
            )}
            <span className="top-utility-link">
              <FileCheck size={13} style={{ color: 'var(--accent-on-dark)' }} />
              <span>Boleta Electrónica · IVA 19%</span>
            </span>
            <span className="top-utility-divider">|</span>
            <a href={whatsappLink()} className="top-utility-link" target="_blank" rel="noopener noreferrer">
              <Phone size={13} style={{ color: 'var(--accent-on-dark)' }} />
              <span>Mesa Clínica: {WHATSAPP_DISPLAY}</span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <header className="navbar">
        <div className="nav-container">
          {/* Brand Identity — code-rendered wordmark lockup (§10.3) */}
          <a href="#" className="brand-logo" aria-label="PRONTO Insumos Odontológicos">
            <span className="brand-lockup">
              <span className="brand-wordmark">
                PRONTO
                <svg
                  className="brand-underline"
                  viewBox="0 0 100 8"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M2 4 Q 25 7 50 4 T 98 4" />
                </svg>
              </span>
              <span className="brand-descriptor">INSUMOS ODONTOLÓGICOS</span>
            </span>
          </a>

          {/* Desktop Search Bar */}
          <div className="nav-search desktop-only-search">
            <Search size={18} className="nav-search-icon" />
            <input
              type="text"
              placeholder="Buscar turbinas, resinas, autoclaves, instrumental..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar en el catálogo"
            />
          </div>

          {/* Action Controls */}
          <div className="nav-actions">
            <div className="trust-badge-item desktop-only-trust">
              <MapPin size={16} style={{ color: 'var(--ink-800)' }} />
              <span>Melipilla · San Antonio</span>
            </div>

            <button className="cart-trigger-btn" onClick={onOpenCart} aria-label="Abrir Carro de Compras">
              <ShoppingBag size={18} />
              <span className="cart-btn-label">Carro</span>
              {cartCount > 0 && (
                <span className={`cart-count-badge ${isPulsing ? 'cart-count-badge--pulse' : ''}`} aria-live="polite">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Dedicated Search Bar */}
        <div className="nav-search-mobile">
          <Search size={16} className="nav-search-icon" />
          <input
            type="text"
            placeholder="Buscar insumos y equipos dentales..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar insumos y equipos dentales"
          />
        </div>

        {/* Mobile utility row — restores the phone + tracking actions the hidden top bar takes away */}
        <div className="nav-mobile-utility">
          <a href={whatsappLink()} className="nav-mobile-utility-link" target="_blank" rel="noopener noreferrer">
            <Phone size={14} />
            <span>Mesa Clínica</span>
          </a>
          {onOpenTracking && (
            <button type="button" onClick={onOpenTracking} className="nav-mobile-utility-link">
              <Truck size={14} />
              <span>Seguimiento</span>
            </button>
          )}
        </div>
      </header>
    </>
  )
}
