import React from 'react'
import { Building2, MapPin, CreditCard, Shield, Clock } from 'lucide-react'
import { BANK_DETAILS } from '../../config/bankDetails'

export const AdminSettings: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '800px' }}>
      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Información de la Sucursal Melipilla</h2>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={16} style={{ color: 'var(--teal-600)' }} />
            <span><strong>Razón Social:</strong> {BANK_DETAILS.companyName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={16} style={{ color: 'var(--teal-600)' }} />
            <span><strong>RUT Empresa:</strong> {BANK_DETAILS.rut}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={16} style={{ color: 'var(--teal-600)' }} />
            <span><strong>Dirección Bodega:</strong> Av. Ortúzar 750, Melipilla, Región Metropolitana</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CreditCard size={16} style={{ color: 'var(--teal-600)' }} />
            <span><strong>Cuenta de Transferencia:</strong> {BANK_DETAILS.bankName} — {BANK_DETAILS.accountType} N° {BANK_DETAILS.accountNumber}</span>
          </div>
        </div>
      </div>

      <div className="admin-placeholder-card" style={{ padding: '1.5rem', opacity: 0.85 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Clock size={24} style={{ color: 'var(--text-muted)' }} />
          <div>
            <div style={{ fontWeight: '800', fontSize: '0.95rem', color: 'var(--navy-900)' }}>
              Configuración de Tarifas de Envío y Zonas Rurales
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              La administración dinámica de tarifas de courier y comunas periféricas estará disponible en la Fase 5.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
