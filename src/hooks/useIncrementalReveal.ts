import { useCallback, useState } from 'react'

/** Cards revealed per page (4 rows of the desktop grid). */
export const PRODUCTS_PAGE_SIZE = 16

interface IncrementalRevealResult {
  /** How many items of the full list are currently revealed. */
  visibleCount: number
  /** True while unrevealed items remain. */
  hasMore: boolean
  /** Reveals the next page (no-op when the end is reached). */
  revealMore: () => void
}

/**
 * Progressive disclosure state for the catalog grid: reveals one page of cards
 * at a time. Reveal is **button-only** — the IntersectionObserver auto-reveal
 * sentinel was deliberately removed at the store owner's request, so cards
 * only advance when the shopper clicks "Cargar más insumos".
 *
 * Reset-on-filter-change is handled by the caller remounting the list (a
 * changing React `key`), matching the codebase's "scoped by remount, not by
 * reset effects" convention — no setState-in-effect here.
 */
export function useIncrementalReveal(total: number): IncrementalRevealResult {
  const [visibleCount, setVisibleCount] = useState(PRODUCTS_PAGE_SIZE)

  // The ceiling is derived, never stored, so a shrinking result set clamps the
  // reveal without an effect.
  const max = Math.max(total, PRODUCTS_PAGE_SIZE)
  const effectiveCount = Math.min(visibleCount, max)

  const revealMore = useCallback(() => {
    setVisibleCount((current) => Math.min(Math.min(current, max) + PRODUCTS_PAGE_SIZE, max))
  }, [max])

  return { visibleCount: effectiveCount, hasMore: effectiveCount < total, revealMore }
}
