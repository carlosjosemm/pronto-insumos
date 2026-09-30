/**
 * Firestore schema manager — validate / seed / purge-and-seed.
 *
 * Seed safety model — a re-seed once meant "reset everything"; now:
 *
 *   1. UPDATES ARE METADATA-ONLY. On an existing product the seed rewrites
 *      only the descriptive allowlist (name, brand, category, price, priceNeto,
 *      description, specs, packageContents, manufacturer, tag, unitOfSale,
 *      updatedAt). Live `stockCount`, `inStock`, `isActive`,
 *      `prescriptionRequired`, `images`, ratings and `createdAt` are never
 *      touched — sold stock survives a re-seed.
 *   2. AUDITS RECORD REAL CHANGES ONLY: new product → CATALOG_SEED log; a
 *      price change → METADATA_UPDATE log; unchanged → no write at all.
 *   3. THE SAMPLE PAID ORDER IS DEV-ONLY. `PRONTO-SAMPLE-001` (a fabricated
 *      TRANSFERENCIA_APROBADA order with a placeholder voucher) is never
 *      written to the canonical collections.
 *   4. PRODUCTION GATES: `--seed` requires `--confirm-production-seed`;
 *      `--purge-and-seed` requires `--force` AND `--confirm-production-wipe`.
 *   5. `--dry-run` prints the full plan and writes nothing.
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PRODUCTS as canonicalProducts } from '../src/data/products'
import { validateProductSchema, validateOrderSchema } from '../src/utils/schemaValidation'
import type { InventoryAuditLog } from '../src/types'

// ---------------------------------------------------------------------------
// Pure planner (unit-tested; no I/O, no Firestore)
// ---------------------------------------------------------------------------

export interface ExistingProductDoc {
  id: string
  price?: number
  stockCount?: number
  sku?: string
  createdAt?: string
  [key: string]: unknown
}

export type SeedPlanOp =
  | {
      kind: 'create'
      productId: string
      doc: Record<string, unknown>
      audit: Omit<InventoryAuditLog, 'id' | 'timestamp'>
    }
  | {
      kind: 'update'
      productId: string
      doc: Record<string, unknown>
      audit?: Omit<InventoryAuditLog, 'id' | 'timestamp'>
    }
  | { kind: 'noop'; productId: string }
  | { kind: 'createSampleOrder'; orderId: string }

export interface SeedPlan {
  ops: SeedPlanOp[]
}

/**
 * The ONLY fields a re-seed may overwrite on an existing product. Everything
 * else — stock, visibility, regulated flags, images, ratings — is operator or
 * sales-truth data and survives a re-seed untouched.
 */
const SEED_UPDATE_ALLOWLIST = [
  'name',
  'brand',
  'category',
  'price',
  'priceNeto',
  'description',
  'specs',
  'packageContents',
  'manufacturer',
  'tag',
  'unitOfSale'
] as const

export const SAMPLE_ORDER_ID = 'PRONTO-SAMPLE-001'

/** Drops keys whose value is undefined — Firestore rejects undefined fields. */
function dropUndefined<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) if (obj[key] === undefined) delete obj[key]
  return obj
}

/**
 * Decide every write the seed will make — before touching Firestore.
 *
 * @param products          Canonical product fixture.
 * @param existing          Current product documents in the target collection.
 * @param sampleOrderExists Whether the dev sample order is already present.
 * @param includeSampleOrder False in production — the fake paid order is a
 *                           dev fixture and must never reach canonical orders.
 */
