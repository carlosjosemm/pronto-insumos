import { useState } from 'react'
import {
  ArrowRight,
  ShieldCheck,
  Truck,
  FileCheck,
  MessageSquare
} from 'lucide-react'

export interface HeroProps {
  onExploreClick: () => void
}

export default function Hero({ onExploreClick }: HeroProps) {
  const [imgError, setImgError] = useState(false)

  return (
    <section className="hero-section" aria-labelledby="hero-main-title">
      <div className="hero-content-grid">
        {/* Left Editorial Block */}
        <div className="hero-text-block">
          <div className="hero-pill-tag">
            <ShieldCheck size={15} />
            <span>Proveedor Especializado para Clínicas Dentales · Melipilla & RM</span>
          </div>

          <h1 className="hero-title" id="hero-main-title">
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
              <MessageSquare size={17} style={{ color: 'var(--brand-blue)' }} />
              <span>Cotización Directa para Clínicas</span>
            </a>
          </div>

          {/* Inline B2B Guarantee & Trust Strip */}
          <div className="hero-trust-strip" aria-label="Garantías Comerciales B2B">
            <div className="hero-trust-badge-row">
              <span className="guarantee-title">Garantías Comerciales B2B</span>
              <span className="guarantee-badge">VALIDEZ SII</span>
            </div>

            <div className="hero-trust-grid">
              <div className="hero-trust-item">
                <FileCheck size={17} className="hero-trust-icon" />
                <div className="hero-trust-text">
                  <strong>Factura Electrónica Inmediata (19% IVA)</strong>
                  <span>Emisión formal con RUT de empresa y giro clínico</span>
                </div>
              </div>

              <div className="hero-trust-item">
                <Truck size={17} className="hero-trust-icon" />
                <div className="hero-trust-text">
                  <strong>Despacho Local y Retiro en Av. Ortúzar</strong>
                  <span>Entregas programadas y retiro express en Melipilla</span>
                </div>
              </div>

              <div className="hero-trust-item">
                <ShieldCheck size={17} className="hero-trust-icon" />
                <div className="hero-trust-text">
                  <strong>Insumos Certificados y Homologados</strong>
                  <span>Trazabilidad de lote conforme a normativa sanitaria</span>
                </div>
              </div>

              <div className="hero-trust-item">
                <MessageSquare size={17} className="hero-trust-icon" />
                <div className="hero-trust-text">
                  <strong>Mesa Técnica Directa WhatsApp</strong>
                  <span>Atención prioritaria y soporte ágil para gabinetes</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Lifestyle Photography Panel */}
        <div className="hero-image-panel">
          {!imgError ? (
            <img
              src="/assets/hero-dental-instruments.jpg"
              alt="Instrumental Odontológico Quirúrgico y de Diagnóstico"
              className="hero-lifestyle-img"
              onError={() => setImgError(true)}
              loading="eager"
            />
          ) : (
            <div className="hero-image-fallback">
              <ShieldCheck size={48} />
              <span>Equipamiento e Instrumental Clínico Homologado</span>
            </div>
          )}

          <div className="hero-image-overlay">
            <div className="hero-image-caption-pill">
              <ShieldCheck size={14} />
              <span>Calidad Quirúrgica · Estándar Clínico ISP</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
