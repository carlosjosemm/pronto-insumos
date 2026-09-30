import { describe, it, expect } from 'vitest'
import {
  buildImportPlan,
  normalizeName,
  parseArgs,
  parseCatalogCsv,
  productionGateError,
  type ExistingProductDoc
} from '../../../scripts/import-catalog-csv'

/**
 * The non-destructive import contract: product identity comes from the
 * normalized name (never the CSV row index), updates carry metadata only,
 * odon-* prototypes referenced by orders are soft-retired instead of deleted,
 * audits record real changes only, and production requires the explicit
 * --confirm-production-import flag (--force is not a substitute). The I/O
 * shell (Firestore batches) is not exercised here.
 */

const NOW = '2026-09-30T00:00:00.000Z'

const CSV = [
  'descripcion,categoria,marca,precio',
  'Guantes de Nitrilo Talla M,Insumos,Safetouch,"12.990"',
  'Turbina LED Triple Spray,Equipos,NSK,"189.990"',
  'Alginato Cromático 500g,Materiales,Dentsply,"24.500"'
].join('\n')

function items(csv = CSV) {
  return parseCatalogCsv(csv).items
}

const liveCatalog: ExistingProductDoc[] = [
  // A product that already exists — under a DIFFERENT row position and id
  // than the CSV would naively assign. Live sales data it must keep.
  {
    id: 'pronto-007',
    name: 'Turbina LED Triple Spray',
    category: 'Equipos',
    brand: 'NSK',
    price: 189990,
    unitOfSale: undefined,
    stockCount: 3,
    isActive: true,
    sku: 'REF-NSK-007'
  }
]

describe('import-catalog-csv — normalizeName', () => {
  it('folds case, accents and repeated whitespace into one identity', () => {
    expect(normalizeName('  Turbina   LED Triple Spray ')).toBe(normalizeName('turbina led triple spray'))
    expect(normalizeName('Alginato Cromático')).toBe(normalizeName('alginato cromatico'))
  })
})

describe('import-catalog-csv — parseCatalogCsv', () => {
  it('parses rows, strips CLP thousand separators and reports invalid lines', () => {
    const { items: parsed, skipped } = parseCatalogCsv(
      ['desc,cat,brand,price', 'Válido,C,B,"10.000"', 'SinPrecio,C,B,abc', ',C,B,5000'].join('\n')
    )
    expect(parsed).toHaveLength(1)
    expect(parsed[0].price).toBe(10000)
    expect(skipped).toHaveLength(2)
  })

  it('reads the optional unit_of_sale column when present', () => {
    const { items: parsed } = parseCatalogCsv('d,c,b,price,unit_of_sale\nItem,Cat,Brand,1000,Caja 100 un')
    expect(parsed[0].unitOfSale).toBe('Caja 100 un')
  })
})

