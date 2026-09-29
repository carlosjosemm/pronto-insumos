import { UploadVoucherResult } from '../types'
import { validateRut, cleanRut } from '../utils/rut'
import { isSimulatedFallbackAllowed } from './simulationPolicy'

export interface UploadVoucherParams {
  orderId: string
  customerRut: string
  file: File
}

export const VOUCHER_MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']

interface SignPhasePayload {
  success?: boolean
  simulated?: boolean
  uploadUrl?: string
  storagePath?: string
  contentType?: string
  /** Byte cap bound into the signed URL — echoed back verbatim in the upload header. */
  maxBytes?: number
}

/**
 * Validates the file format and size for bank transfer vouchers.
 */
export function validateVoucherFile(file: File): { isValid: boolean; error?: string } {
  if (!file) {
    return { isValid: false, error: 'Debe seleccionar un archivo de comprobante.' }
  }

  if (file.size > VOUCHER_MAX_FILE_BYTES) {
    return { isValid: false, error: 'El archivo excede el tamaño máximo permitido de 5 MB.' }
  }

  const mime = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  const isAllowedExt = name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png')

  if (!ALLOWED_MIME_TYPES.includes(mime) && !isAllowedExt) {
    return {
      isValid: false,
      error: 'Formato no soportado. Por favor adjunta un archivo en PDF, PNG o JPG.'
    }
  }

  return { isValid: true }
}

/**
 * Content type the signed upload URL will be bound to. Browsers leave `File.type`
 * empty for some files, so the extension is used as a fallback — never the filename
 * itself (the server derives the stored extension from the content type).
 */
export function resolveVoucherContentType(file: File): string {
  const mime = (file?.type || '').toLowerCase()
  if (ALLOWED_MIME_TYPES.includes(mime)) {
    return mime === 'image/jpg' ? 'image/jpeg' : mime
  }

  const name = (file?.name || '').toLowerCase()
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'

  return mime
}

function buildSimulatedResult(orderId: string, file: File): UploadVoucherResult {
  console.warn('Endpoint /api/upload-voucher no disponible; usando simulación local (no se almacenó el comprobante).')
  return {
    success: true,
    orderId,
    voucherUrl: `simulated-voucher://${orderId}/${encodeURIComponent(file.name)}`,
    status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
    message: 'Modo simulación: comprobante simulado — no se almacenó en el servidor.'
  }
}

function failure(orderId: string, error: string): UploadVoucherResult {
  return { success: false, orderId, status: 'PENDIENTE_TRANSFERENCIA', error }
}

/** Reads the endpoint's Chilean-Spanish error message; `null` when the response is not JSON. */
async function readEndpointError(response: Response): Promise<string | null> {
  const payload = await response.json().catch(() => null)
  return payload && typeof payload.error === 'string' ? payload.error : null
}

/**
 * Uploads a bank transfer voucher: authorize (sign) → direct upload to the private
 * bucket → confirm. Real HTTP errors surface to the customer — only a demonstrably
 * absent endpoint degrades to the simulated result, and only outside a production
 * runtime (`isSimulatedFallbackAllowed`, the same gate as Task 2.8).
 */
export async function uploadTransferVoucher({
  orderId,
  customerRut,
  file
}: UploadVoucherParams): Promise<UploadVoucherResult> {
  const cleanId = orderId.trim().toUpperCase()
  const normalizedRut = cleanRut(customerRut)

  if (!cleanId) {
    return failure(cleanId, 'Identificador de pedido no proporcionado.')
  }

  if (!validateRut(customerRut)) {
    return failure(cleanId, 'El RUT ingresado no es válido según el algoritmo chileno.')
  }

  const validation = validateVoucherFile(file)
  if (!validation.isValid) {
    return failure(cleanId, validation.error as string)
  }

  const contentType = resolveVoucherContentType(file)

  try {
    const signResponse = await fetch('/api/upload-voucher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sign',
        orderId: cleanId,
        rut: normalizedRut,
        fileName: file.name,
        contentType,
        sizeBytes: file.size
      })
    })

    if (!signResponse.ok) {
      const signError = await readEndpointError(signResponse)
      if (!signError && isSimulatedFallbackAllowed()) return buildSimulatedResult(cleanId, file)
      return failure(cleanId, signError || `Error del servidor (${signResponse.status})`)
    }

    const signPayload = (await signResponse.json().catch(() => null)) as SignPhasePayload | null
    if (signPayload?.simulated === true) return buildSimulatedResult(cleanId, file)

    if (!signPayload?.uploadUrl || !signPayload?.storagePath) {
      return failure(cleanId, 'Respuesta inválida del servidor al preparar la subida del comprobante.')
    }

    // `x-goog-content-length-range` is part of the signed URL: sending it verbatim is what
    // makes Storage itself reject any upload above the 5 MB cap (Task 2.9).
    const uploadHeaders: Record<string, string> = {
      'Content-Type': signPayload.contentType || contentType
    }
    if (signPayload.maxBytes) {
      uploadHeaders['x-goog-content-length-range'] = `0,${signPayload.maxBytes}`
    }

    const uploadResponse = await fetch(signPayload.uploadUrl, {
      method: 'PUT',
      headers: uploadHeaders,
      body: file
    })

    if (!uploadResponse.ok) {
      return failure(
        cleanId,
        `No pudimos subir el archivo al almacenamiento seguro (${uploadResponse.status}). Por favor reintenta.`
      )
    }

    const confirmResponse = await fetch('/api/upload-voucher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'confirm',
        orderId: cleanId,
        rut: normalizedRut,
        storagePath: signPayload.storagePath,
        fileName: file.name
      })
    })

    if (!confirmResponse.ok) {
      const confirmError = await readEndpointError(confirmResponse)
      return failure(cleanId, confirmError || `Error del servidor (${confirmResponse.status})`)
    }

    const confirmPayload = await confirmResponse.json().catch(() => null)
    if (!confirmPayload?.success) {
      return failure(cleanId, confirmPayload?.error || 'No pudimos registrar el comprobante en tu pedido.')
    }

    return {
      success: true,
      orderId: cleanId,
      voucherUrl: confirmPayload.voucherUrl,
      status: 'TRANSFERENCIA_COMPROBANTE_SUBIDO',
      message: confirmPayload.message || 'Comprobante recepcionado exitosamente. En proceso de validación contable.'
    }
  } catch (err: unknown) {
    // Network-level failure: the endpoint (or the storage host) could not be reached.
    if (isSimulatedFallbackAllowed()) return buildSimulatedResult(cleanId, file)

    console.error(
      'No fue posible subir el comprobante a /api/upload-voucher en un runtime de producción:',
      err instanceof Error ? err.message : err
    )
    return failure(
      cleanId,
      'No pudimos conectar con el servidor para subir tu comprobante. Revisa tu conexión e inténtalo nuevamente.'
    )
  }
}
