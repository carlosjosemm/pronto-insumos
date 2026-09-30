import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Applies the admin API's shared response headers.
 *
 * These endpoints are called by the backoffice console from the same origin, so
 * they deliberately emit NO `Access-Control-Allow-Origin`: a wildcard would let
 * any website's browser send an authenticated admin request using the operator's
 * stored Firebase token. Only the method/header advertisement is kept so a
 * same-origin preflight still gets a well-formed answer.
 */
export function setAdminResponseHeaders(res: VercelResponse, methods = 'POST, OPTIONS'): void {
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

/**
 * True when the request is an `OPTIONS` preflight, which every admin handler
 * acknowledges with an empty `200` before any auth or body work.
 */
export function isAdminPreflight(req: VercelRequest): boolean {
  return req.method === 'OPTIONS'
}
