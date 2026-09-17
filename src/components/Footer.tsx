import React from 'react'
import { Activity, ShieldCheck, Headphones, RefreshCw, MapPin, Building2, Phone, CreditCard, Truck } from 'lucide-react'

export interface FooterProps {
  onOpenTracking?: () => void
}

export default function Footer({ onOpenTracking }: FooterProps = {}) {
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
              <div style={{ fontWeight: '700', fontSize: '0.925rem', color: '#ffffff' }}>Registro ISP Chile</div>
              <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>Insumos Médicos Certificados</div>
            </div>
          </div>

          <div className="footer-value-prop-card">
            <div className="footer-prop-icon">
              <MapPin size={24} />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.925rem', color: '#ffffff' }}>Bodega Melipilla</div>
              <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>Retiro y Despacho Local Directo</div>
            </div>
          </div>

          <div className="footer-value-prop-card">
            <div className="footer-prop-icon">
              <Truck size={24} />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.925rem', color: '#ffffff' }}>Rutas Semanales RM</div>
              <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>Melipilla, Talagante y Santiago</div>
            </div>
          </div>

          <div className="footer-value-prop-card">
            <div className="footer-prop-icon">
              <RefreshCw size={24} />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.925rem', color: '#ffffff' }}>Garantía SERNAC 6 Meses</div>
              <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>Respaldo Técnico en Instrumental</div>
            </div>
          </div>
        </div>

        {/* Grounded 4-Column B2B Distribution Structure */}
        <div className="footer-grid-4col">
          {/* Column 1: Corporate Identity & Local Presence */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontWeight: '800', fontSize: '1.25rem', color: '#ffffff', marginBottom: '0.75rem' }}>
              <div className="brand-icon-wrapper" style={{ width: '32px', height: '32px' }}>
                <Activity size={20} />
              </div>
              <span>PRONTO ODONTOLOGÍA</span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.825rem', lineHeight: '1.6', marginBottom: '1rem' }}>
              Distribuidor especializado en insumos y equipamiento odontológico para gabinetes, clínicas dentales y laboratorios en Melipilla y la Región Metropolitana.
            </p>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div><strong>RUT Empresa:</strong> 77.892.410-K</div>
              <div><strong>Bodega & Despacho:</strong> Av. Ortúzar 750, Melipilla, Chile</div>
              <div><strong>Distribución local:</strong> Melipilla, Talagante, Peñaflor y RM</div>
              <div><strong>Horario de Atención:</strong> Lunes a Viernes 08:30 – 18:30 hrs</div>
            </div>
          </div>

          {/* Column 2: Regional Logistics & Delivery Routes */}
          <div>
            <h4 className="footer-heading">Logística Regional</h4>
            <ul className="footer-links-list">
              <li>• Despacho Express Clínicas Melipilla</li>
              <li>• Retiro Presencial en Av. Ortúzar</li>
              <li>• Ruta Pomaire, Talagante y Peñaflor</li>
              <li>• Envíos Región Metropolitana (Starken / Chilexpress)</li>
              <li>• Despacho Gratuito sobre $100.000</li>
              {onOpenTracking && (
                <li>
                  <button
                    type="button"
                    onClick={onOpenTracking}
                    style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 0, font: 'inherit', textAlign: 'left', fontWeight: '700' }}
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
              <li>• Factura Electrónica Inmediata (19% IVA)</li>
              <li>• Dispositivos Homologados Registro ISP</li>
              <li>• Fichas de Seguridad de Materiales</li>
              <li>• Convenios Especiales para Clínicas Dentales</li>
              <li>• Términos y Condiciones de Venta B2B</li>
            </ul>
          </div>

          {/* Column 4: Customer Care & Payment Pathways */}
          <div>
            <h4 className="footer-heading">Contacto y Formas de Pago</h4>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: '1.5', marginBottom: '0.85rem' }}>
              Atención directa para presupuestos de insumos y equipamiento clínico.
            </p>
            <div style={{ fontSize: '0.825rem', color: '#cbd5e1', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Phone size={14} style={{ color: 'var(--teal-600)' }} />
                <span>Mesa Clínica: +56 9 1234 5678</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CreditCard size={14} style={{ color: 'var(--teal-600)' }} />
                <span>Webpay Plus, Redcompra y Banco de Chile</span>
              </div>
            </div>
            <a
              href="https://wa.me/56912345678?text=Hola,%20necesito%20asistencia%20t%C3%A9cnica%20de%20insumos"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ padding: '0.55rem 1rem', fontSize: '0.825rem', width: 'fit-content' }}
            >
              <span>Consultar por WhatsApp</span>
            </a>
          </div>
        </div>

        {/* Bottom Legal Disclaimer (Seed button eliminated) */}
        <div className="footer-bottom-bar">
          <span>© {new Date().getFullYear()} PRONTO INSUMOS ODONTOLÓGICOS SPA. Todos los derechos reservados. Melipilla, Chile.</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <span>Depósito Dental Certificado</span>
            <span>Facturación Electrónica SII</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
