import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(__dirname, '../../..')

/**
 * Source-content guard for the storefront claim sweep. The certification and
 * registry claims below cannot be substantiated, so the owner replaced them
 * with neutral wording; this test fails the suite if any of them is
 * reintroduced into the storefront UI (the `src/components/` tree plus
 * `src/App.tsx`). The admin bundle is a separate surface and the tests
 * themselves are excluded, so the scan stays scoped to shipped storefront copy.
 *
 * One residual is allowed and documented: `LegalModal.tsx` is the
 * owner-reviewed draft legal copy under the suspended legal-copy task, so it is
 * deliberately out of this sweep and keeps its own `Boleta Electrónica SII ·
 * Registro ISP` line (a longer, different string than the retired footer cell).
 * Every other component must not carry a retired claim, and the same string in
 * any other file still fails.
 */
const RETIRED_CLAIMS = [
  'Registro ISP Chile',
  'Insumos Médicos Certificados',
  'Despacho Gratuito sobre $150.000',
  'Boleta Electrónica Inmediata (19% IVA)',
  'Dispositivos Homologados Registro ISP',
  'Fichas de Seguridad de Materiales',
  'Mercado Pago Chile · Pago 100% Seguro',
  'Boleta Electrónica SII · 19% IVA',
  'Dispositivos Médicos · Registro ISP Chile',
  'Depósito Dental Certificado',
  'Boleta Electrónica SII',
  'Insumos Certificados ISP',
  'Trazabilidad de lote conforme a normativa sanitaria',
  'Equipamiento e Instrumental Clínico Homologado',
  'Normativa ISP Homologada'
] as const

/** Documented 7.1 legal-copy residual: this one file/claim pair is allowed. */
const ALLOWED_RESIDUALS: ReadonlyArray<{ file: string; claim: string }> = [
  { file: 'src/components/LegalModal.tsx', claim: 'Boleta Electrónica SII' }
]

function collectComponentFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectComponentFiles(fullPath)
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

describe('Storefront claim sweep (neutral wording, reviews disabled)', () => {
  const files = [...collectComponentFiles(path.join(rootDir, 'src/components')), path.join(rootDir, 'src/App.tsx')]

  it('scans the storefront component tree', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('leaves no unsubstantiated certification or registry claim in a component', () => {
    const offenders: string[] = []
    for (const file of files) {
      const relative = path.relative(rootDir, file)
      const source = fs.readFileSync(file, 'utf8').toLowerCase()
      for (const claim of RETIRED_CLAIMS) {
        if (!source.includes(claim.toLowerCase())) continue
        const allowed = ALLOWED_RESIDUALS.some(
          (residual) => residual.file === relative && residual.claim.toLowerCase() === claim.toLowerCase()
        )
        if (!allowed) offenders.push(`${relative} → "${claim}"`)
      }
    }

    expect(offenders).toEqual([])
  })
})
