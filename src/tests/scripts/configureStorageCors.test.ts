import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  DEFAULT_CORS_FILE,
  corsConfigMatches,
  normalizeCorsRules,
  parseArgs,
  parseCorsConfig,
  type BucketCorsRule
} from '../../../scripts/configure-storage-cors'

const rootDir = path.resolve(__dirname, '../../../')

const validRule: BucketCorsRule = {
  origin: ['*'],
  method: ['PUT'],
  responseHeader: ['Content-Type', 'x-goog-content-length-range'],
  maxAgeSeconds: 3600
}

describe('Voucher bucket CORS operator script (scripts/configure-storage-cors)', () => {
  it('accepts the repository CORS file that the voucher upload depends on', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(rootDir, DEFAULT_CORS_FILE), 'utf8'))
    const parsed = parseCorsConfig(raw)

    expect(parsed.valid).toBe(true)
    expect(parsed.cors).toHaveLength(1)
    expect(parsed.cors?.[0].method.map((m) => m.toUpperCase())).toContain('PUT')
    expect(parsed.cors?.[0].responseHeader).toContain('x-goog-content-length-range')
  })

  it('rejects a document that is not a non-empty array', () => {
    expect(parseCorsConfig({ origin: ['*'] }).valid).toBe(false)
    expect(parseCorsConfig([]).valid).toBe(false)
    expect(parseCorsConfig(null).valid).toBe(false)
  })

  it('rejects a rule without the PUT method', () => {
    const parsed = parseCorsConfig([{ ...validRule, method: ['GET'] }])

    expect(parsed.valid).toBe(false)
    expect(parsed.error).toContain('PUT')
  })

  it('rejects a rule that drops the signed size-range header', () => {
    const parsed = parseCorsConfig([{ ...validRule, responseHeader: ['Content-Type'] }])

    expect(parsed.valid).toBe(false)
    expect(parsed.error).toContain('x-goog-content-length-range')
  })

  it('rejects malformed origins, methods and maxAgeSeconds', () => {
    expect(parseCorsConfig([{ ...validRule, origin: [] }]).valid).toBe(false)
    expect(parseCorsConfig([{ ...validRule, origin: [42] }]).valid).toBe(false)
    expect(parseCorsConfig([{ ...validRule, method: 'PUT' }]).valid).toBe(false)
    expect(parseCorsConfig([{ ...validRule, maxAgeSeconds: '3600' }]).valid).toBe(false)
    expect(parseCorsConfig([null]).valid).toBe(false)
  })

  it('normalizes rules so ordering and method casing cannot cause a false mismatch', () => {
    const normalized = normalizeCorsRules([{ origin: ['b', 'a'], method: ['put'], responseHeader: ['z', 'a'] }])

    expect(normalized).toEqual([{ origin: ['a', 'b'], method: ['PUT'], responseHeader: ['a', 'z'] }])
    expect(normalizeCorsRules(undefined)).toEqual([])
  })

  it('detects an already-applied configuration and a drifted one', () => {
    expect(corsConfigMatches([validRule], [validRule])).toBe(true)
    expect(corsConfigMatches([{ ...validRule, method: ['put'] }], [validRule])).toBe(true)
    expect(corsConfigMatches(null, [validRule])).toBe(false)
    expect(corsConfigMatches([{ ...validRule, responseHeader: ['Content-Type'] }], [validRule])).toBe(false)
  })

  it('is a dry run unless --apply is passed', () => {
    expect(parseArgs([])).toEqual({ apply: false, file: DEFAULT_CORS_FILE, help: false })
    expect(parseArgs(['--apply']).apply).toBe(true)
    expect(parseArgs(['--file=custom.json']).file).toBe('custom.json')
    expect(parseArgs(['--help']).help).toBe(true)
    expect(parseArgs(['-h']).help).toBe(true)
  })

  it('exposes the script through pnpm', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
    expect(pkg.scripts['storage:cors']).toBe('pnpm dlx tsx scripts/configure-storage-cors.ts')
  })
})