describe('import-catalog-csv — buildImportPlan identity & preservation', () => {
  it('matches an existing product by name regardless of row order — keeps its id and live data', () => {
    // Reordered CSV: the turbina now sits in row position 1, not index 7.
    const plan = buildImportPlan(items(), liveCatalog, new Set(), NOW)
    const turbina = plan.ops.find((o) => o.productId === 'pronto-007')

    expect(turbina?.kind).toBe('noop')
    // No op may write to pronto-001 for the turbina — identity is name-bound.
    expect(plan.ops.some((o) => o.productId === 'pronto-001' && o.kind === 'update')).toBe(false)
  })

  it('update payloads carry ONLY the metadata allowlist — never stock, visibility, regulated flags or images', () => {
    const existing: ExistingProductDoc[] = [{ ...liveCatalog[0], price: 179990 }]
    const plan = buildImportPlan(items(), existing, new Set(), NOW)
    const update = plan.ops.find((o) => o.kind === 'update' && o.productId === 'pronto-007')

    expect(update).toBeDefined()
    if (update?.kind !== 'update') return
    for (const forbidden of [
      'stockCount',
      'inStock',
      'isActive',
      'prescriptionRequired',
      'ispRegistrationNumber',
      'images',
      'rating',
      'reviewsCount',
      'sku',
      'createdAt',
      'originalPrice'
    ]) {
      expect(update.doc).not.toHaveProperty(forbidden)
    }
    expect(update.doc).toMatchObject({ price: 189990, name: 'Turbina LED Triple Spray' })
  })

  it('a byte-identical re-run plans zero writes and zero audits', () => {
    const identical: ExistingProductDoc[] = [
      { ...liveCatalog[0] },
      { id: 'pronto-001', name: 'Guantes de Nitrilo Talla M', category: 'Insumos', brand: 'Safetouch', price: 12990 },
      { id: 'pronto-002', name: 'Alginato Cromático 500g', category: 'Materiales', brand: 'Dentsply', price: 24500 }
    ]
    const plan = buildImportPlan(items(), identical, new Set(), NOW)

    expect(plan.ops.every((o) => o.kind === 'noop')).toBe(true)
    expect(plan.ops.some((o) => o.kind === 'update' && o.audit)).toBe(false)
  })

  it('a price change produces a metadata update plus a real METADATA_UPDATE audit echoing live stock', () => {
    const existing: ExistingProductDoc[] = [{ ...liveCatalog[0], price: 179990, stockCount: 7 }]
    const plan = buildImportPlan(items(), existing, new Set(), NOW)
    const update = plan.ops.find((o) => o.kind === 'update' && o.productId === 'pronto-007')

    if (update?.kind !== 'update') throw new Error('expected update op')
    expect(update.audit).toMatchObject({
      changeType: 'METADATA_UPDATE',
      previousStock: 7,
      newStock: 7,
      delta: 0,
      metadata: { previousPrice: 179990, newPrice: 189990 }
    })
  })

  it('a non-price metadata change updates without inventing an audit entry', () => {
    const existing: ExistingProductDoc[] = [{ ...liveCatalog[0], category: 'Equipos Rotatorios' }]
    const plan = buildImportPlan(items(), existing, new Set(), NOW)
    const update = plan.ops.find((o) => o.kind === 'update' && o.productId === 'pronto-007')

    if (update?.kind !== 'update') throw new Error('expected update op')
    expect(update.audit).toBeUndefined()
  })

  it('genuinely new rows create ABOVE the existing max index — a freed index is never reused', () => {
    const plan = buildImportPlan(items(), liveCatalog, new Set(), NOW)
    const creates = plan.ops.filter((o) => o.kind === 'create')

    // Only pronto-007 exists; ids 001-006 are gaps that must NOT be refilled —
    // a deleted product's id may still be referenced by an order.
    expect(creates.map((o) => o.productId)).toEqual(['pronto-008', 'pronto-009'])
    for (const op of creates) {
      if (op.kind !== 'create') continue
      expect(op.audit.changeType).toBe('CATALOG_SEED')
      expect(op.doc.stockCount).toBe(10)
      expect(op.doc.inStock).toBe(true)
      expect(op.doc.prescriptionRequired).toBe(false)
    }
  })

  it('a reordered CSV against a full live catalog maps every row to its existing id', () => {
    const full: ExistingProductDoc[] = [
      { id: 'pronto-003', name: 'Alginato Cromático 500g', category: 'Materiales', brand: 'Dentsply', price: 24500 },
      { id: 'pronto-001', name: 'Guantes de Nitrilo Talla M', category: 'Insumos', brand: 'Safetouch', price: 12990 },
      { id: 'pronto-002', name: 'Turbina LED Triple Spray', category: 'Equipos', brand: 'NSK', price: 189990 }
    ]
    const reversed = [CSV.split('\n')[0], ...CSV.split('\n').slice(1).reverse()].join('\n')
    const plan = buildImportPlan(items(reversed), full, new Set(), NOW)

    expect(plan.ops.every((o) => o.kind === 'noop')).toBe(true)
    expect(plan.errors).toHaveLength(0)
  })
})

