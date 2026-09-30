import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  SESSION_ORDER_STORAGE_KEY,
  rememberSessionOrderId,
  getSessionOrderId,
  isSessionOrder,
  forgetSessionOrderId
} from '../../services/orderSession'

/**
 * The session marker that decides whether a Mercado Pago return URL
 * may reset the shopper's cart. Every case here is a security-relevant branch:
 * the marker must match only the order this tab created, and must fail safe
 * (no match, no throw) whenever the session store is unavailable.
 */

/**
 * jsdom's `Storage` is a Proxy, so `vi.spyOn(storage, 'setItem')` installs a spy
 * that never intercepts (verified: no own descriptor, zero recorded calls).
 * Swap the whole `window.sessionStorage` property instead — that is also what a
 * locked-down browser actually presents to the module.
 */
function replaceSessionStorage(value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
  Object.defineProperty(window, 'sessionStorage', { value, configurable: true, writable: true })

  return () => {
    if (original) {
      Object.defineProperty(window, 'sessionStorage', original)
    } else {
      Reflect.deleteProperty(window, 'sessionStorage')
    }
  }
}

/** A store whose every access throws — quota exceeded, private mode, disabled storage. */
function createThrowingStorage(message: string): Storage {
  const boom = () => {
    throw new Error(message)
  }
  return { getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 } as unknown as Storage
}

describe('orderSession service (Task 2.12)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    window.sessionStorage.clear()
    vi.restoreAllMocks()
  })

  describe('rememberSessionOrderId & getSessionOrderId', () => {
    it('should record the canonical order id under the session key', () => {
      rememberSessionOrderId('PRONTO-ABCD1234')

      expect(window.sessionStorage.getItem(SESSION_ORDER_STORAGE_KEY)).toBe('PRONTO-ABCD1234')
      expect(getSessionOrderId()).toBe('PRONTO-ABCD1234')
    })

    it('should normalize a padded, lower-case id before storing it', () => {
      rememberSessionOrderId('  pronto-abcd1234 ')

      expect(window.sessionStorage.getItem(SESSION_ORDER_STORAGE_KEY)).toBe('PRONTO-ABCD1234')
      expect(getSessionOrderId()).toBe('PRONTO-ABCD1234')
    })

    it('should keep only the most recent order created in the tab', () => {
      rememberSessionOrderId('PRONTO-AAAA1111')
      rememberSessionOrderId('PRONTO-BBBB2222')

      expect(getSessionOrderId()).toBe('PRONTO-BBBB2222')
    })

    it('should return null when the tab has not created an order', () => {
      expect(getSessionOrderId()).toBeNull()
    })

    it('should not write a marker for empty, null, undefined or non-string ids', () => {
      rememberSessionOrderId('')
      rememberSessionOrderId('   ')
      rememberSessionOrderId(null)
      rememberSessionOrderId(undefined)
      // @ts-expect-error deliberate invalid input to assert runtime resilience
      rememberSessionOrderId(42)

      expect(window.sessionStorage.getItem(SESSION_ORDER_STORAGE_KEY)).toBeNull()
      expect(getSessionOrderId()).toBeNull()
    })

    it('should degrade to a no-op when sessionStorage.setItem throws', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const restore = replaceSessionStorage(createThrowingStorage('QuotaExceededError: DOM Exception 22'))

      try {
        expect(() => rememberSessionOrderId('PRONTO-ABCD1234')).not.toThrow()
        expect(warnSpy).toHaveBeenCalled()
      } finally {
        restore()
      }
    })

    it('should return null and warn when sessionStorage.getItem throws', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const restore = replaceSessionStorage(createThrowingStorage('SecurityError: storage disabled by the browser'))

      try {
        expect(getSessionOrderId()).toBeNull()
        expect(warnSpy).toHaveBeenCalled()
      } finally {
        restore()
      }
    })

    it('should fail safe when window.sessionStorage itself is unavailable', () => {
      const restore = replaceSessionStorage(undefined)

      try {
        expect(() => rememberSessionOrderId('PRONTO-ABCD1234')).not.toThrow()
        expect(getSessionOrderId()).toBeNull()
        expect(isSessionOrder('PRONTO-ABCD1234')).toBe(false)
      } finally {
        restore()
      }
    })
  })

  describe('forgetSessionOrderId', () => {
    it('should drop the marker so a replayed return URL can no longer match', () => {
      rememberSessionOrderId('PRONTO-ABCD1234')
      expect(isSessionOrder('PRONTO-ABCD1234')).toBe(true)

      forgetSessionOrderId()

      expect(window.sessionStorage.getItem(SESSION_ORDER_STORAGE_KEY)).toBeNull()
      expect(getSessionOrderId()).toBeNull()
      expect(isSessionOrder('PRONTO-ABCD1234')).toBe(false)
    })

    it('should be idempotent and safe with no marker present', () => {
      expect(() => {
        forgetSessionOrderId()
        forgetSessionOrderId()
      }).not.toThrow()
      expect(getSessionOrderId()).toBeNull()
    })

    it('should not throw when sessionStorage.removeItem throws', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const restore = replaceSessionStorage(createThrowingStorage('SecurityError: storage disabled by the browser'))

      try {
        expect(() => forgetSessionOrderId()).not.toThrow()
        expect(warnSpy).toHaveBeenCalled()
      } finally {
        restore()
      }
    })
  })

  describe('isSessionOrder', () => {
    it('should match the recorded id regardless of case or surrounding whitespace', () => {
      rememberSessionOrderId('PRONTO-ABCD1234')

      expect(isSessionOrder('PRONTO-ABCD1234')).toBe(true)
      expect(isSessionOrder('pronto-abcd1234')).toBe(true)
      expect(isSessionOrder('  PRONTO-ABCD1234 ')).toBe(true)
    })

    it('should reject any other order id', () => {
      rememberSessionOrderId('PRONTO-ABCD1234')

      expect(isSessionOrder('PRONTO-ZZZZ9999')).toBe(false)
    })

    it('should reject empty, null, undefined and non-string ids without throwing', () => {
      rememberSessionOrderId('PRONTO-ABCD1234')

      expect(isSessionOrder('')).toBe(false)
      expect(isSessionOrder('   ')).toBe(false)
      expect(isSessionOrder(null)).toBe(false)
      expect(isSessionOrder(undefined)).toBe(false)
      // @ts-expect-error deliberate invalid input to assert runtime resilience
      expect(isSessionOrder(1234)).toBe(false)
    })

    it('should never match when the tab has not created an order', () => {
      expect(isSessionOrder('PRONTO-ABCD1234')).toBe(false)
    })
  })
})
