import React from 'react'
import { Sparkles, ArrowRight, ShieldCheck, Truck, Clock, MapPin } from 'lucide-react'

export interface HeroProps {
  onExploreClick: () => void
}

export default function Hero({ onExploreClick }: HeroProps) {
  return (
    <section className="hero-section">
      <div className="hero-glow"></div>
      
      <div className="hero-content-grid">
        <div className="hero-text-block">
          <div className="hero-pill-tag">
            <Sparkles size={14} />
            <span>Proveedor de Insumos Odontológicos - Melipilla & RM</span>
          </div>

          <h1 className="hero-title">
            Equipamiento e Insumos <span>Odontológicos de Precisión</span>
          </h1>

          <p className="hero-description">
            Abasteciendo a odontólogos, clínicas dentales, ortodoncistas e implantólogos con tecnología de fotocurado, piezas de mano, instrumental de exploración y esterilización con despacho directo en Melipilla y la Región Metropolitana.
          </p>

          <div className="hero-cta-group">
            <button className="btn-primary" onClick={onExploreClick}>
              <span>Ver Catálogo Dental</span>
              <ArrowRight size={18} />
            </button>
            
            <a href="#catalog-section" className="btn-secondary">
              <span>Especificaciones ISP</span>
            </a>
          </div>

          <div className="hero-trust-badges">
            <div className="trust-badge-item">
              <ShieldCheck size={18} style={{ color: '#34d399' }} />
              <span>Registro ISP Chile</span>
            </div>
            <div className="trust-badge-item">
              <MapPin size={18} style={{ color: '#38bdf8' }} />
              <span>Despacho Directo Melipilla</span>
            </div>
            <div className="trust-badge-item">
              <Truck size={18} style={{ color: '#fbbf24' }} />
              <span>Express 24h RM</span>
            </div>
          </div>
        </div>

        {/* Hero Interactive Card Preview */}
        <div className="hero-card-preview">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} style={{ color: '#34d399' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#e2e8f0' }}>DESPACHO REGION DE MELIPILLA</span>
            </div>
            <span className="brand-badge" style={{ background: '#064e3b', color: '#6ee7b7' }}>ZONA CENTRAL</span>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '1rem', borderRadius: '12px', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Tiempo de Entrega Local</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#34d399' }}>Mismo Día / 24h</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Entrega prioritaria para clínicas dentales en Melipilla y alrededores</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '0.75rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Cumplimiento Stock</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#38bdf8' }}>99.8%</div>
            </div>
            <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '0.75rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Evaluación Odontólogos</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fbbf24' }}>4.9 / 5.0</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
