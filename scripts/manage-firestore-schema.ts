import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import fs from 'node:fs'
import path from 'node:path'
import { PRODUCTS as canonicalProducts } from '../src/data/products'
import { validateProductSchema, validateOrderSchema } from '../src/utils/schemaValidation'

// Auto-load local environment if present
for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(process.cwd(), envFile)
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim()
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    }
  }
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
  console.error('💡 Puedes obtenerlas en: Firebase Console > Configuración del Proyecto > Cuentas de servicio > Generar nueva clave privada.\n')
  process.exit(1)
}

const app = getApps().length > 0
  ? getApps()[0]
  : initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      })
    })

const db = getFirestore(app)

const mode = process.argv[2] || '--validate'
const forceFlag = process.argv.includes('--force')
const isExplicitDev = process.argv.includes('--env=dev')
const isExplicitProd = process.argv.includes('--env=prod') || process.argv.includes('--prod')
const isDev = isExplicitDev || (!isExplicitProd && process.env.FIRESTORE_ENV === 'development')
const colPrefix = isDev ? 'dev_' : ''
const targetEnv = isDev ? 'DESARROLLO (dev_*)' : 'PRODUCCIÓN'

function col(baseName: string): string {
  return `${colPrefix}${baseName}`
}

async function runValidate() {
  console.log(`\n🔍 [SCHEMA AUDIT] Escaneando colecciones en Firestore [Entorno: ${targetEnv}]...\n`)

  // 1. Validate Products
  const productsSnap = await db.collection(col('products')).get()
  console.log(`📦 Colección "${col('products')}": ${productsSnap.size} documentos encontrados.`)

  let validProducts = 0
  let invalidProducts = 0

  productsSnap.forEach(doc => {
    const data = doc.data()
    const result = validateProductSchema({ id: doc.id, ...data })
    if (result.valid) {
      validProducts++
    } else {
      invalidProducts++
      console.warn(`  ⚠️ Producto "${doc.id}":`, result.errors.join(' | '))
    }
  })

  console.log(`   Resultado: ${validProducts} válidos, ${invalidProducts} con observaciones de esquema.`)

  // 2. Validate Orders
  const ordersSnap = await db.collection(col('orders')).get()
  console.log(`\n📋 Colección "${col('orders')}": ${ordersSnap.size} documentos encontrados.`)

  let validOrders = 0
  let invalidOrders = 0

  ordersSnap.forEach(doc => {
    const data = doc.data()
    const result = validateOrderSchema({ orderId: doc.id, ...data })
    if (result.valid) {
      validOrders++
    } else {
      invalidOrders++
      console.warn(`  ⚠️ Pedido "${doc.id}":`, result.errors.join(' | '))
    }
  })

  console.log(`   Resultado: ${validOrders} válidos, ${invalidOrders} con observaciones de esquema.`)

  // 3. Count Audit Logs
  const historySnap = await db.collection(col('order_status_history')).get()
  const inventoryAuditSnap = await db.collection(col('inventory_audit_logs')).get()
  console.log(`\n🛡️ Auditoría:`)
  console.log(`   - Eventos en "${col('order_status_history')}": ${historySnap.size}`)
  console.log(`   - Eventos en "${col('inventory_audit_logs')}": ${inventoryAuditSnap.size}\n`)
}

