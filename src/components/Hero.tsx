import { useState } from 'react'
import { ArrowRight, ShieldCheck, Truck, FileCheck, MessageSquare } from 'lucide-react'
import { whatsappLink } from '../config/contact'

export interface HeroProps {
  onExploreClick: () => void
}

export default function Hero({ onExploreClick }: HeroProps) {
  const [imgError, setImgError] = useState(false)

  return (
    <section className="hero-section" aria-labelledby="hero-main-title">
      <div className="hero-inner">
        <div className="hero-content-grid">
          {/* Left Editorial Block */}
          <div className="hero-text-block">
            <div className="hero-pill-tag">
              <ShieldCheck size={15} />
              <span>Depósito Dental · Melipilla</span>
            </div>

            <h1 className="hero-title" id="hero-main-title">
              El depósito dental que despacha{' '}
              <span className="hero-title-accent">
                el mismo día
                <svg
                  className="hero-title-underline"
                  viewBox="0 0 100 8"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M2 6 Q 50 0 100 5" />
                </svg>
              </span>
            </h1>

            <p className="hero-description">
              Turbina, resinas restauradoras, instrumental de diagnóstico y bioseguridad para clínicas y gabinetes.
              Pedidos confirmados antes de las 16:00 salen de nuestra bodega en Melipilla ese mismo día — despacho a
              Melipilla y San Antonio.
            </p>

            <div className="hero-cta-group">
              <button className="btn-primary hero-cta-primary" onClick={onExploreClick}>
                <span>Explorar Catálogo de Insumos</span>
                <ArrowRight size={17} />
              </button>

              <a
                href={whatsappLink('Hola, solicito cotización de insumos para clínica dental')}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary hero-cta-secondary"
              >
                <MessageSquare size={17} />
                <span>Cotización Directa para Clínicas</span>
              </a>
            </div>

            {/* Quiet inline trust row — no pill chrome */}
            <div className="hero-trust-strip" aria-label="Garantías comerciales para clínicas">
              <div className="hero-trust-grid">
                <div className="hero-trust-item">
                  <FileCheck size={17} className="hero-trust-icon" />
                  <div className="hero-trust-text">
                    <strong>Boleta Electrónica · IVA 19%</strong>
                    <span>Emitida automáticamente con cada compra</span>
                  </div>
                </div>

                <div className="hero-trust-item">
                  <Truck size={17} className="hero-trust-icon" />
                  <div className="hero-trust-text">
                    <strong>Despacho el mismo día</strong>
                    <span>Pedidos antes de las 16:00 · Melipilla y San Antonio</span>
                  </div>
                </div>

                <div className="hero-trust-item">
                  <ShieldCheck size={17} className="hero-trust-icon" />
                  <div className="hero-trust-text">
                    <strong>Insumos Certificados ISP</strong>
                    <span>Trazabilidad de lote conforme a normativa sanitaria</span>
                  </div>
                </div>

                <div className="hero-trust-item">
                  <MessageSquare size={17} className="hero-trust-icon" />
                  <div className="hero-trust-text">
                    <strong>Mesa Técnica WhatsApp</strong>
                    <span>Factura para clínicas y cotizaciones directas</span>
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
      </div>
    </section>
  )
}
