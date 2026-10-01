import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from './_lib/firebaseAdmin.js'
import { getCollectionName } from './_lib/firestoreEnv.js'
import { consumeThrottleAttempt, getClientIp, respondThrottled } from './_lib/abuseThrottle.js'
import { LOW_STOCK_PUBLIC_THRESHOLD } from '../src/config/catalog.js'

/**
 * Public catalog endpoint — the storefront's only catalog source.
 *
 * Firestore rules deny client reads of `products`, so this endpoint (Firebase
 * Admin SDK) is the sole catalog authority. It returns an explicit public-field
 * allowlist: only active products, and `stockCount` disclosed ONLY when it is
 * 1–`LOW_STOCK_PUBLIC_THRESHOLD` (the "Últimas unidades" cue) — every other
 * stock figure is omitted and the server verifies stock at payment time, so
 * exact inventory can no longer be scraped or probed.
 *
 *   GET  — the whole active catalog, CDN-cacheable
 *         (`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`),
 *         collapsing Firestore reads to ~1/minute regardless of visitors.
 *   POST { ids } — the same shape for specific products, `no-store` (the
 *         uncached pre-flight read used to re-check a cart against the live
 *         catalog; a stale cached answer would defeat the re-check).
 *
 * Fails closed with `503` when Firestore Admin is unavailable.
 */

const PUBLIC_FIELDS = [
  'sku',
  'name',
  'brand',
  'category',
  'price',
  'priceNeto',
  'originalPrice',
  'rating',
  'reviewsCount',
  'inStock',
  'prescriptionRequired',
  'tag',
  'description',
  'specs',
  'placeholderTheme',
  'mediaBadge',
  'unitOfSale',
  'images',
  'packageContents',
  'manufacturer'
] as const

const MAX_IDS_PER_REQUEST = 50
const MAX_ID_LENGTH = 64

/**
 * Projects a catalog document onto the public allowlist. Everything not named
 * in `PUBLIC_FIELDS` — exact stock (unless 1–3), `isActive`, the ISP registry
 * number, audit timestamps — never leaves the server.
 */
function toPublicProduct(id: string, data: Record<string, unknown>): Record<string, unknown> {
  const product: Record<string, unknown> = { id }
  for (const field of PUBLIC_FIELDS) {
    if (data[field] !== undefined) product[field] = data[field]
  }
  const stockCount = data.stockCount
  if (
    typeof stockCount === 'number' &&
    Number.isInteger(stockCount) &&
    stockCount >= 1 &&
    stockCount <= LOW_STOCK_PUBLIC_THRESHOLD
  ) {
    product.stockCount = stockCount
  }
  return product
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    if (req.method === 'GET') {
      const adminDb = getAdminFirestore()
      if (!adminDb) {
        console.error('[catalog] Firestore Admin unavailable; refusing to fabricate a catalog.')
        return res
          .status(503)
          .json({ error: 'Catálogo no disponible temporalmente. Reintenta en unos minutos.' })
      }
      const snapshot = await adminDb.collection(getCollectionName('products')).get()
      const products = snapshot.docs
        .map((doc) => ({ id: doc.id, data: (doc.data() as Record<string, unknown> | undefined) || {} }))
        .filter(({ data }) => data.isActive !== false)
        .map(({ id, data }) => toPublicProduct(id, data))
      // CDN-cached: Firestore reads collapse to ~1/minute per edge regardless
      // of visitor count; stale-while-revalidate keeps loads instant.
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
      return res.status(200).json(products)
    }

    if (req.method === 'POST') {
      const adminDb = getAdminFirestore()
      if (!adminDb) {
        console.error('[catalog] Firestore Admin unavailable; refusing the uncached product read.')
        return res
          .status(503)
          .json({ error: 'Catálogo no disponible temporalmente. Reintenta en unos minutos.' })
      }
      // REPEAT BUDGET (POST only): the uncached read performs one billed
      // Firestore read per id (up to 50), so the IP budget caps the read
      // amplification. GET is unthrottled — it is CDN-cached, and a counter
      // transaction per request would defeat that caching. Fail-open, like
      // every scope: a counter outage logs and lets the request through.
      const ipDecision = await consumeThrottleAttempt(adminDb, 'catalog', 'ip', getClientIp(req))
      if (!ipDecision.allowed) {
        return respondThrottled(res, ipDecision.retryAfterSeconds)
      }
      const body = (req.body || {}) as { ids?: unknown }
      if (!Array.isArray(body.ids) || body.ids.length === 0) {
        return res
          .status(400)
          .json({ error: 'El cuerpo debe incluir "ids": array de identificadores de producto.' })
      }
      if (body.ids.length > MAX_IDS_PER_REQUEST) {
        return res.status(400).json({ error: 'Demasiados identificadores de producto solicitados.' })
      }
      const ids: string[] = []
      for (const raw of body.ids) {
        if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_ID_LENGTH) {
          return res.status(400).json({ error: 'Identificador de producto no válido.' })
        }
        ids.push(raw)
      }

      const products: Array<Record<string, unknown>> = []
      for (const id of ids) {
        const snap = await adminDb.collection(getCollectionName('products')).doc(id).get()
        if (!snap.exists) continue
        const data = (snap.data() as Record<string, unknown> | undefined) || {}
        if (data.isActive === false) continue
        products.push(toPublicProduct(id, data))
      }
      // Uncached: a price/stock re-check must never see a cached answer.
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json(products)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    console.error('[catalog] Unexpected error:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Servicio no disponible temporalmente.' })
  }
}
