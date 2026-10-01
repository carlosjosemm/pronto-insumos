import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Config-contract drift guard for the serverless type-check gate
 * (`tsconfig.server.json` + its wiring). The api/ tree is outside
 * tsconfig.json's src/** scope, so without this project the server layer is
 * only type-checked incidentally by Vercel's per-function build — which
 * resolves the Admin SDK typings differently and surfaces TS7006/TS2503
 * errors the local gate does not see. There is no emulator for a compiler
 * config; like firestore-rules/vercelHeaders, the contract is pinned by
 * reading the files as text.
 */

const rootDir = path.resolve(__dirname, '../../../')
const serverTsconfigPath = path.join(rootDir, 'tsconfig.server.json')
const packageJsonPath = path.join(rootDir, 'package.json')
const ciPath = path.join(rootDir, '.github/workflows/ci.yml')

interface ServerTsconfig {
  compilerOptions: Record<string, unknown>
  include: string[]
}

/**
 * tsconfig files are JSONC — the comments that explain the load-bearing
 * flags must survive in the source, so both comment styles are stripped
 * before parse (a leftover comment would otherwise surface as a cryptic
 * JSON syntax error instead of a contract failure).
 */
function readServerTsconfig(): ServerTsconfig {
  const jsonc = fs.readFileSync(serverTsconfigPath, 'utf8')
  return JSON.parse(jsonc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))
}

function walk(dir: string): string[] {
  const entries: string[] = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) {
      entries.push(...walk(full))
    } else if (name.endsWith('.ts')) {
      entries.push(full)
    }
  }
  return entries
}

const apiSources = [...walk(path.join(rootDir, 'api'))]

describe('Server type-check gate (tsconfig.server.json, package.json, ci.yml)', () => {
  it('declares the load-bearing compiler flags the verified invocation requires', () => {
    const config = readServerTsconfig()
    const options = config.compilerOptions

    // ES2022: under the default ES5 target the api sources fail with TS2802
    // (Map iterator loops need ES2015+ iteration). skipLibCheck: without it
    // the check reports TS18028 errors raised inside node_modules types the
    // repo does not own. Both were measured — they are requirements, not
    // preferences.
    expect(options.target).toBe('ES2022')
    expect(options.skipLibCheck).toBe(true)
    expect(options.strict).toBe(true)
    expect(options.module).toBe('ESNext')
    expect(options.moduleResolution).toBe('bundler')
    expect(options.types).toEqual(['node'])
    expect(options.noEmit).toBe(true)
  })

  it('covers every serverless source: routes, admin dispatcher, shared _lib, admin handlers and webhooks', () => {
    const config = readServerTsconfig()
    expect(config.include).toEqual([
      'api/*.ts',
      'api/admin/*.ts',
      'api/_lib/*.ts',
      'api/_lib/admin/*.ts',
      'api/webhooks/*.ts'
    ])

    // The globs must actually reach the files on disk — a moved module would
    // otherwise silently fall out of the gate. Separators are normalized so
    // the comparison also holds on a Windows checkout (CI is ubuntu, the
    // owner is macOS, but the contract should not depend on that).
    const globDirs = config.include.map((glob) => glob.slice(0, glob.lastIndexOf('/')))
    const included = apiSources.filter((file) =>
      globDirs.includes(path.relative(rootDir, path.dirname(file)).split(path.sep).join('/'))
    )
    expect(included.length, 'every api/**/*.ts file is covered by an include glob').toBe(apiSources.length)
  })

  it('wires the server gate into the pre-release verify command and CI', () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    expect(pkg.scripts['typecheck:server']).toBe('tsc -p tsconfig.server.json')
    expect(pkg.scripts.verify).toContain('pnpm run typecheck:server')

    const ci = fs.readFileSync(ciPath, 'utf8')
    expect(ci).toContain('pnpm run typecheck:server')
  })

  it('keeps every runTransaction callback explicitly typed (Vercel TS7006 drift guard)', () => {
    // Vercel's per-function type-check cannot infer the Admin SDK callback
    // types the way the local command does, so an un-annotated
    // `runTransaction(async (transaction) => …)` shows up there as
    // `Parameter 'transaction' implicitly has an 'any' type`. Every callback
    // is annotated with the `Transaction` type imported from
    // firebase-admin/firestore, which makes the code independent of that
    // inference. This fails if a new callback lands un-annotated.
    const untyped = apiSources.filter((file) =>
      // Whitespace-tolerant on purpose: `api/**` is outside Prettier's scope,
      // so a differently-formatted but un-annotated callback (e.g. no space
      // before the parameter list) must not slip past the guard — the local
      // gate would infer the type and stay green while Vercel's checker
      // regresses to TS7006.
      /runTransaction\(\s*async\s*\(\s*transaction\s*\)/.test(fs.readFileSync(file, 'utf8'))
    )
    expect(
      untyped.map((file) => path.relative(rootDir, file)),
      'runTransaction callbacks missing the explicit Transaction annotation'
    ).toEqual([])
  })

  it('uses named type imports instead of the FirebaseFirestore namespace (Vercel TS2503 drift guard)', () => {
    // The global `FirebaseFirestore` namespace resolves under the local
    // flags but not under Vercel's per-function check
    // (`Cannot find namespace 'FirebaseFirestore'`). The repo convention is
    // named type imports from firebase-admin/firestore.
    const namespaced = apiSources.filter((file) => fs.readFileSync(file, 'utf8').includes('FirebaseFirestore.'))
    expect(
      namespaced.map((file) => path.relative(rootDir, file)),
      'files still referencing the FirebaseFirestore namespace'
    ).toEqual([])
  })
})
