import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildPlan,
  parseArgs,
  parseEnvFile,
  unquote,
  FIRESTORE_KEYS,
  SENSITIVE_KEYS,
  SYSTEM_KEY_PATTERN
} from '../../../scripts/sync-env-to-vercel'

/**
 * These suites cover the *decision* logic of the Vercel env sync — the part that
 * decides what gets written and what is deliberately left alone. The I/O shell
 * (spawning the Vercel CLI, copying backups) is not exercised here.
 */

const tempDirs: string[] = []

function envFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pronto-env-sync-'))
  tempDirs.push(dir)
  const file = join(dir, '.env.local')
  writeFileSync(file, contents)
  return file
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('sync-env-to-vercel — parseEnvFile', () => {
  it('parses KEY=VALUE in order, skipping comments and blank lines', () => {
    const path = envFile(['# a comment', '', 'ALPHA=one', '   ', 'BETA=two'].join('\n'))
    const { entries } = parseEnvFile(path)

    expect(entries).toEqual([
      ['ALPHA', 'one'],
      ['BETA', 'two']
    ])
  })

  it('strips one layer of surrounding quotes but leaves escaped newlines intact', () => {
    const path = envFile(
      [
        'PLAIN=value',
        'DOUBLE="quoted value"',
        "SINGLE='quoted value'",
        // The real FIREBASE_PRIVATE_KEY shape: one line, literal \n sequences.
        'KEY="-----BEGIN\\nMIIE\\n-----END-----"'
      ].join('\n')
    )
    const values = Object.fromEntries(parseEnvFile(path).entries)

    expect(values.PLAIN).toBe('value')
    expect(values.DOUBLE).toBe('quoted value')
    expect(values.SINGLE).toBe('quoted value')
    expect(values.KEY).toBe('-----BEGIN\\nMIIE\\n-----END-----')
  })

  it('filters Vercel/Turbo system variables and reports which were skipped', () => {
    const path = envFile(
      [
        'VITE_FIREBASE_API_KEY=keepme',
        'VERCEL_OIDC_TOKEN=short-lived-credential',
        'VERCEL_ENV=production',
        'VERCEL=1',
        'TURBO_CACHE=local:rw',
        'NX_DAEMON=false'
      ].join('\n')
    )
    const { entries, skippedSystem } = parseEnvFile(path)

    expect(entries.map(([k]) => k)).toEqual(['VITE_FIREBASE_API_KEY'])
    expect(skippedSystem).toEqual(['VERCEL_OIDC_TOKEN', 'VERCEL_ENV', 'VERCEL', 'TURBO_CACHE', 'NX_DAEMON'])
  })

  it('ignores malformed lines rather than guessing', () => {
    const path = envFile(['no-equals-sign', '=novalue', 'VALID=yes'].join('\n'))

    expect(parseEnvFile(path).entries).toEqual([['VALID', 'yes']])
  })

  it('exposes a system-key pattern that does not swallow real app vars', () => {
    for (const key of ['VERCEL', 'VERCEL_OIDC_TOKEN', 'VERCEL_ENV', 'TURBO_CACHE', 'NX_DAEMON']) {
      expect(SYSTEM_KEY_PATTERN.test(key)).toBe(true)
    }
    for (const key of ['VITE_FIREBASE_API_KEY', 'FIREBASE_PRIVATE_KEY', 'FIRESTORE_ENV']) {
      expect(SYSTEM_KEY_PATTERN.test(key)).toBe(false)
    }
  })
})

