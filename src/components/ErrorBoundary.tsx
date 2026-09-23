import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, MessageSquare } from 'lucide-react'
import { whatsappLink } from '../config/contact'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('PRONTO Store ErrorBoundary captured a runtime crash:', error, errorInfo)
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface-bg)',
            padding: '1.5rem',
            fontFamily: 'inherit'
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              width: '100%',
              background: 'var(--surface-card)',
              borderRadius: '16px',
              padding: '2rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              border: '1px solid var(--border-subtle)',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--signal-soft)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
                color: 'var(--danger)'
              }}
            >
              <AlertTriangle size={32} />
            </div>

            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: '800',
                color: 'var(--text-primary)',
                marginBottom: '0.5rem'
              }}
            >
              Inconveniente Inesperado
            </h2>

            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
                lineHeight: '1.5',
                marginBottom: '1.5rem'
              }}
            >
              Ha ocurrido un detalle al procesar la aplicación. No te preocupes, el inventario y tu pedido no se han
              visto afectados.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                onClick={this.handleReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.25rem',
                  background: 'var(--ink-800)',
                  color: 'var(--text-inverse)',
                  fontWeight: '700',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                <RefreshCw size={16} />
                <span>Reintentar y Recargar Tienda</span>
              </button>

              <a
                href={whatsappLink('Hola, tuve un inconveniente en el sitio web')}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.25rem',
                  background: 'var(--surface-card)',
                  color: 'var(--text-secondary)',
                  fontWeight: '600',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  textDecoration: 'none',
                  fontSize: '0.85rem'
                }}
              >
                <MessageSquare size={16} style={{ color: 'var(--success)' }} />
                <span>Soporte Directo por WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
