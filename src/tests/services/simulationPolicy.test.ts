import { describe, it, expect } from 'vitest'
import { isSimulatedFallbackAllowed } from '../../services/simulationPolicy'

const envWith = (vars: Record<string, string>) => vars as unknown as ImportMetaEnv

describe('Client simulation policy (src/services/simulationPolicy, Task 2.8)', () => {
  it('allows simulated fallbacks when VITE_VERCEL_ENV is unset (local dev / Vitest)', () => {
    expect(isSimulatedFallbackAllowed(envWith({}))).toBe(true)
  })

  it('allows simulated fallbacks for preview and development runtimes', () => {
    expect(isSimulatedFallbackAllowed(envWith({ VITE_VERCEL_ENV: 'preview' }))).toBe(true)
    expect(isSimulatedFallbackAllowed(envWith({ VITE_VERCEL_ENV: 'development' }))).toBe(true)
  })

  it('blocks simulated fallbacks in a production runtime', () => {
    expect(isSimulatedFallbackAllowed(envWith({ VITE_VERCEL_ENV: 'production' }))).toBe(false)
  })

  it('honors the explicit VITE_ALLOW_SIMULATED_PAYMENTS=true escape hatch in production', () => {
    expect(
      isSimulatedFallbackAllowed(envWith({ VITE_VERCEL_ENV: 'production', VITE_ALLOW_SIMULATED_PAYMENTS: 'true' }))
    ).toBe(true)
  })

  it('requires the exact string "true" for the escape hatch', () => {
    expect(
      isSimulatedFallbackAllowed(envWith({ VITE_VERCEL_ENV: 'production', VITE_ALLOW_SIMULATED_PAYMENTS: 'TRUE' }))
    ).toBe(false)
    expect(
      isSimulatedFallbackAllowed(envWith({ VITE_VERCEL_ENV: 'production', VITE_ALLOW_SIMULATED_PAYMENTS: '1' }))
    ).toBe(false)
    expect(
      isSimulatedFallbackAllowed(envWith({ VITE_VERCEL_ENV: 'production', VITE_ALLOW_SIMULATED_PAYMENTS: 'false' }))
    ).toBe(false)
  })
})
