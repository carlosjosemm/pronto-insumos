import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Static contract test for the edge security headers in `vercel.json`.
 *
 * These headers are the only thing standing between the backoffice and a
 * click-jacked *Aprobar Transferencia* / *Marcar Despachado* button, so they are
 * asserted here rather than trusted to a review of the JSON: the file is parsed,
 * the rules are located by `source`, and each policy is split into directives so
 * a directive cannot silently disappear inside the string.
 *
 * The suite also pins the *staged* rollout: the full policy must stay
 * report-only until the owner has verified it on a preview deployment, because
 * enforcing a wrong `connect-src`/`style-src` breaks the storefront for real
 * customers.
 */

const rootDir = path.resolve(__dirname, '../../../')

interface HeaderEntry {
  key: string
  value: string
}
interface HeaderRule {
  source: string
  headers: HeaderEntry[]
}

function loadConfig(): { rewrites: Array<{ source: string; destination: string }>; headers: HeaderRule[] } {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'))
}

function ruleFor(config: { headers: HeaderRule[] }, source: string): HeaderRule | undefined {
  return config.headers.find((rule) => rule.source === source)
}

function headerValue(rule: HeaderRule | undefined, key: string): string | undefined {
  return rule?.headers.find((header) => header.key === key)?.value
}

/** Splits a CSP string into `directive → tokens`, so a missing directive fails loudly. */
function parseCsp(value: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {}
  for (const chunk of value.split(';')) {
    const parts = chunk.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) continue
    const [name, ...tokens] = parts
    directives[name.toLowerCase()] = tokens
  }
  return directives
}

const config = loadConfig()
const globalRule = ruleFor(config, '/((?!api/).*)')
const reportOnlyCsp = headerValue(globalRule, 'Content-Security-Policy-Report-Only')

/**
 * Every URL that serves the admin bundle must be anti-framed. The two rewrite
 * sources are not enough: `dist/admin.html` is also a real static file, so
 * `/admin.html` reaches the same logged-in backoffice without passing through a
 * rewrite — and without this third rule it would fall through to the global
 * rule, which carries no enforcing anti-framing header.
 */
const ADMIN_FRAME_GUARDED_SOURCES = ['/admin', '/admin.html', '/admin/:path*']

