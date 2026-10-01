import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  PRODUCTION_HOST,
  assertSafeTarget,
  buildProbePlan,
  parseArgs,
  runProbes,
  summarize,
  type SmokeFetch,
  type SmokeProbe
} from '../../../scripts/smoke-preview'

/**
 * These suites cover the decision logic of the preview smoke test: what it
 * probes, what it refuses to probe, and how it classifies an answer. No request
 * leaves the process — every case injects a `fetch` double.
 */

/**
 * Builds a fetch double from a `"METHOD /path" → status` map, recording every
 * call. The key carries the method because the plan probes the admin order
 * endpoint twice — once as an `OPTIONS` preflight and once as an
 * unauthenticated `GET`.
 */
function stubFetch(byRoute: Record<string, number>): {
  fetchImpl: SmokeFetch
  calls: Array<{ url: string; init: { method: string; headers?: Record<string, string>; body?: string } }>
} {
  const calls: Array<{ url: string; init: { method: string; headers?: Record<string, string>; body?: string } }> = []
  const fetchImpl: SmokeFetch = async (url, init) => {
    calls.push({ url, init })
    const route = `${init.method} ${new URL(url).pathname}`
    const status = byRoute[route]
    if (status === undefined) throw new Error(`unexpected probe route: ${route}`)
    return { status }
  }
  return { fetchImpl, calls }
}

