/**
 * Official catalog CSV import — non-destructive by contract.
 *
 * Safety model — every point exists because a real re-run once broke it:
 *
 *   1. IDENTITY COMES FROM THE PRODUCT NAME, never from the CSV row index.
 *      Rows matched to an existing product by normalized name keep that
 *      document id, so reordering the CSV can never rename/reshuffle the
 *      catalog. Only genuinely new names receive the next free `pronto-NNN`
 *      index — a freed index is never reused.
 *   2. UPDATES ARE METADATA-ONLY. The update payload carries the descriptive
 *      allowlist (name, category, brand, manufacturer, description, price,
 *      priceNeto, unitOfSale, updatedAt) and nothing else — live `stockCount`,
 *      `inStock`, `isActive`, `prescriptionRequired`, `images`, ratings and
 *      `createdAt` are never touched by a re-import.
 *   3. odon-* PROTOTYPES ARE NEVER DELETED WHILE AN ORDER REFERENCES THEM:
 *      referenced ones are soft-retired (`isActive: false`); only unreferenced
 *      ones are deleted.
 *   4. AUDITS RECORD REAL CHANGES ONLY: a create writes one CATALOG_SEED log;
 *      a price change writes one METADATA_UPDATE log echoing the live stock;
 *      an unchanged product writes nothing at all.
 *   5. PRODUCTION REQUIRES `--confirm-production-import`. `--force` is not a
 *      substitute. `--dry-run` prints the full plan and writes nothing.
 *
 * Usage:
 *   pnpm run catalog:import:dev                      # dev collections
 *   pnpm run catalog:import -- --dry-run             # prod rehearsal, no writes
 *   pnpm run catalog:import -- --confirm-production-import
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateProductSchema } from '../src/utils/schemaValidation'
import type { Product, InventoryAuditLog } from '../src/types'

// ---------------------------------------------------------------------------
// Pure planner (unit-tested; no I/O, no Firestore)
// ---------------------------------------------------------------------------

export interface ParsedCsvItem {
  line: number
  name: string
  category: string
  brand: string
  price: number
  unitOfSale?: string
}

export interface ExistingProductDoc {
  id: string
  name?: string
  category?: string
  brand?: string
  manufacturer?: string
  price?: number
  unitOfSale?: string
  stockCount?: number
  isActive?: boolean
  sku?: string
}

export type ImportPlanOp =
  | { kind: 'create'; productId: string; doc: Product; audit: Omit<InventoryAuditLog, 'id' | 'timestamp'> }
  | {
      kind: 'update'
      productId: string
      doc: Record<string, unknown>
      audit?: Omit<InventoryAuditLog, 'id' | 'timestamp'>
      note: string
    }
  | { kind: 'noop'; productId: string; note: string }
  | { kind: 'delete'; productId: string }
  | { kind: 'deactivate'; productId: string; note: string }

export interface ImportPlan {
  ops: ImportPlanOp[]
  errors: string[]
}

/**
 * Normalized product-name key: the identity a CSV row claims. Case, accents and
 * whitespace differences must not split one product into two documents.
 */
export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * The ONLY fields a re-import may overwrite on an existing product. Anything
 * else — stock, visibility, regulatory flags, images, ratings — is operator or
 * sales-truth data and must survive a re-run untouched.
 */
const UPDATE_ALLOWLIST = [
  'name',
  'category',
  'brand',
  'manufacturer',
  'description',
  'price',
  'priceNeto',
  'unitOfSale'
] as const

export function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

