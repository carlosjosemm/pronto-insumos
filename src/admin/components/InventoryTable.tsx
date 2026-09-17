import React, { useState, useMemo } from 'react'
import { Search, Edit, SlidersHorizontal, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { formatCLP } from '../../utils/currency'
import type { Product } from '../../types'

interface InventoryTableProps {
  products: Product[]
  onAdjustStock: (product: Product) => void
  onEditProduct: (product: Product) => void
  onToggleVisibility: (productId: string, currentVisible: boolean) => void
}

export const InventoryTable: React.FC<InventoryTableProps> = ({
  products,
  onAdjustStock,
  onEditProduct,
  onToggleVisibility
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  const categories = useMemo(() => {
    const set = new Set<string>()
    products.forEach(p => { if (p.category) set.add(p.category) })
    return Array.from(set)
  }, [products])

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim()
        const matchName = p.name.toLowerCase().includes(q)
        const matchId = p.id.toLowerCase().includes(q)
        if (!matchName && !matchId) return false
      }
      return true
    })
  }, [products, selectedCategory, searchTerm])

  const getStockBadgeClass = (stock: number, inStock: boolean) => {
    if (!inStock || stock <= 0) return 'admin-stock-badge--out'
    if (stock <= 3) return 'admin-stock-badge--critical'
    if (stock <= 10) return 'admin-stock-badge--low'
    return 'admin-stock-badge--optimal'
  }

  return (
    <div className="admin-card">
      <div style={{ padding: '1.25rem 1.25rem 0.5rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              className="admin-search-input"
              placeholder="Buscar insumos odontológicos por nombre o código REF..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.4rem' }}
            />
            <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          </div>

          <div style={{ minWidth: '200px' }}>
            <select
              className="admin-select"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
            >
              <option value="all">Todas las Categorías</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="admin-table-container">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>REF / SKU</th>
              <th>Insumo Clínico</th>
              <th>Especialidad</th>
              <th>Precio Neto</th>
              <th>Precio c/IVA</th>
              <th>Stock Bodega</th>
              <th>Catálogo Activo</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                  No se encontraron productos coincidentes.
                </td>
              </tr>
            ) : (
              filteredProducts.map(p => {
                const stock = typeof p.stockCount === 'number' ? p.stockCount : 0
                const isVisible = p.isActive !== false
                const netPrice = Math.round(p.price / 1.19)

                return (
                  <tr key={p.id}>
                    <td>
                      <span className="admin-code">{p.id.toUpperCase()}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: '700', color: 'var(--navy-900)' }}>
                        {p.name}
                      </div>
                      {p.prescriptionRequired && (
                        <span style={{ fontSize: '0.675rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: '700' }}>
                          ⚕️ Regulado SIS
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', background: 'var(--surface-muted)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                        {p.category}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {formatCLP(netPrice)}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '800', color: 'var(--navy-900)' }}>
                      {formatCLP(p.price)}
                    </td>
                    <td>
                      <span className={`admin-stock-badge ${getStockBadgeClass(stock, isVisible)}`}>
                        {!isVisible ? 'Pausado' : stock <= 0 ? 'Sin Stock' : `${stock} unid.`}
                      </span>
                    </td>
                    <td>
                      <label className="admin-switch" title={isVisible ? 'Visible en tienda' : 'Pausado de tienda'}>
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => onToggleVisibility(p.id, isVisible)}
                        />
                        <span className="admin-switch-slider"></span>
                      </label>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
                          title="Ajustar unidades en bodega"
                          onClick={() => onAdjustStock(p)}
                        >
                          <SlidersHorizontal size={13} />
                          <span>Stock</span>
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn-ghost"
                          style={{ padding: '0.3rem 0.45rem' }}
                          title="Editar metadata del producto"
                          onClick={() => onEditProduct(p)}
                        >
                          <Edit size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
