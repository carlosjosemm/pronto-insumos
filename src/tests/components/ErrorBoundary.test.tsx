import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import ErrorBoundary from '../../components/ErrorBoundary'

const ProblemChild = () => {
  throw new Error('Test crash in child component')
}

const GoodChild = () => <div>All Good</div>

describe('ErrorBoundary component', () => {
  it('should render children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    )
    expect(screen.getByText('All Good')).toBeInTheDocument()
  })

  it('should catch error and render fallback UI when a child component crashes', () => {
    // Suppress console.error output during crash test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    )

    expect(screen.getByText('Inconveniente Inesperado')).toBeInTheDocument()
    expect(screen.getByText('Reintentar y Recargar Tienda')).toBeInTheDocument()
    expect(screen.getByText('Soporte Directo por WhatsApp')).toBeInTheDocument()

    consoleSpy.mockRestore()
  })
})