export function parseCatalogCsv(rawContent: string): {
  items: ParsedCsvItem[]
  skipped: { line: number; raw: string }[]
} {
  const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return { items: [], skipped: [] }

  // Optional `unit_of_sale` column carrying the human-readable sales unit
  // ("Caja 100 un"). The legacy price list has no such column, so the field is
  // simply omitted from the document when absent.
  const headerColumns = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase())
  const unitOfSaleIdx = headerColumns.indexOf('unit_of_sale')

  const items: ParsedCsvItem[] = []
  const skipped: { line: number; raw: string }[] = []

  for (let i = 1; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i])
    if (parts.length < 4) {
      skipped.push({ line: i + 1, raw: lines[i] })
      continue
    }
    const desc = parts[0]
    const price = parseInt(parts[3].replace(/[^0-9]/g, ''), 10)
    if (!desc || isNaN(price) || price <= 0) {
      skipped.push({ line: i + 1, raw: lines[i] })
      continue
    }
    items.push({
      line: i + 1,
      name: desc,
      category: parts[1],
      brand: parts[2] || 'Genérico',
      price,
      unitOfSale: unitOfSaleIdx >= 0 ? parts[unitOfSaleIdx]?.trim() : undefined
    })
  }
  return { items, skipped }
}

/** Drops keys whose value is undefined — Firestore rejects undefined fields. */
function dropUndefined<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) if (obj[key] === undefined) delete obj[key]
  return obj
}

/**
 * Decide every write the import will make — before touching Firestore.
 *
 * @param items          Parsed CSV rows.
 * @param existing       Current product documents (any env's collection).
 * @param referencedIds  Product ids referenced by at least one order — these
 *                       must never be deleted.
 */
