import React, { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { auth } from '../services/firebase'
import { AdminLogin } from './components/AdminLogin'
import { AdminLayout } from './components/AdminLayout'
import { AdminDashboard } from './components/AdminDashboard'
import { AdminOrders } from './components/AdminOrders'
import { AdminInventory } from './components/AdminInventory'
import { AdminSettings } from './components/AdminSettings'
import type { AdminView } from './types'
import './admin.css'

export const AdminApp: React.FC = () => {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [activeView, setActiveView] = useState<AdminView>('dashboard')
  const [selectedOrderId, setSelectedOrderId] = useState<string | undefined>(undefined)

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const tokenResult = await currentUser.getIdTokenResult()
          if (tokenResult.claims.admin === true) {
            setUser(currentUser)
            setIsAdmin(true)
          } else {
            console.warn('[Admin App] User lacks admin claim. Signing out.')
            await signOut(auth)
            setUser(null)
            setIsAdmin(false)
          }
        } catch (err) {
          console.error('[Admin App] Error verifying token claims:', err)
          setUser(null)
          setIsAdmin(false)
        }
      } else {
        setUser(null)
        setIsAdmin(false)
      }
      setAuthChecking(false)
    })

    return () => unsubscribe()
  }, [])

  // Listen to Hash Change
  useEffect(() => {
    const handleHash = () => {
      const rawHash = window.location.hash.replace(/^#\/?/, '').trim()
      const [view, param] = rawHash.split('/')
      if (view === 'orders' || view === 'inventory' || view === 'settings' || view === 'dashboard') {
        setActiveView(view as AdminView)
        if (view === 'orders' && param) {
          setSelectedOrderId(param)
        }
      } else {
        setActiveView('dashboard')
      }
    }

    handleHash()
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  const navigateTo = (view: AdminView, orderId?: string) => {
    setActiveView(view)
    setSelectedOrderId(orderId)
    window.location.hash = orderId ? `#${view}/${orderId}` : `#${view}`
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      setUser(null)
      setIsAdmin(false)
    } catch (err) {
      console.error('[Admin App] Sign out error:', err)
    }
  }

  if (authChecking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy-900)', color: '#ffffff' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '0.5rem' }}>PRONTO ADMIN</div>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Verificando credenciales de acceso...</div>
        </div>
      </div>
    )
  }

  if (!user || isAdmin !== true) {
    return (
      <AdminLogin
        onLoginSuccess={() => {
          setIsAdmin(true)
          setUser(auth.currentUser)
        }}
      />
    )
  }

  return (
    <AdminLayout
      activeView={activeView}
      userEmail={user.email || 'admin@prontoinsumos.cl'}
      onNavigate={view => navigateTo(view)}
      onSignOut={handleSignOut}
    >
      {activeView === 'dashboard' && (
        <AdminDashboard
          onNavigateToOrders={orderId => navigateTo('orders', orderId)}
          onNavigateToInventory={() => navigateTo('inventory')}
        />
      )}

      {activeView === 'orders' && (
        <AdminOrders initialOrderId={selectedOrderId} />
      )}

      {activeView === 'inventory' && (
        <AdminInventory />
      )}

      {activeView === 'settings' && (
        <AdminSettings />
      )}
    </AdminLayout>
  )
}
