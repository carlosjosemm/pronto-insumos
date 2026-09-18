import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import fs from 'node:fs'
import path from 'node:path'

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

const isExplicitProd = process.argv.includes('--env=prod') || process.argv.includes('--prod')
const isDev = !isExplicitProd
const colPrefix = isDev ? 'dev_' : ''
const targetEnv = isDev ? 'DESARROLLO (dev_*)' : 'PRODUCCIÓN CANÓNICA'

function col(baseName: string): string {
  return `${colPrefix}${baseName}`
}

async function fixCatalogData() {
  console.log(`\n🩺 [DATA QUALITY FIX] Reparando datos de catálogo en [${targetEnv}]...`)

  if (!isDev && !process.argv.includes('--confirm-production-fix')) {
    console.error('\n⚠️  ATENCIÓN: Para aplicar los cambios a PRODUCCIÓN, incluye el flag:')
    console.error('  pnpm dlx tsx scripts/fix-catalog-data-quality.ts --env=prod --confirm-production-fix\n')
    process.exit(1)
  }

  const productsRef = db.collection(col('products'))
  const snapshot = await productsRef.get()
  const nowIso = new Date().toISOString()

  let batch = db.batch()
  let opCount = 0
  let deletedPrototypeCount = 0
  let updatedBadgeCount = 0

  for (const doc of snapshot.docs) {
    const data = doc.data() as any

    // 1. Purge legacy prototype items (odon-*)
    if (doc.id.startsWith('odon-')) {
      batch.delete(doc.ref)
      deletedPrototypeCount++
      opCount++
    } 
    // 2. Fix mediaBadge on real catalog items
    else {
      const needsBadgeFix = !data.mediaBadge || data.mediaBadge.includes('Stock Inicial')
      if (needsBadgeFix) {
        const brand = data.brand || data.manufacturer || ''
        const cleanMediaBadge = brand && brand !== 'Genérico' && brand !== 'NACIONAL' ? brand : 'Clínico Certificado'
        
        batch.update(doc.ref, {
          mediaBadge: cleanMediaBadge,
          updatedAt: nowIso
        })
        updatedBadgeCount++
        opCount++
      }
    }

    if (opCount >= 400) {
      await batch.commit()
      batch = db.batch()
      opCount = 0
    }
  }

  if (opCount > 0) {
    await batch.commit()
  }

  console.log(`\n✅ Resumen de calidad de datos [${targetEnv}]:`)
  console.log(`   - 🧹 Prototipos eliminados (odon-*): ${deletedPrototypeCount}`)
  console.log(`   - 🏷️ Badges corregidos (marca real): ${updatedBadgeCount}`)
  console.log(`   - 📦 Productos totales activos en catálogo: ${snapshot.size - deletedPrototypeCount}\n`)
}

fixCatalogData().catch(err => {
  console.error('❌ Error ejecutando data quality fix:', err)
  process.exit(1)
})