describe('Edge security headers (vercel.json)', () => {
  it('keeps the existing rewrites intact', () => {
    expect(config.rewrites).toEqual([
      { source: '/admin/:path*', destination: '/admin.html' },
      { source: '/admin', destination: '/admin.html' },
      { source: '/((?!api/).*)', destination: '/index.html' }
    ])
  })

  it('applies the page headers to every non-api path and to no api path', () => {
    expect(globalRule).toBeDefined()
    expect(globalRule?.headers.length).toBeGreaterThan(0)

    // The source contains no path-to-regexp parameters, so evaluating it as a
    // regex is exactly what the edge matcher does — and the same shape already
    // routes the storefront in production.
    const matches = new RegExp(`^${globalRule?.source}$`)
    expect(matches.test('/')).toBe(true)
    expect(matches.test('/admin')).toBe(true)
    expect(matches.test('/admin.html')).toBe(true)
    expect(matches.test('/assets/main-abc123.js')).toBe(true)
    expect(matches.test('/api/orders')).toBe(false)
    expect(matches.test('/api/webhooks/mercadopago')).toBe(false)
  })

  it('sets nosniff, the referrer policy and a permissions policy that denies unused features', () => {
    expect(headerValue(globalRule, 'X-Content-Type-Options')).toBe('nosniff')
    expect(headerValue(globalRule, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')

    const permissions = headerValue(globalRule, 'Permissions-Policy') ?? ''
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
      expect(permissions).toContain(`${feature}=()`)
    }
  })

  it('ships the full policy as report-only until the owner verifies it on a preview', () => {
    expect(reportOnlyCsp).toBeTruthy()

    // The global rule must NOT carry an enforcing default-src policy: enforcing
    // it before the preview walkthrough is what would blank the storefront.
    const enforced = headerValue(globalRule, 'Content-Security-Policy')
    expect(enforced).toBeUndefined()
  })

  it('allows exactly the origins the app uses', () => {
    const csp = parseCsp(reportOnlyCsp ?? '')

    expect(csp['default-src']).toEqual(["'self'"])
    expect(csp['base-uri']).toEqual(["'self'"])
    expect(csp['object-src']).toEqual(["'none'"])
    expect(csp['frame-ancestors']).toEqual(["'none'"])
    expect(csp['script-src']).toEqual(["'self'"])

    // Google Fonts: the stylesheet and the font binaries it loads.
    expect(csp['style-src']).toContain('https://fonts.googleapis.com')
    expect(csp['font-src']).toContain('https://fonts.gstatic.com')

    // React sets inline `style` attributes across the UI, so styles need
    // 'unsafe-inline'; scripts deliberately do not.
    expect(csp['style-src']).toContain("'unsafe-inline'")

    // Images: same origin, inline data URLs, the legacy-voucher Blob URL and
    // the Storage download-token host.
    expect(csp['img-src']).toEqual(
      expect.arrayContaining(["'self'", 'data:', 'blob:', 'https://firebasestorage.googleapis.com'])
    )

    // Fetches: our API, Firestore, Firebase Auth, the signed voucher PUT, the
    // SDK's own telemetry transport, and `data:` — the backoffice fetches a
    // legacy Base64 voucher URL before re-wrapping it as a Blob, so a bare
    // `connect-src` without `data:` would break that admin action.
    expect(csp['connect-src']).toEqual(
      expect.arrayContaining([
        "'self'",
        'data:',
        'https://firestore.googleapis.com',
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com',
        'https://storage.googleapis.com',
        'https://firebaselogging-pa.googleapis.com'
      ])
    )

    // Checkout Pro is reached by a top-level redirect, which CSP does not
    // govern; it is pre-authorized for form-action in case that ever changes.
    expect(csp['form-action']).toEqual(expect.arrayContaining(["'self'", 'https://www.mercadopago.cl']))
  })

  it('never opens the script policy up', () => {
    const csp = parseCsp(reportOnlyCsp ?? '')

    expect(csp['script-src']).not.toContain("'unsafe-inline'")
    expect(csp['script-src']).not.toContain("'unsafe-eval'")
    expect(csp['script-src']).not.toContain('*')
    expect(csp['script-src']).not.toContain('data:')
    expect(csp['default-src']).not.toContain('*')
    expect(csp['default-src']).not.toContain('https:')

    // No directive may fall back to a wildcard or a scheme-wide source.
    for (const [directive, tokens] of Object.entries(csp)) {
      expect(tokens, `${directive} must not contain a bare wildcard`).not.toContain('*')
      if (directive !== 'img-src' && directive !== 'connect-src') {
        expect(tokens, `${directive} must not allow data:`).not.toContain('data:')
      }
    }
  })

  it('makes every admin URL un-frameable with both an enforced policy and the legacy header', () => {
    // The static `/admin.html` file is the bypass this list exists to prevent.
    expect(ADMIN_FRAME_GUARDED_SOURCES).toEqual(
      config.headers.map((rule) => rule.source).filter((source) => source !== '/((?!api/).*)')
    )

    for (const source of ADMIN_FRAME_GUARDED_SOURCES) {
      const rule = ruleFor(config, source)
      expect(rule, `${source} needs the anti-framing headers`).toBeDefined()
      expect(headerValue(rule, 'X-Frame-Options')).toBe('DENY')

      const enforced = parseCsp(headerValue(rule, 'Content-Security-Policy') ?? '')
      expect(enforced['frame-ancestors']).toEqual(["'none'"])
      // The enforced admin policy must stay minimal: anything else here would be
      // an unverified policy blocking a live backoffice.
      expect(Object.keys(enforced)).toEqual(['frame-ancestors'])
    }
  })

  it('does not introduce a CORS header', () => {
    const allHeaders = config.headers.flatMap((rule) => rule.headers.map((header) => header.key))
    expect(allHeaders).not.toContain('Access-Control-Allow-Origin')
  })
})
