#!/usr/bin/env tsx
/**
 * Apply the bucket CORS configuration the browser-direct voucher upload needs.
 *
 * Why this exists: `/api/upload-voucher` hands the browser a short-lived V4 signed PUT URL,
 * and the browser uploads straight to `storage.googleapis.com` — a cross-origin PUT, which
 * ALWAYS triggers a CORS preflight. Cloud Storage builds `Access-Control-Allow-Headers` from
 * the bucket's own CORS `responseHeader` list, so the signed `x-goog-content-length-range`
 * header must be listed there or every upload fails the preflight.
 *
 * This script replaces the `gcloud storage buckets update … --cors-file=…` step on machines
 * without the Cloud SDK: it uses the same Firebase Admin service-account credentials as the
 * serverless functions (`.env.local`) and the rules in `scripts/storage-cors.json`.
 *
 * Safety model — deliberate, do not "simplify" it away:
 *   1. DRY RUN BY DEFAULT. Nothing is written without `--apply`.
 *   2. The bucket must already exist; a missing bucket reports the Blaze prerequisite instead
 *      of silently creating anything.
 *   3. The config is validated before it is used: the PUT method and both required response
 *      headers must be present, so a hand-edited file cannot silently break uploads.
 *   4. Re-running is idempotent: an already-applied config is reported and skipped.
 *
 * Usage:
 *   pnpm run storage:cors                    # dry run — shows current vs proposed CORS
 *   pnpm run storage:cors -- --apply         # writes the configuration
 *   pnpm run storage:cors -- --file=path.json
 *   pnpm run storage:cors -- --help
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface BucketCorsRule {
  origin: string[]
  method: string[]
  responseHeader: string[]
  maxAgeSeconds?: number
}

export interface ParsedCorsConfig {
  valid: boolean
  error?: string
  cors?: BucketCorsRule[]
}

export const DEFAULT_CORS_FILE = path.join('scripts', 'storage-cors.json')

/** The upload method the voucher flow needs. */
export const REQUIRED_CORS_METHOD = 'PUT'

/**
 * Response headers that must stay listed — Cloud Storage answers the preflight with these,
 * so dropping either one breaks the browser upload.
 */
export const REQUIRED_CORS_RESPONSE_HEADERS = ['Content-Type', 'x-goog-content-length-range']

const HELP = `Apply the voucher bucket CORS configuration (dry run by default).

  pnpm run storage:cors [-- --apply] [--file=<path>]

Flags:
  --apply        Actually write the CORS configuration (default: dry run)
  --file=<path>  CORS JSON to apply (default: ${DEFAULT_CORS_FILE})
  --help         Show this message
`

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string')
}

/** Validates the CORS JSON document before it is ever sent to the bucket. */
export function parseCorsConfig(raw: unknown): ParsedCorsConfig {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { valid: false, error: 'El archivo CORS debe ser un arreglo con al menos una regla.' }
  }

  const cors: BucketCorsRule[] = []

  for (const [index, rule] of raw.entries()) {
    if (typeof rule !== 'object' || rule === null) {
      return { valid: false, error: `Regla CORS #${index + 1}: se esperaba un objeto.` }
    }

    const candidate = rule as Record<string, unknown>

    if (!isStringArray(candidate.origin)) {
      return { valid: false, error: `Regla CORS #${index + 1}: "origin" debe ser un arreglo de strings no vacío.` }
    }
    const origin = candidate.origin

    if (!isStringArray(candidate.method)) {
      return { valid: false, error: `Regla CORS #${index + 1}: "method" debe ser un arreglo de strings no vacío.` }
    }
    const method = candidate.method

    if (!method.map((entry) => entry.toUpperCase()).includes(REQUIRED_CORS_METHOD)) {
      return {
        valid: false,
        error: `Regla CORS #${index + 1}: falta el método ${REQUIRED_CORS_METHOD}, sin él el navegador no puede subir comprobantes.`
      }
    }

    if (!isStringArray(candidate.responseHeader)) {
      return {
        valid: false,
        error: `Regla CORS #${index + 1}: "responseHeader" debe ser un arreglo de strings no vacío.`
      }
    }
    const responseHeader = candidate.responseHeader

    const missingHeader = REQUIRED_CORS_RESPONSE_HEADERS.find((header) => !responseHeader.includes(header))
    if (missingHeader) {
      return {
        valid: false,
        error: `Regla CORS #${index + 1}: falta el encabezado "${missingHeader}" — Cloud Storage responde el preflight con esta lista.`
      }
    }

    if (candidate.maxAgeSeconds !== undefined && typeof candidate.maxAgeSeconds !== 'number') {
      return { valid: false, error: `Regla CORS #${index + 1}: "maxAgeSeconds" debe ser numérico.` }
    }

    const normalized: BucketCorsRule = { origin, method, responseHeader }
    if (typeof candidate.maxAgeSeconds === 'number') normalized.maxAgeSeconds = candidate.maxAgeSeconds

    cors.push(normalized)
  }

  return { valid: true, cors }
}

