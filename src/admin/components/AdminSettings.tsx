import React, { useState } from 'react'
import { Building2, MapPin, CreditCard, Shield, Clock, Trash2, Search, TimerReset } from 'lucide-react'
import { BANK_DETAILS } from '../../config/bankDetails'
import { runVoucherHousekeeping, closeStalePendingOrders } from '../services/adminApi'

export const AdminSettings: React.FC = () => {
  const [sweepLoading, setSweepLoading] = useState<'review' | 'clean' | null>(null)
  const [sweepResult, setSweepResult] = useState('')
  const [sweepError, setSweepError] = useState('')
  const [sweepLimit, setSweepLimit] = useState(100)

  const [staleLoading, setStaleLoading] = useState<'review' | 'close' | null>(null)
  const [staleResult, setStaleResult] = useState('')
  const [staleError, setStaleError] = useState('')
  const [staleHours, setStaleHours] = useState(48)

  /**
   * Runs the voucher housekeeping sweep. `dryRun` only reports; the real run deletes the
   * unreferenced objects older than the server's grace window (never the voucher an order
   * currently references). `sweepLimit` bounds how many of the most recent orders are
   * scanned — the server clamps it to 500.
   */
  const runSweep = async (dryRun: boolean) => {
    setSweepLoading(dryRun ? 'review' : 'clean')
    setSweepResult('')
    setSweepError('')
    const res = await runVoucherHousekeeping({ dryRun, limit: sweepLimit })
    setSweepLoading(null)
    if (!res.success) {
      setSweepError(res.error || 'No fue posible ejecutar la limpieza de comprobantes.')
      return
    }
    const verb = dryRun ? 'se eliminarían' : 'se eliminaron'
    const failures = res.failures?.length ? ` ${res.failures.length} objeto(s) no se pudieron procesar.` : ''
    setSweepResult(
      `Revisados ${res.scannedObjects ?? 0} objeto(s) en ${res.scannedOrders ?? 0} pedido(s): ` +
        `${verb} ${res.deletedCount ?? 0} comprobante(s) huérfano(s). ` +
        `${res.keptReferenced ?? 0} vigente(s), ${res.skippedRecent ?? 0} reciente(s) omitido(s).${failures}`
    )
  }

  /**
   * Sweeps abandoned online-payment orders. `dryRun` only lists the candidates; the real
   * run closes them, but never one whose Mercado Pago ledger already shows a settled
   * payment — that order is sent to *Pago en Revisión* instead, and an order whose ledger
   * could not be read is left untouched. `staleHours` is the idle window the server clamps
   * to 1–720 hours.
   */
  const runStaleSweep = async (dryRun: boolean) => {
    setStaleLoading(dryRun ? 'review' : 'close')
    setStaleResult('')
    setStaleError('')
    const res = await closeStalePendingOrders({ dryRun, olderThanHours: staleHours })
    setStaleLoading(null)
    if (!res.success) {
      setStaleError(res.error || 'No fue posible revisar los pedidos pendientes antiguos.')
      return
    }
    const verb = dryRun ? 'se cerrarían' : 'se cerraron'
    const parkVerb = dryRun ? 'se enviarían a revisión manual' : 'se enviaron a revisión manual'
    const failures = res.failures?.length ? ` ${res.failures.length} pedido(s) sin verificar (no se tocaron).` : ''
    const more = res.truncated
      ? ' Quedan pedidos pendientes por revisar: vuelve a ejecutarlo más tarde.'
      : ''
    setStaleResult(
      `Revisados ${res.scannedOrders ?? 0} de ${res.pendingTotal ?? 0} pedido(s) pendiente(s); ` +
        `${res.staleOrders ?? 0} con más de ${res.olderThanHours ?? staleHours} hora(s) sin pago: ` +
        `${verb} ${res.closedCount ?? 0} y ${res.parkedCount ?? 0} con pago ya acreditado ${parkVerb}.${failures}${more}`
    )
  }

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

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Mantenimiento de Comprobantes</h2>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
          <div style={{ color: 'var(--text-secondary)' }}>
            Un comprobante que se sube pero nunca se confirma queda como archivo huérfano en el
            almacenamiento (hasta 5 MB cada uno). Esta limpieza elimina solo los comprobantes que
            ningún pedido referencia y que llevan más de una hora en el almacenamiento; el
            comprobante vigente de un pedido nunca se toca.
          </div>

          <div className="admin-form-group">
            <label className="admin-label" htmlFor="voucher-sweep-limit">
              Pedidos a revisar (los más recientes)
            </label>
            <input
              id="voucher-sweep-limit"
              type="number"
              className="admin-input"
              min={1}
              max={500}
              value={sweepLimit}
              onChange={e => setSweepLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              disabled={sweepLoading !== null}
            />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Se revisan hasta 500 pedidos por ejecución. Para alcanzar pedidos más antiguos,
              repite la limpieza con un límite mayor.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              disabled={sweepLoading !== null}
              onClick={() => runSweep(true)}
            >
              <Search size={15} />
              <span>{sweepLoading === 'review' ? 'Revisando...' : 'Revisar huérfanos'}</span>
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-danger"
              disabled={sweepLoading !== null}
              onClick={() => runSweep(false)}
            >
              <Trash2 size={15} />
              <span>{sweepLoading === 'clean' ? 'Eliminando...' : 'Eliminar huérfanos'}</span>
            </button>
          </div>

          {sweepResult && (
            <div
              style={{
                background: 'var(--success-bg)',
                color: 'var(--success)',
                border: '1px solid #a7f3d0',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}
            >
              {sweepResult}
            </div>
          )}

          {sweepError && (
            <div
              style={{
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                border: '1px solid #fecaca',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}
            >
              {sweepError}
            </div>
          )}
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Pedidos Pendientes Antiguos</h2>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
          <div style={{ color: 'var(--text-secondary)' }}>
            Cada intento de compra en línea deja un pedido pendiente. Cuando el cliente abandona el pago,
            ese pedido queda como fantasma. Antes de cerrar uno, esta revisión consulta la cartola de
            Mercado Pago: si el pago ya está acreditado, el pedido <strong>no se cancela</strong> y se
            envía a revisión manual; si la cartola no se puede consultar, el pedido no se toca.
          </div>

          <div className="admin-form-group">
            <label className="admin-label" htmlFor="stale-hours">
              Horas sin pago para considerarlo abandonado
            </label>
            <input
              id="stale-hours"
              type="number"
              className="admin-input"
              min={1}
              max={720}
              value={staleHours}
              onChange={e => setStaleHours(Math.max(1, Math.min(720, Number(e.target.value) || 1)))}
              disabled={staleLoading !== null}
            />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Mínimo 1 hora, máximo 720 (30 días). Revisa primero en seco: solo el segundo botón cierra pedidos.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              disabled={staleLoading !== null}
              onClick={() => runStaleSweep(true)}
            >
              <Search size={15} />
              <span>{staleLoading === 'review' ? 'Revisando...' : 'Revisar pendientes antiguos'}</span>
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-danger"
              disabled={staleLoading !== null}
              onClick={() => runStaleSweep(false)}
            >
              <TimerReset size={15} />
              <span>{staleLoading === 'close' ? 'Cerrando...' : 'Cerrar pendientes antiguos'}</span>
            </button>
          </div>

          {staleResult && (
            <div
              style={{
                background: 'var(--success-bg)',
                color: 'var(--success)',
                border: '1px solid #a7f3d0',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}
            >
              {staleResult}
            </div>
          )}

          {staleError && (
            <div
              style={{
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                border: '1px solid #fecaca',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}
            >
              {staleError}
            </div>
          )}
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
