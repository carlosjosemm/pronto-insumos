import React from 'react'
import { Activity, ShieldCheck, Headphones, RefreshCw, ArrowRight, MapPin } from 'lucide-react'

export default function Footer() {
  return (
    <footer style={{ background: 'var(--slate-900)', color: 'white', marginTop: '4rem', paddingTop: '4rem', paddingBottom: '2rem' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 1.5rem' }}>
        
        {/* Value Proposition Banners */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '3.5rem', paddingBottom: '3rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--emerald)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>Registro ISP Chile</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--slate-400)' }}>100% Insumos Certificados</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--cyan)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <MapPin size={24} />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>Despacho Melipilla & RM</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--slate-400)' }}>Entrega Directa 24h a Clínicas</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <Headphones size={24} />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>Asesoría Odontológica</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--slate-400)' }}>Soporte Técnico en Equipamiento</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <RefreshCw size={24} />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>Garantía Dental</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--slate-400)' }}>30 Días de Garantía Directa</div>
            </div>
          </div>
        </div>

        {/* Footer Navigation Columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr', gap: '2rem', marginBottom: '3rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontWeight: '800', fontSize: '1.35rem', marginBottom: '1rem' }}>
              <div className="brand-icon-wrapper">
                <Activity size={24} />
              </div>
              <span>PRONTO ODONTOLOGÍA</span>
            </div>
            <p style={{ color: 'var(--slate-400)', fontSize: '0.875rem', lineHeight: '1.6', maxWidth: '320px' }}>
              Distribuidor especialista en insumos y equipamiento odontológico, piezas de mano, materiales de impresión y restauración para clínicas dentales en Melipilla y la Región Metropolitana.
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '1rem', color: '#f8fafc' }}>Categorías Dentales</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem', color: 'var(--slate-400)' }}>
              <li><a href="#catalog-section" style={{ color: 'inherit', textDecoration: 'none' }}>Diagnóstico y Exploración</a></li>
              <li><a href="#catalog-section" style={{ color: 'inherit', textDecoration: 'none' }}>Instrumental y Piezas de Mano</a></li>
              <li><a href="#catalog-section" style={{ color: 'inherit', textDecoration: 'none' }}>Materiales y Restauración</a></li>
              <li><a href="#catalog-section" style={{ color: 'inherit', textDecoration: 'none' }}>Esterilización e Higiene</a></li>
            </ul>
          </div>

          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '1rem', color: '#f8fafc' }}>Atención Clínicas</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem', color: 'var(--slate-400)' }}>
              <li><a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Convenios Clínicos Melipilla</a></li>
              <li><a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Normativa ISP Odontología</a></li>
              <li><a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Rutas de Despacho RM</a></li>
              <li><a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Términos y Privacidad</a></li>
            </ul>
          </div>

          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '1rem', color: '#f8fafc' }}>Boletín Odontológico</h4>
            <p style={{ color: 'var(--slate-400)', fontSize: '0.85rem', marginBottom: '0.85rem' }}>
              Suscríbete para recibir ofertas exclusivas en insumos y convenios para gabinetes en Melipilla.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="email"
                placeholder="Ingresa tu correo..."
                style={{ flex: 1, padding: '0.55rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--slate-700)', background: 'var(--slate-800)', color: 'white' }}
              />
              <button className="btn-primary" style={{ padding: '0 0.85rem' }}>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Legal Disclaimer */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', fontSize: '0.8rem', color: 'var(--slate-500)' }}>
          <span>© {new Date().getFullYear()} PRONTO INSUMOS ODONTOLÓGICOS. Melipilla, Región Metropolitana, Chile.</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span>Proveedor Especializado en Salud Oral</span>
            <button
              onClick={async () => {
                const { seedProductsToFirestore } = await import('../services/firebase')
                const res = await seedProductsToFirestore()
                alert(res.message || res.error)
              }}
              style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--slate-400)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem' }}
            >
              🔥 Sembrar Firebase DB
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