export function buildImportPlan(
  items: ParsedCsvItem[],
  existing: ExistingProductDoc[],
  referencedIds: Set<string>,
  nowIso: string
): ImportPlan {
  const errors: string[] = []

  // A normalized name claimed by two CSV rows would silently pick a winner —
  // refuse the whole import instead.
  const seen = new Map<string, number>()
  for (const item of items) {
    const key = normalizeName(item.name)
    const first = seen.get(key)
    if (first !== undefined) {
      errors.push(`Nombre duplicado en CSV (líneas ${first} y ${item.line}): "${item.name}"`)
    } else {
      seen.set(key, item.line)
    }
  }

  const byName = new Map<string, ExistingProductDoc>()
  for (const doc of existing) {
    // odon-* prototypes are slated for retirement below — a CSV row that
    // happens to share a name must create a pronto-* doc, never update (and
    // then immediately delete/deactivate) the prototype.
    if (!doc.name || doc.id.startsWith('odon-')) continue
    const key = normalizeName(doc.name)
    const shadowed = byName.get(key)
    if (shadowed) {
      errors.push(
        `Dos documentos existentes comparten el nombre normalizado "${doc.name}": ${shadowed.id} y ${doc.id} — resuélvalos antes de importar.`
      )
    } else {
      byName.set(key, doc)
    }
  }

  // New ids are always allocated above the existing maximum — a gap left by a
  // deleted product is never re-issued, so an order that still references the
  // freed id can never silently alias to a different product.
  let nextIndex = 1
  for (const doc of existing) {
    const m = /^pronto-(\d+)$/.exec(doc.id)
    if (m) nextIndex = Math.max(nextIndex, parseInt(m[1], 10) + 1)
  }

  const ops: ImportPlanOp[] = []

  for (const item of items) {
    const match = byName.get(normalizeName(item.name))
    const priceNeto = Math.round(item.price / 1.19)

    if (match) {
      // unitOfSale only counts as changed when the CSV actually carries a
      // column — an absent column must not flag (or erase) a value an
      // operator set by hand.
      const changed =
        match.name !== item.name ||
        match.category !== item.category ||
        match.brand !== item.brand ||
        match.price !== item.price ||
        (item.unitOfSale !== undefined && match.unitOfSale !== item.unitOfSale)

      if (!changed) {
        ops.push({ kind: 'noop', productId: match.id, note: 'sin cambios' })
        continue
      }

      // Metadata-only: only UPDATE_ALLOWLIST keys + updatedAt are written.
      // Everything else on the live document — stock, visibility, regulated
      // flags, images — is preserved by omission.
      const candidate: Record<string, unknown> = {
        name: item.name,
        category: item.category,
        brand: item.brand,
        manufacturer: item.brand,
        description: item.name,
        price: item.price,
        priceNeto,
        unitOfSale: item.unitOfSale || undefined
      }
      const doc: Record<string, unknown> = { updatedAt: nowIso }
      for (const key of UPDATE_ALLOWLIST) {
        if (candidate[key] !== undefined) doc[key] = candidate[key]
      }

      const audit =
        match.price !== item.price
          ? ({
              productId: match.id,
              productSku: match.sku,
              productName: item.name,
              changeType: 'METADATA_UPDATE',
              previousStock: match.stockCount ?? null,
              newStock: match.stockCount ?? null,
              delta: 0,
              reasonCode: 'catalogo_precio_csv',
              operatorNotes: `Actualización de precio desde CSV oficial: $${match.price ?? '?'} → $${item.price}.`,
              changedBy: 'system-csv-importer',
              changedByEmail: 'system@prontoinsumos.cl',
              actorRole: 'SYSTEM_SEED',
              metadata: { previousPrice: match.price ?? null, newPrice: item.price }
            } satisfies Omit<InventoryAuditLog, 'id' | 'timestamp'>)
          : undefined

      ops.push({ kind: 'update', productId: match.id, doc, audit, note: 'metadatos actualizados' })
      continue
    }

    const productId = `pronto-${String(nextIndex++).padStart(3, '0')}`
    const sku = `REF-${item.brand
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 4)
      .toUpperCase()}-${productId.slice(7)}`

    const doc: Product = dropUndefined({
      id: productId,
      sku,
      name: item.name,
      category: item.category,
      brand: item.brand,
      manufacturer: item.brand,
      price: item.price,
      priceNeto,
      rating: 5.0,
      reviewsCount: 0,
      inStock: true,
      stockCount: 10,
      isActive: true,
      prescriptionRequired: false,
      tag: '',
      description: item.name,
      specs: ['Insumo clínico odontológico certificado', 'Distribución oficial Pronto Insumos Melipilla'],
      placeholderTheme: 'gradient-teal',
      mediaBadge: item.brand && item.brand !== 'Genérico' ? item.brand : 'Clínico Certificado',
      unitOfSale: item.unitOfSale?.trim() || undefined,
      images: [],
      packageContents: [`1x ${item.name}`],
      createdAt: nowIso,
      updatedAt: nowIso
    })

    ops.push({
      kind: 'create',
      productId,
      doc,
      audit: {
        productId,
        productSku: sku,
        productName: item.name,
        previousStock: null,
        newStock: 10,
        delta: 10,
        changeType: 'CATALOG_SEED',
        reasonCode: 'catalogo_inicial_csv',
        operatorNotes: `Carga inicial de catálogo real desde CSV oficial [${item.category}].`,
        changedBy: 'system-csv-importer',
        changedByEmail: 'system@prontoinsumos.cl',
        actorRole: 'SYSTEM_SEED',
        metadata: { category: item.category, price: item.price }
      }
    })
  }

  // odon-* prototype cleanup: never delete what an order references.
  for (const doc of existing) {
    if (!doc.id.startsWith('odon-')) continue
    if (referencedIds.has(doc.id)) {
      if (doc.isActive === false) {
        ops.push({ kind: 'noop', productId: doc.id, note: 'prototipo ya retirado' })
      } else {
        ops.push({
          kind: 'deactivate',
          productId: doc.id,
          note: 'prototipo referenciado por pedidos — retirado del catálogo, nunca eliminado'
        })
      }
    } else {
      ops.push({ kind: 'delete', productId: doc.id })
    }
  }

  return { ops, errors }
}

export interface ImportArgs {
  env: 'dev' | 'prod'
  file: string
  dryRun: boolean
  confirmProductionImport: boolean
}

