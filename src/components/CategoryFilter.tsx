import React from 'react'
import { CATEGORIES, PRODUCTS } from '../data/products'
import { ProductCategory, Product } from '../types'
import {
  Activity,
  Home,
  Heart,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Layers,
  Wrench,
  Scissors,
  LayoutGrid,
  Grid,
  Filter,
  LucideIcon
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Grid,
  LayoutGrid,
  Activity,
  Home,
  Heart,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Layers,
  Wrench,
  Scissors
}

export interface CategoryFilterProps {
  selectedCategory: ProductCategory
  onSelectCategory: (category: ProductCategory) => void
  sortBy: string
  onSortChange: (sort: string) => void
  inStockOnly: boolean
  onToggleInStock: (checked: boolean) => void
  totalResults: number
  products?: Product[]
}

export default function CategoryFilter({
  selectedCategory,
  onSelectCategory,
  sortBy,
  onSortChange,
  inStockOnly,
  onToggleInStock,
  totalResults,
  products
}: CategoryFilterProps) {
  const catalog = products || PRODUCTS
  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: catalog.length }
    catalog.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1
    })
    return counts
  }, [catalog])

  const displayedCategories = React.useMemo(() => {
    const knownIds = new Set(CATEGORIES.map(c => c.id))
    const extraCategories: typeof CATEGORIES = []

    catalog.forEach((p) => {
      if (p.category && !knownIds.has(p.category)) {
        knownIds.add(p.category)
        const displayName = p.category
          .toLowerCase()
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
        extraCategories.push({
          id: p.category,
          name: displayName,
          icon: 'Grid'
        })
      }
    })

    return [...CATEGORIES, ...extraCategories]
  }, [catalog])

  return (
    <div className="controls-bar" id="catalog-section">
      {/* Segmented Category Control Bar */}
      <div className="category-pills" role="tablist" aria-label="Categorías de insumos dentales">
        {displayedCategories.map((cat) => {
          const IconComp = ICON_MAP[cat.icon] || Grid
          const isActive = selectedCategory === cat.id

          return (
            <button
              key={cat.id}
              role="tab"
              aria-selected={isActive}
              className={`category-pill-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelectCategory(cat.id)}
            >
              <IconComp size={16} />
              <span>{cat.name}</span>
              <span className="category-pill-count">{categoryCounts[cat.id] ?? 0}</span>
            </button>
          )
        })}
      </div>

      {/* Results Bar & Filters */}
      <div className="filter-controls-row">
        <div className="results-count">
          Mostrando <strong>{totalResults}</strong> insumos y equipos odontológicos
          <span className="results-slogan-tagline"> · Insumos a un click de distancia</span>
        </div>

        <div className="filter-options">
          {/* Stock Toggle */}
          <label className="stock-toggle-label">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => onToggleInStock(e.target.checked)}
            />
            <span>Solo en Stock</span>
          </label>

          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Filter size={15} style={{ color: 'var(--text-muted)' }} />
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
              aria-label="Ordenar catálogo"
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
