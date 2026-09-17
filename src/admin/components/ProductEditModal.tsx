import React, { useState, useEffect } from 'react'
import { X, CheckCircle2, AlertCircle, PlusCircle } from 'lucide-react'
import { updateProductDetails, createProductDetails } from '../services/adminApi'
import { formatCLP } from '../../utils/currency'
import type { Product } from '../../types'

export const BASE_CHILEAN_CATEGORIES = [
  'DESECHABLES, ESTERILIZACION Y DESINFECCION',
  'ENDODONCIA',
  'HIGIENE BUCAL',
  'IMPRESION',
  'INSTRUMENTAL Y ACCESORIOS',
  'OPERATORIA'
]

interface ProductEditModalProps {
  product: Product | null // If null, mode is create; if set, mode is edit
  isOpen?: boolean
  existingCategories?: string[]
  onClose: () => void
  onSuccess: () => void
}

export const ProductEditModal: React.FC<ProductEditModalProps> = ({
  product,
  isOpen = true,
  existingCategories = [],
  onClose,
  onSuccess
}) => {
  const isCreateMode = !product

  // Compile unique available categories
  const availableCategories = React.useMemo(() => {
    const set = new Set<string>(BASE_CHILEAN_CATEGORIES)
    existingCategories.forEach(c => {
      if (c && c.trim() && c !== 'all') set.add(c.trim().toUpperCase())
    })
    if (product?.category) set.add(product.category.trim().toUpperCase())
    return Array.from(set).sort()
  }, [existingCategories, product])

  const [name, setName] = useState('')
  const [price, setPrice] = useState(0)
  const [stockCount, setStockCount] = useState(10)
  const [brand, setBrand] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(BASE_CHILEAN_CATEGORIES[0])
  const [isCustomCategory, setIsCustomCategory] = useState(false)
  const [customCategoryName, setCustomCategoryName] = useState('')
  const [prescriptionRequired, setPrescriptionRequired] = useState(false)
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (product) {
      setName(product.name || '')
      setPrice(product.price || 0)
      setStockCount(typeof product.stockCount === 'number' ? product.stockCount : 10)
      setBrand(product.brand || product.manufacturer || '')
      setDescription(product.description || '')
      setCategory(product.category || BASE_CHILEAN_CATEGORIES[0])
      setIsCustomCategory(false)
      setCustomCategoryName('')
      setPrescriptionRequired(!!product.prescriptionRequired)
      setTag(product.tag || '')
    } else {
      // Defaults for create mode
      setName('')
      setPrice(0)
      setStockCount(10)
      setBrand('')
      setDescription('')
      setCategory(BASE_CHILEAN_CATEGORIES[0])
      setIsCustomCategory(false)
      setCustomCategoryName('')
      setPrescriptionRequired(false)
      setTag('')
    }
    setError('')
  }, [product, isOpen])

  if (!isOpen && !product) return null

  const handleCategorySelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === '__NEW__') {
      setIsCustomCategory(true)
      setCustomCategoryName('')
    } else {
      setIsCustomCategory(false)
      setCategory(val)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('El nombre del insumo es obligatorio.')
      return
    }

    if (price <= 0) {
      setError('El precio debe ser un monto mayor a $0 CLP.')
      return
    }

    const resolvedCategory = isCustomCategory ? customCategoryName.trim().toUpperCase() : category.trim().toUpperCase()
    if (!resolvedCategory) {
      setError('Debes especificar o seleccionar una categoría/especialidad clínica.')
      return
    }

    setLoading(true)
    setError('')

    try {
      if (isCreateMode) {
        const res = await createProductDetails({
          name: name.trim(),
          category: resolvedCategory,
          price: Math.round(price),
          stockCount: Math.max(0, Math.round(stockCount)),
          brand: brand.trim() || undefined,
          manufacturer: brand.trim() || undefined,
          description: description.trim() || name.trim(),
          prescriptionRequired,
          tag: tag.trim() || undefined
        })

        if (res.success) {
          onSuccess()
          onClose()
        } else {
          setError(res.error || 'Error al registrar el insumo')
        }
      } else {
        const res = await updateProductDetails({
          productId: product.id,
          name: name.trim(),
          category: resolvedCategory,
          price: Math.round(price),
          description: description.trim(),
          prescriptionRequired,
          tag: tag.trim() || undefined
        })

        if (res.success) {
          onSuccess()
          onClose()
        } else {
          setError(res.error || 'Error al actualizar el producto')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const netPrice = Math.round(price / 1.19)

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: 'var(--navy-900)' }}>
              {isCreateMode ? 'Registrar Nuevo Insumo Odontológico' : 'Editar Insumo Odontológico'}
            </h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
              {isCreateMode ? 'Ingreso directo al catálogo y bodega Melipilla' : `REF: ${product?.id.toUpperCase()}`}
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
              <label className="admin-label">Nombre Comercial del Insumo *</label>
              <input
                type="text"
                required
                placeholder="Ej: Turbina LED Push Button Triple Spray"
                className="admin-input"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              <div className="admin-form-group">
                <label className="admin-label">Precio c/IVA (CLP Entero) *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="18990"
                  className="admin-input"
                  value={price || ''}
                  onChange={e => setPrice(parseInt(e.target.value, 10) || 0)}
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: '700' }}
                />
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Neto estimado: {formatCLP(netPrice)}
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Marca / Fabricante</label>
                <input
                  type="text"
                  placeholder="Ej: NSK, 3M, SKYDENT"
                  className="admin-input"
                  value={brand}
                  onChange={e => setBrand(e.target.value)}
                />
              </div>
            </div>

            {/* Dynamic Category Selector */}
            <div className="admin-form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="admin-label">Especialidad Clínica / Categoría *</label>
                {isCustomCategory && (
                  <button
                    type="button"
                    onClick={() => setIsCustomCategory(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--teal-600)', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', padding: 0 }}
                  >
                    ← Elegir de existentes
                  </button>
                )}
              </div>

              {!isCustomCategory ? (
                <select
                  className="admin-select"
                  value={category}
                  onChange={handleCategorySelectChange}
                >
                  {availableCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="__NEW__" style={{ fontWeight: '700', color: 'var(--teal-700)' }}>
                    + Crear Nueva Categoría...
                  </option>
                </select>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    required
                    placeholder="Ej: ORTODONCIA, PERIODONCIA, CIRUGIA"
                    className="admin-input"
                    value={customCategoryName}
                    onChange={e => setCustomCategoryName(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {isCustomCategory ? 'Escribe el nombre de la nueva especialidad en mayúsculas.' : 'Puedes seleccionar una existente o registrar una nueva.'}
              </div>
            </div>

            {isCreateMode && (
              <div className="admin-form-group">
                <label className="admin-label">Stock Inicial en Bodega Melipilla *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  className="admin-input"
                  value={stockCount}
                  onChange={e => setStockCount(parseInt(e.target.value, 10) || 0)}
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: '700' }}
                />
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Unidades disponibles para despacho inmediato (por defecto 10).
                </div>
              </div>
            )}

            <div className="admin-form-group">
              <label className="admin-label">Descripción Técnica</label>
              <textarea
                rows={3}
                placeholder="Detalle clínico, material, dimensiones, compatibilidad..."
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
              <span>{loading ? 'Guardando...' : (isCreateMode ? 'Registrar Insumo' : 'Guardar Cambios')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
