import { describe, it, expect, afterEach, vi } from 'vitest'
import { PRODUCTS } from '../../data/products'
import {
  buildSeedPlan,
  parseArgs,
  seedProductionGateError,
  SAMPLE_ORDER_ID,
  type ExistingProductDoc
} from '../../../scripts/manage-firestore-schema'

/**
 * The non-destructive seed contract: a re-seed rewrites descriptive metadata
 * only (live stock/visibility/regulated/images data survives), audits record
 * real changes only, the fabricated paid sample order is dev-only, and
 * production requires the explicit --confirm-production-seed flag. The I/O
 * shell (Firestore writes) is not exercised here.
 */

const NOW = '2026-09-30T00:00:00.000Z'
const fixture = PRODUCTS.slice(0, 2)

function liveCopy(prod = fixture[0]): ExistingProductDoc {
  return {
    id: prod.id,
    name: prod.name,
    brand: prod.manufacturer || 'PRONTO Insumos',
    category: prod.category,
    price: prod.price,
    priceNeto: Math.round(prod.price / 1.19),
    description: prod.description || '',
    specs: prod.specs || [],
    packageContents: prod.packageContents || [],
    manufacturer: prod.manufacturer || '',
    tag: prod.tag || '',
    unitOfSale: prod.unitOfSale,
    stockCount: 4,
    isActive: true,
    sku: `REF-${prod.id.toUpperCase()}`
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('manage-firestore-schema — buildSeedPlan preservation', () => {
  it('plans a noop for an identical existing product — nothing is written, not even updatedAt', () => {
    const plan = buildSeedPlan(fixture, [liveCopy()], false, false, NOW)
    const first = plan.ops.find((o) => 'productId' in o && o.productId === fixture[0].id)

    expect(first?.kind).toBe('noop')
  })

  it('update payloads carry ONLY the metadata allowlist — never stock, visibility, regulated flags or images', () => {
    const existing = [{ ...liveCopy(), price: fixture[0].price + 1000 }]
    const plan = buildSeedPlan([fixture[0]], existing, false, false, NOW)
    const update = plan.ops.find((o) => o.kind === 'update')

    if (update?.kind !== 'update') throw new Error('expected update op')
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
    expect(update.doc).toMatchObject({ price: fixture[0].price, updatedAt: NOW })
  })

  it('a price change writes a METADATA_UPDATE audit echoing the live stock — not a fake seed entry', () => {
    const existing = [{ ...liveCopy(), price: fixture[0].price - 5000, stockCount: 9 }]
    const plan = buildSeedPlan([fixture[0]], existing, false, false, NOW)
    const update = plan.ops.find((o) => o.kind === 'update')

    if (update?.kind !== 'update') throw new Error('expected update op')
    expect(update.audit).toMatchObject({
      changeType: 'METADATA_UPDATE',
      previousStock: 9,
      newStock: 9,
      delta: 0,
      metadata: { previousPrice: fixture[0].price - 5000, newPrice: fixture[0].price }
    })
  })

  it('creates new products with the full document plus one CATALOG_SEED audit', () => {
    const plan = buildSeedPlan([fixture[0]], [], false, false, NOW)
    const create = plan.ops.find((o) => o.kind === 'create')

    if (create?.kind !== 'create') throw new Error('expected create op')
    expect(create.productId).toBe(fixture[0].id)
    expect(create.doc).toMatchObject({ stockCount: fixture[0].stockCount, inStock: fixture[0].inStock })
    expect(create.audit.changeType).toBe('CATALOG_SEED')
    expect(create.audit.previousStock).toBeNull()
  })

  it('preserves the fixture prescriptionRequired flag on create instead of resetting it', () => {
    const regulated = PRODUCTS.find((p) => p.prescriptionRequired) ?? { ...fixture[0], prescriptionRequired: true }
    const plan = buildSeedPlan([regulated], [], false, false, NOW)
    const create = plan.ops.find((o) => o.kind === 'create')

    if (create?.kind !== 'create') throw new Error('expected create op')
    expect(create.doc.prescriptionRequired).toBe(regulated.prescriptionRequired)
  })
})

describe('manage-firestore-schema — sample order boundary', () => {
  it('never plans the fabricated paid order in production, even when it does not exist', () => {
    const plan = buildSeedPlan(fixture, [], false, false, NOW)

    expect(plan.ops.some((o) => o.kind === 'createSampleOrder')).toBe(false)
  })

  it('plans the sample order in dev only when it is absent', () => {
    const absent = buildSeedPlan(fixture, [], false, true, NOW)
    const present = buildSeedPlan(fixture, [], true, true, NOW)

    expect(absent.ops).toContainEqual({ kind: 'createSampleOrder', orderId: SAMPLE_ORDER_ID })
    expect(present.ops.some((o) => o.kind === 'createSampleOrder')).toBe(false)
  })
})

describe('manage-firestore-schema — production gate & args', () => {
  it('refuses a production seed without the explicit confirmation flag', () => {
    expect(seedProductionGateError(parseArgs(['--seed', '--env=prod']))).not.toBeNull()
  })

  it('exempts --dry-run — the read-only rehearsal must not demand a write confirmation', () => {
    expect(seedProductionGateError(parseArgs(['--seed', '--env=prod', '--dry-run']))).toBeNull()
  })

  it('refuses --force as a production substitute — only --confirm-production-seed opens the gate', () => {
    expect(seedProductionGateError(parseArgs(['--seed', '--env=prod', '--force']))).not.toBeNull()
    expect(seedProductionGateError(parseArgs(['--seed', '--env=prod', '--confirm-production-seed']))).toBeNull()
  })

  it('never gates dev seeds, and only applies to the seed mode', () => {
    expect(seedProductionGateError(parseArgs(['--seed', '--env=dev']))).toBeNull()
    expect(seedProductionGateError(parseArgs(['--validate', '--env=prod']))).toBeNull()
  })

  it('a bare --seed with no env resolves to production and is gated', () => {
    vi.stubEnv('FIRESTORE_ENV', '')
    const args = parseArgs(['--seed'])
    expect(args.env).toBe('prod')
    expect(seedProductionGateError(args)).not.toBeNull()
  })

  it('honors FIRESTORE_ENV=development as a dev target and parses --dry-run', () => {
    vi.stubEnv('FIRESTORE_ENV', 'development')
    const args = parseArgs(['--seed', '--dry-run'])
    expect(args).toMatchObject({ mode: 'seed', env: 'dev', dryRun: true })
  })
})
