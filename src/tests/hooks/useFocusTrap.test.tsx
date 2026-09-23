import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

function Dialog() {
  const ref = useFocusTrap<HTMLDivElement>()
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <button>Primero</button>
      <button>Último</button>
    </div>
  )
}

describe('useFocusTrap', () => {
  it('should move initial focus to the first focusable element', () => {
    render(<Dialog />)
    expect(screen.getByText('Primero')).toHaveFocus()
  })

  it('should wrap Tab from the last focusable back to the first', () => {
    render(<Dialog />)
    const last = screen.getByText('Último')
    last.focus()

    fireEvent.keyDown(last, { key: 'Tab' })
    expect(screen.getByText('Primero')).toHaveFocus()
  })

  it('should wrap Shift+Tab from the first focusable to the last', () => {
    render(<Dialog />)
    const first = screen.getByText('Primero')
    first.focus()

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(screen.getByText('Último')).toHaveFocus()
  })

  it('should leave other keys alone', () => {
    render(<Dialog />)
    const last = screen.getByText('Último')
    last.focus()

    fireEvent.keyDown(last, { key: 'Enter' })
    expect(last).toHaveFocus()
  })

  it('should restore focus to the previously focused element on unmount', () => {
    const outside = document.createElement('button')
    outside.textContent = 'Fuera del diálogo'
    document.body.appendChild(outside)
    outside.focus()
    expect(outside).toHaveFocus()

    const { unmount } = render(<Dialog />)
    expect(screen.getByText('Primero')).toHaveFocus()

    unmount()
    expect(outside).toHaveFocus()

    document.body.removeChild(outside)
  })
})
