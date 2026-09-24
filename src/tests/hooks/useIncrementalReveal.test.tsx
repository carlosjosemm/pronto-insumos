import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import React from 'react'
import { useIncrementalReveal, PRODUCTS_PAGE_SIZE } from '../../hooks/useIncrementalReveal'

/** Minimal IntersectionObserver double: records observations, exposes manual triggers. */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  callback: IntersectionObserverCallback
  observed: Element[] = []
  disconnect = vi.fn()

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  observe(target: Element) {
    this.observed.push(target)
  }

  unobserve() {}

  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

const originalIO = globalThis.IntersectionObserver

beforeEach(() => {
  MockIntersectionObserver.instances = []
  globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver
})

afterEach(() => {
  globalThis.IntersectionObserver = originalIO
  cleanup()
  vi.clearAllMocks()
})

function Harness({ total }: { total: number }) {
  const { visibleCount, hasMore, revealMore, sentinelRef } = useIncrementalReveal(total)
  return (
    <div>
      <span data-testid="visible">{visibleCount}</span>
      <span data-testid="has-more">{String(hasMore)}</span>
      <button type="button" onClick={revealMore}>
        reveal
      </button>
      {hasMore && <div ref={sentinelRef} data-testid="sentinel" />}
    </div>
  )
}

describe('useIncrementalReveal (Task 8.7)', () => {
  it('starts at one page and reports hasMore for a long catalog', () => {
    render(<Harness total={75} />)

    expect(screen.getByTestId('visible')).toHaveTextContent(String(PRODUCTS_PAGE_SIZE))
    expect(screen.getByTestId('has-more')).toHaveTextContent('true')
    expect(screen.getByTestId('sentinel')).toBeInTheDocument()
    expect(MockIntersectionObserver.instances).toHaveLength(1)
    expect(MockIntersectionObserver.instances[0].observed).toEqual([screen.getByTestId('sentinel')])
  })

  it('reveals exactly one page per call', () => {
    render(<Harness total={75} />)

    fireEvent.click(screen.getByRole('button', { name: 'reveal' }))
    expect(screen.getByTestId('visible')).toHaveTextContent(String(PRODUCTS_PAGE_SIZE * 2))

    fireEvent.click(screen.getByRole('button', { name: 'reveal' }))
    expect(screen.getByTestId('visible')).toHaveTextContent(String(PRODUCTS_PAGE_SIZE * 3))
  })

  it('clamps the reveal at the end of the list and retires the sentinel', () => {
    render(<Harness total={20} />)

    fireEvent.click(screen.getByRole('button', { name: 'reveal' }))

    expect(screen.getByTestId('visible')).toHaveTextContent('20')
    expect(screen.getByTestId('has-more')).toHaveTextContent('false')
    expect(screen.queryByTestId('sentinel')).toBeNull()
  })

  it('reports hasMore=false for catalogs shorter than one page', () => {
    render(<Harness total={10} />)

    expect(screen.getByTestId('has-more')).toHaveTextContent('false')
    expect(screen.queryByTestId('sentinel')).toBeNull()
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

  it('auto-reveals when the sentinel intersects the viewport', () => {
    render(<Harness total={75} />)
    const observer = MockIntersectionObserver.instances[0]

    act(() => observer.trigger(true))

    expect(screen.getByTestId('visible')).toHaveTextContent(String(PRODUCTS_PAGE_SIZE * 2))
  })

  it('ignores non-intersecting sentinel notifications', () => {
    render(<Harness total={75} />)
    const observer = MockIntersectionObserver.instances[0]

    act(() => observer.trigger(false))

    expect(screen.getByTestId('visible')).toHaveTextContent(String(PRODUCTS_PAGE_SIZE))
  })

  it('disconnects the observer on unmount', () => {
    const { unmount } = render(<Harness total={75} />)
    const observer = MockIntersectionObserver.instances[0]

    unmount()

    expect(observer.disconnect).toHaveBeenCalled()
  })

  it('degrades safely when IntersectionObserver is unavailable', () => {
    // @ts-expect-error deliberately simulating a runtime without IntersectionObserver
    delete globalThis.IntersectionObserver

    render(<Harness total={75} />)

    expect(screen.getByTestId('visible')).toHaveTextContent(String(PRODUCTS_PAGE_SIZE))
    expect(MockIntersectionObserver.instances).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'reveal' }))
    expect(screen.getByTestId('visible')).toHaveTextContent(String(PRODUCTS_PAGE_SIZE * 2))
  })
})