describe('import-catalog-csv — buildImportPlan collisions & deletions', () => {
  it('aborts the whole plan when two CSV rows normalize to the same name', () => {
    const dup = 'd,c,b,p\nÁcido Fosfórico 37%,Grabado,3M,5000\nacido fosforico 37%,Grabado,3M,6000'
    const plan = buildImportPlan(items(dup), [], new Set(), NOW)

    expect(plan.errors.length).toBeGreaterThan(0)
    expect(plan.errors[0]).toContain('duplicado')
  })

  it('aborts when two EXISTING documents share a normalized name — no silent shadowing', () => {
    const existing: ExistingProductDoc[] = [
      { id: 'pronto-003', name: 'Turbina LED Triple Spray', price: 1 },
      { id: 'pronto-009', name: 'turbina led triple spray', price: 2 }
    ]
    const plan = buildImportPlan(items(), existing, new Set(), NOW)

    expect(plan.errors.some((e) => e.includes('pronto-003') && e.includes('pronto-009'))).toBe(true)
  })

  it('a CSV row matching an odon-* name creates a pronto-* — never an update+delete on the same doc', () => {
    const existing: ExistingProductDoc[] = [
      { id: 'odon-101', name: 'Turbina LED Triple Spray', price: 189990, isActive: true }
    ]
    const plan = buildImportPlan(items(), existing, new Set(), NOW)

    const onOdon = plan.ops.filter((o) => o.productId === 'odon-101')
    expect(onOdon).toHaveLength(1)
    expect(['delete', 'deactivate', 'noop']).toContain(onOdon[0].kind)
    expect(plan.ops.some((o) => o.kind === 'update' && o.productId === 'odon-101')).toBe(false)
    // The row itself lands as a create.
    expect(plan.ops.some((o) => o.kind === 'create' && o.doc.name === 'Turbina LED Triple Spray')).toBe(true)
  })

  it('deletes unreferenced odon-* prototypes', () => {
    const existing: ExistingProductDoc[] = [{ id: 'odon-999', name: 'Prototipo Viejo' }]
    const plan = buildImportPlan([], existing, new Set(), NOW)

    expect(plan.ops).toContainEqual({ kind: 'delete', productId: 'odon-999' })
  })

  it('soft-retires — never deletes — an odon-* product referenced by an order', () => {
    const existing: ExistingProductDoc[] = [{ id: 'odon-001', name: 'Turbina Vendida', isActive: true }]
    const plan = buildImportPlan([], existing, new Set(['odon-001']), NOW)

    const op = plan.ops.find((o) => o.productId === 'odon-001')
    expect(op?.kind).toBe('deactivate')
    expect(plan.ops.some((o) => o.kind === 'delete' && o.productId === 'odon-001')).toBe(false)
  })

  it('leaves an already-retired referenced prototype as a noop', () => {
    const existing: ExistingProductDoc[] = [{ id: 'odon-001', isActive: false }]
    const plan = buildImportPlan([], existing, new Set(['odon-001']), NOW)

    expect(plan.ops.find((o) => o.productId === 'odon-001')?.kind).toBe('noop')
  })
})

describe('import-catalog-csv — production gate & args', () => {
  it('refuses production without the explicit confirmation flag', () => {
    expect(productionGateError(parseArgs(['--env=prod']))).not.toBeNull()
  })

  it('exempts --dry-run — the read-only rehearsal must not demand a write confirmation', () => {
    expect(productionGateError(parseArgs(['--env=prod', '--dry-run']))).toBeNull()
  })

  it('refuses --force as a production substitute — only --confirm-production-import opens the gate', () => {
    expect(productionGateError(parseArgs(['--env=prod', '--force']))).not.toBeNull()
    expect(productionGateError(parseArgs(['--env=prod', '--confirm-production-import']))).toBeNull()
  })

  it('never gates the dev environment', () => {
    expect(productionGateError(parseArgs(['--env=dev']))).toBeNull()
    expect(productionGateError(parseArgs([]))).toBeNull()
  })

  it('parses --file and --dry-run', () => {
    const args = parseArgs(['--env=dev', '--file=catalogo.csv', '--dry-run'])
    expect(args).toMatchObject({ env: 'dev', file: 'catalogo.csv', dryRun: true })
  })
})
