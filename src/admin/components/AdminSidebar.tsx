import React from 'react'
import { LayoutDashboard, ClipboardList, Package, Settings, Stethoscope, ExternalLink } from 'lucide-react'
import type { AdminView } from '../types'

interface AdminSidebarProps {
  activeView: AdminView
  onNavigate: (view: AdminView) => void
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ activeView, onNavigate }) => {
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-header">
        <div className="admin-sidebar-brand">
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--teal-600)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff'
          }}>
            <Stethoscope size={18} />
          </div>
          <div>
            <div className="admin-sidebar-title">PRONTO</div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Bodega Melipilla</div>
          </div>
        </div>
        <span className="admin-sidebar-badge">B2B</span>
      </div>

      <nav className="admin-sidebar-nav">
        <button
          type="button"
          className={`admin-sidebar-nav-item ${activeView === 'dashboard' ? 'admin-sidebar-nav-item--active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          className={`admin-sidebar-nav-item ${activeView === 'orders' ? 'admin-sidebar-nav-item--active' : ''}`}
          onClick={() => onNavigate('orders')}
        >
          <ClipboardList size={18} />
          <span>Pedidos Clínicos</span>
        </button>

        <button
          type="button"
          className={`admin-sidebar-nav-item ${activeView === 'inventory' ? 'admin-sidebar-nav-item--active' : ''}`}
          onClick={() => onNavigate('inventory')}
        >
          <Package size={18} />
          <span>Inventario y Stock</span>
        </button>

        <button
          type="button"
          className={`admin-sidebar-nav-item admin-sidebar-nav-item--disabled ${activeView === 'settings' ? 'admin-sidebar-nav-item--active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          <Settings size={18} />
          <span>Configuración</span>
        </button>
      </nav>

      <div className="admin-sidebar-footer">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}
        >
          <span>Ir a Tienda Pública</span>
          <ExternalLink size={13} />
        </a>
      </div>
    </aside>
  )
}
