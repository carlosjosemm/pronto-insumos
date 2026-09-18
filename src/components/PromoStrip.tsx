import { Sparkles, Truck, FileText } from 'lucide-react'

export default function PromoStrip() {
  return (
    <aside className="promo-strip" aria-label="Beneficios y propuesta de valor comercial">
      <div className="promo-strip-content">
        <div className="promo-strip-item">
          <Sparkles size={16} className="promo-strip-icon" />
          <span className="promo-strip-highlight">Insumos a un click de distancia</span>
        </div>
        <span className="promo-strip-divider" aria-hidden="true">•</span>
        <div className="promo-strip-item">
          <Truck size={16} className="promo-strip-icon" />
          <span>Despacho Express Melipilla y RM</span>
        </div>
        <span className="promo-strip-divider" aria-hidden="true">•</span>
        <div className="promo-strip-item">
          <FileText size={16} className="promo-strip-icon" />
          <span>Factura Electrónica SII · 19% IVA</span>
        </div>
      </div>
    </aside>
  )
}
