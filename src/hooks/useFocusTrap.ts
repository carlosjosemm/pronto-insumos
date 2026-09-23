import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Traps Tab/Shift+Tab inside the referenced element while `active`.
 * Moves initial focus to the first focusable element and restores
 * focus to the previously focused element on release.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean = true) {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!active || !ref.current) return
    const root = ref.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))

    focusables()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const els = focusables()
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        last.focus()
        e.preventDefault()
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus()
        e.preventDefault()
      }
    }

    root.addEventListener('keydown', onKeyDown)
    return () => {
      root.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [active])

  return ref
}
