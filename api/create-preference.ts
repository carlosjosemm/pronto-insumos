import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from './_lib/firebaseAdmin.js'
import { getCollectionName } from './_lib/firestoreEnv.js'
import { resolvePromoPercent } from '../src/config/promos.js'
import { computeDiscountedUnitPrice, normalizeQuantity } from '../src/utils/orderTotal.js'

function buildBaseUrl(host: string): string {
  const protocol = host.includes('localhost') ? 'http' : 'https'
  return `${protocol}://${host}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || ''
  const hasRealToken = Boolean(MERCADOPAGO_ACCESS_TOKEN) && MERCADOPAGO_ACCESS_TOKEN !== 'YOUR_MERCADOPAGO_ACCESS_TOKEN'

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { orderId, items, customer } = req.body || {}

    if (!orderId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required parameters: orderId and non-empty items array' })
    }

    const cleanOrderId = String(orderId).trim().toUpperCase()
    const host = req.headers.host || 'pronto-insumos.vercel.app'
    const baseUrl = buildBaseUrl(host)

    const adminDb = getAdminFirestore()

    // FAIL-CLOSED: without Firestore Admin there is no catalog to rebuild prices
    // from. A real charge must never be created from client-supplied prices, so
    // refuse; the token-less simulated fallback (local dev) stays available.
    if (!adminDb) {
      if (hasRealToken) {
        console.warn(
          '[create-preference] Firestore Admin unavailable; refusing to create a preference from unverifiable client prices.'
        )
        return res
          .status(503)
          .json({ error: 'Servicio de pagos no disponible temporalmente. Intenta nuevamente o cotiza por WhatsApp.' })
      }
      console.warn('Mercado Pago Access Token missing. Returning simulated fallback checkout URL.')
      return res.status(200).json({
        success: true,
        isSimulated: true,
        preferenceId: 'PREF-SIMULATED-' + Math.floor(100000 + Math.random() * 900000),
        initPoint: `${baseUrl}/?status=approved&orderId=${cleanOrderId}`
      })
    }

    // SERVER-SIDE PRICE REBUILD — the client payload only contributes product IDs
    // and quantities. Every unit price comes from the Firestore products catalog;
    // the promo discount is resolved from the shared PROMO_CODES table, so a
    // tampered `price`, `total` or `promoCode` cannot change the charged amount.
    const discountPercent = resolvePromoPercent(req.body?.promoCode)
    const rebuiltItems: Array<{
      id: string
      title: string
      quantity: number
      unit_price: number
      currency_id: 'CLP'
    }> = []
    const productCache = new Map<string, Record<string, unknown> | null>()

    for (const item of items) {
      const productId = item?.product?.id || item?.productId || item?.id

      // A line without a resolvable productId can be neither priced nor
      // stock-checked — reject it (closes the Task 2.3 validation bypass).
      if (!productId || typeof productId !== 'string') {
        return res.status(400).json({
          error: 'Cada insumo del pedido debe incluir un identificador de producto (productId) válido.',
          productId: null
        })
      }

      const quantity = normalizeQuantity(item?.quantity)

      let productData = productCache.get(productId)
      if (productData === undefined) {
        const productSnap = await adminDb.collection(getCollectionName('products')).doc(productId).get()
        if (!productSnap.exists) {
          return res.status(400).json({
            error: `El producto "${item?.product?.name || productId}" no fue encontrado en el catálogo de inventario.`,
            productId,
            availableStock: 0,
            requestedQuantity: quantity
          })
        }
        productData = (productSnap.data() as Record<string, unknown> | null) ?? null
        productCache.set(productId, productData)
      }

      const availableStock = typeof productData?.stockCount === 'number' ? productData.stockCount : 0
      const inStock = productData?.inStock !== false && availableStock > 0

      if (!inStock || availableStock < quantity) {
        return res.status(400).json({
          error: `Stock insuficiente para el producto "${String(productData?.name || productId)}". Stock disponible: ${availableStock}, solicitado: ${quantity}.`,
          productId,
          availableStock,
          requestedQuantity: quantity
        })
      }

      const catalogPrice = Number(productData?.price)
      const unitPrice = computeDiscountedUnitPrice(catalogPrice, discountPercent)
      if (!Number.isInteger(catalogPrice) || catalogPrice <= 0 || unitPrice < 1) {
        console.warn(
          `[create-preference] Producto "${productId}" con precio de catálogo inválido (${String(productData?.price)}); preferencia rechazada.`
        )
        return res.status(400).json({
          error: `El producto "${String(productData?.name || productId)}" no tiene un precio válido en el catálogo. Por favor cotiza por WhatsApp.`,
          productId
        })
      }

      rebuiltItems.push({
        id: productId,
        title: String(productData?.name || 'Insumo Odontológico'),
        quantity,
        unit_price: unitPrice,
        currency_id: 'CLP'
      })
    }

    // Token-less simulated fallback — only reachable after full price/stock validation.
    if (!hasRealToken) {
      console.warn('Mercado Pago Access Token missing. Returning simulated fallback checkout URL.')
      return res.status(200).json({
        success: true,
        isSimulated: true,
        preferenceId: 'PREF-SIMULATED-' + Math.floor(100000 + Math.random() * 900000),
        initPoint: `${baseUrl}/?status=approved&orderId=${cleanOrderId}`
      })
    }

    // Mercado Pago Preference Payload built exclusively from the REBUILT lines
    const mpPreference = {
      items: rebuiltItems,
      payer: {
        name: customer?.fullName || 'Cliente Clínica',
        email: customer?.email || 'contacto@clinica.cl',
        identification: customer?.rut
          ? {
              type: 'RUT',
              number: customer.rut
            }
          : undefined
      },
      external_reference: cleanOrderId,
      back_urls: {
        success: `${baseUrl}/?status=approved&orderId=${cleanOrderId}`,
        failure: `${baseUrl}/?status=failure&orderId=${cleanOrderId}`,
        pending: `${baseUrl}/?status=pending&orderId=${cleanOrderId}`
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/webhooks/mercadopago`
    }

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
      },
      body: JSON.stringify(mpPreference)
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Mercado Pago Preference API error:', errText)
      return res.status(502).json({ error: 'Mercado Pago preference creation failed', details: errText })
    }

    const data = await response.json()

    return res.status(200).json({
      success: true,
      isSimulated: false,
      preferenceId: data.id,
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point
    })
  } catch (error: any) {
    console.error('Error creating Mercado Pago preference:', error)
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
}
