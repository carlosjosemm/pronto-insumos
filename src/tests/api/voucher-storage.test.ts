import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the Firebase boundaries before importing the module under test
vi.mock('firebase-admin/storage', () => ({
  getStorage: vi.fn()
}))
vi.mock('../../../api/_lib/firebaseAdmin', () => ({
  getAdminApp: vi.fn(() => null),
  getAdminFirestore: vi.fn(() => null)
}))

import { getStorage } from 'firebase-admin/storage'
import { getAdminApp } from '../../../api/_lib/firebaseAdmin'
import { VOUCHER_MAX_FILE_BYTES } from '../../../src/services/transferVoucher'
import {
  VOUCHER_MAX_BYTES,
  VOUCHER_PATH_ROOT,
  buildVoucherDownloadUrl,
  buildVoucherStoragePath,
  deleteVoucherObject,
  extensionForVoucherContentType,
  getVoucherBucket,
  isVoucherStoragePathForOrder,
  normalizeVoucherContentType,
  randomVoucherToken,
  resolveVoucherBucketName,
  sanitizeCollectionSegment,
  sanitizeOrderIdForPath,
  sanitizeVoucherFileName,
  validateVoucherFileMetadata,
  voucherContentLengthRange
} from '../../../api/_lib/voucherStorage'

type AdminBucket = NonNullable<ReturnType<typeof getVoucherBucket>>

