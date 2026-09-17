import React, { useState } from 'react'
import { X, CheckCircle2, AlertCircle } from 'lucide-react'
import { updateProductDetails } from '../services/adminApi'
import { formatCLP } from '../../utils/currency'
import type { Product } from '../../types'

interface ProductEditModalProps {
  product: Product | null
  onClose: () => void
  onSuccess: () => void
}

const CATEGORIES = [
  'Instrumental',
  'Materiales Restauradores',
  'Equipamiento',
  'Desechables',
  'Endodoncia',
  'Ortodoncia',
  'Periodoncia'
]

export const ProductEditModal: React.FC<ProductEditModalProps> = ({
  product,
  onClose,
  onSuccess
}) => {
  if (!product) return null

  const [name, setName] = useState(product.name || '')
  const [price, setPrice] = useState(product.price || 0)
  const [description, setDescription] = useState(product.description || '')
  const [category, setCategory] = useState(product.category || 'Instrumental')
  const [prescriptionRequired, setPrescriptionRequired] = useState(!!product.prescriptionRequired)
  const [tag, setTag] = useState(product.tag || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (price <= 0) {
      setError('El precio debe ser mayor a $0 CLP.')
      return
    }

    setLoading(true)
    setError('')
    const res = await updateProductDetails({
      productId: product.id,
      name: name.trim(),
      price: Math.round(price),
      description: description.trim(),
      category,
      prescriptionRequired,
      tag: tag.trim() || undefined
    })
    setLoading(false)

    if (res.success) {
      onSuccess()
      onClose()
    } else {
      setError(res.error || 'Error al actualizar el producto')
    }
  }

  const netPrice = Math.round(price / 1.19)

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: 'var(--navy-900)' }}>
              Editar Insumo Odontológico
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
          <div className="admin-modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
            {error && (
              <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid #fecaca', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="admin-form-group">
              <label className="admin-label">Nombre Comercial del Insumo</label>
              <input
                type="text"
                required
                className="admin-input"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              <div className="admin-form-group">
                <label className="admin-label">Precio c/IVA (CLP Entero)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  className="admin-input"
                  value={price}
                  onChange={e => setPrice(parseInt(e.target.value, 10) || 0)}
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: '700' }}
                />
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Neto estimado: {formatCLP(netPrice)}
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Especialidad Clínica</label>
                <select
                  className="admin-select"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="admin-form-group">
              <label className="admin-label">Descripción Técnica</label>
              <textarea
                rows={3}
                className="admin-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              <div className="admin-form-group">
                <label className="admin-label">Etiqueta Comercial (Tag)</label>
                <input
                  type="text"
                  placeholder="Ej: MÁS VENDIDO, OFERTA"
                  className="admin-input"
                  value={tag}
                  onChange={e => setTag(e.target.value)}
                />
              </div>

              <div className="admin-form-group" style={{ justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '700', color: 'var(--navy-900)' }}>
                  <input
                    type="checkbox"
                    checked={prescriptionRequired}
                    onChange={e => setPrescriptionRequired(e.target.checked)}
                  />
                  <span>Regulado ISP / Requiere SIS</span>
                </label>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '1.4rem' }}>
                  Exige N° SIS al dentista en checkout
                </div>
              </div>
            </div>
          </div>

          <div className="admin-modal-footer">
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={loading}>
              <CheckCircle2 size={16} />
              <span>{loading ? 'Guardando...' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
