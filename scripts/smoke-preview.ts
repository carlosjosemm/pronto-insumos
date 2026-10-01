#!/usr/bin/env tsx
/**
 * Read-only preview smoke probe for a PRONTO deployment.
 *
 * Why this exists: a green `vite build` proves nothing about the deployed app.
 * Every serverless function under `api/` can answer HTTP 500
 * `FUNCTION_INVOCATION_FAILED` *after* a successful build when Node's ESM
 * resolver rejects an extensionless relative import or the pinned `jose`
 * override regresses. That failure is invisible in the build log and only
 * appears at request time, so the release gate needs a request-time probe.
 *
 * What this tool does NOT prove, and must not be read as proving: the `GET /`
 * and `GET /admin` probes assert only that the HTML shell is served. They
 * cannot detect the storefront blank page caused by a module-scope `getAuth()`
 * throwing on a bad Firebase API key, because a server-side request never
 * executes the client bundle — only the manual browser step in the
 * credential-bearing half of the release gate catches that.
 *
 * Every probe below is a read or a validation-failure path that returns before
 * any Firestore or Storage access, so running it against a preview can never
 * create, mutate or delete an order, a product or a stored object — and no
 * probe needs a credential. The credential-bearing half of the release gate
 * (a test checkout, a test payment, an admin stock adjustment) stays manual:
 * it must use Mercado Pago TEST credentials and non-customer test data only,
 * and it must never be pointed at production.
 *
 * Usage:
 *   pnpm run smoke:preview -- --base=https://pronto-insumos-abc123.vercel.app
 *
 * Flags:
 *   --base <url>   REQUIRED. http(s) origin of the preview to probe.
 *   --help         Show this message.
 *
 * Note: a preview behind Vercel Deployment Protection answers every probe with
 * a login redirect or a 401, so all probes fail. Disable protection for the
 * preview under test, or smoke the deployment through the sharing link.
 */

import { pathToFileURL } from 'node:url'

/**
 * The production host this tool refuses to probe. The release gate is meant to
 * run against a preview deployment, and a probe set that can be aimed at the
 * live storefront is one typo away from running against real traffic.
 */
export const PRODUCTION_HOST = 'pronto-insumos.vercel.app'

/** One request in the probe plan and the statuses that count as healthy. */
export interface SmokeProbe {
  name: string
  method: 'GET' | 'POST' | 'OPTIONS'
  path: string
  body?: Record<string, unknown>
  expectedStatuses: number[]
}

/** The outcome of one probe, kept plain so the report is trivially testable. */
export interface SmokeResult {
  probe: SmokeProbe
  /** `null` when the request never produced a response (DNS, TLS, timeout). */
  status: number | null
  ok: boolean
  detail: string
}

/**
 * The subset of `fetch` this tool uses. Declared structurally so a test can
 * inject a stub without constructing a real `Response`.
 */
export type SmokeFetch = (
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string }
) => Promise<{ status: number }>

/**
 * The credential-free probe plan.
 *
 * `GET /api/webhooks/mercadopago` is the Mercado Pago ping: it answers `200`
 * without a signature and touches no store, which makes it the cheapest proof
 * that a public function module actually loads under the deployed runtime.
 *
 * The two admin probes together prove that the routed dispatcher resolved the
 * action and that the handler module loaded — the handler's static imports
 * reach `firebase-admin/auth`, which is where a `jose`/ESM regression surfaces.
 * They cannot prove the admin *configuration*: `verifyAdminToken` answers
 * "not authenticated" both for a missing bearer token and for an unconfigured
 * Admin SDK, so `403` covers a healthy deployment and a credential-less one
 * alike. The `OPTIONS` answer is likewise produced before any CORS header is
 * set, so it proves the route exists, not that the headers are right.
 */
export function buildProbePlan(): SmokeProbe[] {
  return [
    { name: 'Storefront shell served (not a blank-page check)', method: 'GET', path: '/', expectedStatuses: [200] },
    { name: 'Admin shell served', method: 'GET', path: '/admin', expectedStatuses: [200] },
    {
      name: 'Webhook runtime (Mercado Pago ping)',
      method: 'GET',
      path: '/api/webhooks/mercadopago',
      expectedStatuses: [200]
    },
    {
      name: 'Admin route answers preflight',
      method: 'OPTIONS',
      path: '/api/admin/orders',
      expectedStatuses: [200]
    },
    {
      name: 'Admin route refuses an unauthenticated read',
      method: 'GET',
      path: '/api/admin/orders',
      expectedStatuses: [403]
    },
    {
      name: 'create-preference validates before pricing',
      method: 'POST',
      path: '/api/create-preference',
      body: {},
      expectedStatuses: [400]
    },
    {
      name: 'track-order validates before the dual-factor lookup',
      method: 'POST',
      path: '/api/track-order',
      body: {},
      expectedStatuses: [400]
    },
    {
      name: 'upload-voucher validates before signing',
      method: 'POST',
      path: '/api/upload-voucher',
      body: {},
      expectedStatuses: [400]
    },
    {
      name: 'order-confirmation validates before sending',
      method: 'POST',
      path: '/api/order-confirmation',
      body: {},
      expectedStatuses: [400]
    }
  ]
}

/**
 * Normalizes and validates the probe target.
 *
 * Rejects a missing value, a non-http(s) scheme, a URL carrying a path, query
 * or fragment, and the production host — so the tool cannot be aimed at the
 * live storefront, nor at a deep link that would change what the probes mean.
 * Returns the bare origin (no trailing slash).
 */
