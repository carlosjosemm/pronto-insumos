import React, { useEffect, useState } from 'react'
import { InventoryTable } from './InventoryTable'
import { StockAdjustModal } from './StockAdjustModal'
import { ProductEditModal } from './ProductEditModal'
import { fetchAdminProducts, toggleProductVisibility } from '../services/adminApi'
import { RefreshCw } from 'lucide-react'
import type { Product } from '../../types'

export const AdminInventory: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedForStock, setSelectedForStock] = useState<Product | null>(null)
  const [selectedForEdit, setSelectedForEdit] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProducts = async () => {
    setLoading(true)
    try {
      const list = await fetchAdminProducts()
      setProducts(list)
    } catch (err) {
      console.error('[Admin Inventory] Error loading products:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const handleToggleVisibility = async (productId: string, currentVisible: boolean) => {
    const next = !currentVisible
    // Optimistic UI update
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, inStock: next } : p))
    const res = await toggleProductVisibility(productId, next)
    if (!res.success) {
      // Revert if failed
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, inStock: currentVisible } : p))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Control de existencias físicas en bodega Melipilla, precios en CLP con IVA y catálogo activo.
          </div>
        </div>
        <button
          type="button"
          onClick={loadProducts}
          className="admin-btn admin-btn-secondary"
          disabled={loading}
          style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem' }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Actualizar Catálogo</span>
        </button>
      </div>

      <InventoryTable
        products={products}
        onAdjustStock={p => setSelectedForStock(p)}
        onEditProduct={p => setSelectedForEdit(p)}
        onToggleVisibility={handleToggleVisibility}
      />

      <StockAdjustModal
        product={selectedForStock}
        onClose={() => setSelectedForStock(null)}
        onSuccess={() => loadProducts()}
      />

      <ProductEditModal
        product={selectedForEdit}
        onClose={() => setSelectedForEdit(null)}
        onSuccess={() => loadProducts()}
      />
    </div>
  )
}