describe('Voucher storage helpers (api/_lib/voucherStorage)', () => {
  const envBackup: Record<string, string | undefined> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    envBackup.FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET
    envBackup.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID
    delete process.env.FIREBASE_STORAGE_BUCKET
    delete process.env.FIREBASE_PROJECT_ID
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  describe('normalizeVoucherContentType', () => {
    it('accepts the allow-listed types regardless of case or parameters', () => {
      expect(normalizeVoucherContentType('application/pdf')).toBe('application/pdf')
      expect(normalizeVoucherContentType('image/png')).toBe('image/png')
      expect(normalizeVoucherContentType('image/jpeg')).toBe('image/jpeg')
      expect(normalizeVoucherContentType('Application/PDF; charset=binary')).toBe('application/pdf')
      expect(normalizeVoucherContentType('  IMAGE/PNG  ')).toBe('image/png')
    })

    it('normalizes the non-standard image/jpg alias', () => {
      expect(normalizeVoucherContentType('image/jpg')).toBe('image/jpeg')
    })

    it('rejects unsupported or non-string values', () => {
      expect(normalizeVoucherContentType('text/plain')).toBeNull()
      expect(normalizeVoucherContentType('application/x-msdownload')).toBeNull()
      expect(normalizeVoucherContentType('')).toBeNull()
      expect(normalizeVoucherContentType(undefined)).toBeNull()
      expect(normalizeVoucherContentType(42)).toBeNull()
    })
  })

  describe('extensionForVoucherContentType', () => {
    it('maps the allow-listed types and falls back safely', () => {
      expect(extensionForVoucherContentType('application/pdf')).toBe('pdf')
      expect(extensionForVoucherContentType('image/png')).toBe('png')
      expect(extensionForVoucherContentType('image/jpeg')).toBe('jpg')
      expect(extensionForVoucherContentType('application/octet-stream')).toBe('bin')
    })
  })

  describe('sanitizeVoucherFileName', () => {
    it('strips path separators, control characters and runaway length', () => {
      expect(sanitizeVoucherFileName('../../etc/passwd')).toBe('..-..-etc-passwd')
      expect(sanitizeVoucherFileName('comprobante\u0000\u001f.pdf')).toBe('comprobante.pdf')
      expect(sanitizeVoucherFileName('  banco   de   chile  .pdf ')).toBe('banco de chile .pdf')
      expect(sanitizeVoucherFileName('x'.repeat(300))).toHaveLength(120)
    })

    it('falls back to a default name for empty input', () => {
      expect(sanitizeVoucherFileName(undefined)).toBe('comprobante')
      expect(sanitizeVoucherFileName('   ')).toBe('comprobante')
    })
  })

  describe('path sanitizers', () => {
    it('canonicalizes order ids and rejects unusable segments', () => {
      expect(sanitizeOrderIdForPath(' pronto-123456 ')).toBe('PRONTO-123456')
      expect(sanitizeOrderIdForPath('PRONTO/123456')).toBe('PRONTO123456')
      expect(sanitizeOrderIdForPath('../../etc')).toBe('ETC')
      expect(sanitizeOrderIdForPath('')).toBe('')
      expect(sanitizeOrderIdForPath(null)).toBe('')
    })

    it('keeps environment-scoped collection names intact', () => {
      expect(sanitizeCollectionSegment('orders')).toBe('orders')
      expect(sanitizeCollectionSegment('dev_orders')).toBe('dev_orders')
      expect(sanitizeCollectionSegment('../orders')).toBe('orders')
      expect(sanitizeCollectionSegment(undefined)).toBe('orders')
    })
  })

  describe('buildVoucherStoragePath', () => {
    it('builds an environment-scoped path with the extension derived from the MIME type', () => {
      expect(buildVoucherStoragePath('orders', 'PRONTO-123456', 'application/pdf', 1700000000000, 'abcd1234')).toBe(
        'vouchers/orders/PRONTO-123456/1700000000000-abcd1234.pdf'
      )
      expect(buildVoucherStoragePath('dev_orders', 'pronto-999999', 'image/jpeg', 1700000000000, 'abcd1234')).toBe(
        'vouchers/dev_orders/PRONTO-999999/1700000000000-abcd1234.jpg'
      )
      expect(buildVoucherStoragePath('orders', 'PRONTO-123456', 'image/png', 1700000000000, 'abcd1234')).toBe(
        'vouchers/orders/PRONTO-123456/1700000000000-abcd1234.png'
      )
    })

    it('never derives the stored path from a user-supplied filename', () => {
      const path = buildVoucherStoragePath('orders', 'PRONTO-123456', 'application/pdf')
      expect(path.startsWith(`${VOUCHER_PATH_ROOT}/orders/PRONTO-123456/`)).toBe(true)
      expect(path).not.toContain('..')
      expect(path.split('/')).toHaveLength(4)
    })
  })

  describe('isVoucherStoragePathForOrder', () => {
    it('accepts only a direct child object of the order folder', () => {
      expect(isVoucherStoragePathForOrder('vouchers/orders/PRONTO-123456/1-a.pdf', 'orders', 'PRONTO-123456')).toBe(
        true
      )
      expect(
        isVoucherStoragePathForOrder('vouchers/dev_orders/PRONTO-123456/1-a.pdf', 'dev_orders', 'PRONTO-123456')
      ).toBe(true)
    })

    it('rejects another order, another environment, nested paths and traversal', () => {
      expect(isVoucherStoragePathForOrder('vouchers/orders/PRONTO-999999/1-a.pdf', 'orders', 'PRONTO-123456')).toBe(
        false
      )
      expect(isVoucherStoragePathForOrder('vouchers/dev_orders/PRONTO-123456/1-a.pdf', 'orders', 'PRONTO-123456')).toBe(
        false
      )
      expect(
        isVoucherStoragePathForOrder('vouchers/orders/PRONTO-123456/nested/1-a.pdf', 'orders', 'PRONTO-123456')
      ).toBe(false)
      expect(isVoucherStoragePathForOrder('vouchers/orders/PRONTO-123456/', 'orders', 'PRONTO-123456')).toBe(false)
      // Order ids that merely share a prefix must not match
      expect(isVoucherStoragePathForOrder('vouchers/orders/PRONTO-1234567/1.pdf', 'orders', 'PRONTO-123456')).toBe(
        false
      )
      expect(isVoucherStoragePathForOrder('vouchers/orders/../secrets.pdf', 'orders', 'PRONTO-123456')).toBe(false)
      expect(isVoucherStoragePathForOrder(undefined, 'orders', 'PRONTO-123456')).toBe(false)
      expect(isVoucherStoragePathForOrder(123, 'orders', 'PRONTO-123456')).toBe(false)
    })
  })

  describe('buildVoucherDownloadUrl', () => {
    it('encodes the object path and embeds the capability token', () => {
      expect(
        buildVoucherDownloadUrl('pronto-insumos.firebasestorage.app', 'vouchers/orders/PRONTO-1/a b.pdf', 'tok')
      ).toBe(
        'https://firebasestorage.googleapis.com/v0/b/pronto-insumos.firebasestorage.app/o/vouchers%2Forders%2FPRONTO-1%2Fa%20b.pdf?alt=media&token=tok'
      )
    })
  })

  describe('randomVoucherToken', () => {
    it('returns hex tokens of the requested length', () => {
      expect(randomVoucherToken(8)).toMatch(/^[0-9a-f]{8}$/)
      expect(randomVoucherToken(8)).not.toBe(randomVoucherToken(8))
      expect(randomVoucherToken(64)).toHaveLength(32)
    })
  })

  describe('resolveVoucherBucketName', () => {
    it('prefers the explicit env override', () => {
      process.env.FIREBASE_STORAGE_BUCKET = 'custom-bucket'
      expect(resolveVoucherBucketName('pronto-insumos')).toBe('custom-bucket')
    })

    it('derives the default Firebase Storage bucket from the project id', () => {
      process.env.FIREBASE_PROJECT_ID = 'pronto-insumos'
      expect(resolveVoucherBucketName()).toBe('pronto-insumos.firebasestorage.app')
      expect(resolveVoucherBucketName('other-project')).toBe('other-project.firebasestorage.app')
    })

    it('returns null when nothing can be resolved', () => {
      expect(resolveVoucherBucketName()).toBeNull()
      expect(resolveVoucherBucketName('   ')).toBeNull()
    })

    it('treats console/env placeholders as unconfigured instead of signing for a non-existent bucket', () => {
      process.env.FIREBASE_STORAGE_BUCKET = 'YOUR_PROJECT_ID.firebasestorage.app'
      expect(resolveVoucherBucketName('pronto-insumos')).toBeNull()

      delete process.env.FIREBASE_STORAGE_BUCKET
      process.env.FIREBASE_PROJECT_ID = 'YOUR_PROJECT_ID'
      expect(resolveVoucherBucketName()).toBeNull()
    })
  })

  describe('validateVoucherFileMetadata', () => {
    it('accepts allow-listed types within the byte cap (size as number or string)', () => {
      expect(validateVoucherFileMetadata({ size: 1024, contentType: 'application/pdf' }).isValid).toBe(true)
      expect(validateVoucherFileMetadata({ size: '1024', contentType: 'image/png' }).isValid).toBe(true)
      expect(validateVoucherFileMetadata({ size: VOUCHER_MAX_BYTES, contentType: 'image/jpeg' }).isValid).toBe(true)
    })

    it('rejects empty, non-numeric or oversized objects', () => {
      expect(validateVoucherFileMetadata({ size: 0, contentType: 'application/pdf' }).isValid).toBe(false)
      expect(validateVoucherFileMetadata({ size: -5, contentType: 'application/pdf' }).isValid).toBe(false)
      expect(validateVoucherFileMetadata({ size: 'not-a-number', contentType: 'application/pdf' }).isValid).toBe(false)
      expect(validateVoucherFileMetadata({ contentType: 'application/pdf' }).isValid).toBe(false)
      expect(validateVoucherFileMetadata({}).isValid).toBe(false)

      const oversized = validateVoucherFileMetadata({
        size: VOUCHER_MAX_BYTES + 1,
        contentType: 'application/pdf'
      })
      expect(oversized.isValid).toBe(false)
      expect(oversized.error).toContain('5 MB')
    })

    it('rejects disallowed content types with the customer-facing message', () => {
      const result = validateVoucherFileMetadata({ size: 1024, contentType: 'application/zip' })
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Formato no soportado')
    })
  })

  describe('getVoucherBucket', () => {
    it('returns null when the Admin app is unavailable', () => {
      vi.mocked(getAdminApp).mockReturnValue(null)
      expect(getVoucherBucket()).toBeNull()
    })

    it('resolves the bucket from the derived project default', () => {
      process.env.FIREBASE_PROJECT_ID = 'pronto-insumos'
      const bucket = { name: 'pronto-insumos.firebasestorage.app' }
      const bucketSpy = vi.fn(() => bucket)
      vi.mocked(getAdminApp).mockReturnValue({
        options: {}
      } as unknown as ReturnType<typeof getAdminApp>)
      vi.mocked(getStorage).mockReturnValue({
        bucket: bucketSpy
      } as unknown as ReturnType<typeof getStorage>)

      expect(getVoucherBucket()).toBe(bucket as unknown as AdminBucket)
      expect(bucketSpy).toHaveBeenCalledWith('pronto-insumos.firebasestorage.app')
    })

    it('returns null when the bucket cannot be resolved', () => {
      vi.mocked(getAdminApp).mockReturnValue({
        options: {}
      } as unknown as ReturnType<typeof getAdminApp>)

      expect(getVoucherBucket()).toBeNull()
    })
  })

  describe('cross-runtime cap contract', () => {
    it('keeps the client-side voucher cap identical to the server cap', () => {
      expect(VOUCHER_MAX_FILE_BYTES).toBe(VOUCHER_MAX_BYTES)
    })

    it('binds the signed upload header to the server cap', () => {
      expect(voucherContentLengthRange()).toBe(`0,${VOUCHER_MAX_BYTES}`)
      expect(voucherContentLengthRange(1024)).toBe('0,1024')
    })
  })

  describe('deleteVoucherObject', () => {
    it('deletes objects under the voucher prefix only', async () => {
      const deleteSpy = vi.fn().mockResolvedValue([{}])
      const bucket = { file: vi.fn(() => ({ delete: deleteSpy })) } as unknown as AdminBucket

      await expect(deleteVoucherObject(bucket, 'vouchers/orders/PRONTO-1/a.pdf')).resolves.toBe(true)
      expect(deleteSpy).toHaveBeenCalledWith({ ignoreNotFound: true })

      await expect(deleteVoucherObject(bucket, 'products/odon-101.png')).resolves.toBe(false)
      await expect(deleteVoucherObject(bucket, undefined)).resolves.toBe(false)
      expect(bucket.file).toHaveBeenCalledTimes(1)
    })

    it('never throws when the bucket rejects the deletion', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const bucket = {
        file: vi.fn(() => ({ delete: vi.fn().mockRejectedValue(new Error('permission denied')) }))
      } as unknown as AdminBucket

      await expect(deleteVoucherObject(bucket, 'vouchers/orders/PRONTO-1/a.pdf')).resolves.toBe(false)
    })
  })
})
