import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Firestore, DocumentReference } from 'firebase-admin/firestore'
import { getAdminFirestore } from './_lib/firebaseAdmin.js'
import { getCollectionName } from './_lib/firestoreEnv.js'
import { sendEmail, getWarehouseEmail } from './_lib/email.js'
import { buildWarehouseAlertEmail, toOrderEmailData } from './_lib/emailTemplates.js'
import { isSimulatedPaymentAllowed } from './_lib/simulationPolicy.js'
import {
  VOUCHER_MAX_BYTES,
  VOUCHER_MAX_MB,
  attachVoucherDownloadToken,
  buildVoucherStoragePath,
  createVoucherUploadUrl,
  deleteVoucherObject,
  getVoucherBucket,
  isVoucherStoragePathForOrder,
  normalizeVoucherContentType,
  randomVoucherToken,
  sanitizeOrderIdForPath,
  sanitizeVoucherFileName,
  validateVoucherFileMetadata,
  type AdminBucket
} from './_lib/voucherStorage.js'

const VOUCHER_SUBMITTED_STATUS = 'TRANSFERENCIA_COMPROBANTE_SUBIDO'

/** Statuses from which a voucher may be attached or replaced (Task 2.9 lifecycle guard). */
const VOUCHER_UPLOADABLE_STATUSES = ['PENDIENTE_TRANSFERENCIA', VOUCHER_SUBMITTED_STATUS]

const UPLOAD_UNAVAILABLE_MESSAGE =
  'No pudimos preparar la subida segura de tu comprobante. Escríbenos por WhatsApp y lo recibimos manualmente.'
const PERSISTENCE_ERROR_MESSAGE =
  'No pudimos registrar el comprobante en tu pedido. Por favor reintenta o escríbenos por WhatsApp.'

function normalizeRut(raw: string): string {
  return (raw || '').replace(/[^0-9kK]/g, '').toUpperCase()
}

interface ResolvedOrder {
  ref: DocumentReference
  data: Record<string, unknown>
}

/**
 * Order lookup: direct document key first (the canonical Order ID IS the document id),
 * then the `where('orderId','==')` fallback for legacy documents.
 */
async function findOrder(adminDb: Firestore, cleanOrderId: string): Promise<ResolvedOrder | null> {
  const collection = adminDb.collection(getCollectionName('orders'))

  const direct = await collection.doc(cleanOrderId).get()
  if (direct.exists) {
    return { ref: direct.ref, data: (direct.data() || {}) as Record<string, unknown> }
  }

  const snapshot = await collection.where('orderId', '==', cleanOrderId).limit(1).get()
  if (snapshot.empty) return null

  const doc = snapshot.docs[0]
  return { ref: doc.ref, data: (doc.data() || {}) as Record<string, unknown> }
}

/** Phase 1 — authorize the upload and mint a short-lived V4 signed PUT URL (no bytes, no writes). */
async function handleSign(
  res: VercelResponse,
  bucket: AdminBucket,
  cleanOrderId: string,
  body: Record<string, unknown>
): Promise<VercelResponse> {
  const { fileName, contentType, sizeBytes } = body

  if (!fileName || !contentType || sizeBytes === undefined || sizeBytes === null) {
    return res
      .status(400)
      .json({ error: 'Faltan parámetros obligatorios: fileName, contentType y sizeBytes.' })
  }

  const normalizedType = normalizeVoucherContentType(contentType)
  if (!normalizedType) {
    return res
      .status(400)
      .json({ error: 'Formato no soportado. Por favor adjunta un archivo en PDF, PNG o JPG.' })
  }

  const declaredSize = Number(sizeBytes)
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
    return res.status(400).json({ error: 'Tamaño de archivo no válido.' })
  }
  if (declaredSize > VOUCHER_MAX_BYTES) {
    return res
      .status(400)
      .json({ error: `El archivo excede el tamaño máximo permitido de ${VOUCHER_MAX_MB} MB.` })
  }

  const storagePath = buildVoucherStoragePath(
    getCollectionName('orders'),
    cleanOrderId,
    normalizedType,
    Date.now(),
    randomVoucherToken(8)
  )

  try {
    const { uploadUrl, expiresAt } = await createVoucherUploadUrl(bucket, storagePath, normalizedType)
    return res.status(200).json({
      success: true,
      orderId: cleanOrderId,
      uploadUrl,
      storagePath,
      contentType: normalizedType,
      fileName: sanitizeVoucherFileName(fileName),
      // Exact byte cap bound into the signed URL — the client must echo it back in
      // the `x-goog-content-length-range` header or Storage rejects the PUT.
      maxBytes: VOUCHER_MAX_BYTES,
      expiresAt
    })
  } catch (err: unknown) {
    console.error('[upload-voucher] Failed to sign the voucher upload URL:', err)
    return res.status(500).json({ error: UPLOAD_UNAVAILABLE_MESSAGE })
  }
}

