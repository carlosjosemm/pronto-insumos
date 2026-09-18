import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import fs from 'node:fs'
import path from 'node:path'
import { validateProductSchema } from '../src/utils/schemaValidation'
import type { Product, InventoryAuditLog } from '../src/types'

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

// Environment flags
const isExplicitProd = process.argv.includes('--env=prod') || process.argv.includes('--prod')
const isDev = !isExplicitProd // Default to dev environment unless explicitly asked for prod
const colPrefix = isDev ? 'dev_' : ''
const targetEnv = isDev ? 'DESARROLLO (dev_*)' : 'PRODUCCIÓN CANÓNICA'

function col(baseName: string): string {
  return `${colPrefix}${baseName}`
}

function parseCSVLine(line: string): string[] {
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

async function importCatalog() {
  console.log(`\n🚀 [CATALOG IMPORT] Iniciando importación de catálogo oficial [Entorno: ${targetEnv}]...`)

  if (!isDev && !process.argv.includes('--confirm-production-import') && !process.argv.includes('--force')) {
    console.error('\n⚠️  ATENCIÓN: Estás a punto de importar al entorno de PRODUCCIÓN.')
    console.error('Para confirmar esta operación, agrega la bandera --confirm-production-import:')
    console.error('  pnpm run catalog:import --confirm-production-import\n')
    process.exit(1)
  }

  // 1. Locate and parse CSV file
  const customFileArg = process.argv.find(a => a.startsWith('--file='))
  const csvFileName = customFileArg ? customFileArg.split('=')[1] : 'listo-of-prices-pronto-basic.csv'
  const csvFilePath = path.resolve(process.cwd(), csvFileName)

  if (!fs.existsSync(csvFilePath)) {
    console.error(`\n❌ Error: No se encontró el archivo CSV en: ${csvFilePath}`)
    process.exit(1)
  }

  const rawContent = fs.readFileSync(csvFilePath, 'utf8')
  const lines = rawContent.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) {
    console.error('\n❌ Error: El archivo CSV está vacío o solo contiene cabecera.')
    process.exit(1)
  }

  console.log(`📄 Archivo CSV leído: ${csvFileName} (${lines.length - 1} registros detectados)`)

  const parsedItems: {
    name: string
    category: string
    brand: string
    price: number
  }[] = []

  for (let i = 1; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i])
    if (parts.length >= 4) {
      const desc = parts[0]
      const cat = parts[1]
      const marca = parts[2]
      const priceStr = parts[3].replace(/[^0-9]/g, '')
      const price = parseInt(priceStr, 10)

      if (!desc || isNaN(price) || price <= 0) {
        console.warn(`  ⚠️ Línea ${i + 1} omitida por datos inválidos: ${lines[i]}`)
        continue
      }

      parsedItems.push({
        name: desc,
        category: cat,
        brand: marca || 'Genérico',
        price
      })
    }
  }

  console.log(`✅ ${parsedItems.length} insumos clínicos procesados correctamente desde el CSV.`)

  // 2. Fetch existing products to inactivate prototype items (odon-*)
  console.log(`\n🔍 Verificando productos existentes en colección "${col('products')}"...`)
  const existingSnap = await db.collection(col('products')).get()
  const nowIso = new Date().toISOString()

  let batch = db.batch()
  let opCount = 0

  let inactivatedCount = 0
  for (const doc of existingSnap.docs) {
    const data = doc.data()
    // If it's a prototype item or any item not part of the new pronto- catalog
    if (doc.id.startsWith('odon-') && (data.isActive !== false || data.inStock !== false)) {
      batch.update(doc.ref, {
        isActive: false,
        inStock: false,
        updatedAt: nowIso
      })
      inactivatedCount++
      opCount++

      if (opCount >= 400) {
        await batch.commit()
        batch = db.batch()
        opCount = 0
      }
    }
  }

  if (inactivatedCount > 0) {
    console.log(`💤 ${inactivatedCount} insumos anteriores (prototipo odon-*) marcados como inactivos.`)
  } else {
    console.log(`ℹ️ No se detectaron productos antiguos activos para inactivar.`)
  }

  // 3. Upsert products from CSV
  console.log(`\n📦 Upserting ${parsedItems.length} insumos odontológicos con inventario base de 10 unidades...`)
  let insertedCount = 0

  for (let idx = 0; idx < parsedItems.length; idx++) {
    const item = parsedItems[idx]
    const productId = `pronto-${String(idx + 1).padStart(3, '0')}`
    const sku = `REF-${item.brand.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()}-${String(idx + 1).padStart(3, '0')}`
    const priceNeto = Math.round(item.price / 1.19)

    const productDoc: Product = {
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
      specs: [
        'Insumo clínico odontológico certificado',
        'Distribución oficial Pronto Insumos Melipilla'
      ],
      placeholderTheme: 'gradient-teal',
      mediaBadge: '',
      images: [],
      packageContents: [`1x ${item.name}`],
      createdAt: nowIso,
      updatedAt: nowIso
    }

    const validation = validateProductSchema(productDoc)
    if (!validation.valid) {
      console.error(`❌ Error de validación de esquema en "${productId}":`, validation.errors)
      process.exit(1)
    }

    const productRef = db.collection(col('products')).doc(productId)
    batch.set(productRef, productDoc, { merge: true })
    opCount++

    // Record initial inventory audit log
    const auditRef = db.collection(col('inventory_audit_logs')).doc()
    const auditRecord: InventoryAuditLog = {
      id: auditRef.id,
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
      timestamp: nowIso,
      metadata: {
        category: item.category,
        price: item.price
      }
    }

    batch.set(auditRef, auditRecord)
    opCount++
    insertedCount++

    if (opCount >= 400) {
      await batch.commit()
      batch = db.batch()
      opCount = 0
    }
  }

  if (opCount > 0) {
    await batch.commit()
  }

  console.log(`\n🎉 [ÉXITO] Ingesta completada con éxito en ${targetEnv}:`)
  console.log(`   - ${insertedCount} productos oficiales sembrados/actualizados (pronto-001 a pronto-${String(insertedCount).padStart(3, '0')}).`)
  console.log(`   - ${inactivatedCount} productos prototipo anteriores inactivados.`)
  console.log(`   - ${insertedCount} registros de auditoría registrados en "${col('inventory_audit_logs')}".`)
  console.log(`\n👉 Ejecuta la validación de esquema para confirmar:`)
  console.log(`   pnpm run schema:validate${isDev ? ':dev' : ''}\n`)
}

importCatalog().catch(err => {
  console.error('\n❌ Error durante la importación:', err)
  process.exit(1)
})
