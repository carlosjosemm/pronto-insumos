#!/usr/bin/env tsx
/**
 * Sync local environment variables to Vercel — safely.
 *
 * Why this exists: PRONTO's Vercel project lost its environment variables
 * entirely, and every production build shipped with an empty Firebase config
 * (blank storefront) without the build ever failing. `vercel env pull` is also
 * destructive in the other direction: it OVERWRITES `.env.local` in place.
 * This script is the single, auditable way to push local vars up.
 *
 * Safety model — all four are deliberate, do not "simplify" them away:
 *
 *   1. DRY RUN BY DEFAULT. Nothing is written without `--apply`.
 *   2. `--target` IS REQUIRED. There is no default, so production can never be
 *      hit by forgetting a flag. Valid: production | preview | development.
 *   3. EXISTING REMOTE VARS ARE SKIPPED unless `--overwrite` is passed. A
 *      routine sync can therefore never silently clobber a value that is
 *      already live — the dangerous direction.
 *   4. The local env file is BACKED UP (timestamped) before the first write,
 *      and the script ABORTS if that backup path is not gitignored — so it can
 *      never leave an un-ignored file full of secrets behind.
 *
 * Values are streamed to the Vercel CLI over **stdin**. They are never printed,
 * never logged, and never placed on a command line.
 *
 * Usage:
 *   pnpm run env:sync -- --target preview              # dry run, prints the plan
 *   pnpm run env:sync -- --target preview --apply      # writes only new vars
 *   pnpm run env:sync -- --target production --apply --overwrite
 *
 * Flags:
 *   --target <env>   REQUIRED. production | preview | development
 *   --file <path>    Local env file to read (default: .env.local)
 *   --apply          Actually write to Vercel (default: dry run)
 *   --overwrite      Replace vars that already exist remotely (default: skip)
 *   --help           Show this message
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export type Target = 'production' | 'preview' | 'development'

/**
 * Stored as Vercel Secrets rather than Config: values that must not be readable
 * back from the dashboard or `vercel env ls`.
 */
export const SENSITIVE_KEYS = new Set([
  'FIREBASE_PRIVATE_KEY',
  'MERCADOPAGO_ACCESS_TOKEN',
  'MERCADOPAGO_WEBHOOK_SECRET',
  'RESEND_API_KEY'
])

/**
 * Never sync these up. `vercel env pull` injects them into the local file, and
 * `VERCEL_OIDC_TOKEN` in particular is a short-lived credential minted by
 * Vercel itself — storing it as a project var would be both useless and unsafe.
 */
export const SYSTEM_KEY_PATTERN = /^(?:VERCEL|VERCEL_[A-Z0-9_]+|TURBO_[A-Z0-9_]+|NX_[A-Z0-9_]+)$/

/** Collection isolation is per-environment; never copy the local value up. */
export const FIRESTORE_KEYS = new Set(['FIRESTORE_ENV', 'VITE_FIRESTORE_ENV'])

export const TARGETS: Target[] = ['production', 'preview', 'development']

const HELP = `Sync local env vars to Vercel (dry run by default).

  pnpm run env:sync -- --target <production|preview|development> [flags]

Flags:
  --target <env>   REQUIRED — no default, so production is never hit by accident
  --file <path>    Local env file to read (default: .env.local)
  --apply          Actually write to Vercel (default: dry run, nothing written)
  --overwrite      Replace vars that already exist remotely (default: skip them)
  --help           Show this message
`

export interface ParsedEnv {
  /** KEY=VALUE in file order, quotes stripped, values untouched. */
  entries: Array<[string, string]>
  /** Keys skipped because they are Vercel/Turbo system vars. */
  skippedSystem: string[]
}

export function parseArgs(argv: string[]) {
  const flags = { apply: false, overwrite: false, help: false }
  let target: string | undefined
  let file = '.env.local'

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      // `pnpm run env:sync -- --target x` forwards a bare `--` through tsx.
      case '--':
        break
      case '--apply':
        flags.apply = true
        break
      case '--overwrite':
        flags.overwrite = true
        break
      case '--help':
      case '-h':
        flags.help = true
        break
      case '--target':
        target = argv[++i]
        break
      case '--file':
        file = argv[++i] ?? file
        break
      default:
        if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
        else if (arg.startsWith('--file=')) file = arg.slice('--file='.length)
        else throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return { ...flags, target, file }
}

