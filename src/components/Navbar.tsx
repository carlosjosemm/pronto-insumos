import React from 'react'
import { Activity, Search, ShoppingBag, MapPin, FileCheck, Phone, Truck } from 'lucide-react'

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
              <MapPin size={13} style={{ color: '#38bdf8' }} />
              <span>Despacho prioritario en Melipilla y rutas RM | Retiro en Av. Ortúzar</span>
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
                  <Truck size={13} style={{ color: '#38bdf8' }} />
                  <span>Seguimiento de Pedido</span>
                </button>
                <span className="top-utility-divider">|</span>
              </>
            )}
            <span className="top-utility-link">
              <FileCheck size={13} style={{ color: '#34d399' }} />
              <span>Factura Electrónica Inmediata (19% IVA)</span>
            </span>
            <span className="top-utility-divider">|</span>
            <a href="https://wa.me/56912345678" className="top-utility-link" target="_blank" rel="noopener noreferrer">
              <Phone size={13} style={{ color: '#38bdf8' }} />
              <span>Mesa Clínica: +56 9 1234 5678</span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <header className="navbar">
        <div className="nav-container">
          {/* Brand Identity */}
          <a href="#" className="brand-logo">
            <div className="brand-icon-wrapper">
              <Activity size={22} />
            </div>
            <div className="brand-text-group">
              <div className="brand-name">PRONTO</div>
              <div className="brand-badge">ODONTOLOGÍA</div>
            </div>
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
              <MapPin size={16} style={{ color: 'var(--brand-blue)' }} />
              <span>Melipilla & RM</span>
            </div>

            <button className="cart-trigger-btn" onClick={onOpenCart} aria-label="Abrir Carro de Compras">
              <ShoppingBag size={18} />
              <span className="cart-btn-label">Carro</span>
              {cartCount > 0 && (
                <span className={`cart-count-badge ${isPulsing ? 'cart-count-badge--pulse' : ''}`}>{cartCount}</span>
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
      </header>
    </>
  )
}
