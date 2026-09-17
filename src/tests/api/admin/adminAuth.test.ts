import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyAdminToken } from '../../../../api/lib/adminAuth'
import * as firebaseAdminLib from '../../../../api/lib/firebaseAdmin'
import * as firebaseAuthAdmin from 'firebase-admin/auth'
import type { VercelRequest } from '@vercel/node'

vi.mock('../../../../api/lib/firebaseAdmin', () => ({
  getAdminApp: vi.fn()
}))

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn()
}))

describe('Serverless Admin Auth Middleware (api/lib/adminAuth.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects requests missing the Authorization header', async () => {
    const req = { headers: {} } as VercelRequest
    const result = await verifyAdminToken(req)
    expect(result.authenticated).toBe(false)
    expect(result.error).toContain('ausente o malformado')
  })

  it('rejects requests with non-bearer Authorization header', async () => {
    const req = { headers: { authorization: 'Basic 12345' } } as VercelRequest
    const result = await verifyAdminToken(req)
    expect(result.authenticated).toBe(false)
  })

  it('rejects when user does not have admin: true custom claim', async () => {
    const mockApp = {} as any
    vi.mocked(firebaseAdminLib.getAdminApp).mockReturnValue(mockApp)
    const mockVerify = vi.fn().mockResolvedValue({
      uid: 'user-regular-123',
      email: 'regular@clinica.cl',
      admin: false
    })
    vi.mocked(firebaseAuthAdmin.getAuth).mockReturnValue({
      verifyIdToken: mockVerify
    } as any)

    const req = { headers: { authorization: 'Bearer token-regular' } } as VercelRequest
    const result = await verifyAdminToken(req)

    expect(result.authenticated).toBe(false)
    expect(result.error).toContain('permisos administrativos requeridos')
  })

  it('authenticates valid admin user with admin: true custom claim', async () => {
    const mockApp = {} as any
    vi.mocked(firebaseAdminLib.getAdminApp).mockReturnValue(mockApp)
    const mockVerify = vi.fn().mockResolvedValue({
      uid: 'admin-uid-999',
      email: 'admin@prontoinsumos.cl',
      admin: true
    })
    vi.mocked(firebaseAuthAdmin.getAuth).mockReturnValue({
      verifyIdToken: mockVerify
    } as any)

    const req = { headers: { authorization: 'Bearer token-admin-valid' } } as VercelRequest
    const result = await verifyAdminToken(req)

    expect(result.authenticated).toBe(true)
    expect(result.uid).toBe('admin-uid-999')
    expect(result.email).toBe('admin@prontoinsumos.cl')
  })
})
