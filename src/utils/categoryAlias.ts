/**
 * Canonical Chilean Dental Category Display Alias Map
 *
 * Maps internal, frozen database category keys to clean, user-friendly storefront display labels.
 * This decouples backend data schemas and Firestore storage from client-facing UI presentation,
 * preventing data migration risks while providing a concise, polished UX.
 */
export const CATEGORY_DISPLAY_MAP: Record<string, string> = {
  'DESECHABLES, ESTERILIZACION Y DESINFECCION': 'Desechables y Esterilización',
  'desechables, esterilizacion y desinfeccion': 'Desechables y Esterilización',
  'INSTRUMENTAL Y ACCESORIOS': 'Instrumental y Accesorios',
  OPERATORIA: 'Operatoria',
  ENDODONCIA: 'Endodoncia',
  'HIGIENE BUCAL': 'Higiene Bucal',
  IMPRESION: 'Impresión'
}

/**
 * Returns the human-friendly display label for a given product category.
 * If no alias is defined (e.g. legacy test fixtures like 'Sterilization'),
 * it falls back safely to the original string.
 */
export function formatCategoryDisplayName(category?: string): string {
  if (!category || typeof category !== 'string') return ''
  const trimmed = category.trim()
  return CATEGORY_DISPLAY_MAP[trimmed] || trimmed
}
