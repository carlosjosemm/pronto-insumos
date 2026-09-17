import React, { useState } from 'react'
import { X, CheckCircle2, AlertCircle, Plus, Minus } from 'lucide-react'
import { STOCK_REASON_LABELS, type StockAdjustmentReason } from '../types'
import { updateStockCount } from '../services/adminApi'
import type { Product } from '../../types'

interface StockAdjustModalProps {
  product: Product | null
  onClose: () => void
  onSuccess: () => void
}

export const StockAdjustModal: React.FC<StockAdjustModalProps> = ({
  product,
  onClose,
  onSuccess
}) => {
  if (!product) return null

  const [newStock, setNewStock] = useState(product.stockCount || 0)
  const [reason, setReason] = useState<StockAdjustmentReason>('reposicion')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newStock < 0) {
      setError('El stock no puede ser un número negativo.')
      return
    }

    setLoading(true)
    setError('')
    const res = await updateStockCount({
      productId: product.id,
      newStock: Math.round(newStock),
      reason
    })
    setLoading(false)

    if (res.success) {
      onSuccess()
      onClose()
    } else {
      setError(res.error || 'Error al actualizar el inventario')
    }
  }

  const diff = newStock - (product.stockCount || 0)

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: 'var(--navy-900)' }}>
              Ajuste Físico de Inventario
            </h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
              REF: {product.id.toUpperCase()}
            </div>
          </div>
          <button type="button" className="admin-btn admin-btn-ghost" style={{ padding: '0.35rem' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="admin-modal-body">
            {error && (
              <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid #fecaca', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ background: 'var(--surface-muted)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: '700', fontSize: '0.85rem', color: 'var(--navy-900)' }}>
                {product.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Stock actual en bodega Melipilla: <strong>{product.stockCount || 0} unidades</strong>
              </div>
            </div>

            {/* Stepper Controls */}
            <div className="admin-form-group">
              <label className="admin-label">Nuevo Stock en Bodega</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  style={{ padding: '0.6rem 0.9rem' }}
                  onClick={() => setNewStock(s => Math.max(0, s - 1))}
                >
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  min="0"
                  required
                  className="admin-input"
                  style={{ textAlign: 'center', fontSize: '1.2rem', fontWeight: '800', fontFamily: 'var(--font-mono)' }}
                  value={newStock}
                  onChange={e => setNewStock(Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  style={{ padding: '0.6rem 0.9rem' }}
                  onClick={() => setNewStock(s => s + 1)}
                >
                  <Plus size={16} />
                </button>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', textAlign: 'center' }}>
                {diff === 0 ? 'Sin cambios' : diff > 0 ? `+${diff} unidades (Ingreso)` : `${diff} unidades (Salida / Rebaje)`}
              </div>
            </div>

            {/* Adjustment Reason */}
            <div className="admin-form-group">
              <label className="admin-label">Motivo Operativo del Ajuste</label>
              <select
                className="admin-select"
                value={reason}
                onChange={e => setReason(e.target.value as StockAdjustmentReason)}
              >
                {Object.entries(STOCK_REASON_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="admin-modal-footer">
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={loading}>
              <CheckCircle2 size={16} />
              <span>{loading ? 'Guardando...' : 'Guardar Ajuste'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