describe('sync-env-to-vercel — buildPlan', () => {
  const entries: Array<[string, string]> = [
    ['VITE_FIREBASE_API_KEY', 'local-key'],
    ['FIRESTORE_ENV', 'development'],
    ['RESEND_API_KEY', 'local-secret']
  ]

  it('creates variables that do not exist remotely', () => {
    const plan = buildPlan(entries, new Set(), 'preview', false)

    expect(plan.map((p) => p.action)).toEqual(['CREATE', 'CREATE', 'CREATE'])
  })

  it('SKIPS variables that already exist remotely — the overwrite-protection default', () => {
    const plan = buildPlan(entries, new Set(['VITE_FIREBASE_API_KEY']), 'production', false)

    expect(plan.find((p) => p.key === 'VITE_FIREBASE_API_KEY')?.action).toBe('SKIP')
    expect(plan.filter((p) => p.action === 'SKIP')).toHaveLength(1)
  })

  it('OVERWRITES only when overwrite is explicitly enabled', () => {
    const plan = buildPlan(entries, new Set(['VITE_FIREBASE_API_KEY']), 'production', true)

    expect(plan.find((p) => p.key === 'VITE_FIREBASE_API_KEY')?.action).toBe('OVERWRITE')
  })

  it('forces per-target Firestore isolation and never copies the local value up', () => {
    const production = buildPlan([['FIRESTORE_ENV', 'development']], new Set(), 'production', true)
    const preview = buildPlan([['FIRESTORE_ENV', 'development']], new Set(), 'preview', true)
    const development = buildPlan([['VITE_FIRESTORE_ENV', 'production']], new Set(), 'development', true)

    expect(production[0].value).toBe('production')
    expect(preview[0].value).toBe('development')
    expect(development[0].value).toBe('development')
    expect(FIRESTORE_KEYS.has('FIRESTORE_ENV')).toBe(true)
  })

  it('classifies secrets so they are stored as Vercel Secrets', () => {
    const plan = buildPlan(entries, new Set(), 'production', false)

    expect(plan.find((p) => p.key === 'RESEND_API_KEY')?.sensitive).toBe(true)
    expect(plan.find((p) => p.key === 'VITE_FIREBASE_API_KEY')?.sensitive).toBe(false)
    expect(SENSITIVE_KEYS.has('FIREBASE_PRIVATE_KEY')).toBe(true)
    expect(SENSITIVE_KEYS.has('MERCADOPAGO_WEBHOOK_SECRET')).toBe(true)
  })

  it('preserves the local value verbatim for non-Firestore variables', () => {
    const plan = buildPlan(
      [['EMAIL_FROM', 'PRONTO Insumos <pedidos@prontoinsumos.com>']],
      new Set(),
      'production',
      false
    )

    expect(plan[0].value).toBe('PRONTO Insumos <pedidos@prontoinsumos.com>')
  })
})

describe('sync-env-to-vercel — parseArgs', () => {
  it('ignores the bare "--" that `pnpm run env:sync -- …` forwards through tsx', () => {
    const args = parseArgs(['--', '--target', 'preview', '--apply'])

    expect(args.target).toBe('preview')
    expect(args.apply).toBe(true)
  })

  it('leaves target undefined when omitted, so the script refuses to run', () => {
    expect(parseArgs(['--apply']).target).toBeUndefined()
  })

  it('parses the space-separated and = forms, plus --file and --overwrite', () => {
    expect(parseArgs(['--target', 'production', '--overwrite', '--file', '.env.other'])).toMatchObject({
      target: 'production',
      overwrite: true,
      file: '.env.other',
      apply: false
    })
    expect(parseArgs(['--target=development'])).toMatchObject({ target: 'development', file: '.env.local' })
  })

  it('throws on an unknown flag instead of silently ignoring it', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument/)
  })

  it('recognises --help', () => {
    expect(parseArgs(['--help']).help).toBe(true)
    expect(parseArgs(['-h']).help).toBe(true)
  })
})

describe('sync-env-to-vercel — unquote', () => {
  it('removes a single matching pair of quotes and nothing else', () => {
    expect(unquote('"a"')).toBe('a')
    expect(unquote("'a'")).toBe('a')
    expect(unquote('plain')).toBe('plain')
    expect(unquote('"mismatched\'')).toBe('"mismatched\'')
    expect(unquote('"')).toBe('"')
    expect(unquote('')).toBe('')
  })
})
