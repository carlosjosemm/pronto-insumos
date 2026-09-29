import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useScrollLock } from '../hooks/useScrollLock'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { BANK_DETAILS } from '../config/bankDetails'
import { WHATSAPP_DISPLAY, whatsappLink } from '../config/contact'
import { FREE_SHIPPING_THRESHOLD, MIN_ORDER_OUTSIDE_MELIPILLA } from '../config/delivery'
import { formatCLP } from '../utils/currency'

export type LegalSection = 'terminos' | 'garantia' | 'privacidad' | 'identificacion'

export interface LegalModalProps {
  section: LegalSection
  onClose: () => void
}

const SECTION_NAV: Array<{ key: LegalSection; label: string }> = [
  { key: 'terminos', label: 'Términos de Venta' },
  { key: 'garantia', label: 'Garantía Legal (SERNAC)' },
  { key: 'privacidad', label: 'Privacidad (Ley 19.628)' },
  { key: 'identificacion', label: 'Identificación Legal' }
]

const boxStyle: React.CSSProperties = {
  background: 'var(--surface-muted)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: '0.85rem 1rem',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
  marginBottom: '0.9rem'
}

const boxTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  color: 'var(--ink-800)',
  marginBottom: '0.35rem',
  fontSize: '0.8rem'
}

const paragraphStyle: React.CSSProperties = {
  fontSize: '0.825rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.55,
  marginBottom: '0.9rem'
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '1rem',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  padding: '0.3rem 0'
}

