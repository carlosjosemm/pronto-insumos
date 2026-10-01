import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from './_lib/firebaseAdmin.js'
import { getCollectionName } from './_lib/firestoreEnv.js'
import { hasRealMercadoPagoToken, isSimulatedPaymentAllowed } from './_lib/simulationPolicy.js'
import { consumeThrottleAttempt, getClientIp, recordThrottleFailures, respondThrottled } from './_lib/abuseThrottle.js'
import { resolvePromoPercent } from '../src/config/promos.js'
import { computeDiscountedUnitPrice, computeOrderTotal, normalizeQuantity } from '../src/utils/orderTotal.js'
import { buildPreferenceSnapshot } from './_lib/preferenceSnapshot.js'
import type { DocumentReference } from 'firebase-admin/firestore'
import { MIN_ORDER_OUTSIDE_MELIPILLA, MIN_ORDER_ZONE, isBelowMinimumOrder } from '../src/config/delivery.js'
import type { DeliveryZone } from '../src/config/delivery.js'
import { formatCLP } from '../src/utils/currency.js'

/**
 * Host header shapes a preference's return/webhook URLs may be built from
 * outside production: loopback (any port), Vercel deployment domains and
 * private-range IPv4 for LAN testing. Anything else — a scheme, a path,
 * traversal, whitespace or a public foreign host — is refused: the Host
 * header is caller-controlled and must never decide where Mercado Pago
 * redirects the shopper or delivers the payment webhook.
 */
function isSafeDevHost(host: string): boolean {
  if (!host || host.length > 253) return false
  if (/[/?#@\s\\]/.test(host) || host.includes('..')) return false
  if (/^(?:localhost|127\.0\.0\.1|::1|\[::1\])(?::\d+)?$/i.test(host)) return true
  if (/\.vercel\.app$/i.test(host)) return true
  // Full dotted quads only, so a public hostname like `10.evil.com` can never
  // pass by sharing a prefix with a private address.
  if (
    /^(?:(?:10(?:\.\d{1,3}){3})|(?:192\.168(?:\.\d{1,3}){2})|(?:172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}))(?::\d+)?$/.test(
      host
    )
  ) {
    return true
  }
  return false
}

function hostProtocol(host: string): 'http' | 'https' {
  // Loopback and private-range LAN servers are plain-http dev endpoints; a
  // public deployment domain is always https.
  if (/^(?:localhost|127\.0\.0\.1|::1|\[::1\])(?::\d+)?$/i.test(host)) return 'http'
  if (
    /^(?:(?:10(?:\.\d{1,3}){3})|(?:192\.168(?:\.\d{1,3}){2})|(?:172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}))(?::\d+)?$/.test(
      host
    )
  ) {
    return 'http'
  }
  return 'https'
}

type CheckoutOrigin =
  | { origin: string }
  | { failure: { status: number; body: Record<string, unknown> } }

const ORIGIN_UNAVAILABLE_ERROR =
  'Servicio de pagos no disponible temporalmente. Intenta nuevamente o cotiza por WhatsApp.'

/**
 * The origin every preference URL is built from — the return URLs Mercado
 * Pago sends the shopper to and the webhook endpoint it delivers payment
 * notifications to. In a production runtime `SITE_URL` is the only trusted
 * source (fail closed when missing or malformed); outside production the
 * Host header is used only when it passes the safe-shape check above, and a
 * configured SITE_URL is deliberately ignored there — a value leaked to a
 * preview target must never repoint preview returns and webhooks at
 * production, where the canonical collections cannot see a preview order.
 */
function resolveCheckoutOrigin(req: VercelRequest): CheckoutOrigin {
  if (process.env.VERCEL_ENV === 'production') {
    const configured = (process.env.SITE_URL || '').trim().replace(/\/+$/, '')
    if (configured && /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(configured)) {
      return { origin: configured }
    }
    console.error(
      `[create-preference] SITE_URL missing or not a valid http(s) origin ("${configured}") in a production runtime; refusing to build return URLs from the request Host.`
    )
    return { failure: { status: 500, body: { error: ORIGIN_UNAVAILABLE_ERROR } } }
  }

  const host = String(req.headers.host || '').trim()
  if (!isSafeDevHost(host)) {
    console.warn(
      `[create-preference] Unsafe request Host ("${host}"); refusing to build return URLs from it.`
    )
    return {
      failure: {
        status: 400,
        body: { error: 'Origen de la solicitud no válido. Reintenta la compra o cotiza por WhatsApp.' }
      }
    }
  }
  return { origin: `${hostProtocol(host)}://${host}` }
}