/** Phase 2 — verify the uploaded object against its real metadata, then persist the order trail. */
async function handleConfirm(
  res: VercelResponse,
  adminDb: Firestore,
  bucket: AdminBucket,
  cleanOrderId: string,
  currentStatus: string,
  order: ResolvedOrder,
  body: Record<string, unknown>
): Promise<VercelResponse> {
  const { storagePath, fileName } = body

  if (!storagePath) {
    return res.status(400).json({ error: 'Falta el identificador del comprobante subido.' })
  }

  if (!isVoucherStoragePathForOrder(storagePath, getCollectionName('orders'), cleanOrderId)) {
    return res
      .status(400)
      .json({ error: 'La ruta del comprobante no corresponde a este pedido.' })
  }

  const file = bucket.file(storagePath)

  let metadata: { size?: unknown; contentType?: unknown }
  try {
    const [objectMetadata] = await file.getMetadata()
    metadata = objectMetadata
  } catch (err: unknown) {
    console.warn(
      '[upload-voucher] Uploaded voucher object not found:',
      err instanceof Error ? err.message : err
    )
    return res
      .status(400)
      .json({ error: 'No encontramos el comprobante subido. Por favor vuelve a intentarlo.' })
  }

  const validation = validateVoucherFileMetadata(metadata)
  if (!validation.isValid) {
    await deleteVoucherObject(bucket, storagePath)
    return res.status(400).json({ error: validation.error })
  }

  const normalizedType = normalizeVoucherContentType(metadata.contentType) as string
  const sizeBytes = Number(metadata.size)

  // Idempotent fast path, before any side effect: re-confirming the object that is already
  // recorded must not rotate its download token, re-write the order or re-notify.
  if (order.data.voucherStoragePath === storagePath && currentStatus === VOUCHER_SUBMITTED_STATUS) {
    return res.status(200).json({
      success: true,
      duplicate: true,
      orderId: cleanOrderId,
      voucherUrl: order.data.voucherUrl,
      voucherFileName: order.data.voucherFileName,
      voucherContentType: order.data.voucherContentType,
      voucherSizeBytes: order.data.voucherSizeBytes,
      voucherUploadedAt: order.data.voucherUploadedAt,
      status: VOUCHER_SUBMITTED_STATUS,
      message: 'Comprobante ya registrado. En proceso de validación contable.'
    })
  }

  const timestamp = new Date().toISOString()
  const cleanFileName = sanitizeVoucherFileName(fileName || order.data.voucherFileName)

  let voucherUrl: string
  try {
    voucherUrl = await attachVoucherDownloadToken(bucket, storagePath)
  } catch (err: unknown) {
    console.error('[upload-voucher] Failed to attach the voucher download token:', err)
    return res.status(500).json({ error: UPLOAD_UNAVAILABLE_MESSAGE })
  }

  const previousStoragePath = order.data.voucherStoragePath
  const historyRef = adminDb.collection(getCollectionName('order_status_history')).doc()

  // The lifecycle guard must hold at write time: the status is re-read inside the
  // transaction, so an admin approval (or a cancellation) landing between the
  // authorization read and this write can never be regressed by a voucher upload.
  let conflictedStatus = ''
  let latestData: Record<string, unknown> = order.data
  let outcome: 'persisted' | 'duplicate' | 'status-changed'

  try {
    outcome = await adminDb.runTransaction(async (transaction) => {
      const fresh = await transaction.get(order.ref)
      const freshData = (fresh.data() || {}) as Record<string, unknown>
      const freshStatus = String(freshData.status || '')
      latestData = freshData

      // Rare race: another confirm of this exact object committed while the token was being
      // minted — repoint the order at the token that now exists, without a second history
      // event or warehouse alert.
      if (freshData.voucherStoragePath === storagePath && freshStatus === VOUCHER_SUBMITTED_STATUS) {
        transaction.update(order.ref, { voucherUrl, updatedAt: timestamp })
        return 'duplicate'
      }

      if (!VOUCHER_UPLOADABLE_STATUSES.includes(freshStatus)) {
        conflictedStatus = freshStatus
        return 'status-changed'
      }

      transaction.update(order.ref, {
        voucherUrl,
        voucherStoragePath: storagePath,
        voucherFileName: cleanFileName,
        voucherContentType: normalizedType,
        voucherSizeBytes: sizeBytes,
        voucherUploadedAt: timestamp,
        status: VOUCHER_SUBMITTED_STATUS,
        updatedAt: timestamp
      })

      transaction.set(historyRef, {
        id: historyRef.id,
        orderId: cleanOrderId,
        previousStatus: freshStatus,
        newStatus: VOUCHER_SUBMITTED_STATUS,
        changedBy: 'CUSTOMER',
        changedByEmail: (freshData.customer as { email?: string } | undefined)?.email || null,
        actorRole: 'CUSTOMER',
        timestamp,
        reason: `Comprobante de transferencia bancaria adjuntado (${cleanFileName})`,
        metadata: {
          fileName: cleanFileName,
          contentType: normalizedType,
          sizeBytes,
          storagePath
        }
      })

      return 'persisted'
    })
  } catch (err: unknown) {
    console.error('[upload-voucher] Failed to persist the voucher on the order document:', err)
    return res.status(500).json({ error: PERSISTENCE_ERROR_MESSAGE })
  }

  if (outcome === 'duplicate') {
    return res.status(200).json({
      success: true,
      duplicate: true,
      orderId: cleanOrderId,
      voucherUrl: latestData.voucherUrl,
      voucherFileName: latestData.voucherFileName,
      voucherContentType: latestData.voucherContentType,
      voucherSizeBytes: latestData.voucherSizeBytes,
      voucherUploadedAt: latestData.voucherUploadedAt,
      status: VOUCHER_SUBMITTED_STATUS,
      message: 'Comprobante ya registrado. En proceso de validación contable.'
    })
  }

  if (outcome === 'status-changed') {
    await deleteVoucherObject(bucket, storagePath)
    return res.status(409).json({
      error: `No es posible modificar el comprobante: el pedido está en estado "${conflictedStatus}". Escríbenos por WhatsApp para asistirte.`
    })
  }

  // Only after the order document owns the new voucher: drop the object it replaced.
  if (previousStoragePath && previousStoragePath !== storagePath) {
    await deleteVoucherObject(bucket, previousStoragePath)
  }

  // Warehouse alert (fail-safe): voucher received — verify against Banco de Chile
  const warehouseEmail = getWarehouseEmail()
  if (warehouseEmail) {
    const emailData = toOrderEmailData(cleanOrderId, {
      ...order.data,
      status: VOUCHER_SUBMITTED_STATUS
    })
    await sendEmail({
      to: warehouseEmail,
      ...buildWarehouseAlertEmail(emailData, VOUCHER_SUBMITTED_STATUS)
    })
  }

  return res.status(200).json({
    success: true,
    orderId: cleanOrderId,
    voucherUrl,
    voucherFileName: cleanFileName,
    voucherContentType: normalizedType,
    voucherSizeBytes: sizeBytes,
    voucherUploadedAt: timestamp,
    status: VOUCHER_SUBMITTED_STATUS,
    message: 'Comprobante adjuntado exitosamente. En proceso de validación contable.'
  })
}

