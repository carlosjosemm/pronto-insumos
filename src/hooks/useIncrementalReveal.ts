import { useCallback, useEffect, useRef, useState } from 'react'

/** Cards revealed per page (4 rows of the desktop grid). */
export const PRODUCTS_PAGE_SIZE = 16

interface IncrementalRevealResult {
  /** How many items of the full list are currently revealed. */
  visibleCount: number
  /** True while unrevealed items remain. */
  hasMore: boolean
  /** Reveals the next page (no-op when the end is reached). */
  revealMore: () => void
  /** Attach to a sentinel element rendered below the list. */
  sentinelRef: (node: HTMLElement | null) => void
}

/**
 * Progressive disclosure state for the catalog grid: reveals one page of cards
 * at a time and auto-reveals through an IntersectionObserver sentinel. The
 * "Cargar más" button remains the primary keyboard-reachable control — the
 * observer is a convenience, never a replacement.
 *
 * Reset-on-filter-change is handled by the caller remounting the list (a
 * changing React `key`), matching the codebase's "scoped by remount, not by
 * reset effects" convention — no setState-in-effect here.
 */
export function useIncrementalReveal(total: number): IncrementalRevealResult {
  const [visibleCount, setVisibleCount] = useState(PRODUCTS_PAGE_SIZE)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // The ceiling is derived, never stored, so a shrinking result set clamps the
  // reveal without an effect.
  const max = Math.max(total, PRODUCTS_PAGE_SIZE)
  const effectiveCount = Math.min(visibleCount, max)

  const revealMore = useCallback(() => {
    setVisibleCount((current) => Math.min(Math.min(current, max) + PRODUCTS_PAGE_SIZE, max))
  }, [max])

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      if (!node || typeof IntersectionObserver === 'undefined') return

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) revealMore()
        },
        { rootMargin: '200px' }
      )
      observerRef.current.observe(node)
    },
    [revealMore]
  )

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [])

  return { visibleCount: effectiveCount, hasMore: effectiveCount < total, revealMore, sentinelRef }
}