export function buildSeedPlan(
  products: typeof canonicalProducts,
  existing: ExistingProductDoc[],
  sampleOrderExists: boolean,
  includeSampleOrder: boolean,
  nowIso: string
): SeedPlan {
  const byId = new Map(existing.map((d) => [d.id, d]))
  const ops: SeedPlanOp[] = []

  for (const prod of products) {
    const match = byId.get(prod.id)
    const priceNeto = Math.round(prod.price / 1.19)

    const candidate: Record<string, unknown> = {
      name: prod.name,
      brand: prod.manufacturer || 'PRONTO Insumos',
      category: prod.category,
      price: prod.price,
      priceNeto,
      description: prod.description || '',
      specs: prod.specs || [],
      packageContents: prod.packageContents || [],
      manufacturer: prod.manufacturer || '',
      tag: prod.tag || '',
      unitOfSale: prod.unitOfSale || undefined
    }

    if (match) {
      // No-change detection: a second seed over identical data must write
      // nothing at all — not even an updatedAt bump.
      const changed = SEED_UPDATE_ALLOWLIST.some((key) => {
        const next = candidate[key]
        if (next === undefined) return false
        return JSON.stringify(next) !== JSON.stringify(match[key])
      })
      if (!changed) {
        ops.push({ kind: 'noop', productId: prod.id })
        continue
      }

      // Metadata-only update: SEED_UPDATE_ALLOWLIST + updatedAt. Stock,
      // visibility, regulated flags and images are preserved by omission.
      const doc: Record<string, unknown> = { updatedAt: nowIso }
      for (const key of SEED_UPDATE_ALLOWLIST) {
        if (candidate[key] !== undefined) doc[key] = candidate[key]
      }

      const audit =
        match.price !== prod.price
          ? ({
              productId: prod.id,
              productSku: match.sku,
              productName: prod.name,
              changeType: 'METADATA_UPDATE',
              previousStock: match.stockCount ?? null,
              newStock: match.stockCount ?? null,
              delta: 0,
              reasonCode: 'semilla_precio_canonico',
              operatorNotes: `Actualización de precio canónico: $${match.price ?? '?'} → $${prod.price}.`,
              changedBy: 'SYSTEM_SEED',
              changedByEmail: 'system@prontoinsumos.cl',
              actorRole: 'SYSTEM_SEED',
              metadata: { previousPrice: match.price ?? null, newPrice: prod.price }
            } satisfies Omit<InventoryAuditLog, 'id' | 'timestamp'>)
          : undefined

      ops.push({ kind: 'update', productId: prod.id, doc, audit })
      continue
    }

    ops.push({
      kind: 'create',
      productId: prod.id,
      doc: dropUndefined({
        id: prod.id,
        sku: `REF-${prod.id.toUpperCase()}`,
        ...candidate,
        inStock: prod.inStock,
        stockCount: prod.stockCount,
        prescriptionRequired: prod.prescriptionRequired || false,
        images: prod.images || [],
        rating: prod.rating || 5.0,
        reviewsCount: prod.reviewsCount || 0,
        createdAt: nowIso,
        updatedAt: nowIso
      }),
      audit: {
        productId: prod.id,
        productSku: `REF-${prod.id.toUpperCase()}`,
        productName: prod.name,
        changeType: 'CATALOG_SEED',
        previousStock: null,
        newStock: prod.stockCount,
        delta: prod.stockCount,
        reasonCode: 'catalogo_inicial',
        operatorNotes: 'Carga inicial del catálogo canónico PRONTO',
        changedBy: 'SYSTEM_SEED',
        changedByEmail: 'system@prontoinsumos.cl',
        actorRole: 'SYSTEM_SEED'
      }
    })
  }

  if (includeSampleOrder && !sampleOrderExists) {
    ops.push({ kind: 'createSampleOrder', orderId: SAMPLE_ORDER_ID })
  }

  return { ops }
}

export interface SchemaArgs {
  mode: 'validate' | 'seed' | 'purge-and-seed'
  env: 'dev' | 'prod'
  force: boolean
  dryRun: boolean
  confirmProductionSeed: boolean
  confirmProductionWipe: boolean
}

