import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isAdminPreflight, setAdminResponseHeaders } from '../../../../api/_lib/admin/adminHttp'
import type { VercelRequest, VercelResponse } from '@vercel/node'

describe('Admin HTTP helpers (api/_lib/admin/adminHttp.ts)', () => {
  it('never advertises a wildcard CORS origin', () => {
    const setHeader = vi.fn()
    setAdminResponseHeaders({ setHeader } as unknown as VercelResponse)

    const headerNames = setHeader.mock.calls.map((call) => call[0])
    expect(headerNames).not.toContain('Access-Control-Allow-Origin')
    expect(setHeader.mock.calls.some((call) => call[1] === '*')).toBe(false)
  })

  it('advertises the requested methods', () => {
    const setHeader = vi.fn()
    setAdminResponseHeaders({ setHeader } as unknown as VercelResponse, 'GET, OPTIONS')

    expect(setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, OPTIONS')
  })

  it('detects only OPTIONS as a preflight', () => {
    expect(isAdminPreflight({ method: 'OPTIONS' } as VercelRequest)).toBe(true)
    expect(isAdminPreflight({ method: 'POST' } as VercelRequest)).toBe(false)
  })

  it('no admin handler reintroduces a wildcard CORS origin', () => {
    const adminDir = join(process.cwd(), 'api/_lib/admin')
    const offenders = readdirSync(adminDir)
      .filter((file) => file.endsWith('.ts') && file !== 'adminHttp.ts')
      .filter((file) => readFileSync(join(adminDir, file), 'utf8').includes('Access-Control-Allow-Origin'))

    expect(offenders).toEqual([])
  })
})