export function parseArgs(argv: string[]): ImportArgs {
  const isProd = argv.includes('--env=prod') || argv.includes('--prod')
  const fileArg = argv.find((a) => a.startsWith('--file='))
  return {
    env: isProd ? 'prod' : 'dev',
    file: fileArg ? fileArg.split('=')[1] : 'listo-of-prices-pronto-basic.csv',
    dryRun: argv.includes('--dry-run'),
    confirmProductionImport: argv.includes('--confirm-production-import')
  }
}

/**
 * The single production gate. `--force` is deliberately NOT accepted — the
 * only way into the canonical collections is the explicit confirmation flag.
 * `--dry-run` is exempt: a plan-only rehearsal writes nothing and is precisely
 * the read-only preview this gate exists to precede.
 */
export function productionGateError(args: ImportArgs): string | null {
  if (args.env === 'dev' || args.dryRun || args.confirmProductionImport) return null
  return [
    '⚠️  ATENCIÓN: Estás a punto de importar al entorno de PRODUCCIÓN.',
    'Para confirmar esta operación, agrega la bandera --confirm-production-import:',
    '  pnpm run catalog:import -- --confirm-production-import'
  ].join('\n')
}

// ---------------------------------------------------------------------------
// I/O shell — runs only when invoked directly, never on test import
// ---------------------------------------------------------------------------

