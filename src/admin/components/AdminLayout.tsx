import React from 'react'
import { AdminSidebar } from './AdminSidebar'
import { AdminTopbar } from './AdminTopbar'
import type { AdminView } from '../types'

interface AdminLayoutProps {
  activeView: AdminView
  userEmail: string
  onNavigate: (view: AdminView) => void
  onSignOut: () => void
  children: React.ReactNode
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  activeView,
  userEmail,
  onNavigate,
  onSignOut,
  children
}) => {
  return (
    <div className="admin-shell">
      <AdminSidebar activeView={activeView} onNavigate={onNavigate} />
      <div className="admin-main-wrap">
        <AdminTopbar activeView={activeView} userEmail={userEmail} onSignOut={onSignOut} />
        <main className="admin-content">
          {children}
        </main>
      </div>
    </div>
  )
}