/** Order-insensitive, case-insensitive shape used to compare a live bucket against the file. */
export function normalizeCorsRules(rules: unknown): BucketCorsRule[] {
  if (!Array.isArray(rules)) return []

  return rules
    .filter((rule): rule is Record<string, unknown> => typeof rule === 'object' && rule !== null)
    .map((rule) => {
      const normalized: BucketCorsRule = {
        origin: (isStringArray(rule.origin) ? rule.origin : []).slice().sort(),
        method: (isStringArray(rule.method) ? rule.method : []).map((method) => method.toUpperCase()).sort(),
        responseHeader: (isStringArray(rule.responseHeader) ? rule.responseHeader : []).slice().sort()
      }
      if (typeof rule.maxAgeSeconds === 'number') normalized.maxAgeSeconds = rule.maxAgeSeconds
      return normalized
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

/** True when the bucket already carries exactly the configuration we would apply. */
export function corsConfigMatches(current: unknown, proposed: BucketCorsRule[]): boolean {
  return JSON.stringify(normalizeCorsRules(current)) === JSON.stringify(normalizeCorsRules(proposed))
}

export function parseArgs(argv: string[]): { apply: boolean; file: string; help: boolean } {
  const flags = { apply: false, file: DEFAULT_CORS_FILE, help: false }

  for (const arg of argv) {
    if (arg === '--apply') flags.apply = true
    else if (arg === '--help' || arg === '-h') flags.help = true
    else if (arg.startsWith('--file=')) flags.file = arg.slice('--file='.length)
  }

  return flags
}

/** Auto-load .env.local or .env when running locally from the terminal. */
function loadEnvFiles(): void {
  for (const envFile of ['.env.local', '.env']) {
    const envPath = path.resolve(process.cwd(), envFile)
    if (!fs.existsSync(envPath)) continue

    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim()
        const value = trimmed
          .slice(eqIdx + 1)
          .trim()
          .replace(/^["']|["']$/g, '')
        if (!process.env[key]) process.env[key] = value
      }
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log(HELP)
    return
  }

  loadEnvFiles()

  const corsPath = path.resolve(process.cwd(), args.file)
  if (!fs.existsSync(corsPath)) {
    console.error(`No se encontró el archivo CORS: ${corsPath}`)
    process.exitCode = 1
    return
  }

  const parsed = parseCorsConfig(JSON.parse(fs.readFileSync(corsPath, 'utf8')))
  if (!parsed.valid || !parsed.cors) {
    console.error(`Archivo CORS inválido (${args.file}): ${parsed.error}`)
    process.exitCode = 1
    return
  }

  const { getVoucherBucket, resolveVoucherBucketName } = await import('../api/_lib/voucherStorage.js')

  const bucketName = resolveVoucherBucketName()
  const bucket = getVoucherBucket()
  if (!bucket || !bucketName) {
    console.error(
      'No se pudo resolver el bucket: revisa FIREBASE_PROJECT_ID / FIREBASE_STORAGE_BUCKET y las credenciales del Admin SDK en .env.local.'
    )
    process.exitCode = 1
    return
  }

  console.log(`Bucket:      ${bucket.name}`)
  console.log(
    `Resuelto por: ${process.env.FIREBASE_STORAGE_BUCKET ? 'FIREBASE_STORAGE_BUCKET' : 'FIREBASE_PROJECT_ID (default)'}`
  )

  const [exists] = await bucket.exists()
  if (!exists) {
    console.error(
      `\nEl bucket "${bucket.name}" no existe todavía. Habilita el plan Blaze y crea el bucket en Firebase Console → Storage antes de aplicar CORS.`
    )
    process.exitCode = 1
    return
  }

  const [metadata] = await bucket.getMetadata()
  const currentCors = (metadata as { cors?: unknown }).cors ?? null

  console.log(`Ubicación:   ${metadata.location}`)
  console.log(`CORS actual: ${JSON.stringify(currentCors)}`)
  console.log(`CORS propuesto: ${JSON.stringify(parsed.cors)}`)

  if (corsConfigMatches(currentCors, parsed.cors)) {
    console.log('\n✔ El bucket ya tiene esta configuración CORS — no hay nada que hacer.')
    return
  }

  if (!args.apply) {
    console.log('\nDRY RUN — vuelve a ejecutar con --apply para escribir esta configuración.')
    return
  }

  await bucket.setCorsConfiguration(parsed.cors)

  const [after] = await bucket.getMetadata()
  console.log(`\n✔ CORS aplicado. Configuración actual: ${JSON.stringify((after as { cors?: unknown }).cors ?? null)}`)
}

// Only run when executed directly (`pnpm run storage:cors`), so tests can import the helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error('Error aplicando la configuración CORS:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