async function main() {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')

  for (const envFile of ['.env.local', '.env']) {
    const envPath = path.resolve(process.cwd(), envFile)
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim()
          const val = trimmed
            .slice(eqIdx + 1)
            .trim()
            .replace(/^["']|["']$/g, '')
          if (!process.env[key]) process.env[key] = val
        }
      }
    }
  }

  const args = parseArgs(process.argv.slice(2))
  const isDev = args.env === 'dev'
  const colPrefix = isDev ? 'dev_' : ''
  const targetEnv = isDev ? 'DESARROLLO (dev_*)' : 'PRODUCCIÓN CANÓNICA'
  const col = (base: string) => `${colPrefix}${base}`

  console.log(`\n🚀 [CATALOG IMPORT] Iniciando importación de catálogo oficial [Entorno: ${targetEnv}]...`)

  const gateError = productionGateError(args)
  if (gateError) {
    console.error(`\n${gateError}\n`)
    process.exit(1)
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const rawKey = process.env.FIREBASE_PRIVATE_KEY?.trim()
  const privateKey = rawKey ? rawKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n') : undefined

  if (!projectId || !clientEmail || !privateKey) {
    console.error('\n❌ Error: Faltan credenciales de Firebase Admin (Service Account).')
    console.error('Para conectar scripts administrativos a Firestore, define en tu .env.local:')
    console.error('  - FIREBASE_PROJECT_ID=' + (projectId || 'pronto-insumos'))
    console.error('  - FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@pronto-insumos.iam.gserviceaccount.com')
    console.error('  - FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n..."\n')
    process.exit(1)
  }

  const app =
    getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  const db = getFirestore(app)

  // 1. Parse CSV
  const csvFilePath = path.resolve(process.cwd(), args.file)
  if (!fs.existsSync(csvFilePath)) {
    console.error(`\n❌ Error: No se encontró el archivo CSV en: ${csvFilePath}`)
    process.exit(1)
  }
  const { items, skipped } = parseCatalogCsv(fs.readFileSync(csvFilePath, 'utf8'))
  if (items.length === 0) {
    console.error('\n❌ Error: El archivo CSV está vacío o solo contiene cabecera.')
    process.exit(1)
  }
  console.log(`📄 Archivo CSV leído: ${args.file} (${items.length} registros detectados)`)
  for (const s of skipped) console.warn(`  ⚠️ Línea ${s.line} omitida por datos inválidos: ${s.raw}`)

  // 2. Snapshot existing products + product ids referenced by orders
  const existingSnap = await db.collection(col('products')).get()
  const existing: ExistingProductDoc[] = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  const referencedIds = new Set<string>()
  const ordersSnap = await db.collection(col('orders')).get()
  for (const d of ordersSnap.docs) {
    const items = d.data().items
    if (Array.isArray(items)) {
      // Legacy order lines key the product as `id` instead of `productId`.
      for (const i of items) {
        const pid = i?.productId ?? i?.id
        if (typeof pid === 'string') referencedIds.add(pid)
      }
    }
  }

  // 3. Plan — every write decided before the first batch is built
  const nowIso = new Date().toISOString()
  const plan = buildImportPlan(items, existing, referencedIds, nowIso)

  if (plan.errors.length > 0) {
    console.error('\n❌ Importación abortada — colisiones detectadas, ningún documento fue modificado:')
    for (const e of plan.errors) console.error(`   - ${e}`)
    process.exit(1)
  }

  for (const op of plan.ops) {
    if (op.kind === 'create') {
      const validation = validateProductSchema(op.doc)
      if (!validation.valid) {
        console.error(`❌ Error de validación de esquema en "${op.productId}":`, validation.errors)
        process.exit(1)
      }
    }
  }

  const counts = { create: 0, update: 0, noop: 0, delete: 0, deactivate: 0 }
  for (const op of plan.ops) counts[op.kind]++
  console.log(
    `\n📋 Plan: ${counts.create} altas, ${counts.update} actualizaciones de metadatos, ` +
      `${counts.deactivate} prototipos retirados, ${counts.delete} prototipos eliminados, ${counts.noop} sin cambios.`
  )

  // Existing pronto-* docs with no CSV row are left untouched — surface them
  // so an operator notices a stale listing instead of it silently lingering.
  const touched = new Set(plan.ops.map((o) => o.productId))
  const stale = existing.filter((d) => !d.id.startsWith('odon-') && !touched.has(d.id)).map((d) => d.id)
  if (stale.length > 0) {
    console.log(`   - ${stale.length} documentos sin fila en el CSV (sin cambios): ${stale.join(', ')}`)
  }

  if (args.dryRun) {
    console.log('\n🧪 DRY-RUN — no se escribió ningún documento:')
    for (const op of plan.ops) console.log(`   [${op.kind.toUpperCase()}] ${op.productId}`)
    return
  }

  // 4. Execute the plan in batches
  let batch = db.batch()
  let opCount = 0
  const flush = async () => {
    if (opCount > 0) {
      await batch.commit()
      batch = db.batch()
      opCount = 0
    }
  }

  for (const op of plan.ops) {
    const ref = db.collection(col('products')).doc(op.productId)
    if (op.kind === 'create') batch.set(ref, op.doc)
    else if (op.kind === 'update') batch.update(ref, op.doc)
    else if (op.kind === 'deactivate') batch.update(ref, { isActive: false, updatedAt: nowIso })
    else if (op.kind === 'delete') batch.delete(ref)
    else continue // noop

    opCount++
    if (op.kind === 'create' || op.kind === 'update') {
      if (op.audit) {
        const auditRef = db.collection(col('inventory_audit_logs')).doc()
        batch.set(auditRef, { id: auditRef.id, ...op.audit, timestamp: nowIso })
        opCount++
      }
    }
    if (opCount >= 400) await flush()
  }
  await flush()

  console.log(`\n🎉 [ÉXITO] Ingesta completada con éxito en ${targetEnv}:`)
  console.log(`   - ${counts.create} productos nuevos creados.`)
  console.log(`   - ${counts.update} productos existentes actualizados (solo metadatos; stock/visibilidad intactos).`)
  console.log(
    `   - ${counts.deactivate} prototipos retirados, ${counts.delete} eliminados (nunca los referenciados por pedidos).`
  )
  console.log(`\n👉 Ejecuta la validación de esquema para confirmar:`)
  console.log(`   pnpm run schema:validate${isDev ? ':dev' : ''}\n`)
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  main().catch((err) => {
    console.error('\n❌ Error durante la importación:', err)
    process.exit(1)
  })
}
