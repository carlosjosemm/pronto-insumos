/**
 * Client-side mirror of `api/_lib/simulationPolicy.ts` (Task 0.10).
 *
 * Simulated fallbacks in `src/services/` are allowed only outside a production
 * runtime — `VITE_VERCEL_ENV` is the build-time define `vite.config.ts` injects
 * from `process.env.VERCEL_ENV` — or with the explicit `VITE_ALLOW_SIMULATED_PAYMENTS=true`
 * opt-in for controlled demo deployments. Real HTTP error responses must always
 * surface as errors to the customer (Task 2.8).
 */
export function isSimulatedFallbackAllowed(env: ImportMetaEnv = import.meta.env): boolean {
  if (env.VITE_ALLOW_SIMULATED_PAYMENTS === 'true') return true
  return env.VITE_VERCEL_ENV !== 'production'
}