/** Strip one layer of surrounding quotes; leave the value otherwise intact. */
export function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1)
    }
  }
  return value
}

export function parseEnvFile(path: string): ParsedEnv {
  const entries: Array<[string, string]> = []
  const skippedSystem: string[] = []

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue

    if (SYSTEM_KEY_PATTERN.test(key)) {
      skippedSystem.push(key)
      continue
    }
    entries.push([key, unquote(line.slice(eq + 1).trim())])
  }
  return { entries, skippedSystem }
}

/**
 * Always go through `pnpm dlx vercel@latest` unless VERCEL_CLI overrides it.
 *
 * A `vercel` on PATH may be ancient — this machine has 34.1.9, which predates
 * `env ls --json` and fails with "unknown or unexpected option". Pinning to
 * `@latest` matches the repo's documented deployment flow (AGENTS.md §7) and
 * guarantees the subcommands this script depends on actually exist.
 */
function vercelInvocation(): { cmd: string; baseArgs: string[] } {
  const override = process.env.VERCEL_CLI
  if (override) return { cmd: override, baseArgs: [] }
  return { cmd: 'pnpm', baseArgs: ['dlx', 'vercel@latest'] }
}

function runVercel(args: string[], input?: string): string {
  const { cmd, baseArgs } = vercelInvocation()
  return execFileSync(cmd, [...baseArgs, ...args], {
    input,
    encoding: 'utf8',
    stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe']
  })
}

/** Keys already present in the target environment. Values stay encrypted. */
function remoteKeys(target: Target): Set<string> {
  const out = runVercel(['env', 'ls', target, '--json'])
  const parsed = JSON.parse(out) as { envs?: Array<{ key?: string }> }
  return new Set((parsed.envs ?? []).map((e) => e.key).filter((k): k is string => Boolean(k)))
}

function isGitIgnored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')
}

export interface PlanItem {
  key: string
  value: string
  action: 'CREATE' | 'OVERWRITE' | 'SKIP'
  sensitive: boolean
}

/**
 * Pure decision logic: which variables to write, with which values, and whether
 * an existing remote value may be replaced. Deliberately free of I/O so the
 * safety rules — skip-by-default, per-target Firestore isolation, secret
 * classification — are directly unit-testable.
 */
export function buildPlan(
  entries: Array<[string, string]>,
  existing: ReadonlySet<string>,
  target: Target,
  overwrite: boolean
): PlanItem[] {
  return entries.map(([key, localValue]) => {
    const value = FIRESTORE_KEYS.has(key) ? (target === 'production' ? 'production' : 'development') : localValue
    const exists = existing.has(key)
    const action: PlanItem['action'] = !exists ? 'CREATE' : overwrite ? 'OVERWRITE' : 'SKIP'
    return { key, value, action, sensitive: SENSITIVE_KEYS.has(key) }
  })
}

