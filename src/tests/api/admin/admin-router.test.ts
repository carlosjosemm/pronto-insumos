import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../../api/_lib/admin/dashboard-stats', () => ({ default: vi.fn() }))
vi.mock('../../../../api/_lib/admin/orders', () => ({ default: vi.fn() }))
vi.mock('../../../../api/_lib/admin/order-history', () => ({ default: vi.fn() }))
vi.mock('../../../../api/_lib/admin/products', () => ({ default: vi.fn() }))
vi.mock('../../../../api/_lib/admin/approve-transfer', () => ({ default: vi.fn() }))
vi.mock('../../../../api/_lib/admin/dispatch-order', () => ({ default: vi.fn() }))
vi.mock('../../../../api/_lib/admin/mark-delivered', () => ({ default: vi.fn() }))
vi.mock('../../../../api/_lib/admin/update-stock', () => ({ default: vi.fn() }))
vi.mock('../../../../api/_lib/admin/update-product', () => ({ default: vi.fn() }))
vi.mock('../../../../api/_lib/admin/create-product', () => ({ default: vi.fn() }))
vi.mock('../../../../api/_lib/admin/toggle-visibility', () => ({ default: vi.fn() }))

import handler from '../../../../api/admin/[action]'
import dashboardStats from '../../../../api/_lib/admin/dashboard-stats'
import orders from '../../../../api/_lib/admin/orders'
import orderHistory from '../../../../api/_lib/admin/order-history'
import products from '../../../../api/_lib/admin/products'
import approveTransfer from '../../../../api/_lib/admin/approve-transfer'
import dispatchOrder from '../../../../api/_lib/admin/dispatch-order'
import markDelivered from '../../../../api/_lib/admin/mark-delivered'
import updateStock from '../../../../api/_lib/admin/update-stock'
import updateProduct from '../../../../api/_lib/admin/update-product'
import createProduct from '../../../../api/_lib/admin/create-product'
import toggleVisibility from '../../../../api/_lib/admin/toggle-visibility'

const ROUTES: Record<string, ReturnType<typeof vi.fn>> = {
  'dashboard-stats': vi.mocked(dashboardStats),
  orders: vi.mocked(orders),
  'order-history': vi.mocked(orderHistory),
  products: vi.mocked(products),
  'approve-transfer': vi.mocked(approveTransfer),
  'dispatch-order': vi.mocked(dispatchOrder),
  'mark-delivered': vi.mocked(markDelivered),
  'update-stock': vi.mocked(updateStock),
  'update-product': vi.mocked(updateProduct),
  'create-product': vi.mocked(createProduct),
  'toggle-visibility': vi.mocked(toggleVisibility)
}

describe('Serverless Admin Router (/api/admin/[action])', () => {
  let mockRes: Partial<VercelResponse>
  let jsonOutput: Record<string, unknown> = {}
  let statusOutput: number

  beforeEach(() => {
    vi.clearAllMocks()
    jsonOutput = {}
    statusOutput = 200

    mockRes = {
      setHeader: vi.fn(),
      status: vi.fn((code: number) => {
        statusOutput = code
        return mockRes as VercelResponse
      }),
      json: vi.fn((data: unknown) => {
        jsonOutput = data as Record<string, unknown>
        return mockRes as VercelResponse
      }),
      end: vi.fn()
    }
  })

  it('routes a GET action to its delegated handler', async () => {
    const req = { method: 'GET', query: { action: 'orders' } } as unknown as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(orders).toHaveBeenCalledTimes(1)
    expect(orders).toHaveBeenCalledWith(req, mockRes)
  })

  it('routes a POST action to its delegated handler', async () => {
    const req = { method: 'POST', query: { action: 'approve-transfer' } } as unknown as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(approveTransfer).toHaveBeenCalledTimes(1)
    expect(approveTransfer).toHaveBeenCalledWith(req, mockRes)
  })

  it('maps every declared admin action to its handler module', async () => {
    for (const [action, mock] of Object.entries(ROUTES)) {
      const req = { method: 'GET', query: { action } } as unknown as VercelRequest

      await handler(req, mockRes as VercelResponse)

      expect(mock, `action "${action}" should resolve to its handler`).toHaveBeenCalledTimes(1)
      expect(mock).toHaveBeenCalledWith(req, mockRes)
    }
  })

  it('returns 404 for an unknown action without invoking any handler', async () => {
    const req = { method: 'GET', query: { action: 'nukes-inventory' } } as unknown as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(404)
    expect(jsonOutput.success).toBe(false)
    for (const mock of Object.values(ROUTES)) expect(mock).not.toHaveBeenCalled()
  })

  it('returns 404 when the action query parameter is missing', async () => {
    const req = { method: 'GET', query: {} } as unknown as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(404)
    expect(jsonOutput.success).toBe(false)
  })

  it('returns 404 for an empty or whitespace-only action', async () => {
    for (const action of ['', '   ']) {
      const req = { method: 'GET', query: { action } } as unknown as VercelRequest

      await handler(req, mockRes as VercelResponse)

      expect(statusOutput).toBe(404)
      expect(jsonOutput.success).toBe(false)
    }
    for (const mock of Object.values(ROUTES)) expect(mock).not.toHaveBeenCalled()
  })

  it('returns 404 for a non-string action segment', async () => {
    const req = { method: 'GET', query: { action: 42 } } as unknown as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(statusOutput).toBe(404)
    expect(jsonOutput.success).toBe(false)
    for (const mock of Object.values(ROUTES)) expect(mock).not.toHaveBeenCalled()
  })

  it('normalizes an array-shaped action to its first element', async () => {
    const req = { method: 'GET', query: { action: ['orders'] } } as unknown as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(orders).toHaveBeenCalledTimes(1)
  })

  it('trims surrounding whitespace from the action segment', async () => {
    const req = { method: 'GET', query: { action: '  orders  ' } } as unknown as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(orders).toHaveBeenCalledTimes(1)
  })

  it('delegates OPTIONS preflight to the handler instead of short-circuiting', async () => {
    const req = { method: 'OPTIONS', query: { action: 'orders' } } as unknown as VercelRequest

    await handler(req, mockRes as VercelResponse)

    expect(orders).toHaveBeenCalledTimes(1)
    expect(statusOutput).toBe(200)
  })

  it('does not resolve inherited prototype keys as actions', async () => {
    for (const action of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const req = { method: 'GET', query: { action } } as unknown as VercelRequest

      await handler(req, mockRes as VercelResponse)

      expect(statusOutput, `"${action}" must not resolve`).toBe(404)
      expect(jsonOutput.success).toBe(false)
    }
    for (const mock of Object.values(ROUTES)) expect(mock).not.toHaveBeenCalled()
  })
})