async function runSeed() {
  console.log('\n🌱 [SCHEMA SEED] Sembrando catálogo canónico y registros de ejemplo...\n')

  const nowIso = new Date().toISOString()
  let seededProducts = 0

  // Seed Products
  for (const prod of canonicalProducts) {
    const prodRef = db.collection(col('products')).doc(prod.id)
    const existing = await prodRef.get()

    const cleanProduct = {
      id: prod.id,
      sku: `REF-${prod.id.toUpperCase()}`,
      name: prod.name,
      brand: prod.manufacturer || 'PRONTO Insumos',
      category: prod.category,
      price: prod.price,
      priceNeto: Math.round(prod.price / 1.19),
      inStock: prod.inStock,
      stockCount: prod.stockCount,
      prescriptionRequired: prod.prescriptionRequired || false,
      tag: prod.tag || '',
      description: prod.description || '',
      specs: prod.specs || [],
      images: prod.images || [],
      packageContents: prod.packageContents || [],
      manufacturer: prod.manufacturer || '',
      rating: prod.rating || 5.0,
      reviewsCount: prod.reviewsCount || 0,
      createdAt: existing.exists ? (existing.data()?.createdAt || nowIso) : nowIso,
      updatedAt: nowIso
    }

    await prodRef.set(cleanProduct, { merge: true })

    if (!existing.exists) {
      // Record initial inventory audit
      const auditRef = db.collection(col('inventory_audit_logs')).doc()
      await auditRef.set({
        id: auditRef.id,
        productId: prod.id,
        productSku: cleanProduct.sku,
        productName: prod.name,
        changeType: 'CATALOG_SEED',
        previousStock: null,
        newStock: prod.stockCount,
        delta: prod.stockCount,
        reasonCode: 'catalogo_inicial',
        operatorNotes: 'Carga inicial del catálogo canónico PRONTO',
        changedBy: 'SYSTEM_SEED',
        changedByEmail: 'system@prontoinsumos.cl',
        actorRole: 'SYSTEM_SEED',
        timestamp: nowIso
      })
    }

    seededProducts++
  }

  console.log(`✅ ${seededProducts} productos canónicos sincronizados en Firestore.`)

  // Check if a sample order exists, if not seed one
  const sampleOrderId = 'PRONTO-SAMPLE-001'
  const sampleOrderRef = db.collection(col('orders')).doc(sampleOrderId)
  const existingOrder = await sampleOrderRef.get()

  if (!existingOrder.exists) {
    const sampleOrder = {
      orderId: sampleOrderId,
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
      bankTransfer: {
        voucherUrl: 'https://placehold.co/600x800/0f172a/ffffff?text=Comprobante+Banco+de+Chile',
        voucherFileName: 'comprobante_transferencia_001.pdf',
        voucherUploadedAt: nowIso,
        approvedAt: nowIso,
        approvedBy: 'admin@prontoinsumos.cl'
      },
      voucherUrl: 'https://placehold.co/600x800/0f172a/ffffff?text=Comprobante+Banco+de+Chile',
      voucherFileName: 'comprobante_transferencia_001.pdf',
      voucherUploadedAt: nowIso,
      approvedAt: nowIso,
      approvedBy: 'admin@prontoinsumos.cl'
    }

    await sampleOrderRef.set(sampleOrder)

    // Record order status history
    const historyRef = db.collection(col('order_status_history')).doc()
    await historyRef.set({
      id: historyRef.id,
      orderId: sampleOrderId,
      previousStatus: 'PENDIENTE_TRANSFERENCIA',
      newStatus: 'TRANSFERENCIA_APROBADA',
      changedBy: 'admin@prontoinsumos.cl',
      changedByEmail: 'admin@prontoinsumos.cl',
      actorRole: 'ADMIN',
      timestamp: nowIso,
      reason: 'Aprobación de transferencia y verificación de comprobante Banco de Chile',
      metadata: {
        sampleRecord: true
      }
    })

    console.log(`✅ Pedido canónico de ejemplo "${sampleOrderId}" sembrado con éxito.`)
  } else {
    console.log(`ℹ️ Pedido de ejemplo "${sampleOrderId}" ya existe.`)
  }

  console.log('\n🎉 Sincronización de esquema y datos completada.\n')
}

async function runPurgeAndSeed() {
  if (!forceFlag) {
    console.error('❌ Error: El comando --purge-and-seed requiere el flag --force para confirmar la purga.')
    console.error('Uso: pnpm run schema:purge-and-seed --force')
    process.exit(1)
  }

  if (!isDev && !process.argv.includes('--confirm-production-wipe')) {
    console.error('\n🛑 OPERACIÓN ABORTADA POR SEGURIDAD:')
    console.error('Estás intentando purgar la base de datos de PRODUCCIÓN (colecciones canónicas).')
    console.error('Para purgar el entorno de desarrollo/pruebas ejecuta: pnpm run schema:purge:dev')
    console.error('Si REALMENTE deseas purgar producción, debes incluir: --confirm-production-wipe')
    console.error('Ejemplo: npx tsx scripts/manage-firestore-schema.ts --purge-and-seed --force --confirm-production-wipe\n')
    process.exit(1)
  }

  console.log(`\n⚠️ [SCHEMA PURGE] Eliminando documentos antiguos [Entorno: ${targetEnv}]...\n`)

  const collectionsToPurge = [col('products'), col('orders'), col('order_status_history'), col('inventory_audit_logs')]

  for (const colName of collectionsToPurge) {
    const snap = await db.collection(colName).get()
    if (!snap.empty) {
      const BATCH_LIMIT = 450
      const docs = snap.docs
      for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
        const chunk = docs.slice(i, i + BATCH_LIMIT)
        const batch = db.batch()
        chunk.forEach(doc => {
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

async function main() {
  switch (mode) {
    case '--validate':
      await runValidate()
      break
    case '--seed':
      await runSeed()
      break
    case '--purge-and-seed':
      await runPurgeAndSeed()
      break
    default:
      console.log(`Comando desconocido: ${mode}`)
      console.log('Opciones disponibles:')
      console.log('  --validate [--env=dev]            : Audita colecciones contra el esquema')
      console.log('  --seed [--env=dev]                : Siembra catálogo canónico y pedido de prueba')
      console.log('  --purge-and-seed --force [--env=dev]: Purga y recrea colecciones del entorno')
      process.exit(1)
  }
}

main().catch(err => {
  console.error('❌ Error ejecutando script de esquema:', err)
  process.exit(1)
})
