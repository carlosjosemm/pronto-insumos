import React from 'react'
import { Activity, Search, ShoppingBag, MapPin } from 'lucide-react'

export interface NavbarProps {
  search: string
  setSearch: (value: string) => void
  cartCount: number
  onOpenCart: () => void
}

export default function Navbar({ search, setSearch, cartCount, onOpenCart }: NavbarProps) {
  return (
    <header className="navbar glass-header">
      <div className="nav-container">
        {/* Brand Identity */}
        <a href="#" className="brand-logo">
          <div className="brand-icon-wrapper">
            <Activity size={24} />
          </div>
          <div>
            PRONTO <span className="brand-badge">ODONTOLOGÍA</span>
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
          />
        </div>

        {/* Action Controls */}
        <div className="nav-actions">
          <div className="trust-badge-item desktop-only-trust" style={{ fontSize: '0.8rem' }}>
            <MapPin size={18} style={{ color: 'var(--emerald)' }} />
            <span>Melipilla & RM</span>
          </div>

          <button
            className="cart-trigger-btn"
            onClick={onOpenCart}
            aria-label="Abrir Carro de Compras"
          >
            <ShoppingBag size={18} />
            <span className="cart-btn-label">Carro</span>
            {cartCount > 0 && <span className="cart-count-badge">{cartCount}</span>}
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
        />
      </div>
    </header>
  )
}
