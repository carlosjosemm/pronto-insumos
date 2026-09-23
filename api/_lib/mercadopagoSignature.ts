import crypto from 'crypto'

export interface VerifySignatureOptions {
  signatureHeader?: string | string[]
  requestIdHeader?: string | string[]
  dataId?: string | number
  secret?: string
  maxAgeSeconds?: number
}

export interface VerifySignatureResult {
  valid: boolean
  reason?: string
}

/**
 * Verifies Mercado Pago webhook cryptographic signature (HMAC-SHA256).
 * Follows official Mercado Pago signature verification specification:
 * Manifest: "id:[data.id];request-id:[x-request-id];ts:[ts];"
 *
 * @param options - Verification options including headers, dataId, secret, and optional maxAgeSeconds
 * @returns Object with valid status and optional reason string
 */
export function verifyMercadoPagoSignature({
  signatureHeader,
  requestIdHeader,
  dataId,
  secret,
  maxAgeSeconds
}: VerifySignatureOptions): VerifySignatureResult {
  const cleanSecret = (secret || '').trim().replace(/^["']|["']$/g, '').trim()

  // If no secret configured or placeholder, skip verification (development / fallback mode)
  if (!cleanSecret || cleanSecret === 'YOUR_MERCADOPAGO_WEBHOOK_SECRET') {
    return { valid: true, reason: 'secret_not_configured' }
  }

  const rawSig = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader
  const rawRequestId = (Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader)?.trim()
  const cleanDataId = dataId !== undefined && dataId !== null ? String(dataId).trim() : ''

  if (!rawSig || !rawRequestId || !cleanDataId) {
    return { valid: false, reason: 'missing_signature_headers_or_id' }
  }

  // Parse ts and v1 from x-signature: "ts=1704067200,v1=abc123..." (supports comma or semicolon delimiters)
  const parts: Record<string, string> = {}
  rawSig.split(/[;,]/).forEach((part) => {
    const [key, ...vals] = part.trim().split('=')
    if (key && vals.length > 0) {
      parts[key.toLowerCase()] = vals.join('=')
    }
  })

  const ts = parts['ts']?.trim()
  const v1 = parts['v1']?.trim()

  if (!ts || !v1) {
    return { valid: false, reason: 'malformed_x_signature_header' }
  }

  // Optional replay attack timestamp age verification
  if (maxAgeSeconds && maxAgeSeconds > 0) {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const parsedTs = parseInt(ts, 10)
    if (!isNaN(parsedTs) && Math.abs(nowSeconds - parsedTs) > maxAgeSeconds) {
      return { valid: false, reason: 'timestamp_expired' }
    }
  }

  // Manifest template: id:[data.id];request-id:[x-request-id];ts:[ts];
  const manifest = `id:${cleanDataId};request-id:${rawRequestId};ts:${ts};`

  const expectedSignature = crypto
    .createHmac('sha256', cleanSecret)
    .update(manifest)
    .digest('hex')

  const expectedBuffer = Buffer.from(expectedSignature.toLowerCase(), 'utf8')
  const receivedBuffer = Buffer.from(v1.toLowerCase(), 'utf8')

  if (expectedBuffer.length !== receivedBuffer.length) {
    return { valid: false, reason: 'signature_mismatch' }
  }

  const matches = crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  return { valid: matches, reason: matches ? undefined : 'signature_mismatch' }
}
