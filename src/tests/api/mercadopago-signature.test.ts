import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { verifyMercadoPagoSignature } from '../../../api/_lib/mercadopagoSignature'

describe('Mercado Pago Signature Verification (api/_lib/mercadopagoSignature)', () => {
  const mockSecret = 'prod_secret_key_abcdef123456'
  const mockDataId = '998877'
  const mockRequestId = 'req-uuid-12345'
  const mockTs = '1710372000'

  function generateValidSignature(secret: string, dataId: string, requestId: string, ts: string): string {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
    return `ts=${ts},v1=${hash}`
  }

  it('should validate a genuine HMAC-SHA256 signature successfully', () => {
    const validSignature = generateValidSignature(mockSecret, mockDataId, mockRequestId, mockTs)

    const result = verifyMercadoPagoSignature({
      signatureHeader: validSignature,
      requestIdHeader: mockRequestId,
      dataId: mockDataId,
      secret: mockSecret
    })

    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('should reject a tampered signature hash', () => {
    const validSignature = generateValidSignature(mockSecret, mockDataId, mockRequestId, mockTs)
    const tamperedSignature = validSignature.replace(/v1=[a-f0-9]{4}/, 'v1=deadbeef')

    const result = verifyMercadoPagoSignature({
      signatureHeader: tamperedSignature,
      requestIdHeader: mockRequestId,
      dataId: mockDataId,
      secret: mockSecret
    })

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('signature_mismatch')
  })

  it('should reject when dataId does not match the signed manifest', () => {
    const validSignature = generateValidSignature(mockSecret, mockDataId, mockRequestId, mockTs)

    const result = verifyMercadoPagoSignature({
      signatureHeader: validSignature,
      requestIdHeader: mockRequestId,
      dataId: 'different-data-id-555',
      secret: mockSecret
    })

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('signature_mismatch')
  })

  it('should reject when x-request-id does not match the signed manifest', () => {
    const validSignature = generateValidSignature(mockSecret, mockDataId, mockRequestId, mockTs)

    const result = verifyMercadoPagoSignature({
      signatureHeader: validSignature,
      requestIdHeader: 'fake-request-id-999',
      dataId: mockDataId,
      secret: mockSecret
    })

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('signature_mismatch')
  })

  it('should reject when signature or request-id headers are missing', () => {
    const result1 = verifyMercadoPagoSignature({
      signatureHeader: undefined,
      requestIdHeader: mockRequestId,
      dataId: mockDataId,
      secret: mockSecret
    })
    expect(result1.valid).toBe(false)
    expect(result1.reason).toBe('missing_signature_headers_or_id')

    const result2 = verifyMercadoPagoSignature({
      signatureHeader: 'ts=123,v1=abc',
      requestIdHeader: undefined,
      dataId: mockDataId,
      secret: mockSecret
    })
    expect(result2.valid).toBe(false)
    expect(result2.reason).toBe('missing_signature_headers_or_id')
  })

  it('should reject malformed x-signature header missing ts or v1', () => {
    const result1 = verifyMercadoPagoSignature({
      signatureHeader: 'invalid_format_without_keys',
      requestIdHeader: mockRequestId,
      dataId: mockDataId,
      secret: mockSecret
    })
    expect(result1.valid).toBe(false)
    expect(result1.reason).toBe('malformed_x_signature_header')

    const result2 = verifyMercadoPagoSignature({
      signatureHeader: 'ts=1710372000', // missing v1
      requestIdHeader: mockRequestId,
      dataId: mockDataId,
      secret: mockSecret
    })
    expect(result2.valid).toBe(false)
    expect(result2.reason).toBe('malformed_x_signature_header')
  })

  it('should permit processing in development mode when secret is not configured or is placeholder', () => {
    const result1 = verifyMercadoPagoSignature({
      signatureHeader: undefined,
      requestIdHeader: undefined,
      dataId: mockDataId,
      secret: undefined
    })
    expect(result1.valid).toBe(true)
    expect(result1.reason).toBe('secret_not_configured')

    const result2 = verifyMercadoPagoSignature({
      signatureHeader: undefined,
      requestIdHeader: undefined,
      dataId: mockDataId,
      secret: 'YOUR_MERCADOPAGO_WEBHOOK_SECRET'
    })
    expect(result2.valid).toBe(true)
    expect(result2.reason).toBe('secret_not_configured')
  })

  it('should handle array header inputs from Node HTTP request object', () => {
    const validSignature = generateValidSignature(mockSecret, mockDataId, mockRequestId, mockTs)

    const result = verifyMercadoPagoSignature({
      signatureHeader: [validSignature],
      requestIdHeader: [mockRequestId],
      dataId: mockDataId,
      secret: mockSecret
    })

    expect(result.valid).toBe(true)
  })

  it('should clean quotes and whitespace from secret environment variables', () => {
    const validSignature = generateValidSignature(mockSecret, mockDataId, mockRequestId, mockTs)

    const result = verifyMercadoPagoSignature({
      signatureHeader: validSignature,
      requestIdHeader: mockRequestId,
      dataId: mockDataId,
      secret: ` "${mockSecret}" `
    })

    expect(result.valid).toBe(true)
  })

  it('should support semicolon-separated signature header formats', () => {
    const manifest = `id:${mockDataId};request-id:${mockRequestId};ts:${mockTs};`
    const hash = crypto.createHmac('sha256', mockSecret).update(manifest).digest('hex')
    const semicolonSignature = `ts=${mockTs};v1=${hash}`

    const result = verifyMercadoPagoSignature({
      signatureHeader: semicolonSignature,
      requestIdHeader: mockRequestId,
      dataId: mockDataId,
      secret: mockSecret
    })

    expect(result.valid).toBe(true)
  })

  it('should handle case-insensitive hex signatures without false mismatch', () => {
    const manifest = `id:${mockDataId};request-id:${mockRequestId};ts:${mockTs};`
    const uppercaseHash = crypto.createHmac('sha256', mockSecret).update(manifest).digest('hex').toUpperCase()
    const uppercaseSig = `ts=${mockTs},v1=${uppercaseHash}`

    const result = verifyMercadoPagoSignature({
      signatureHeader: uppercaseSig,
      requestIdHeader: mockRequestId,
      dataId: mockDataId,
      secret: mockSecret
    })

    expect(result.valid).toBe(true)
  })

  it('should reject timestamps that exceed replay attack maxAgeSeconds threshold', () => {
    const oldTs = '1500000000' // Far in the past
    const oldSignature = generateValidSignature(mockSecret, mockDataId, mockRequestId, oldTs)

    const result = verifyMercadoPagoSignature({
      signatureHeader: oldSignature,
      requestIdHeader: mockRequestId,
      dataId: mockDataId,
      secret: mockSecret,
      maxAgeSeconds: 300 // 5 minutes tolerance
    })

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('timestamp_expired')
  })

  it('should accept timestamps within replay attack maxAgeSeconds tolerance', () => {
    const currentTs = Math.floor(Date.now() / 1000).toString()
    const recentSignature = generateValidSignature(mockSecret, mockDataId, mockRequestId, currentTs)

    const result = verifyMercadoPagoSignature({
      signatureHeader: recentSignature,
      requestIdHeader: mockRequestId,
      dataId: mockDataId,
      secret: mockSecret,
      maxAgeSeconds: 300
    })

    expect(result.valid).toBe(true)
  })
})
