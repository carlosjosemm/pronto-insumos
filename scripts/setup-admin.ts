import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

/**
 * One-time CLI setup script to provision the primary administrator user in Firebase Auth
 * and assign the custom claim { admin: true }.
 *
 * Usage:
 *   npx tsx scripts/setup-admin.ts [optional-email] [optional-password]
 */
async function setupAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const rawKey = process.env.FIREBASE_PRIVATE_KEY?.trim()
  const privateKey = rawKey ? rawKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n') : undefined

  if (!projectId || !clientEmail || !privateKey) {
    console.error('❌ Error: Variables de entorno requeridas no encontradas.')
    console.error('Asegúrate de definir FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY.')
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

  const auth = getAuth(app)
  const targetEmail = process.argv[2] || process.env.ADMIN_EMAIL || 'admin@prontoinsumos.cl'
  const targetPassword = process.argv[3] || process.env.ADMIN_INITIAL_PASSWORD || 'changeme123!'

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
