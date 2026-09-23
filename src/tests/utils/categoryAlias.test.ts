import { describe, it, expect } from 'vitest'
import { formatCategoryDisplayName } from '../../utils/categoryAlias'

describe('Category Display Alias Utility', () => {
  it('should alias "DESECHABLES, ESTERILIZACION Y DESINFECCION" to "Desechables y Esterilización"', () => {
    expect(formatCategoryDisplayName('DESECHABLES, ESTERILIZACION Y DESINFECCION')).toBe('Desechables y Esterilización')
    expect(formatCategoryDisplayName('desechables, esterilizacion y desinfeccion')).toBe('Desechables y Esterilización')
  })

  it('should alias canonical categories to title case equivalents', () => {
    expect(formatCategoryDisplayName('INSTRUMENTAL Y ACCESORIOS')).toBe('Instrumental y Accesorios')
    expect(formatCategoryDisplayName('OPERATORIA')).toBe('Operatoria')
    expect(formatCategoryDisplayName('ENDODONCIA')).toBe('Endodoncia')
    expect(formatCategoryDisplayName('HIGIENE BUCAL')).toBe('Higiene Bucal')
    expect(formatCategoryDisplayName('IMPRESION')).toBe('Impresión')
  })

  it('should safely fall back to original string when no alias is registered', () => {
    expect(formatCategoryDisplayName('Sterilization')).toBe('Sterilization')
    expect(formatCategoryDisplayName('Instruments')).toBe('Instruments')
    expect(formatCategoryDisplayName('CustomCategory')).toBe('CustomCategory')
  })

  it('should handle undefined, empty, or whitespace-only values', () => {
    expect(formatCategoryDisplayName(undefined)).toBe('')
    expect(formatCategoryDisplayName('')).toBe('')
    expect(formatCategoryDisplayName('   ')).toBe('')
  })
})