export function parseArgs(argv: string[]): SchemaArgs {
  const isExplicitProd = argv.includes('--env=prod') || argv.includes('--prod')
  const isExplicitDev = argv.includes('--env=dev')
  const mode = argv.includes('--seed') ? 'seed' : argv.includes('--purge-and-seed') ? 'purge-and-seed' : 'validate'
  return {
    mode,
    // Dev only when explicitly asked (flag or env var); otherwise the target
    // is the canonical collection — the safe reading of "unspecified" here is
    // "production", which is exactly why the production gates exist.
    env: isExplicitDev || (!isExplicitProd && process.env.FIRESTORE_ENV === 'development') ? 'dev' : 'prod',
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    confirmProductionSeed: argv.includes('--confirm-production-seed'),
    confirmProductionWipe: argv.includes('--confirm-production-wipe')
  }
}

/**
 * The single seed production gate — no fallback accepted. `--dry-run` is
 * exempt: a plan-only rehearsal writes nothing and is precisely the read-only
 * preview this gate exists to precede.
 */
export function seedProductionGateError(args: SchemaArgs): string | null {
  if (args.mode !== 'seed' || args.env === 'dev' || args.dryRun || args.confirmProductionSeed) return null
  return [
    '⚠️  ATENCIÓN: Estás a punto de sembrar en el entorno de PRODUCCIÓN.',
    'Para confirmar esta operación, agrega la bandera --confirm-production-seed:',
    '  pnpm run schema:seed -- --confirm-production-seed'
  ].join('\n')
}

// ---------------------------------------------------------------------------
// I/O shell — runs only when invoked directly, never on test import
// ---------------------------------------------------------------------------

function loadLocalEnv() {
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
}