export default function LegalModal({ section, onClose }: LegalModalProps) {
  const [active, setActive] = useState<LegalSection>(section)

  useScrollLock(true)
  const dialogRef = useFocusTrap<HTMLDivElement>(true)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      <div
        className="modal-card"
        style={{
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.75rem'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar ventana">
          <X size={18} />
        </button>

        <h2
          id="legal-modal-title"
          style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--ink-800)', marginBottom: '0.35rem' }}
        >
          Información Legal
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          PRONTO Insumos Odontológicos · Depósito Dental en Melipilla, Chile
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.1rem' }}>
          {SECTION_NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={active === item.key}
              onClick={() => setActive(item.key)}
              style={{
                fontSize: '0.775rem',
                fontWeight: 600,
                padding: '0.4rem 0.7rem',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
                border: `1px solid ${active === item.key ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                background: active === item.key ? 'var(--accent-soft)' : 'var(--surface-muted)',
                color: active === item.key ? 'var(--ink-800)' : 'var(--text-secondary)'
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', paddingRight: '0.25rem' }}>
          {active === 'terminos' && (
            <section aria-label="Términos y Condiciones de Venta">
              <h3 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--ink-800)', marginBottom: '0.6rem' }}>
                Términos y Condiciones de Venta
              </h3>
              <p style={paragraphStyle}>
                Estas condiciones regulan la venta de insumos y equipamiento odontológico realizada por PRONTO INSUMOS
                ODONTOLÓGICOS SPA a clínicas dentales, odontólogos y laboratorios en Chile. Los pedidos confirmados en
                esta tienda se rigen por ellas.
              </p>
              <div style={boxStyle}>
                <div style={boxTitleStyle}>Precios y documentos tributarios</div>
                <div>• Todos los precios están expresados en pesos chilenos (CLP) e incluyen IVA (19%).</div>
                <div>
                  • Cada venta emite <strong>Boleta Electrónica</strong> ante el SII. Las clínicas que requieren Factura
                  Electrónica pueden solicitarla por WhatsApp (cotización B2B).
                </div>
              </div>
              <div style={boxStyle}>
                <div style={boxTitleStyle}>Medios de pago</div>
                <div>
                  • <strong>Mercado Pago Chile</strong> (Webpay Plus, Redcompra y tarjetas) o{' '}
                  <strong>Transferencia Bancaria</strong> directa a nuestra cuenta de Banco de Chile, cuyos datos se
                  muestran en el paso de pago del checkout.
                </div>
              </div>
              <div style={boxStyle}>
                <div style={boxTitleStyle}>Despacho</div>
                <div>
                  • <strong>Melipilla:</strong> despacho el mismo día para pedidos confirmados antes de las 16:00.
                </div>
                <div>
                  • <strong>San Antonio:</strong> ruta programada, con compra mínima de{' '}
                  {formatCLP(MIN_ORDER_OUTSIDE_MELIPILLA)} por pedido.
                </div>
                <div>
                  • Despacho gratuito en ambas zonas por compras sobre {formatCLP(FREE_SHIPPING_THRESHOLD)}. No
                  ofrecemos retiro en tienda.
                </div>
              </div>
            </section>
          )}

          {active === 'garantia' && (
            <section aria-label="Garantía Legal de 6 Meses (SERNAC)">
              <h3 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--ink-800)', marginBottom: '0.6rem' }}>
                Garantía Legal de 6 Meses (SERNAC)
              </h3>
              <p style={paragraphStyle}>
                En conformidad con la <strong>Ley N° 19.496</strong> sobre Protección de los Derechos de los
                Consumidores y el Código Civil, todos nuestros productos cuentan con garantía legal de 6 meses contada
                desde la recepción del pedido, por faltas de calidad o cantidad.
              </p>
              <div style={boxStyle}>
                <div style={boxTitleStyle}>Alcance según el tipo de producto</div>
                <div>
                  • <strong>Equipos e instrumentos técnicos</strong> (turbinas, fotocuradores, localizadores de ápice,
                  motores de implante): garantía de funcionamiento conforme a las especificaciones del fabricante; el
                  plazo legal de 6 meses opera como mínimo.
                </div>
                <div>
                  • <strong>Consumables de higiene sellados</strong> (desechables, agujas, anestésicos, materiales de
                  impresión): por normativa sanitaria y de bioseguridad no se aceptan devoluciones una vez abierto el
                  sello original, salvo defecto de fábrica.
                </div>
              </div>
              <div style={boxStyle}>
                <div style={boxTitleStyle}>Cómo hacer efectiva la garantía</div>
                <div>
                  • Escríbenos por WhatsApp dentro del plazo, indicando tu número de pedido (PRONTO-XXXXXXXX) y
                  adjuntando tu boleta electrónica.
                </div>
                <div>• El producto se evalúa técnicamente en nuestra bodega de Melipilla.</div>
                <div>
                  • Acreditado el defecto, a elección del consumidor procede la reposición del producto, su reparación o
                  la devolución del dinero, según la ley.
                </div>
              </div>
              <a
                href={whatsappLink(
                  'Hola PRONTO Insumos, necesito hacer efectiva la garantía legal de un producto adquirido.'
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ justifyContent: 'center', textDecoration: 'none', display: 'flex' }}
              >
                Solicitar Garantía por WhatsApp
              </a>
              <p style={{ ...paragraphStyle, marginTop: '0.9rem', marginBottom: 0 }}>
                El ejercicio de esta garantía no afecta los derechos del consumidor ante el SERNAC ni las acciones
                legales que correspondan.
              </p>
            </section>
          )}

          {active === 'privacidad' && (
            <section aria-label="Privacidad y Protección de Datos Personales">
              <h3 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--ink-800)', marginBottom: '0.6rem' }}>
                Privacidad y Protección de Datos Personales
              </h3>
              <p style={paragraphStyle}>
                Tratamos los datos personales en conformidad con la <strong>Ley N° 19.628</strong> sobre Protección de
                la Vida Privada.
              </p>
              <div style={boxStyle}>
                <div style={boxTitleStyle}>Datos que recopilamos y finalidad</div>
                <div>
                  • Nombre, RUT, correo electrónico, teléfono y dirección de despacho o facturación, con la finalidad
                  exclusiva de procesar pedidos, emitir los documentos tributarios correspondientes y coordinar la
                  entrega.
                </div>
                <div>
                  • Para productos regulados por el ISP registramos el N° SIS del profesional tratante, conforme al
                  Código Sanitario.
                </div>
              </div>
              <div style={boxStyle}>
                <div style={boxTitleStyle}>Pago y terceros</div>
                <div>
                  • Nunca almacenamos datos de tarjetas: el cobro se procesa íntegramente en Mercado Pago (cumplimiento
                  PCI-DSS).
                </div>
                <div>
                  • No compartimos datos con terceros, salvo los proveedores estrictamente necesarios para procesar el
                  pago o el despacho, ni los usamos para fines publicitarios sin tu consentimiento.
                </div>
              </div>
              <div style={boxStyle}>
                <div style={boxTitleStyle}>Tus derechos</div>
                <div>
                  • Puedes solicitar en cualquier momento el acceso, la actualización, la rectificación o la eliminación
                  de tus datos a través de nuestros canales de contacto.
                </div>
              </div>
            </section>
          )}

          {active === 'identificacion' && (
            <section aria-label="Identificación Legal de la Empresa">
              <h3 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--ink-800)', marginBottom: '0.6rem' }}>
                Identificación Legal de la Empresa
              </h3>
              <div style={{ ...boxStyle, display: 'flex', flexDirection: 'column' }}>
                <div style={rowStyle}>
                  <span style={{ color: 'var(--text-muted)' }}>Razón Social:</span>
                  <span style={{ fontWeight: 700, color: 'var(--ink-800)', textAlign: 'right' }}>
                    {BANK_DETAILS.companyName}
                  </span>
                </div>
                <div style={rowStyle}>
                  <span style={{ color: 'var(--text-muted)' }}>RUT:</span>
                  <span style={{ fontWeight: 700, color: 'var(--ink-800)', fontFamily: 'monospace' }}>
                    {BANK_DETAILS.rut}
                  </span>
                </div>
                <div style={rowStyle}>
                  <span style={{ color: 'var(--text-muted)' }}>Bodega y despacho:</span>
                  <span style={{ fontWeight: 600, color: 'var(--ink-800)', textAlign: 'right' }}>
                    Av. Ortúzar 750, Melipilla, Chile
                  </span>
                </div>
                <div style={rowStyle}>
                  <span style={{ color: 'var(--text-muted)' }}>Atención comercial:</span>
                  <span style={{ fontWeight: 600, color: 'var(--ink-800)' }}>WhatsApp {WHATSAPP_DISPLAY}</span>
                </div>
                <div style={rowStyle}>
                  <span style={{ color: 'var(--text-muted)' }}>Contabilidad y pagos:</span>
                  <span style={{ fontWeight: 600, color: 'var(--ink-800)' }}>{BANK_DETAILS.email}</span>
                </div>
                <div style={rowStyle}>
                  <span style={{ color: 'var(--text-muted)' }}>Documentación:</span>
                  <span style={{ fontWeight: 600, color: 'var(--ink-800)' }}>
                    Boleta Electrónica SII · Registro ISP
                  </span>
                </div>
              </div>
              <p style={{ ...paragraphStyle, marginBottom: 0 }}>
                Horario de atención: lunes a viernes de 08:30 a 18:30 hrs.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