export function assertSafeTarget(rawBase: unknown): string {
  const value = typeof rawBase === 'string' ? rawBase.trim() : ''
  if (!value) {
    throw new Error(
      'Falta --base: indica el origen del preview a probar (por ejemplo https://pronto-insumos-abc123.vercel.app).'
    )
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`--base no es una URL válida: "${value}".`)
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`--base debe usar http o https: "${value}".`)
  }

  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error(`--base debe ser un origen sin ruta ni parámetros: "${value}".`)
  }

  // The exact production host and any subdomain of it (`www.…`) are refused;
  // a preview host such as `pronto-insumos-git-branch.vercel.app` is not a
  // subdomain and stays allowed.
  const hostname = url.hostname.toLowerCase()
  if (hostname === PRODUCTION_HOST || hostname.endsWith(`.${PRODUCTION_HOST}`)) {
    throw new Error(
      `--base apunta al host de producción ("${PRODUCTION_HOST}"). El smoke test solo corre contra un preview.`
    )
  }

  return `${url.protocol}//${url.host}`
}

/** Runs one probe and classifies the answer. Never throws. */
async function runProbe(base: string, probe: SmokeProbe, fetchImpl: SmokeFetch): Promise<SmokeResult> {
  const url = `${base}${probe.path}`
  try {
    const response = await fetchImpl(url, {
      method: probe.method,
      // No Authorization header is ever sent: every probe is either public or
      // an explicit unauthenticated request whose whole point is to be refused.
      headers: probe.body ? { 'Content-Type': 'application/json' } : undefined,
      body: probe.body ? JSON.stringify(probe.body) : undefined
    })

    if (probe.expectedStatuses.includes(response.status)) {
      return { probe, status: response.status, ok: true, detail: `HTTP ${response.status}` }
    }

    if (response.status >= 500) {
      return {
        probe,
        status: response.status,
        ok: false,
        detail: `HTTP ${response.status} — fallo de runtime/ESM o de configuración del proveedor (un build verde no lo detecta)`
      }
    }

    return {
      probe,
      status: response.status,
      ok: false,
      detail: `HTTP ${response.status} — se esperaba ${probe.expectedStatuses.join('/')}`
    }
  } catch (err: unknown) {
    return {
      probe,
      status: null,
      ok: false,
      detail: `sin respuesta: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

/** Runs the whole plan, in order, so the report reads top-down. */
export async function runProbes(
  base: string,
  probes: SmokeProbe[],
  fetchImpl: SmokeFetch = fetch
): Promise<SmokeResult[]> {
  const results: SmokeResult[] = []
  for (const probe of probes) {
    results.push(await runProbe(base, probe, fetchImpl))
  }
  return results
}

/** Totals for the report; `exitCode` is non-zero when any probe failed. */
export function summarize(results: SmokeResult[]): { passed: number; failed: number; exitCode: number } {
  const passed = results.filter((result) => result.ok).length
  const failed = results.length - passed
  return { passed, failed, exitCode: failed > 0 ? 1 : 0 }
}

const USAGE = [
  'Smoke test de solo lectura contra un preview de PRONTO.',
  '',
  'Uso:',
  '  pnpm run smoke:preview -- --base=https://pronto-insumos-abc123.vercel.app',
  '',
  'Flags:',
  '  --base <url>   Obligatorio. Origen http(s) del preview a probar.',
  '  --help         Muestra esta ayuda.'
].join('\n')

/** Reads `--base` from argv. Unknown flags are ignored so `pnpm run` noise is harmless. */
export function parseArgs(argv: string[]): { base: string; help: boolean } {
  let base = ''
  let help = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--base') {
      base = argv[i + 1] ?? ''
      i++
    } else if (arg.startsWith('--base=')) {
      base = arg.slice('--base='.length)
    }
  }
  return { base, help }
}

async function main(): Promise<void> {
  const { base, help } = parseArgs(process.argv.slice(2))

  if (help) {
    console.log(USAGE)
    return
  }

  let target: string
  try {
    target = assertSafeTarget(base)
  } catch (err: unknown) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`)
    console.log(USAGE)
    process.exitCode = 1
    return
  }

  const probes = buildProbePlan()
  console.log(`\nSmoke test de solo lectura contra ${target} (${probes.length} sondas)\n`)

  const results = await runProbes(target, probes)

  for (const result of results) {
    console.log(`  ${result.ok ? 'PASS' : 'FAIL'}  ${result.probe.method} ${result.probe.path} — ${result.detail}`)
    if (!result.ok) console.log(`        (${result.probe.name})`)
  }

  const { passed, failed, exitCode } = summarize(results)
  console.log(`\n${passed}/${results.length} sondas OK, ${failed} con falla.`)

  if (failed > 0) {
    console.log(
      '\nRevisa los logs de la función en Vercel: un 500 suele ser un import relativo sin extensión .js o el override de jose.\n'
    )
  } else {
    console.log(
      '\nFalta la mitad con credenciales (manual): checkout y pago de prueba, comprobante de transferencia, login admin + lectura y ajuste de stock — solo con credenciales TEST y datos que no sean de clientes.\n'
    )
  }

  process.exitCode = exitCode
}

// Only probe when executed directly (`tsx scripts/smoke-preview.ts`), so the
// pure planner/runner/summarizer above can be imported by tests without
// generating any outbound request.
const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  })
}
