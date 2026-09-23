import type { VercelRequest, VercelResponse } from '@vercel/node'
import dashboardStats from '../_lib/admin/dashboard-stats.js'
import orders from '../_lib/admin/orders.js'
import orderHistory from '../_lib/admin/order-history.js'
import products from '../_lib/admin/products.js'
import approveTransfer from '../_lib/admin/approve-transfer.js'
import dispatchOrder from '../_lib/admin/dispatch-order.js'
import markDelivered from '../_lib/admin/mark-delivered.js'
import updateStock from '../_lib/admin/update-stock.js'
import updateProduct from '../_lib/admin/update-product.js'
import createProduct from '../_lib/admin/create-product.js'
import toggleVisibility from '../_lib/admin/toggle-visibility.js'

type AdminHandler = (req: VercelRequest, res: VercelResponse) => unknown

/**
 * Single routed entry point for every `/api/admin/<action>` endpoint.
 *
 * The Vercel Hobby plan caps a deployment at 12 Serverless Functions, so the 11
 * administrative handlers live as plain modules under `api/_lib/admin/` (paths
 * containing `/_` are excluded from function detection) and are dispatched here.
 * Public URLs are unchanged: `/api/admin/orders` → `req.query.action === 'orders'`.
 *
 * Each delegated handler keeps its own CORS headers, `OPTIONS` preflight, method
 * gate, `verifyAdminToken` call and error handling — this file only routes.
 */
const ADMIN_ACTIONS: Record<string, AdminHandler> = {
  'dashboard-stats': dashboardStats,
  orders: orders,
  'order-history': orderHistory,
  products: products,
  'approve-transfer': approveTransfer,
  'dispatch-order': dispatchOrder,
  'mark-delivered': markDelivered,
  'update-stock': updateStock,
  'update-product': updateProduct,
  'create-product': createProduct,
  'toggle-visibility': toggleVisibility
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawAction = req.query.action
  const segment = Array.isArray(rawAction) ? rawAction[0] : rawAction
  const action = typeof segment === 'string' ? segment.trim() : ''

  if (!action || !Object.prototype.hasOwnProperty.call(ADMIN_ACTIONS, action)) {
    console.warn('[Admin Router] Unknown or missing admin action:', rawAction)
    return res.status(404).json({
      success: false,
      error: 'Endpoint de administración no encontrado'
    })
  }

  return ADMIN_ACTIONS[action](req, res)
}