function main() {
  const { apply, overwrite, help, target: rawTarget, file } = parseArgs(process.argv.slice(2))

  if (help) {
    console.log(HELP)
    return
  }
  if (!rawTarget) {
    console.error('✗ --target is required (production | preview | development). Nothing was written.\n')
    console.error(HELP)
    process.exitCode = 1
    return
  }
  if (!TARGETS.includes(rawTarget as Target)) {
    console.error(`✗ Invalid --target "${rawTarget}". Expected one of: ${TARGETS.join(', ')}`)
    process.exitCode = 1
    return
  }
  const target = rawTarget as Target

  const envPath = resolve(file)
  if (!existsSync(envPath)) {
    console.error(`✗ Env file not found: ${envPath}`)
    process.exitCode = 1
    return
  }

  const { entries, skippedSystem } = parseEnvFile(envPath)
  if (entries.length === 0) {
    console.error(`✗ No usable KEY=VALUE entries found in ${basename(envPath)}. Aborting.`)
    process.exitCode = 1
    return
  }

  const existing = remoteKeys(target)

  // Resolve the final plan, applying per-environment collection isolation.
  const plan = buildPlan(entries, existing, target, overwrite)

  console.log(`\nEnv file   : ${basename(envPath)}  (${entries.length} vars)`)
  console.log(`Target     : ${target}`)
  console.log(`Mode       : ${apply ? 'APPLY' : 'DRY RUN (nothing will be written)'}`)
  if (overwrite) console.log('Overwrite  : enabled — existing remote vars WILL be replaced')
  if (skippedSystem.length > 0) {
    console.log(`Ignored    : ${[...new Set(skippedSystem)].join(', ')} (Vercel/Turbo system vars)`)
  }
  console.log('')

  for (const item of plan) {
    const note = item.sensitive ? '  [secret]' : ''
    const detail = FIRESTORE_KEYS.has(item.key) ? `  -> ${item.value}` : ''
    console.log(`  ${item.action.padEnd(9)} ${item.key}${detail}${note}`)
  }

  const toWrite = plan.filter((p) => p.action !== 'SKIP')
  const skipped = plan.length - toWrite.length
  console.log(`\n  ${toWrite.length} to write, ${skipped} skipped (already exist remotely).`)

  if (!apply) {
    console.log('\nDry run complete. Re-run with --apply to write.\n')
    return
  }

  // --- Safety gate: never leave a backup of secrets that git would track ------
  const backupPath = `${envPath}.backup.${timestamp()}`
  if (!isGitIgnored(backupPath)) {
    console.error(
      `\n✗ Refusing to proceed: the backup path is not gitignored:\n    ${basename(backupPath)}\n` +
        '  Add a matching pattern to .gitignore (e.g. `.env*.backup.*`) and retry.\n' +
        '  Nothing was written.\n'
    )
    process.exitCode = 1
    return
  }

  copyFileSync(envPath, backupPath)
  console.log(`\n  Backup     ${basename(backupPath)}  (gitignored)`)

  let written = 0
  let failed = 0
  for (const item of toWrite) {
    const args = ['env', 'add', item.key, target, item.sensitive ? '--sensitive' : '--no-sensitive']
    // `preview` additionally prompts "Git branch?" on the TTY, which cannot be
    // answered from a piped stdin — the command then exits 0 having written
    // NOTHING. An empty value means "apply to all Preview branches".
    if (target === 'preview') args.push('--git-branch', '')
    if (item.action === 'OVERWRITE') args.push('--force')
    try {
      // The value travels over stdin — never as an argument.
      runVercel(args, item.value)
      console.log(`  ok         ${item.key}`)
      written++
    } catch (err) {
      console.error(`  FAILED     ${item.key}`)
      if (err instanceof Error && 'stderr' in err && err.stderr) {
        console.error(`             ${String(err.stderr).trim().split('\n')[0]}`)
      }
      failed++
    }
  }

  // Verify against the API rather than trusting exit codes — `env add` can exit
  // 0 while writing nothing (see the preview prompt above), which otherwise
  // reads as success and leaves the deployment silently broken.
  const present = remoteKeys(target)
  const missing = toWrite.filter((item) => !present.has(item.key))

  console.log(`\n  Written: ${written}   Failed: ${failed}   Skipped: ${skipped}`)
  console.log(`  Verified present remotely: ${toWrite.length - missing.length}/${toWrite.length}`)
  if (missing.length > 0) {
    console.error(`  ✗ Still missing after write: ${missing.map((m) => m.key).join(', ')}`)
    process.exitCode = 1
  }
  console.log(`  Restore from backup with: cp ${basename(backupPath)} ${basename(envPath)}\n`)
  if (failed > 0) process.exitCode = 1
}

// Only run when executed directly (`tsx scripts/sync-env-to-vercel.ts`), so the
// pure helpers above can be imported by tests without triggering any I/O.
const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  try {
    main()
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  }
}
