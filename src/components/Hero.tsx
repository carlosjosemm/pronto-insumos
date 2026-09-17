import { ArrowRight, ShieldCheck, Truck, MapPin, FileText, FileCheck, MessageSquare } from 'lucide-react'

export interface HeroProps {
  onExploreClick: () => void
}

export default function Hero({ onExploreClick }: HeroProps) {
  return (
    <section className="hero-section">
      <div className="hero-content-grid">
        {/* Left Editorial Block */}
        <div className="hero-text-block">
          <div className="hero-pill-tag">
            <ShieldCheck size={15} />
            <span>Proveedor Especializado para Clínicas Dentales · Melipilla & RM</span>
          </div>

          <h1 className="hero-title">
            Abastecimiento Odontológico de Precisión para <span>Clínicas y Profesionales</span>
          </h1>

          <p className="hero-description">
            Piezas de mano, resinas restauradoras, instrumental de diagnóstico y bioseguridad con despacho directo a consultas en Melipilla, Talagante, Peñaflor y la Región Metropolitana.
          </p>

          <div className="hero-cta-group">
            <button className="btn-primary" onClick={onExploreClick}>
              <span>Explorar Catálogo de Insumos</span>
              <ArrowRight size={17} />
            </button>
            
            <a
              href="https://wa.me/56912345678?text=Hola,%20solicito%20cotizaci%C3%B3n%20de%20insumos%20para%20cl%C3%ADnica%20dental"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              <MessageSquare size={17} style={{ color: 'var(--teal-600)' }} />
              <span>Cotización Directa para Clínicas</span>
            </a>
          </div>

          <div className="hero-trust-badges">
            <div className="trust-badge-item">
              <ShieldCheck size={17} style={{ color: 'var(--teal-600)' }} />
              <span>Normativa ISP Homologada</span>
            </div>
            <div className="trust-badge-item">
              <MapPin size={17} style={{ color: 'var(--navy-800)' }} />
              <span>Bodega & Retiro en Melipilla</span>
            </div>
            <div className="trust-badge-item">
              <Truck size={17} style={{ color: '#d97706' }} />
              <span>Rutas Semanales RM</span>
            </div>
          </div>
        </div>

        {/* Right Commercial Guarantee Card (Replacing Fake Telemetry) */}
        <div className="hero-card-preview">
          <div className="guarantee-card-header">
            <div className="guarantee-title-block">
              <FileText size={18} style={{ color: 'var(--teal-600)' }} />
              <span className="guarantee-title">Garantías Comerciales B2B</span>
            </div>
            <span className="guarantee-badge">VALIDEZ SII</span>
          </div>

          <div className="guarantee-item-list">
            <div className="guarantee-item">
              <FileCheck size={18} className="guarantee-icon" />
              <div>
                <div className="guarantee-item-title">Factura Electrónica Inmediata (19% IVA)</div>
                <div className="guarantee-item-desc">
                  Emisión formal con RUT de empresa y giro comercial para deducción de crédito fiscal clínico.
                </div>
              </div>
            </div>

            <div className="guarantee-item">
              <Truck size={18} className="guarantee-icon" />
              <div>
                <div className="guarantee-item-title">Despacho Local y Retiro en Av. Ortúzar</div>
                <div className="guarantee-item-desc">
                  Entregas programadas en consultas de Melipilla o retiro express en punto comercial central.
                </div>
              </div>
            </div>

            <div className="guarantee-item">
              <ShieldCheck size={18} className="guarantee-icon" />
              <div>
                <div className="guarantee-item-title">Insumos Certificados y Homologados</div>
                <div className="guarantee-item-desc">
                  Trazabilidad de lote y fichas técnicas conformes a requerimientos de fiscalización sanitaria.
                </div>
              </div>
            </div>

            <div className="guarantee-item">
              <MessageSquare size={18} className="guarantee-icon" />
              <div>
                <div className="guarantee-item-title">Mesa Técnica Directa WhatsApp</div>
                <div className="guarantee-item-desc">
                  Canal prioritario para requerimientos de urgencia en gabinetes odontológicos y reposiciones.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
