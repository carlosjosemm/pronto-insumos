import React from 'react'
import { LogOut, User, MapPin } from 'lucide-react'
import type { AdminView } from '../types'

interface AdminTopbarProps {
  activeView: AdminView
  userEmail: string
  onSignOut: () => void
}

const VIEW_TITLES: Record<AdminView, string> = {
  dashboard: 'Panel General y Métricas',
  orders: 'Gestión de Pedidos Clínicos',
  inventory: 'Control de Inventario y Catálogo',
  settings: 'Configuración de Bodega'
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({ activeView, userEmail, onSignOut }) => {
  return (
    <header className="admin-topbar">
      <div>
        <h1 className="admin-topbar-title">{VIEW_TITLES[activeView]}</h1>
      </div>

      <div className="admin-topbar-user">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <MapPin size={14} style={{ color: 'var(--teal-600)' }} />
          <span>Melipilla, Av. Ortúzar 750</span>
        </div>

        <div className="admin-user-pill">
          <User size={14} style={{ color: 'var(--teal-600)' }} />
          <span>{userEmail || 'admin@prontoinsumos.cl'}</span>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="admin-btn admin-btn-ghost"
          style={{ padding: '0.4rem 0.65rem', fontSize: '0.775rem' }}
          title="Cerrar sesión administrativa"
        >
          <LogOut size={15} />
          <span>Salir</span>
        </button>
      </div>
    </header>
  )
}
