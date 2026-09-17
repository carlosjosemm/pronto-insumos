import React, { useState } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from '../../services/firebase'
import { Shield, Lock, Mail, AlertCircle, ArrowRight, Stethoscope } from 'lucide-react'

interface AdminLoginProps {
  onLoginSuccess: () => void
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password)
      const tokenResult = await userCredential.user.getIdTokenResult(true)

      if (tokenResult.claims.admin !== true) {
        // Sign out immediately if not an authorized administrator
        await signOut(auth)
        setError('Acceso denegado: esta cuenta no cuenta con permisos administrativos en PRONTO.')
        setLoading(false)
        return
      }

      onLoginSuccess()
    } catch (err: any) {
      console.error('[Admin Login] Error:', err)
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Credenciales inválidas. Por favor verifica el correo y contraseña.')
      } else if (err.code === 'auth/too-many-requests') {
        setError('Demasiados intentos fallidos. Intenta más tarde o restablece tu clave.')
      } else {
        setError(err.message || 'Error al iniciar sesión administrativa.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-login-wrap">
      <div className="admin-login-card">
        <div className="admin-login-brand">
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'var(--teal-600)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(8, 131, 149, 0.35)'
          }}>
            <Stethoscope size={26} />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--navy-900)' }}>
            PRONTO <span style={{ color: 'var(--teal-600)' }}>ADMIN</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Panel Operativo de Bodega Melipilla
          </div>
        </div>

        {error && (
          <div style={{
            background: 'var(--danger-bg)',
            border: '1px solid #fecaca',
            color: 'var(--danger)',
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="admin-form-group">
            <label className="admin-label" htmlFor="admin-email">Correo Administrativo</label>
            <div style={{ position: 'relative' }}>
              <input
                id="admin-email"
                type="email"
                required
                className="admin-input"
                placeholder="admin@prontoinsumos.cl"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ paddingLeft: '2.35rem' }}
              />
              <Mail size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div className="admin-form-group">
            <label className="admin-label" htmlFor="admin-password">Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input
                id="admin-password"
                type="password"
                required
                className="admin-input"
                placeholder="••••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ paddingLeft: '2.35rem' }}
              />
              <Lock size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="admin-btn admin-btn-primary"
            style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}
          >
            <span>{loading ? 'Verificando credenciales...' : 'Ingresar al Panel'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: '0.725rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
          <Shield size={13} style={{ color: 'var(--teal-600)' }} />
          <span>Acceso restringido a personal autorizado de Melipilla</span>
        </div>
      </div>
    </div>
  )
}
