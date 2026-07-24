import React from 'react'
import { CATEGORIES } from '../data/products'
import { ProductCategory } from '../types'
import { Activity, Home, Heart, ShieldAlert, Grid, Filter, LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Grid,
  Activity,
  Home,
  Heart,
  ShieldAlert
}

export interface CategoryFilterProps {
  selectedCategory: ProductCategory
  onSelectCategory: (category: ProductCategory) => void
  sortBy: string
  onSortChange: (sort: string) => void
  inStockOnly: boolean
  onToggleInStock: (checked: boolean) => void
  totalResults: number
}

export default function CategoryFilter({
  selectedCategory,
  onSelectCategory,
  sortBy,
  onSortChange,
  inStockOnly,
  onToggleInStock,
  totalResults
}: CategoryFilterProps) {
  return (
    <div className="controls-bar" id="catalog-section">
      {/* Category Pills */}
      <div className="category-pills">
        {CATEGORIES.map((cat) => {
          const IconComp = ICON_MAP[cat.icon] || Grid
          const isActive = selectedCategory === cat.id

          return (
            <button
              key={cat.id}
              className={`category-pill-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelectCategory(cat.id)}
            >
              <IconComp size={16} />
              <span>{cat.name}</span>
            </button>
          )
        })}
      </div>

      {/* Results Bar & Filters */}
      <div className="filter-controls-row">
        <div className="results-count">
          Mostrando <strong>{totalResults}</strong> insumos y equipos odontológicos
        </div>

        <div className="filter-options">
          {/* Stock Toggle */}
          <label className="stock-toggle-label">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => onToggleInStock(e.target.checked)}
              style={{ accentColor: 'var(--emerald)', width: '16px', height: '16px' }}
            />
            <span>Solo en Stock</span>
          </label>

          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Filter size={15} style={{ color: 'var(--slate-500)' }} />
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
            >
              <option value="featured">Ordenar por: Destacados</option>
              <option value="price-low">Precio: Menor a Mayor</option>
              <option value="price-high">Precio: Mayor a Menor</option>
              <option value="rating">Mejor Calificados</option>
              <option value="reviews">Más Reseñas</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
