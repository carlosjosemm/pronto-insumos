import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import fs from 'node:fs'
import path from 'node:path'

// Auto-load .env.local or .env if running locally from terminal
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
        const val = trimmed
          .slice(eqIdx + 1)
          .trim()
          .replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    }
  }
}

/**
 * One-time CLI setup script to provision the primary administrator user in Firebase Auth
 * and assign the custom claim { admin: true }.
 *
 * Usage:
 *   npx tsx scripts/setup-admin.ts [optional-email] [optional-password]
 */
async function setupAdmin() {
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
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey
          })
        })

  const targetEmail = process.argv[2] || process.env.ADMIN_EMAIL
  const targetPassword = process.argv[3] || process.env.ADMIN_INITIAL_PASSWORD

  if (!targetEmail || !targetPassword) {
    console.error('\n❌ Error: Debes especificar el correo y contraseña del administrador.')
    console.error('Uso:')
    console.error('  pnpm run setup:admin <email> <password>')
    console.error('O definir en .env.local:')
    console.error('  ADMIN_EMAIL=tu-email@prontoinsumos.cl')
    console.error('  ADMIN_INITIAL_PASSWORD=TuPasswordSegura123!\n')
    process.exit(1)
  }

  console.log(`\n🩺 PRONTO Admin Setup Script`)
  console.log(`Configurando administrador: ${targetEmail}`)

  try {
    let user
    try {
      user = await auth.getUserByEmail(targetEmail)
      console.log(`ℹ️ Usuario ya existe en Firebase Auth (UID: ${user.uid}).`)
    } catch {
      user = await auth.createUser({
        email: targetEmail,
        password: targetPassword,
        displayName: 'PRONTO Admin Melipilla'
      })
      console.log(`✅ Usuario creado exitosamente (UID: ${user.uid}).`)
    }

    // Set custom claim { admin: true }
    await auth.setCustomUserClaims(user.uid, { admin: true })
    console.log(`🛡️ Permiso administrativo { admin: true } asignado a ${targetEmail}.`)
    console.log(`\n🎉 Configuración completada. Ya puedes iniciar sesión en /admin.\n`)
  } catch (err: any) {
    console.error('❌ Error al configurar el administrador:', err.message)
    process.exit(1)
  }
}

setupAdmin()
