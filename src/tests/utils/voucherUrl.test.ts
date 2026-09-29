import { describe, it, expect } from 'vitest'
import { ALLOWED_VOUCHER_DATA_TYPES, classifyVoucherUrl, normalizeAllowedVoucherMime } from '../../utils/voucherUrl'

const STORAGE_URL =
  'https://firebasestorage.googleapis.com/v0/b/pronto-insumos.firebasestorage.app/o/vouchers%2Forders%2FPRONTO-1%2Fa.pdf?alt=media&token=tok'

describe('classifyVoucherUrl (Task 0.13)', () => {
  it('accepts the Firebase Storage download-token URL the app itself writes', () => {
    expect(classifyVoucherUrl(STORAGE_URL)).toBe('storage')
    expect(classifyVoucherUrl('HTTPS://FIREBASESTORAGE.GOOGLEAPIS.COM/v0/b/x/o/y')).toBe('storage')
    expect(classifyVoucherUrl(`  ${STORAGE_URL}  `)).toBe('storage')
  })

  it('rejects every non-storage scheme, host and relative form', () => {
    expect(classifyVoucherUrl('javascript:alert(1)')).toBe('unsafe')
    expect(classifyVoucherUrl('JavaScript:alert(document.cookie)')).toBe('unsafe')
    expect(classifyVoucherUrl('http://firebasestorage.googleapis.com/v0/b/x/o/y')).toBe('unsafe')
    expect(classifyVoucherUrl('https://evil.com/comprobante.pdf')).toBe('unsafe')
    expect(classifyVoucherUrl('https://firebasestorage.googleapis.com.evil.com/v0/b/x/o/y')).toBe('unsafe')
    expect(classifyVoucherUrl('//firebasestorage.googleapis.com/v0/b/x/o/y')).toBe('unsafe')
    expect(classifyVoucherUrl('/relative/comprobante.pdf')).toBe('unsafe')
    expect(classifyVoucherUrl('ftp://firebasestorage.googleapis.com/x')).toBe('unsafe')
    expect(classifyVoucherUrl('blob:https://pronto-insumos.vercel.app/1234')).toBe('unsafe')
  })

  it('rejects empty and non-string values', () => {
    expect(classifyVoucherUrl(undefined)).toBe('unsafe')
    expect(classifyVoucherUrl(null)).toBe('unsafe')
    expect(classifyVoucherUrl(42)).toBe('unsafe')
    expect(classifyVoucherUrl({ url: STORAGE_URL })).toBe('unsafe')
    expect(classifyVoucherUrl('')).toBe('unsafe')
    expect(classifyVoucherUrl('   ')).toBe('unsafe')
  })

  it('accepts legacy Base64 vouchers only when the declared MIME is allowlisted', () => {
    expect(classifyVoucherUrl('data:application/pdf;base64,JVBERi0xLjQK')).toBe('legacy-data')
    expect(classifyVoucherUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('legacy-data')
    expect(classifyVoucherUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe('legacy-data')
    expect(classifyVoucherUrl('data:image/jpg;base64,/9j/4AAQSkZJRg==')).toBe('legacy-data')
    expect(classifyVoucherUrl('DATA:APPLICATION/PDF;BASE64,JVBERi0xLjQK')).toBe('legacy-data')
  })

  it('rejects legacy vouchers whose declared MIME is not allowlisted', () => {
    expect(classifyVoucherUrl('data:text/html,<script>alert(1)</script>')).toBe('unsafe')
    expect(classifyVoucherUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe('unsafe')
    expect(classifyVoucherUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe('unsafe')
    expect(classifyVoucherUrl('data:application/xhtml+xml,<script>')).toBe('unsafe')
    expect(classifyVoucherUrl('data:application/javascript,alert(1)')).toBe('unsafe')
    expect(classifyVoucherUrl('data:;base64,JVBERi0xLjQK')).toBe('unsafe')
    expect(classifyVoucherUrl('data:,hola')).toBe('unsafe')
  })
})

describe('normalizeAllowedVoucherMime (Task 0.13)', () => {
  it('normalizes the allowlisted types (case, parameters, image/jpg)', () => {
    expect(normalizeAllowedVoucherMime('application/pdf')).toBe('application/pdf')
    expect(normalizeAllowedVoucherMime('APPLICATION/PDF')).toBe('application/pdf')
    expect(normalizeAllowedVoucherMime('application/pdf; charset=binary')).toBe('application/pdf')
    expect(normalizeAllowedVoucherMime('image/jpg')).toBe('image/jpeg')
    expect(normalizeAllowedVoucherMime(' image/png ')).toBe('image/png')
  })

  it('returns null for anything else', () => {
    for (const rejected of [
      'text/html',
      'image/svg+xml',
      'application/zip',
      '',
      'application/pdfx',
      undefined,
      null,
      7
    ]) {
      expect(normalizeAllowedVoucherMime(rejected)).toBeNull()
    }
  })

  it('exposes the allowlist both the URL policy and the admin panel rely on', () => {
    expect([...ALLOWED_VOUCHER_DATA_TYPES]).toEqual(['application/pdf', 'image/png', 'image/jpeg'])
  })
})