/**
 * Bank-transfer voucher intake (Task 2.9).
 *
 * Two-phase, action-dispatched endpoint — no serverless-function slot is added:
 *   * `action: 'sign'`    → authorize + validate, return a short-lived V4 signed PUT URL
 *   * `action: 'confirm'` → re-validate the object's real metadata, persist the order trail
 *
 * The browser uploads the bytes straight to the private bucket; voucher data URLs are
 * never accepted (and never stored on the order document).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = (req.body || {}) as Record<string, unknown>

    if (body.dataUrl) {
      return res.status(400).json({
        error:
          'El comprobante ya no se envía en base64. Sube el archivo directamente al almacenamiento seguro.'
      })
    }

    const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : ''
    if (action !== 'sign' && action !== 'confirm') {
      return res
        .status(400)
        .json({ error: 'Acción no válida: se espera "sign" o "confirm".' })
    }

    const { orderId, rut } = body
    if (!orderId || !rut) {
      return res
        .status(400)
        .json({ error: 'Faltan parámetros obligatorios: orderId y rut.' })
    }

    const cleanOrderId = String(orderId).trim().toUpperCase()
    const cleanUserRut = normalizeRut(String(rut))

    if (!cleanUserRut || cleanUserRut.length < 8) {
      return res.status(400).json({ error: 'Formato de RUT no válido.' })
    }

    if (!sanitizeOrderIdForPath(cleanOrderId)) {
      return res.status(400).json({ error: 'Código de pedido no válido.' })
    }

    const adminDb = getAdminFirestore()
    const bucket = getVoucherBucket()

    if (!adminDb || !bucket) {
      if (!isSimulatedPaymentAllowed()) {
        console.error(
          '[upload-voucher] Firestore Admin / Storage unavailable in a production runtime — refusing the voucher upload.'
        )
        return res.status(500).json({ error: UPLOAD_UNAVAILABLE_MESSAGE })
      }
      console.warn(
        '[upload-voucher] Firestore Admin / Storage unavailable — returning a simulated voucher response (non-production runtime).'
      )
      return res.status(200).json({
        success: true,
        simulated: true,
        orderId: cleanOrderId,
        status: VOUCHER_SUBMITTED_STATUS,
        message: 'Comprobante recepcionado en modo simulación (no se almacenó).'
      })
    }

    const order = await findOrder(adminDb, cleanOrderId)
    if (!order) {
      return res.status(404).json({
        error: `No se encontró un pedido con el código "${cleanOrderId}".`
      })
    }

    // Authorization check: match purchaser's RUT
    const orderCustomerRut = normalizeRut(
      ((order.data.customer as { rut?: string } | undefined)?.rut ||
        (order.data.billing as { rut?: string } | undefined)?.rut ||
        '') as string
    )
    if (orderCustomerRut !== cleanUserRut) {
      return res.status(401).json({
        error: 'El RUT ingresado no coincide con el registrado para este pedido.'
      })
    }

    // Lifecycle guard: only a pending transfer (or a re-upload of an already submitted voucher)
    // may attach a voucher — never a paid, dispatched or delivered order.
    const currentStatus = String(order.data.status || '')
    if (!VOUCHER_UPLOADABLE_STATUSES.includes(currentStatus)) {
      return res.status(409).json({
        error: `No es posible modificar el comprobante: el pedido está en estado "${currentStatus}". Escríbenos por WhatsApp para asistirte.`
      })
    }

    return action === 'sign'
      ? handleSign(res, bucket, cleanOrderId, body)
      : handleConfirm(res, adminDb, bucket, cleanOrderId, currentStatus, order, body)
  } catch (error: any) {
    // The raw cause is logged, never returned: this endpoint is unauthenticated.
    console.error('Error uploading transfer voucher:', error)
    return res.status(500).json({ error: UPLOAD_UNAVAILABLE_MESSAGE })
  }
}