/** Every probe in the plan answered with its own first expected status. */
function healthyPlanStatuses(probes: SmokeProbe[]): Record<string, number> {
  return Object.fromEntries(probes.map((probe) => [`${probe.method} ${probe.path}`, probe.expectedStatuses[0]]))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('smoke-preview — probe plan', () => {
  it('covers both shells, the routed admin dispatcher and every public endpoint', () => {
    const paths = buildProbePlan().map((probe) => probe.path)

    expect(paths).toContain('/')
    expect(paths).toContain('/admin')
    expect(paths).toContain('/api/webhooks/mercadopago')
    expect(paths).toContain('/api/admin/orders')
    expect(paths).toContain('/api/create-preference')
    expect(paths).toContain('/api/track-order')
    expect(paths).toContain('/api/upload-voucher')
    expect(paths).toContain('/api/order-confirmation')
  })

  it('gives every probe a unique name and at least one acceptable status', () => {
    const probes = buildProbePlan()

    expect(new Set(probes.map((probe) => probe.name)).size).toBe(probes.length)
    for (const probe of probes) {
      expect(probe.expectedStatuses.length).toBeGreaterThan(0)
      expect(probe.path.startsWith('/')).toBe(true)
    }
  })

  it('never expects a 5xx or a 2xx from the unauthenticated admin read', () => {
    const probes = buildProbePlan()
    const adminRead = probes.find((probe) => probe.method === 'GET' && probe.path === '/api/admin/orders')

    expect(adminRead?.expectedStatuses).toEqual([403])
    for (const probe of probes) {
      expect(probe.expectedStatuses.every((status) => status < 500)).toBe(true)
    }
  })
})

describe('smoke-preview — target safety', () => {
  it('accepts a preview host and a localhost origin', () => {
    expect(assertSafeTarget('https://pronto-insumos-abc123.vercel.app')).toBe(
      'https://pronto-insumos-abc123.vercel.app'
    )
    expect(assertSafeTarget('http://localhost:3000/')).toBe('http://localhost:3000')
    expect(assertSafeTarget('  https://pronto-insumos-git-feat.vercel.app  ')).toBe(
      'https://pronto-insumos-git-feat.vercel.app'
    )
  })

  it('refuses the production host and its subdomains', () => {
    expect(() => assertSafeTarget(`https://${PRODUCTION_HOST}`)).toThrow(/producción/)
    expect(() => assertSafeTarget(`https://www.${PRODUCTION_HOST}`)).toThrow(/producción/)
  })

  it('refuses an empty, malformed or non-http target', () => {
    expect(() => assertSafeTarget('')).toThrow(/--base/)
    expect(() => assertSafeTarget(undefined)).toThrow(/--base/)
    expect(() => assertSafeTarget('not a url')).toThrow(/no es una URL válida/)
    expect(() => assertSafeTarget('ftp://pronto-insumos-abc.vercel.app')).toThrow(/http o https/)
  })

  it('refuses a target carrying a path, query or fragment', () => {
    expect(() => assertSafeTarget('https://pronto-insumos-abc.vercel.app/admin')).toThrow(/sin ruta/)
    expect(() => assertSafeTarget('https://pronto-insumos-abc.vercel.app/?x=1')).toThrow(/sin ruta/)
    expect(() => assertSafeTarget('https://pronto-insumos-abc.vercel.app/#orders')).toThrow(/sin ruta/)
  })
})

describe('smoke-preview — runProbes', () => {
  it('passes every probe on a healthy preview and sends no Authorization header', async () => {
    const probes = buildProbePlan()
    const { fetchImpl, calls } = stubFetch(healthyPlanStatuses(probes))

    const results = await runProbes('https://pronto-insumos-abc.vercel.app', probes, fetchImpl)

    expect(results.every((result) => result.ok)).toBe(true)
    expect(summarize(results)).toEqual({ passed: probes.length, failed: 0, exitCode: 0 })
    expect(calls).toHaveLength(probes.length)
    for (const call of calls) {
      expect(call.init.headers?.Authorization).toBeUndefined()
    }
  })

  it('sends the POST probes as JSON and keeps the GET probes body-less', async () => {
    const probes = buildProbePlan()
    const { fetchImpl, calls } = stubFetch(healthyPlanStatuses(probes))

    await runProbes('https://pronto-insumos-abc.vercel.app', probes, fetchImpl)

    const post = calls.find((call) => call.init.method === 'POST')
    expect(post?.init.headers?.['Content-Type']).toBe('application/json')
    expect(post?.init.body).toBe('{}')

    const get = calls.find((call) => call.init.method === 'GET')
    expect(get?.init.body).toBeUndefined()
  })

  it('fails a probe whose status is not the expected one, reporting what arrived', async () => {
    const probes = buildProbePlan()
    const statuses = healthyPlanStatuses(probes)
    statuses['GET /api/admin/orders'] = 200
    const { fetchImpl } = stubFetch(statuses)

    const results = await runProbes('https://pronto-insumos-abc.vercel.app', probes, fetchImpl)
    const adminRead = results.find(
      (result) => result.probe.path === '/api/admin/orders' && result.probe.method === 'GET'
    )

    expect(adminRead?.ok).toBe(false)
    expect(adminRead?.detail).toContain('HTTP 200')
    expect(adminRead?.detail).toContain('403')
    expect(summarize(results).exitCode).toBe(1)
  })

  it('labels a 5xx as a runtime/ESM failure rather than a status mismatch', async () => {
    const probes = buildProbePlan()
    const statuses = healthyPlanStatuses(probes)
    statuses['GET /api/webhooks/mercadopago'] = 500
    const { fetchImpl } = stubFetch(statuses)

    const results = await runProbes('https://pronto-insumos-abc.vercel.app', probes, fetchImpl)
    const webhook = results.find((result) => result.probe.path === '/api/webhooks/mercadopago')

    expect(webhook?.ok).toBe(false)
    expect(webhook?.status).toBe(500)
    expect(webhook?.detail).toContain('runtime/ESM')
  })

  it('records a transport failure instead of aborting the run', async () => {
    const probes = buildProbePlan()
    const statuses = healthyPlanStatuses(probes)
    const { fetchImpl } = stubFetch(statuses)
    const failing: SmokeFetch = async (url, init) => {
      if (new URL(url).pathname === '/') throw new Error('getaddrinfo ENOTFOUND')
      return fetchImpl(url, init)
    }

    const results = await runProbes('https://pronto-insumos-abc.vercel.app', probes, failing)
    const storefront = results.find((result) => result.probe.path === '/')

    expect(storefront?.ok).toBe(false)
    expect(storefront?.status).toBeNull()
    expect(storefront?.detail).toContain('sin respuesta')
    expect(storefront?.detail).toContain('ENOTFOUND')
    expect(results.filter((result) => result.ok).length).toBe(probes.length - 1)
  })
})

describe('smoke-preview — parseArgs', () => {
  it('reads --base in both spellings', () => {
    expect(parseArgs(['--base=https://a.vercel.app']).base).toBe('https://a.vercel.app')
    expect(parseArgs(['--base', 'https://a.vercel.app']).base).toBe('https://a.vercel.app')
  })

  it('flags --help and tolerates unrelated pnpm arguments', () => {
    expect(parseArgs(['--help']).help).toBe(true)
    expect(parseArgs(['-h']).help).toBe(true)
    expect(parseArgs(['--base=https://a.vercel.app', '--silent']).base).toBe('https://a.vercel.app')
  })

  it('returns an empty base when the flag is missing or dangling', () => {
    expect(parseArgs([]).base).toBe('')
    expect(parseArgs(['--base']).base).toBe('')
  })
})

describe('smoke-preview — import safety', () => {
  /**
   * The direct-invocation guard is what keeps this module importable by the
   * suite without probing anything. The test supplies a *valid* `--base` and a
   * recording `fetch` double before importing, so if the guard were removed the
   * import would run `main()` and actually issue probes — which is the only way
   * this case can fail. With the guard in place nothing is requested.
   */
  it('performs no outbound request merely by being imported', async () => {
    const fetchSpy = vi.fn(async () => ({ status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const originalArgv = process.argv
    process.argv = [...originalArgv.slice(0, 2), '--base=https://pronto-insumos-abc123.vercel.app']
    try {
      vi.resetModules()
      await import('../../../scripts/smoke-preview')
      // Let any un-awaited `main()` (which the guard should have prevented)
      // reach its first request before asserting.
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      process.argv = originalArgv
    }

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
