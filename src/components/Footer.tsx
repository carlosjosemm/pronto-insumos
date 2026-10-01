import React, { useState } from 'react'
import { Activity, ShieldCheck, RefreshCw, MapPin, Building2, Phone, CreditCard, Truck } from 'lucide-react'
import { WHATSAPP_DISPLAY, whatsappLink } from '../config/contact'
import { BANK_DETAILS } from '../config/bankDetails'
import LegalModal, { LegalSection } from './LegalModal'

export interface FooterProps {
  onOpenTracking?: () => void
}

export default function Footer({ onOpenTracking }: FooterProps = {}) {
  const [legalSection, setLegalSection] = useState<LegalSection | null>(null)

  return (
    <footer className="footer-container">
      <div className="footer-inner">
        {/* Value Proposition Banners */}
        <div className="footer-value-props">
          <div className="footer-value-prop-card">
            <div className="footer-prop-icon">
              <ShieldCheck size={24} />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.925rem', color: 'var(--text-inverse)' }}>
                Insumos odontológicos
              </div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-on-dark-muted)' }}>
                Para clínicas, gabinetes y laboratorios
              </div>
            </div>
          </div>

          <div className="footer-value-prop-card">
            <div className="footer-prop-icon">
              <MapPin size={24} />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.925rem', color: 'var(--text-inverse)' }}>
                Bodega Melipilla
              </div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-on-dark-muted)' }}>
                Despacho local directo a clínicas
              </div>
            </div>
          </div>

          <div className="footer-value-prop-card">
            <div className="footer-prop-icon">
              <Truck size={24} />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.925rem', color: 'var(--text-inverse)' }}>
                Despacho San Antonio
              </div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-on-dark-muted)' }}>
                Ruta programada a clínicas de la zona
              </div>
            </div>
          </div>

          <div className="footer-value-prop-card">
            <div className="footer-prop-icon">
              <RefreshCw size={24} />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.925rem', color: 'var(--text-inverse)' }}>
                Garantía SERNAC 6 Meses
              </div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-on-dark-muted)' }}>
                Respaldo Técnico en Instrumental
              </div>
            </div>
          </div>
        </div>

        {/* Grounded 4-Column B2B Distribution Structure */}
        <div className="footer-grid-4col">
          {/* Column 1: Corporate Identity & Local Presence */}
          <div>
            <div className="brand-lockup brand-lockup--inverse" style={{ marginBottom: '0.75rem' }}>
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
            </div>
            <p
              style={{
                color: 'var(--text-on-dark-muted)',
                fontSize: '0.825rem',
                lineHeight: '1.6',
                marginBottom: '1rem'
              }}
            >
              Distribuidor especializado en insumos y equipamiento odontológico para gabinetes, clínicas dentales y
              laboratorios en Melipilla y San Antonio.
            </p>
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-on-dark-body)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem'
              }}
            >
              <div>
                <strong>RUT Empresa:</strong> {BANK_DETAILS.rut}
              </div>
              <div>
                <strong>Bodega & Despacho:</strong> Av. Ortúzar 750, Melipilla, Chile
              </div>
              <div>
                <strong>Distribución local:</strong> Melipilla y San Antonio
              </div>
              <div>
                <strong>Horario de Atención:</strong> Lunes a Viernes 08:30 – 18:30 hrs
              </div>
            </div>
          </div>

          {/* Column 2: Regional Logistics & Delivery Routes */}
          <div>
            <h4 className="footer-heading">Logística Regional</h4>
            <ul className="footer-links-list">
              <li>• Despacho Express Clínicas Melipilla</li>
              <li>• Despacho Programado San Antonio</li>
              <li>• Compra mínima San Antonio: $60.000</li>
              <li>• Despacho sin costo en Melipilla y San Antonio</li>
              {onOpenTracking && (
                <li>
                  <button
                    type="button"
                    onClick={onOpenTracking}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-on-dark)',
                      cursor: 'pointer',
                      padding: 0,
                      font: 'inherit',
                      textAlign: 'left',
                      fontWeight: '700'
                    }}
                  >
                    • Seguimiento de Pedido en Línea
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Column 3: Clinical Compliance & Invoicing */}
          <div>
            <h4 className="footer-heading">Cumplimiento Clínico</h4>
            <ul className="footer-links-list">
              <li>• Boleta electrónica · IVA 19%</li>
              <li>• Factura para Clínicas — Cotización por WhatsApp</li>
              <li>
                •{' '}
                <button type="button" aria-haspopup="dialog" onClick={() => setLegalSection('terminos')}>
                  Términos y Condiciones de Venta B2B
                </button>
              </li>
              <li>
                •{' '}
                <button type="button" aria-haspopup="dialog" onClick={() => setLegalSection('garantia')}>
                  Garantía Legal 6 Meses (SERNAC)
                </button>
              </li>
              <li>
                •{' '}
                <button type="button" aria-haspopup="dialog" onClick={() => setLegalSection('privacidad')}>
                  Privacidad y Protección de Datos (Ley 19.628)
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Customer Care & Payment Pathways */}
          <div>
            <h4 className="footer-heading">Contacto y Formas de Pago</h4>
            <p
              style={{
                color: 'var(--text-on-dark-muted)',
                fontSize: '0.8rem',
                lineHeight: '1.5',
                marginBottom: '0.85rem'
              }}
            >
              Atención directa para presupuestos de insumos y equipamiento clínico.
            </p>
            <div
              style={{
                fontSize: '0.825rem',
                color: 'var(--text-on-dark-body)',
                marginBottom: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Phone size={14} style={{ color: 'var(--accent-on-dark)' }} />
                <span>Mesa Clínica: {WHATSAPP_DISPLAY}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CreditCard size={14} style={{ color: 'var(--accent-on-dark)' }} />
                <span>Webpay Plus, Redcompra y Banco de Chile</span>
              </div>
            </div>
            <a
              href={whatsappLink('Hola, necesito asistencia técnica de insumos')}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ padding: '0.55rem 1rem', fontSize: '0.825rem', width: 'fit-content' }}
            >
              <span>Consultar por WhatsApp</span>
            </a>
          </div>
        </div>

        {/* Visual Trust Badge Certification Bar */}
        <div className="footer-trust-badges" aria-label="Formas de pago, boleta y despacho">
          <div className="footer-trust-badge">
            <ShieldCheck size={18} />
            <span>Pago procesado por Mercado Pago Chile</span>
          </div>
          <div className="footer-trust-badge">
            <Building2 size={18} />
            <span>Boleta electrónica · IVA 19%</span>
          </div>
          <div className="footer-trust-badge">
            <Truck size={18} />
            <span>Despacho Melipilla y San Antonio</span>
          </div>
          <div className="footer-trust-badge">
            <Activity size={18} />
            <span>Insumos para clínicas y laboratorios dentales</span>
          </div>
        </div>

        {/* Bottom Legal Disclaimer (Seed button eliminated) */}
        <div className="footer-bottom-bar">
          <span>
            © {new Date().getFullYear()} PRONTO INSUMOS ODONTOLÓGICOS SPA. Todos los derechos reservados. Melipilla,
            Chile.
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <span>Depósito dental en Melipilla</span>
            <span>Boleta electrónica</span>
          </div>
        </div>
      </div>

      {legalSection && <LegalModal key={legalSection} section={legalSection} onClose={() => setLegalSection(null)} />}
    </footer>
  )
}