/**
 * Uniform rejection path for the preference endpoint: every 4xx refusal also
 * records a throttle failure against the order and IP keys, so a client
 * hammering invalid preferences is locked out by the existing budget instead
 * of being able to retry forever. Fail-open — a counter outage never changes
 * the rejection itself.
 */
async function rejectPreference(
  res: VercelResponse,
  adminDb: ReturnType<typeof getAdminFirestore>,
  req: VercelRequest,
  cleanOrderId: string,
  status: number,
  body: Record<string, unknown>
): Promise<VercelResponse> {
  if (adminDb) {
    await recordThrottleFailures(adminDb, 'create-preference', {
      order: cleanOrderId,
      ip: getClientIp(req)
    })
  }
  return res.status(status).json(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const MERCADOPAGO_ACCESS_TOKEN = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()
  const hasRealToken = hasRealMercadoPagoToken()

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // FAIL-CLOSED: a production runtime must never fabricate an approved
  // checkout. Without a real access token, refuse loudly instead of simulating.
  if (!hasRealToken && !isSimulatedPaymentAllowed()) {
    console.error(
      '[create-preference] MERCADOPAGO_ACCESS_TOKEN missing in a production runtime; refusing to fabricate a simulated checkout.'
    )
    return res.status(500).json({
      error: 'Servicio de pagos no configurado. Por favor cotiza por WhatsApp mientras lo resolvemos.'
    })
  }

  try {
    // The request body contributes ONLY the order id. The line items, the payer
    // and the promo code are all read from the order document — never from the
    // request — so the charged preference can never diverge from the order the
    // webhook later asserts the payment against.
    const { orderId } = req.body || {}

    if (!orderId) {
      return res.status(400).json({ error: 'Missing required parameters: orderId' })
    }

    const cleanOrderId = String(orderId).trim().toUpperCase()

    const originResult = resolveCheckoutOrigin(req)
    if ('failure' in originResult) {
      return res.status(originResult.failure.status).json(originResult.failure.body)
    }
    const baseUrl = originResult.origin

    const adminDb = getAdminFirestore()

    // REPEAT BUDGET: both keys (client IP and the order id) are consumed before
    // any Firestore read, so a locked caller never reaches the order lookup.
    // Fail-open — a counter outage logs loudly and lets the request through.
    if (adminDb) {
      const ipDecision = await consumeThrottleAttempt(adminDb, 'create-preference', 'ip', getClientIp(req))
      const orderDecision = ipDecision.allowed
        ? await consumeThrottleAttempt(adminDb, 'create-preference', 'order', cleanOrderId)
        : null
      const decision = ipDecision.allowed ? orderDecision : ipDecision
      if (decision && !decision.allowed) {
        return respondThrottled(res, decision.retryAfterSeconds)
      }
    }

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

    // ORDER LOOKUP — the order document is the authority for which promo code was
    // applied. The request body is never trusted for it: reading the code from the
    // order guarantees the amount charged here matches the amount the webhook
    // recomputes from the same document, so a stale/tampered client cannot create a
    // preference whose total diverges from the order it belongs to.
    const ordersCol = getCollectionName('orders')
    let orderData: Record<string, unknown> | null = null
    // The document reference is kept so the price snapshot can be written onto the
    // order the lookup actually resolved — a legacy order resolved through the
    // `orderId` field query is not addressed by its canonical id.
    let orderRef: DocumentReference | null = null

    const directOrderSnap = await adminDb.collection(ordersCol).doc(cleanOrderId).get()
    if (directOrderSnap.exists) {
      orderData = (directOrderSnap.data() as Record<string, unknown> | undefined) || null
      orderRef = directOrderSnap.ref
    } else {
      const orderByFieldSnap = await adminDb
        .collection(ordersCol)
        .where('orderId', '==', cleanOrderId)
        .limit(1)
        .get()
      orderData = orderByFieldSnap.empty
        ? null
        : (orderByFieldSnap.docs[0].data() as Record<string, unknown> | undefined) || null
      orderRef = orderByFieldSnap.empty ? null : orderByFieldSnap.docs[0].ref
    }

    if (!orderData) {
      console.warn(
        `[create-preference] Order "${cleanOrderId}" not found; refusing to build a preference for an unregistered order.`
      )
      return rejectPreference(res, adminDb, req, cleanOrderId, 400, {
        error: 'El pedido no está registrado en el sistema. Reintenta la compra o cotiza por WhatsApp.',
        orderId: cleanOrderId
      })
    }

    // LIFECYCLE GUARD — only an online-payment order that is still genuinely
    // awaiting payment may get a preference. Settled orders (paid, transfer-
    // approved, in preparation, dispatched, delivered), orders parked in
    // payment review, transfer-pending orders, WhatsApp quotes and cancelled
    // orders are all refused: charging any of them again would double-bill a
    // customer or start a payment flow that can never reconcile.
    const orderStatus = String(orderData.status || '')
    const orderMethod = String(orderData.paymentMethod || '')
    if (orderMethod !== 'mercadopago' || orderStatus !== 'PENDIENTE_PAGO_MERCADOPAGO') {
      console.warn(
        `[create-preference] Order "${cleanOrderId}" (method: ${orderMethod || 'unknown'}, status: ${
          orderStatus || 'unknown'
        }) is not an online-payment order awaiting payment; refusing to create a preference.`
      )
      return rejectPreference(res, adminDb, req, cleanOrderId, 409, {
        error:
          'Este pedido no admite un nuevo pago en línea en su estado actual. Revisa el estado de tu pedido o cotiza por WhatsApp.',
        orderId: cleanOrderId
      })
    }

    // SERVER-SIDE PRICE REBUILD — every line comes from the ORDER DOCUMENT,
    // which is the same document the webhook asserts the payment
    // against, and every unit price from the current Firestore products catalog.
    // The promo discount is resolved from the shared PROMO_CODES table using the
    // order's own code, so a tampered request body (`items`, `price`, `total` or
    // `promoCode`) cannot change the charged amount.
    const orderItems: Array<Record<string, unknown>> = Array.isArray(orderData.items)
      ? (orderData.items as Array<Record<string, unknown>>)
      : []

    if (orderItems.length === 0) {
      console.warn(
        `[create-preference] Order "${cleanOrderId}" has no registered items; refusing to build an empty preference.`
      )
      return rejectPreference(res, adminDb, req, cleanOrderId, 400, {
        error:
          'El pedido no tiene insumos registrados; no es posible generar el pago. Reintenta la compra o cotiza por WhatsApp.',
        orderId: cleanOrderId
      })
    }

    const discountPercent = resolvePromoPercent(orderData.promoCode)
    const rebuiltItems: Array<{
      id: string
      title: string
      quantity: number
      unit_price: number
      currency_id: 'CLP'
    }> = []
    // Raw catalog lines (list price × quantity, before the promo discount) —
    // the input for both the stored-total agreement and the San Antonio
    // minimum, which checkout gates on the same original subtotal.
    const rawCatalogLines: Array<{ price: number; quantity: number }> = []
    const productCache = new Map<string, Record<string, unknown> | null>()

    for (const item of orderItems) {
      const productId = item?.productId || item?.id

      // A line without a resolvable productId can be neither priced nor
      // stock-checked — reject it rather than skip it.
      if (!productId || typeof productId !== 'string') {
        return rejectPreference(res, adminDb, req, cleanOrderId, 400, {
          error: 'Cada insumo del pedido debe incluir un identificador de producto (productId) válido.',
          productId: null
        })
      }

      const quantity = normalizeQuantity(item?.quantity)

      let productData = productCache.get(productId)
      if (productData === undefined) {
        const productSnap = await adminDb.collection(getCollectionName('products')).doc(productId).get()
        if (!productSnap.exists) {
          return rejectPreference(res, adminDb, req, cleanOrderId, 400, {
            error: `El producto "${item?.name || productId}" no fue encontrado en el catálogo de inventario.`,
            productId,
            availableStock: 0,
            requestedQuantity: quantity
          })
        }
        productData = (productSnap.data() as Record<string, unknown> | null) ?? null
        productCache.set(productId, productData)
      }

      const availableStock = typeof productData?.stockCount === 'number' ? productData.stockCount : 0
      // `isActive === false` pauses a product from sale (admin visibility toggle).
      // The storefront filters these out of the catalog, so only a stale cart or a
      // hand-crafted request can reach this branch — both must be refused.
      const isActive = productData?.isActive !== false
      const inStock = isActive && productData?.inStock !== false && availableStock > 0

      if (!inStock || availableStock < quantity) {
        return rejectPreference(res, adminDb, req, cleanOrderId, 400, {
          error: isActive
            ? `Stock insuficiente para el producto "${String(productData?.name || productId)}". Stock disponible: ${availableStock}, solicitado: ${quantity}.`
            : `El producto "${String(productData?.name || productId)}" no está disponible para la venta. Por favor cotiza por WhatsApp.`,
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
        return rejectPreference(res, adminDb, req, cleanOrderId, 400, {
          error: `El producto "${String(productData?.name || productId)}" no tiene un precio válido en el catálogo. Por favor cotiza por WhatsApp.`,
          productId
        })
      }

      rawCatalogLines.push({ price: catalogPrice, quantity })
      rebuiltItems.push({
        id: productId,
        title: String(productData?.name || 'Insumo Odontológico'),
        quantity,
        unit_price: unitPrice,
        currency_id: 'CLP'
      })
    }

    // STORED-TOTAL AGREEMENT — the payable total recomputed from the CURRENT
    // catalog (the exact helper the payment webhook asserts with) must equal
    // the total stored on the order document. A divergence means the catalog
    // moved after registration (price change, promo removed): charging the
    // recomputed amount would settle a payment the webhook refuses to
    // reconcile against the order, so the preference is refused instead.
    const expectedTotal = computeOrderTotal(rawCatalogLines, discountPercent)
    const storedTotal = Number(orderData.totalAmount)
    if (!Number.isInteger(storedTotal) || storedTotal !== expectedTotal) {
      console.warn(
        `[create-preference] Order "${cleanOrderId}" stored total (${String(
          orderData.totalAmount
        )}) disagrees with the catalog-recomputed total (${expectedTotal}); preference refused.`
      )
      return rejectPreference(res, adminDb, req, cleanOrderId, 409, {
        error:
          'El total del pedido no coincide con el catálogo actual. Reintenta la compra con un carrito actualizado o cotiza por WhatsApp.',
        orderId: cleanOrderId
      })
    }

    // SAN ANTONIO MINIMUM — the same original product subtotal checkout gates
    // on (list prices × quantities, BEFORE the promo discount) must reach the
    // zone minimum for a San Antonio despacho. Melipilla has no minimum. The
    // zone comes from the order document's stored comuna, never the request.
    const orderCustomer =
      orderData.customer && typeof orderData.customer === 'object'
        ? (orderData.customer as Record<string, unknown>)
        : {}
    const deliveryZone = String(orderCustomer.city || '').trim()
    const rawSubtotal = rawCatalogLines.reduce((acc, line) => acc + line.price * line.quantity, 0)
    if (isBelowMinimumOrder(deliveryZone as DeliveryZone, rawSubtotal)) {
      console.warn(
        `[create-preference] Order "${cleanOrderId}" targets ${MIN_ORDER_ZONE} with an original subtotal of ${rawSubtotal} CLP, below the ${MIN_ORDER_OUTSIDE_MELIPILLA} minimum; preference refused.`
      )
      return rejectPreference(res, adminDb, req, cleanOrderId, 400, {
        error: `La compra mínima para despacho a ${MIN_ORDER_ZONE} es de ${formatCLP(MIN_ORDER_OUTSIDE_MELIPILLA)}`,
        orderId: cleanOrderId
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

    // FREEZE THE CHARGED AMOUNT — write the server-only price snapshot onto the
    // order BEFORE minting the preference, so a preference that exists always has
    // a snapshot the webhook can settle against. Best-effort: a snapshot write
    // failure must not block a sale, and the webhook's catalog recomputation
    // remains the fallback used when no snapshot is stored.
    const snapshot = buildPreferenceSnapshot(
      expectedTotal,
      rebuiltItems.map((line) => ({ productId: line.id, quantity: line.quantity, unitPrice: line.unit_price }))
    )
    if (orderRef) {
      try {
        await orderRef.update({ ...snapshot })
      } catch (err: unknown) {
        console.warn(
          `[create-preference] Could not write the price snapshot for order "${cleanOrderId}"; the webhook will fall back to the live catalog:`,
          err instanceof Error ? err.message : err
        )
      }
    }

    // Mercado Pago Preference Payload built exclusively from the REBUILT lines;
    // the payer is the customer stored on the order document, never the caller.
    const mpPreference = {
      items: rebuiltItems,
      payer: {
        name: String(orderCustomer.fullName || '') || 'Cliente Clínica',
        email: String(orderCustomer.email || '') || 'contacto@clinica.cl',
        identification: orderCustomer.rut
          ? {
              type: 'RUT',
              number: String(orderCustomer.rut)
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
      // Expire the link when the snapshot does: a payable-forever link could be
      // paid days later against a moved catalog or a swept order. Both dates are
      // sent because Mercado Pago documents them as a pair; the values are the
      // exact strings stored on the order, so the two can never disagree.
      expires: true,
      expiration_date_from: snapshot.preferenceCreatedAt,
      expiration_date_to: snapshot.preferenceExpiresAt,
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