async function main() {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')

  loadLocalEnv()

  const args = parseArgs(process.argv.slice(2))
  const isDev = args.env === 'dev'
  const colPrefix = isDev ? 'dev_' : ''
  const targetEnv = isDev ? 'DESARROLLO (dev_*)' : 'PRODUCCIÓN'
  const col = (base: string) => `${colPrefix}${base}`

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
    console.error(
      '💡 Puedes obtenerlas en: Firebase Console > Configuración del Proyecto > Cuentas de servicio > Generar nueva clave privada.\n'
    )
    process.exit(1)
  }

  const app =
    getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  const db = getFirestore(app)

  async function runValidate() {
    console.log(`\n🔍 [SCHEMA AUDIT] Escaneando colecciones en Firestore [Entorno: ${targetEnv}]...\n`)

    const productsSnap = await db.collection(col('products')).get()
    console.log(`📦 Colección "${col('products')}": ${productsSnap.size} documentos encontrados.`)

    let validProducts = 0
    let invalidProducts = 0
    productsSnap.forEach((doc) => {
      const result = validateProductSchema({ id: doc.id, ...doc.data() })
      if (result.valid) validProducts++
      else {
        invalidProducts++
        console.warn(`  ⚠️ Producto "${doc.id}":`, result.errors.join(' | '))
      }
    })
    console.log(`   Resultado: ${validProducts} válidos, ${invalidProducts} con observaciones de esquema.`)

    const ordersSnap = await db.collection(col('orders')).get()
    console.log(`\n📋 Colección "${col('orders')}": ${ordersSnap.size} documentos encontrados.`)

    let validOrders = 0
    let invalidOrders = 0
    ordersSnap.forEach((doc) => {
      const result = validateOrderSchema({ orderId: doc.id, ...doc.data() })
      if (result.valid) validOrders++
      else {
        invalidOrders++
        console.warn(`  ⚠️ Pedido "${doc.id}":`, result.errors.join(' | '))
      }
    })
    console.log(`   Resultado: ${validOrders} válidos, ${invalidOrders} con observaciones de esquema.`)

    const historySnap = await db.collection(col('order_status_history')).get()
    const inventoryAuditSnap = await db.collection(col('inventory_audit_logs')).get()
    console.log(`\n🛡️ Auditoría:`)
    console.log(`   - Eventos en "${col('order_status_history')}": ${historySnap.size}`)
    console.log(`   - Eventos en "${col('inventory_audit_logs')}": ${inventoryAuditSnap.size}\n`)
  }

  async function runSeed() {
    console.log(`\n🌱 [SCHEMA SEED] Sembrando catálogo canónico [Entorno: ${targetEnv}]...\n`)

    const nowIso = new Date().toISOString()
    const existingSnap = await db.collection(col('products')).get()
    const existing: ExistingProductDoc[] = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

    const sampleOrderRef = db.collection(col('orders')).doc(SAMPLE_ORDER_ID)
    const sampleOrderExists = isDev ? (await sampleOrderRef.get()).exists : false
    const plan = buildSeedPlan(canonicalProducts, existing, sampleOrderExists, isDev, nowIso)

    const counts = { create: 0, update: 0, noop: 0, createSampleOrder: 0 }
    for (const op of plan.ops) counts[op.kind]++
    console.log(
      `📋 Plan: ${counts.create} altas, ${counts.update} actualizaciones de metadatos, ` +
        `${counts.noop} sin cambios${isDev ? `, pedido de ejemplo: ${counts.createSampleOrder ? 'crear' : 'ya existe'}` : ' (pedido de ejemplo omitido en producción)'}.`
    )

    if (args.dryRun) {
      console.log('\n🧪 DRY-RUN — no se escribió ningún documento:')
      for (const op of plan.ops)
        console.log(`   [${op.kind.toUpperCase()}] ${op.kind === 'createSampleOrder' ? op.orderId : op.productId}`)
      return
    }

    // Validate every create upfront — a schema failure must abort the whole
    // seed, never leave a partial catalog behind.
    for (const op of plan.ops) {
      if (op.kind !== 'create') continue
      const validation = validateProductSchema(op.doc)
      if (!validation.valid) {
        console.error(`❌ Error de validación de esquema en "${op.productId}":`, validation.errors)
        process.exit(1)
      }
    }

    for (const op of plan.ops) {
      if (op.kind === 'noop' || op.kind === 'createSampleOrder') continue
      const ref = db.collection(col('products')).doc(op.productId)

      if (op.kind === 'create') {
        await ref.set(op.doc, { merge: true })
      } else {
        await ref.update(op.doc)
      }

      if (op.audit) {
        const auditRef = db.collection(col('inventory_audit_logs')).doc()
        await auditRef.set({ id: auditRef.id, ...op.audit, timestamp: nowIso })
      }
    }

    console.log(`✅ ${counts.create + counts.update} productos canónicos sincronizados en Firestore.`)

    // Dev-only sample order — a fabricated TRANSFERENCIA_APROBADA record with a
    // placeholder voucher must never reach the canonical collections.
    if (plan.ops.some((op) => op.kind === 'createSampleOrder')) {
      const sampleOrder = {
        orderId: SAMPLE_ORDER_ID,
        status: 'TRANSFERENCIA_APROBADA',
        paymentMethod: 'transferencia',
        totalAmount: 189990,
        subtotalNeto: Math.round(189990 / 1.19),
        ivaAmount: 189990 - Math.round(189990 / 1.19),
        createdAt: nowIso,
        updatedAt: nowIso,
        customer: {
          fullName: 'Dra. Andrea Morales',
          email: 'contacto@moralesdental.cl',
          phone: '+56 9 7777 8888',
          rut: '12345678-5',
          documentType: 'factura',
          razonSocial: 'Centro Odontológico Morales SpA',
          giroComercial: 'Servicios Odontológicos y Prótesis Dental',
          address: 'Av. Ortúzar 500, Of. 201',
          city: 'Melipilla',
          zip: '9500000'
        },
        sanitaryVerification: {
          sisRegistryNumber: 'SIS-19284',
          credentialFileName: 'registro_prestador_individual_sis.pdf',
          verified: true,
          regulatoryNote: 'Inscripción válida en Superintendencia de Salud'
        },
        items: [
          {
            productId: 'odon-001',
            sku: 'REF-NSK-001',
            name: 'Turbina LED Push Button Triple Spray',
            quantity: 1,
            price: 189990,
            total: 189990
          }
        ],
        voucherUrl: 'https://placehold.co/600x800/0f172a/ffffff?text=Comprobante+Banco+de+Chile',
        voucherFileName: 'comprobante_transferencia_001.pdf',
        voucherUploadedAt: nowIso,
        approvedAt: nowIso,
        approvedBy: 'admin@prontoinsumos.cl'
      }

      await sampleOrderRef.set(sampleOrder)

      const historyRef = db.collection(col('order_status_history')).doc()
      await historyRef.set({
        id: historyRef.id,
        orderId: SAMPLE_ORDER_ID,
        previousStatus: 'PENDIENTE_TRANSFERENCIA',
        newStatus: 'TRANSFERENCIA_APROBADA',
        changedBy: 'admin@prontoinsumos.cl',
        changedByEmail: 'admin@prontoinsumos.cl',
        actorRole: 'ADMIN',
        timestamp: nowIso,
        reason: 'Aprobación de transferencia y verificación de comprobante Banco de Chile',
        metadata: { sampleRecord: true }
      })

      console.log(`✅ Pedido canónico de ejemplo "${SAMPLE_ORDER_ID}" sembrado con éxito.`)
    }

    console.log('\n🎉 Sincronización de esquema y datos completada.\n')
  }

  async function runPurgeAndSeed() {
    if (!args.force) {
      console.error('❌ Error: El comando --purge-and-seed requiere el flag --force para confirmar la purga.')
      console.error('Uso: pnpm run schema:purge-and-seed --force')
      process.exit(1)
    }

    if (!isDev && !args.confirmProductionWipe) {
      console.error('\n🛑 OPERACIÓN ABORTADA POR SEGURIDAD:')
      console.error('Estás intentando purgar la base de datos de PRODUCCIÓN (colecciones canónicas).')
      console.error('Para purgar el entorno de desarrollo/pruebas ejecuta: pnpm run schema:purge:dev')
      console.error('Si REALMENTE deseas purgar producción, debes incluir: --confirm-production-wipe')
      console.error(
        'Ejemplo: npx tsx scripts/manage-firestore-schema.ts --purge-and-seed --force --confirm-production-wipe\n'
      )
      process.exit(1)
    }

    console.log(`\n⚠️ [SCHEMA PURGE] Eliminando documentos antiguos [Entorno: ${targetEnv}]...\n`)

    const collectionsToPurge = [
      col('products'),
      col('orders'),
      col('order_status_history'),
      col('inventory_audit_logs')
    ]

    for (const colName of collectionsToPurge) {
      const snap = await db.collection(colName).get()
      if (!snap.empty) {
        const BATCH_LIMIT = 450
        const docs = snap.docs
        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
          const chunk = docs.slice(i, i + BATCH_LIMIT)
          const batch = db.batch()
          chunk.forEach((doc) => {
            batch.delete(doc.ref)
          })
          await batch.commit()
        }
      }
      console.log(`🗑️ Colección "${colName}": ${snap.size} documentos eliminados.`)
    }

    console.log('\nRecreando esquema congelado y datos canónicos...')
    await runSeed()
  }

  switch (args.mode) {
    case 'validate':
      await runValidate()
      break
    case 'seed': {
      const gateError = seedProductionGateError(args)
      if (gateError) {
        console.error(`\n${gateError}\n`)
        process.exit(1)
      }
      await runSeed()
      break
    }
    case 'purge-and-seed':
      await runPurgeAndSeed()
      break
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  main().catch((err) => {
    console.error('❌ Error ejecutando script de esquema:', err)
    process.exit(1)
  })
}
