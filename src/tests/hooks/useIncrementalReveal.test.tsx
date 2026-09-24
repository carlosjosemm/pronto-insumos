import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { useIncrementalReveal, PRODUCTS_PAGE_SIZE } from '../../hooks/useIncrementalReveal'

afterEach(() => {
  cleanup()
})

function Harness({ total }: { total: number }) {
  const { visibleCount, hasMore, revealMore } = useIncrementalReveal(total)
  return (
    <div>
      <span data-testid="visible">{visibleCount}</span>
      <span data-testid="has-more">{String(hasMore)}</span>
      <button type="button" onClick={revealMore}>
        reveal
      </button>
      {hasMore && <div data-testid="controls" />}
    </div>
  )
}

describe('useIncrementalReveal (Task 8.7)', () => {
  it('starts at one page and reports hasMore for a long catalog', () => {
    render(<Harness total={75} />)

    expect(screen.getByTestId('visible')).toHaveTextContent(String(PRODUCTS_PAGE_SIZE))
    expect(screen.getByTestId('has-more')).toHaveTextContent('true')
    expect(screen.getByTestId('controls')).toBeInTheDocument()
  })

  it('reveals exactly one page per call', () => {
    render(<Harness total={75} />)

    fireEvent.click(screen.getByRole('button', { name: 'reveal' }))
    expect(screen.getByTestId('visible')).toHaveTextContent(String(PRODUCTS_PAGE_SIZE * 2))

    fireEvent.click(screen.getByRole('button', { name: 'reveal' }))
    expect(screen.getByTestId('visible')).toHaveTextContent(String(PRODUCTS_PAGE_SIZE * 3))
  })

  it('clamps the reveal at the end of the list', () => {
    render(<Harness total={20} />)

    fireEvent.click(screen.getByRole('button', { name: 'reveal' }))

    expect(screen.getByTestId('visible')).toHaveTextContent('20')
    expect(screen.getByTestId('has-more')).toHaveTextContent('false')
    expect(screen.queryByTestId('controls')).toBeNull()
  })

  it('reports hasMore=false for catalogs shorter than one page', () => {
    render(<Harness total={10} />)

    expect(screen.getByTestId('has-more')).toHaveTextContent('false')
    expect(screen.queryByTestId('controls')).toBeNull()
  })

  it('derives the clamp when the result set shrinks, without an effect', () => {
    const { rerender } = render(<Harness total={75} />)

    fireEvent.click(screen.getByRole('button', { name: 'reveal' }))
    fireEvent.click(screen.getByRole('button', { name: 'reveal' }))
    expect(screen.getByTestId('visible')).toHaveTextContent(String(PRODUCTS_PAGE_SIZE * 3))

    rerender(<Harness total={20} />)

    expect(screen.getByTestId('visible')).toHaveTextContent('20')
    expect(screen.getByTestId('has-more')).toHaveTextContent('false')
  })
})
