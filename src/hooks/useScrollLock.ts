import { useEffect } from 'react'

/** Locks body scroll while `locked` is true; restores on unmount/unlock. */
export function useScrollLock(locked: boolean = true) {
  useEffect(() => {
    if (!locked) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [locked])
}
