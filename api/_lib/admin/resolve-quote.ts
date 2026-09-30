import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'
import { sendEmail, getWarehouseEmail } from '../email.js'
import {
  buildTransferApprovedEmail,
  buildWarehouseAlertEmail,
  toOrderEmailData
} from '../emailTemplates.js'
import type { StockShortfall } from '../emailTemplates.js'
import { resolvePromoPercent } from '../../../src/config/promos.js'
import { computeDiscountedUnitPrice, normalizeQuantity } from '../../../src/utils/orderTotal.js'

const RESOLUTIONS = ['convert', 'decline'] as const
const MAX_RECONCILIATION_REFERENCE_LENGTH = 120
const MAX_NOTES_LENGTH = 500

/**
 * Transaction outcome, discriminated so the response and email paths narrow
 * cleanly. `conflict` carries the operator-facing reason for a 409.
 */
type QuoteOutcome =
  | { outcome: 'duplicate'; currentStatus: string }
  | { outcome: 'conflict'; currentStatus: string; message: string }
  | { outcome: 'resolved'; resolution: 'convert' | 'decline'; status: string }

/**
 * Closes a WhatsApp quote order (`COTIZACION_SOLICITADA_WHATSAPP`) — the lead a
 * shopper creates when checkout's WhatsApp method hands them to chat instead of a
 * payment gateway. A quote is never paid in-system, so this handler is the only
 * sanctioned way it leaves the quote state:
 *
 *   - `convert`: the sale settled off-platform exactly as quoted (e.g. a Banco de
 *     Chile transfer the operator verified in the cartola). The operator attests
 *     with a reconciliation reference (never bank credentials), and one transaction
 *     re-derives the payable total from the CURRENT catalog (promo-aware), deducts
 *     stock at most once and stamps the order `PAGADO_TRANSFERENCIA`. The quote
 *     document itself becomes the sale record, so the original quote id is preserved.
 *   - `decline`: the customer declined, never replied, or closed the sale on other
 *     terms. The quote is closed `CANCELADO` with no stock movement; the operator's
 *     note records why (and may reference a replacement order id).
 *
 * This action must never fabricate a Mercado Pago payment: no payment id is written,
 * and the Mercado Pago webhook remains the only automatic settlement authority.
 * `approve-transfer` keeps refusing quote statuses — this is the separate, narrower
 * path for leads.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setAdminResponseHeaders(res)

  if (isAdminPreflight(req)) {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' })
  }

  const authResult = await verifyAdminToken(req)
  if (!authResult.authenticated) {
    return res.status(403).json({ success: false, error: authResult.error })
  }

  const { orderId, resolution, reconciliationReference, notes } = req.body || {}

  if (!orderId || typeof orderId !== 'string') {
    return res
      .status(400)
      .json({ success: false, error: 'El parámetro "orderId" es obligatorio' })
  }

  if (
    typeof resolution !== 'string' ||
    !RESOLUTIONS.includes(resolution as (typeof RESOLUTIONS)[number])
  ) {
    return res.status(400).json({
      success: false,
      error: `El parámetro "resolution" debe ser uno de: ${RESOLUTIONS.join(', ')}`
    })
  }

  // Approving moves money and deducts stock, so the operator must record what they
  // reconciled (the bank cartola line or the payment receipt). The system cannot
  // verify the ledger itself, so the reference is the evidence. Declining moves no
  // stock and stays available without one.
  if (
    resolution === 'convert' &&
    (typeof reconciliationReference !== 'string' || reconciliationReference.trim().length === 0)
  ) {
    return res.status(400).json({
      success: false,
      error:
        'El parámetro "reconciliationReference" es obligatorio: verifica el abono en la cartola de Banco de Chile (o el comprobante recibido) y registra la referencia (nunca credenciales bancarias).'
    })
  }

  const cleanReference =
    resolution === 'convert' && typeof reconciliationReference === 'string'
      ? reconciliationReference.trim().slice(0, MAX_RECONCILIATION_REFERENCE_LENGTH)
      : ''
  const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, MAX_NOTES_LENGTH) : ''
  // Normalize once: the lookup trims, so every written field must use the same
  // value or order-history queries (which filter on `orderId`) would miss it.
  const cleanOrderId = orderId.trim()

  const db = getAdminFirestore()
  if (!db) {
    return res
      .status(500)
      .json({ success: false, error: 'Base de datos no inicializada' })
  }

  const ordersCol = getCollectionName('orders')

  try {
    let orderRef = db.collection(ordersCol).doc(cleanOrderId)
    const initialCheck = await orderRef.get()
    if (!initialCheck.exists) {
      const querySnap = await db
        .collection(ordersCol)
        .where('orderId', '==', cleanOrderId)
        .limit(1)
        .get()
      if (querySnap.empty) {
        return res.status(404).json({
          success: false,
          error: `Pedido "${cleanOrderId}" no encontrado en Firestore`
        })
      }
      orderRef = querySnap.docs[0].ref
    }

    let orderDataForEmail: Record<string, unknown> | null = null
    // Oversold lines are recorded on approval. Reset inside the
    // transaction callback, which Firestore may re-run on contention.
    const stockShortfalls: StockShortfall[] = []

    const result = await db.runTransaction(async (transaction) => {
      stockShortfalls.length = 0
      const orderDoc = await transaction.get(orderRef)
      if (!orderDoc.exists) {
        throw new Error(`Pedido "${cleanOrderId}" no encontrado en Firestore`)
      }

      const orderData = orderDoc.data() || {}
      orderDataForEmail = orderData
      const currentStatus = String(orderData.status || '')

      // Idempotency: a retried resolution of the SAME order is a no-op, never a
      // second stock deduction.
      const targetStatus = resolution === 'convert' ? 'PAGADO_TRANSFERENCIA' : 'CANCELADO'
      if (currentStatus === targetStatus) {
        return { outcome: 'duplicate', currentStatus } satisfies QuoteOutcome
      }

      // Only a lead can be closed here — a cancelled, dispatched, delivered,
      // MP-paid, review-parked or transfer-pending order must never move through
      // this action, and a retried conversion cannot race a second administrator.
      if (currentStatus !== 'COTIZACION_SOLICITADA_WHATSAPP') {
        return {
          outcome: 'conflict',
          currentStatus,
          message: `El pedido no es una cotización WhatsApp pendiente (estado actual: ${
            currentStatus || 'desconocido'
          }). Actualiza la lista antes de reintentar.`,
        } satisfies QuoteOutcome
      }

      // A settlement marker (`approvedAt` / `paidAt`) means the lines were already
      // deducted by an earlier payment; approving again must not deduct.
      if (resolution === 'convert' && (orderData.approvedAt || orderData.paidAt)) {
        return {
          outcome: 'conflict',
          currentStatus,
          message:
            'El pedido ya registra un pago o rebaja anterior; no se rebaja stock por segunda vez. Cancela el pedido o concilia el reembolso manualmente.',
        } satisfies QuoteOutcome
      }

      const nowIso = new Date().toISOString()
      const adminActor = authResult.email || authResult.uid || 'admin'

      if (resolution === 'decline') {
        transaction.update(orderRef, {
          status: 'CANCELADO',
          quoteResolvedAt: nowIso,
          quoteResolution: 'DECLINADA',
          quoteResolvedBy: adminActor,
          updatedAt: nowIso
        })

        const declineHistoryRef = db
          .collection(getCollectionName('order_status_history'))
          .doc()
        transaction.set(declineHistoryRef, {
          id: declineHistoryRef.id,
          orderId: cleanOrderId,
          previousStatus: currentStatus,
          newStatus: 'CANCELADO',
          changedBy: authResult.uid || 'admin',
          changedByEmail: authResult.email || null,
          actorRole: 'ADMIN',
          timestamp: nowIso,
          reason: cleanNotes || 'Cotización WhatsApp cerrada sin venta (sin movimiento de stock)',
          metadata: {
            resolvedBy: adminActor,
            quoteResolution: 'DECLINADA'
          }
        })

        return { outcome: 'resolved', resolution: 'decline', status: 'CANCELADO' } satisfies QuoteOutcome
      }

      const items: Array<Record<string, unknown>> = Array.isArray(orderData.items)
        ? (orderData.items as Array<Record<string, unknown>>)
        : []

      // The promo percent comes from the shared catalog via the order's own code —
      // never from the request — so the verified total cannot be dictated by a caller.
      const discountPercent = resolvePromoPercent(orderData.promoCode)

      // Consolidate line quantities by productId so a duplicated line cannot
      // overwrite its own snapshot.
      const consolidatedQty = new Map<string, { qty: number; name?: string }>()
      for (const item of items) {
        const rawProductId = item.productId || item.id
        if (typeof rawProductId !== 'string' || rawProductId.length === 0) {
          return {
            outcome: 'conflict',
            currentStatus,
            message:
              'El pedido tiene una línea sin producto identificable; no se puede verificar el monto. No se rebajó stock.',
          } satisfies QuoteOutcome
        }
        const existing = consolidatedQty.get(rawProductId) || {
          qty: 0,
          name: typeof item.name === 'string' ? item.name : undefined,
        }
        existing.qty += normalizeQuantity(item.quantity)
        if (typeof item.name === 'string') existing.name = item.name
        consolidatedQty.set(rawProductId, existing)
      }

      if (consolidatedQty.size === 0) {
        return {
          outcome: 'conflict',
          currentStatus,
          message:
            'El pedido no tiene insumos registrados; no se puede convertir en venta.',
        } satisfies QuoteOutcome
      }

      // Read every product first (all reads before all writes) and rebuild the
      // payable total from the CURRENT catalog prices.
      const productDocsToUpdate: {
        ref: FirebaseFirestore.DocumentReference
        productId: string
        name: string
        sku: string
        previousStock: number
        newStock: number
        delta: number
        shortfall: number
        isActive: boolean
      }[] = []
      let expectedTotal = 0

      for (const [productId, itemInfo] of consolidatedQty.entries()) {
        const productRef = db
          .collection(getCollectionName('products'))
          .doc(productId)
        const productDoc = await transaction.get(productRef)

        // A missing product fails closed: a partial deduction must never be
        // recorded as a full approval.
        if (!productDoc.exists) {
          return {
            outcome: 'conflict',
            currentStatus,
            message: `El producto "${
              itemInfo.name || productId
            }" ya no existe en el catálogo; no se puede verificar el monto. No se rebajó stock.`,
          } satisfies QuoteOutcome
        }

        const productData = productDoc.data() || {}
        const catalogPrice = Number(productData.price)
        if (!Number.isInteger(catalogPrice) || catalogPrice <= 0) {
          return {
            outcome: 'conflict',
            currentStatus,
            message: `El producto "${
              productData.name || productId
            }" no tiene un precio de catálogo válido; no se puede convertir la cotización en venta.`,
          } satisfies QuoteOutcome
        }
        expectedTotal += computeDiscountedUnitPrice(catalogPrice, discountPercent) * itemInfo.qty

        const currentStock =
          typeof productData.stockCount === 'number'
            ? productData.stockCount
            : 0
        const newStock = Math.max(0, currentStock - itemInfo.qty)
        const isActive = productData.isActive !== false
        const lineName = productData.name || itemInfo.name || productId
        const shortfall = Math.max(0, itemInfo.qty - currentStock)
        // An overselling conversion is still approved (the money
        // is in) but the shortfall is recorded and alerted — never hidden by
        // the Math.max clamp.
        if (shortfall > 0) {
          stockShortfalls.push({
            productId,
            name: lineName,
            requested: itemInfo.qty,
            available: currentStock,
          })
        }

        productDocsToUpdate.push({
          ref: productRef,
          productId,
          name: lineName,
          sku: productData.sku || '',
          previousStock: currentStock,
          newStock,
          delta: -itemInfo.qty,
          shortfall,
          isActive,
        })
      }

      // Server-authoritative amount check: the stored total must equal the total
      // recomputed from the current catalog before any stock moves.
      const storedTotal = Number(orderData.totalAmount)
      if (!Number.isInteger(storedTotal) || storedTotal !== expectedTotal) {
        return {
          outcome: 'conflict',
          currentStatus,
          message: `El total verificado del pedido (${expectedTotal}) no coincide con el monto registrado (${
            orderData.totalAmount ?? 'sin registro'
          }). Corrige el pedido o registra la venta negociada como pedido nuevo; no se rebajó stock.`,
        } satisfies QuoteOutcome
      }

      // Execute all inventory writes and audit logs
      for (const update of productDocsToUpdate) {
        transaction.update(update.ref, {
          stockCount: update.newStock,
          inStock: update.newStock > 0 && update.isActive,
          updatedAt: nowIso,
        })

        const auditRef = db
          .collection(getCollectionName('inventory_audit_logs'))
          .doc()
        transaction.set(auditRef, {
          id: auditRef.id,
          productId: update.productId,
          productSku: update.sku,
          productName: update.name,
          changeType: 'ORDER_FULFILLMENT_DEDUCTION',
          previousStock: update.previousStock,
          newStock: update.newStock,
          delta: update.delta,
          reasonCode: 'venta_manual',
          operatorNotes: `Rebaja de stock por conversión de cotización WhatsApp en venta verificada (orden ${cleanOrderId})`,
          changedBy: authResult.uid || 'admin',
          changedByEmail: authResult.email || null,
          actorRole: 'ADMIN',
          timestamp: nowIso,
          metadata: {
            orderId: cleanOrderId,
            quoteResolution: 'CONVERTIDA',
            ...(update.shortfall > 0
              ? { stockShortfall: update.shortfall }
              : {}),
          },
        })
      }

      // Update order status, stamping the settlement markers so a later
      // automatic payment or approval attempt is refused by their guards.
      transaction.update(orderRef, {
        status: 'PAGADO_TRANSFERENCIA',
        approvedAt: nowIso,
        approvedBy: adminActor,
        quoteResolvedAt: nowIso,
        quoteResolution: 'CONVERTIDA',
        quoteResolvedBy: adminActor,
        updatedAt: nowIso,
      })

      // Record order status history, carrying the operator's reconciliation
      // reference so the conversion is auditable without ever storing bank secrets.
      const historyRef = db
        .collection(getCollectionName('order_status_history'))
        .doc()
      transaction.set(historyRef, {
        id: historyRef.id,
        orderId: cleanOrderId,
        previousStatus: currentStatus,
        newStatus: 'PAGADO_TRANSFERENCIA',
        changedBy: authResult.uid || 'admin',
        changedByEmail: authResult.email || null,
        actorRole: 'ADMIN',
        timestamp: nowIso,
        reason: `Cotización WhatsApp convertida en venta verificada (ref. ${cleanReference}) y rebaja de stock en bodega Melipilla${
          cleanNotes ? ` — ${cleanNotes}` : ''
        }`,
        metadata: {
          resolvedBy: adminActor,
          quoteResolution: 'CONVERTIDA',
          reconciliationReference: cleanReference,
          reconciledAt: nowIso,
          itemsCount: items.length,
          orderTotalAmount: storedTotal,
          // Oversold lines travel with the approval so the
          // shortfall is auditable, not just emailed.
          ...(stockShortfalls.length > 0 ? { stockShortfalls } : {}),
        },
      })

      return { outcome: 'resolved', resolution: 'convert', status: 'PAGADO_TRANSFERENCIA' } satisfies QuoteOutcome
    })

    if (result.outcome === 'conflict') {
      return res.status(409).json({
        success: false,
        error: result.message,
        currentStatus: result.currentStatus,
      })
    }

    // Transactional emails (fail-safe): customer approval notice + warehouse alert
    if (result.outcome === 'resolved' && orderDataForEmail) {
      // Cast because the assignment happens inside the transaction callback, which
      // TypeScript's control-flow analysis does not follow across the `await`.
      const resolvedData = orderDataForEmail as Record<string, unknown>
      const warehouseEmail = getWarehouseEmail()

      if (result.resolution === 'convert') {
        const emailData = toOrderEmailData(cleanOrderId, {
          ...resolvedData,
          status: 'PAGADO_TRANSFERENCIA',
        })
        const customerEmail = String(
          (resolvedData.customer as { email?: string } | undefined)?.email || '',
        ).trim()
        if (customerEmail) {
          await sendEmail({
            to: customerEmail,
            ...buildTransferApprovedEmail(emailData),
          })
        }
        if (warehouseEmail) {
          await sendEmail({
            to: warehouseEmail,
            ...buildWarehouseAlertEmail(emailData, 'PAGADO_TRANSFERENCIA', stockShortfalls),
          })
        }
      } else if (warehouseEmail) {
        // No customer email on decline: the case is already in the WhatsApp
        // conversation and no money moved.
        const emailData = toOrderEmailData(cleanOrderId, {
          ...resolvedData,
          status: 'CANCELADO',
        })
        await sendEmail({ to: warehouseEmail, ...buildWarehouseAlertEmail(emailData, 'CANCELADO') })
      }
    }

    return res.status(200).json({
      success: true,
      orderId: cleanOrderId,
      duplicate: result.outcome === 'duplicate',
      ...(result.outcome === 'resolved'
        ? { resolution: result.resolution, status: result.status }
        : {}),
    })
  } catch (err: unknown) {
    console.error('[Admin API Resolve Quote] Error:', err)
    return res.status(500).json({
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'Error al cerrar la cotización',
    })
  }
}
