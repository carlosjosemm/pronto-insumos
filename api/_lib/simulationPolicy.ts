/**
 * Payment-path policy helpers shared by the serverless payment endpoints.
 *
 * Simulated payment paths fabricate success without money moving, so they are only
 * allowed outside a production runtime — or when a human explicitly opts in with
 * ALLOW_SIMULATED_PAYMENTS=true (controlled demo deployments).
 *
 * Vercel sets VERCEL_ENV on every deployment ('production' | 'preview' | 'development');
 * local dev and Vitest leave it unset, which keeps simulation available there.
 */
export const MERCADOPAGO_TOKEN_PLACEHOLDER = 'YOUR_MERCADOPAGO_ACCESS_TOKEN'

export function isSimulatedPaymentAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_SIMULATED_PAYMENTS === 'true') return true
  return env.VERCEL_ENV !== 'production'
}

/**
 * A Mercado Pago access token counts as real only when it is set, non-blank and not
 * the `.env.example` placeholder. Shared by every endpoint so the definition cannot
 * drift between them.
 */
export function hasRealMercadoPagoToken(env: NodeJS.ProcessEnv = process.env): boolean {
  const token = (env.MERCADOPAGO_ACCESS_TOKEN || '').trim()
  return token !== '' && token !== MERCADOPAGO_TOKEN_PLACEHOLDER
}
