import { describe, it, expect } from 'vitest'
import { hasRealMercadoPagoToken, isSimulatedPaymentAllowed } from '../../../api/_lib/simulationPolicy'

describe('Payment simulation policy (api/_lib/simulationPolicy)', () => {
  it('should allow simulation when VERCEL_ENV is unset (local dev and Vitest)', () => {
    expect(isSimulatedPaymentAllowed({})).toBe(true)
  })

  it('should allow simulation on Vercel preview and development runtimes', () => {
    expect(isSimulatedPaymentAllowed({ VERCEL_ENV: 'preview' })).toBe(true)
    expect(isSimulatedPaymentAllowed({ VERCEL_ENV: 'development' })).toBe(true)
  })

  it('should block simulation on a production runtime', () => {
    expect(isSimulatedPaymentAllowed({ VERCEL_ENV: 'production' })).toBe(false)
  })

  it('should allow simulation in production only with the explicit ALLOW_SIMULATED_PAYMENTS=true opt-in', () => {
    expect(isSimulatedPaymentAllowed({ VERCEL_ENV: 'production', ALLOW_SIMULATED_PAYMENTS: 'true' })).toBe(true)
  })

  it('should keep simulation blocked in production for non-"true" opt-in values', () => {
    for (const value of ['false', 'TRUE', '1', 'yes', '']) {
      expect(isSimulatedPaymentAllowed({ VERCEL_ENV: 'production', ALLOW_SIMULATED_PAYMENTS: value })).toBe(false)
    }
  })

  it('should read process.env by default', () => {
    const originalVercelEnv = process.env.VERCEL_ENV
    process.env.VERCEL_ENV = 'production'
    try {
      expect(isSimulatedPaymentAllowed()).toBe(false)
    } finally {
      if (originalVercelEnv === undefined) {
        delete process.env.VERCEL_ENV
      } else {
        process.env.VERCEL_ENV = originalVercelEnv
      }
    }
  })

  describe('hasRealMercadoPagoToken', () => {
    it('should accept a real access token', () => {
      expect(hasRealMercadoPagoToken({ MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-VALID-TOKEN-XYZ' })).toBe(true)
    })

    it('should reject the .env.example placeholder', () => {
      expect(hasRealMercadoPagoToken({ MERCADOPAGO_ACCESS_TOKEN: 'YOUR_MERCADOPAGO_ACCESS_TOKEN' })).toBe(false)
    })

    it('should reject missing and blank tokens', () => {
      expect(hasRealMercadoPagoToken({})).toBe(false)
      expect(hasRealMercadoPagoToken({ MERCADOPAGO_ACCESS_TOKEN: '   ' })).toBe(false)
    })

    it('should trim before comparing so padded values keep their meaning', () => {
      expect(hasRealMercadoPagoToken({ MERCADOPAGO_ACCESS_TOKEN: '  YOUR_MERCADOPAGO_ACCESS_TOKEN  ' })).toBe(false)
      expect(hasRealMercadoPagoToken({ MERCADOPAGO_ACCESS_TOKEN: '  APP_USR-VALID-TOKEN-XYZ  ' })).toBe(true)
    })
  })
})
