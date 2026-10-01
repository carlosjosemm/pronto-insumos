import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminPreflight, setAdminResponseHeaders } from './adminHttp.js'
import { getAdminFirestore } from '../firebaseAdmin.js'
import { verifyAdminToken } from '../adminAuth.js'
import { getCollectionName } from '../firestoreEnv.js'
import { resolveOrderByCanonicalId } from '../orderLookup.js'
import { sendEmail } from '../email.js'
import {
  claimEmailSend,
  markEmailFailed,
  markEmailSent,
  EMAIL_RESEND_MAX_PER_KIND,
  type OrderEmailKind
} from '../emailDelivery.js'
import {
  buildOrderConfirmationEmail,
  buildPaymentConfirmedEmail,
  buildTransferApprovedEmail,
  toOrderEmailData
} from '../emailTemplates.js'
import { isSettledOrderStatus } from '../../../src/utils/orderLifecycle.js'

const RESEND_KINDS = new Set<OrderEmailKind>(['confirmation', 'payment'])

/**
 * POST /api/admin/resend-order-email
 * Operator-triggered resend of a customer-facing transactional notice — the
 * recovery path for a failed or never-attempted send recorded in
 * `order.emailDelivery`.
 *
 * Body: { orderId, kind: 'confirmation' | 'payment' }.
 * The resend claims the kind inside a transaction (a concurrent confirmation
 * call or a second admin click cannot double-send), is budgeted per kind
 * (`EMAIL_RESEND_MAX_PER_KIND`), and records every resend in the order's
 * status history for the audit timeline. A Resend failure releases the claim,
 * stamps the failure fields and surfaces a 502 — the operator sees the error
 * and can retry; nothing about the paid state ever changes.
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

  const { orderId, kind } = req.body || {}
  if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
    return res
      .status(400)
      .json({ success: false, error: 'El parámetro "orderId" es obligatorio' })
  }
  if (typeof kind !== 'string' || !RESEND_KINDS.has(kind as OrderEmailKind)) {
    return res.status(400).json({
      success: false,
      error: 'El parámetro "kind" debe ser "confirmation" o "payment"'
    })
  }
  const emailKind = kind as OrderEmailKind
  const cleanOrderId = orderId.trim()

  const db = getAdminFirestore()
  if (!db) {
    return res
      .status(500)
      .json({ success: false, error: 'Base de datos no inicializada' })
  }

  try {
    const resolved = await resolveOrderByCanonicalId(db, cleanOrderId)
    if (!resolved) {
      return res.status(404).json({
        success: false,
        error: `Pedido "${cleanOrderId}" no encontrado en Firestore`
      })
    }
    const orderRef = resolved.ref
    const status = String(resolved.data.status || '')

    // The `payment` resend kind sends a "your money settled" notice — it must
    // never go out for a pending, quoted, review-parked or cancelled order.
    if (emailKind === 'payment' && !isSettledOrderStatus(status)) {
      return res.status(409).json({
        success: false,
        error:
          'El pedido no registra un pago verificado; no se puede enviar la confirmación de pago.',
        currentStatus: status
      })
    }

    const customerEmail = String(
      (resolved.data.customer as { email?: string } | undefined)?.email || ''
    ).trim()
    if (!customerEmail) {
      // Recorded like the automatic send sites: a missing recipient is a
      // delivery failure, not an invisible skip.
      await markEmailFailed(db, orderRef, emailKind, 'missing_customer_email')
      return res.status(400).json({
        success: false,
        error: 'El pedido no tiene correo de cliente registrado.'
      })
    }

    const claim = await claimEmailSend(db, orderRef, emailKind, {
      skipIfSent: false,
      forResend: true
    })
    if (claim.outcome === 'in-flight') {
      return res.status(409).json({
        success: false,
        error: 'Ya hay un envío en curso para este correo. Reintenta en unos minutos.'
      })
    }
    if (claim.outcome === 'capped') {
      return res.status(429).json({
        success: false,
        error: `Se alcanzó el límite de reenvíos (${EMAIL_RESEND_MAX_PER_KIND}) para este correo.`
      })
    }

    // The claim re-read the document inside the transaction — decide "is it
    // still paid?" and build the audit trail from THAT status, not the
    // pre-claim snapshot: a status that moved in between (cancel, webhook
    // settlement) must not send a paid notice for an order that no longer is.
    const freshStatus = String(claim.orderData.status || '')
    if (emailKind === 'payment' && !isSettledOrderStatus(freshStatus)) {
      await markEmailFailed(db, orderRef, emailKind, 'status_changed', claim.claimIso)
      return res.status(409).json({
        success: false,
        error:
          'El pedido cambió de estado mientras se reservaba el envío; ya no registra un pago verificado.',
        currentStatus: freshStatus
      })
    }

    const emailData = toOrderEmailData(cleanOrderId, claim.orderData)
    const template =
      emailKind === 'confirmation'
        ? buildOrderConfirmationEmail(emailData)
        : String(claim.orderData.paymentMethod || '') === 'mercadopago' ||
            freshStatus === 'PAGADO_MERCADOPAGO'
          ? buildPaymentConfirmedEmail(emailData)
          : buildTransferApprovedEmail(emailData)

    const result = await sendEmail({ to: customerEmail, ...template })

    if (!result.sent) {
      await markEmailFailed(db, orderRef, emailKind, result.reason || 'send_failed', claim.claimIso)
      return res.status(502).json({
        success: false,
        error: `No se pudo enviar el correo (${result.reason || 'error del proveedor'}). Reintenta más tarde.`
      })
    }

    await markEmailSent(db, orderRef, emailKind, claim.claimIso, { resend: true })

    // Audit the resend in the order's status history (same-status event, like
    // the webhook's incident entries). Best-effort: the email already went
    // out, so a history write failure must not turn the operator's success
    // into an error.
    try {
      const nowIso = new Date().toISOString()
      const historyRef = db.collection(getCollectionName('order_status_history')).doc()
      await historyRef.set({
        id: historyRef.id,
        orderId: cleanOrderId,
        previousStatus: freshStatus,
        newStatus: freshStatus,
        changedBy: authResult.uid || 'admin',
        changedByEmail: authResult.email || null,
        actorRole: 'ADMIN',
        timestamp: nowIso,
        reason: `Reenvío manual del correo ${
          emailKind === 'confirmation' ? 'de confirmación de pedido' : 'de confirmación de pago'
        } al cliente.`,
        metadata: {
          event: 'CORREO_REENVIADO',
          emailKind,
          recipient: customerEmail,
          resentBy: authResult.email || 'admin'
        }
      })
    } catch (historyErr: unknown) {
      console.warn(
        `[Admin Resend Email] Resend for ${cleanOrderId} succeeded but the history event could not be written: ${
          (historyErr as Error)?.message || historyErr
        }`
      )
    }

    return res.status(200).json({
      success: true,
      resent: true,
      orderId: cleanOrderId,
      kind: emailKind
    })
  } catch (err: unknown) {
    console.error('[Admin API Resend Order Email] Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error al reenviar el correo'
    })
  }
}
