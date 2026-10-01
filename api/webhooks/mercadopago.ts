import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Transaction, Firestore, DocumentReference } from "firebase-admin/firestore";
import { getAdminFirestore } from "../_lib/firebaseAdmin.js";
import { verifyMercadoPagoSignature } from "../_lib/mercadopagoSignature.js";
import { getCollectionName } from "../_lib/firestoreEnv.js";
import { resolveOrderByCanonicalId } from "../_lib/orderLookup.js";
import { sendEmail, getWarehouseEmail } from "../_lib/email.js";
import { markEmailFailed, markEmailSent } from "../_lib/emailDelivery.js";
import {
  buildPaymentConfirmedEmail,
  buildWarehouseAlertEmail,
  toOrderEmailData,
} from "../_lib/emailTemplates.js";
import type { StockShortfall } from "../_lib/emailTemplates.js";
import { resolvePromoPercent } from "../../src/config/promos.js";
import { computeOrderTotal } from "../../src/utils/orderTotal.js";
import { isSettledOrderStatus } from "../../src/utils/orderLifecycle.js";
import { formatCLP } from "../../src/utils/currency.js";
import { hasRealMercadoPagoToken, isSimulatedPaymentAllowed } from "../_lib/simulationPolicy.js";
import {
  persistPaymentIncident,
  sendPaymentIncidentAlert,
  type PaymentIncidentReason,
} from "../_lib/paymentIncidents.js";

/**
 * Order-status guard: an approved payment may only settle an order
 * that is genuinely awaiting payment. Anything else is refused — settled orders
 * get an incident record + warehouse alert, unresolved ones are parked in
 * PAGO_EN_REVISION — and stock is NEVER deducted for them.
 */
const PAYABLE_STATUSES = new Set(["PENDIENTE_PAGO_MERCADOPAGO", "PAGO_EN_REVISION"]);
/**
 * Payment statuses that reverse an already-collected charge.
 * `cancelled` is deliberately absent: Mercado Pago only cancels payments that
 * are still pending/in-process (no money was ever collected), so a cancellation
 * can never reverse a paid order — including it would only create a
 * false-positive path for legacy orders with no recorded payment id.
 */
const REVERSAL_PAYMENT_STATUSES = new Set(["refunded", "charged_back"]);

/**
 * A verified settlement that can never be joined to an order — no usable
 * external_reference/description, or a reference resolving to no Firestore
 * order — must not be acknowledged silently. The incident is persisted first
 * (idempotent by paymentId) and only then acknowledged; a persistence failure
 * refuses the delivery with 5xx so Mercado Pago retries. Without Firestore
 * Admin there is no incident store: transient in a production runtime (500,
 * retried), simulated ack outside production.
 */
async function respondMissingOrderIncident(
  res: VercelResponse,
  paymentId: string,
  paymentData: Record<string, unknown>,
  reason: PaymentIncidentReason,
) {
  const adminDb = getAdminFirestore();
  if (!adminDb) {
    if (!isSimulatedPaymentAllowed()) {
      console.error(
        `[Mercado Pago Webhook] Firestore Admin unavailable in a production runtime; refusing to acknowledge payment ${paymentId} without a durable missing-order incident.`,
      );
      return res.status(500).json({ error: "Webhook processing unavailable" });
    }
    console.warn(
      `[Mercado Pago Webhook] Firestore Admin not initialized; skipping missing-order incident for payment ${paymentId}.`,
    );
    return res.status(200).json({
      received: true,
      verifiedStatus: String(paymentData.status || ""),
      warning: "Firestore Admin unavailable",
    });
  }

  try {
    const result = await persistPaymentIncident(adminDb, {
      paymentId,
      paymentData,
      reason,
    });
    await sendPaymentIncidentAlert({
      paymentId,
      paymentData,
      reason,
      duplicate: result.duplicate === true,
    });
    console.warn(
      `[Mercado Pago Webhook] Payment ${paymentId} (${String(
        paymentData.status || "",
      )}) could not be joined to an order (${reason}); incident persisted for manual reconciliation.`,
    );
    return res.status(200).json({
      received: true,
      verifiedStatus: String(paymentData.status || ""),
      note: "incident",
      incident: reason,
      ...(result.duplicate ? { duplicate: true } : {}),
    });
  } catch (error) {
    console.error(
      `[Mercado Pago Webhook] Failed to persist the missing-order incident for payment ${paymentId}; refusing to acknowledge — Mercado Pago will retry.`,
      error,
    );
    return res.status(500).json({ error: "Webhook processing unavailable" });
  }
}

/**
 * The `order_status_history` event for a detected partial refund. The incident
 * carries the payment id and the cumulative refunded amount so the case is
 * auditable without ever storing bank secrets, and the order keeps its current
 * status: a partial refund does not reverse fulfillment, and no stock moves —
 * the owner's Mercado Pago ledger stays the reconciliation authority.
 */
function buildPartialRefundIncidentHistory({
  cleanOrderId,
  previousStatus,
  paymentId,
  paymentData,
  partialRefundAmount,
  nowIso,
  uid,
}: {
  cleanOrderId: string;
  previousStatus: string;
  paymentId: string;
  paymentData: Record<string, unknown>;
  partialRefundAmount: number;
  nowIso: string;
  uid: string;
}): Record<string, unknown> {
  return {
    id: uid,
    orderId: cleanOrderId,
    previousStatus: previousStatus,
    newStatus: previousStatus,
    changedBy: "MERCADOPAGO_WEBHOOK",
    changedByEmail: "webhook@mercadopago.cl",
    actorRole: "SYSTEM_WEBHOOK",
    timestamp: nowIso,
    reason: `Reembolso parcial detectado (ID: ${paymentId}): ${formatCLP(
      partialRefundAmount,
    )} de ${formatCLP(Number(paymentData.transaction_amount) || 0)} devueltos por Mercado Pago. Revisión manual requerida; sin movimiento de stock.`,
    metadata: {
      event: "PAGO_REEMBOLSO_PARCIAL",
      paymentId,
      refundedAmount: partialRefundAmount,
      transactionAmount: paymentData.transaction_amount,
      paymentStatus: paymentData.status,
    },
  };
}

/**
 * Records the partial-refund incident once per refund state. The durable
 * marker fields on the order document (`partialRefundPaymentId` +
 * `partialRefundAmount`) are checked inside the transaction, so a retried
 * delivery of the same refund state writes nothing, while a higher cumulative
 * refunded amount (a new partial refund) records a new incident. No status
 * flip (the sale mostly stands), no stock movement, no customer email.
 *
 * Returns whether this delivery was a replay of an already-recorded incident.
 */
async function respondPartialRefundIncident({
  adminDb,
  orderRef,
  cleanOrderId,
  paymentId,
  paymentData,
  partialRefundAmount,
}: {
  adminDb: Firestore;
  orderRef: DocumentReference;
  cleanOrderId: string;
  paymentId: string;
  paymentData: Record<string, unknown>;
  partialRefundAmount: number;
}): Promise<{ duplicate: boolean }> {
  let partialRefundDuplicate = false;

  await adminDb.runTransaction(async (transaction: Transaction) => {
    // The callback may be re-run by Firestore on contention: reset the
    // closure state so a stale flag cannot leak into the result.
    partialRefundDuplicate = false;

    const freshOrderSnap = await transaction.get(orderRef);
    const freshOrderData = freshOrderSnap.data() || {};
    const freshPartialId = String(freshOrderData.partialRefundPaymentId || "");
    const freshPartialAmount = Number(freshOrderData.partialRefundAmount) || 0;

    // Same payment id = the same payment's refund state. Cumulative refunds
    // only grow, so a lower-or-equal amount under the same payment id is
    // necessarily a stale replay (e.g. refund-1's delivery retried after
    // refund-2's landed first); a higher amount is a NEW partial refund.
    if (freshPartialId === paymentId && partialRefundAmount <= freshPartialAmount) {
      partialRefundDuplicate = true;
      return;
    }

    const nowIso = new Date().toISOString();
    transaction.update(orderRef, {
      partialRefundPaymentId: paymentId,
      partialRefundAmount,
      partialRefundAt: nowIso,
      updatedAt: nowIso,
    });

    const incidentHistoryRef = adminDb
      .collection(getCollectionName("order_status_history"))
      .doc();
    transaction.set(
      incidentHistoryRef,
      buildPartialRefundIncidentHistory({
        cleanOrderId,
        previousStatus: String(freshOrderData.status || ""),
        paymentId,
        paymentData,
        partialRefundAmount,
        nowIso,
        uid: incidentHistoryRef.id,
      }),
    );
  });

  return { duplicate: partialRefundDuplicate };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const MERCADOPAGO_ACCESS_TOKEN =
    (process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim() || "YOUR_MERCADOPAGO_ACCESS_TOKEN";
  const hasRealAccessToken = hasRealMercadoPagoToken();
  const MERCADOPAGO_WEBHOOK_SECRET =
    process.env.MERCADOPAGO_WEBHOOK_SECRET || "";

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only accept POST or GET ping requests
  if (req.method === "GET") {
    return res
      .status(200)
      .json({ status: "ok", message: "Mercado Pago Webhook Endpoint Active" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { body, query: reqQuery } = req;

    // Extract Payment ID from Mercado Pago webhook notification payload.
    // ONE normalized value is used for the signature, the MP fetch
    // and every comparison. The official HMAC manifest is built from the query
    // `data.id` (`id:[data.id];request-id:[x-request-id];ts:[ts];`), so the
    // payment actually fetched must be the one the signature covers — a tampered
    // body id can no longer redirect the verification to a different payment.
    // maxAgeSeconds is deliberately NOT passed: Mercado Pago retries reuse the
    // original `ts`, and a replay window would reject legitimate retries.
    const rawPaymentId =
      reqQuery?.["data.id"] || reqQuery?.id || body?.data?.id || body?.id;
    const paymentId =
      rawPaymentId === undefined || rawPaymentId === null
        ? ""
        : String(rawPaymentId).trim();

    if (!paymentId) {
      return res
        .status(200)
        .json({ received: true, note: "No payment ID in webhook payload" });
    }

    // Step 0: CRYPTOGRAPHIC SIGNATURE VERIFICATION (x-signature / x-request-id)
    const headers = req.headers || {};
    const signatureResult = verifyMercadoPagoSignature({
      signatureHeader: headers["x-signature"],
      requestIdHeader: headers["x-request-id"],
      dataId: paymentId,
      secret: MERCADOPAGO_WEBHOOK_SECRET,
    });

    if (!signatureResult.valid) {
      console.warn(
        `[Mercado Pago Webhook] Unauthorized request: ${signatureResult.reason}`,
      );
      return res.status(401).json({
        error: "Unauthorized: Invalid or missing webhook signature",
        reason: signatureResult.reason,
      });
    }

    // FAIL-CLOSED: a production runtime must not run with placeholder
    // credentials — without the webhook secret nothing can be verified, and without
    // a real access token the payment cannot be double-checked. Refuse loudly (5xx
    // makes Mercado Pago retry) instead of acknowledging blindly.
    if (
      signatureResult.reason === "secret_not_configured" &&
      !isSimulatedPaymentAllowed()
    ) {
      console.error(
        "[Mercado Pago Webhook] MERCADOPAGO_WEBHOOK_SECRET missing in a production runtime; refusing to process an unverifiable webhook.",
      );
      return res
        .status(500)
        .json({ error: "Webhook configuration error: signature verification unavailable" });
    }

    if (!hasRealAccessToken && !isSimulatedPaymentAllowed()) {
      console.error(
        "[Mercado Pago Webhook] MERCADOPAGO_ACCESS_TOKEN missing in a production runtime; refusing to process an unverifiable payment notification.",
      );
      return res
        .status(500)
        .json({ error: "Webhook configuration error: payment verification unavailable" });
    }

    // Step 1: DOUBLE-CHECK PAYMENT WITH MERCADO PAGO OFFICIAL API USING SECRET TOKEN
    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
        },
      },
    );

    if (!mpResponse.ok) {
      // 404 means the payment does not exist — there is nothing to
      // reconcile, so it is safe to acknowledge. EVERY other failure (revoked or
      // expired token, MP 5xx, malformed id) must NOT be acked: Mercado Pago
      // retries 5xx, so a genuinely paid order is reconciled once the cause is
      // fixed instead of being dropped forever.
      if (mpResponse.status === 404) {
        console.warn(
          `[Mercado Pago Webhook] Payment ${paymentId} not found at Mercado Pago (404); acknowledging.`,
        );
        return res
          .status(200)
          .json({ received: true, note: "Payment not found at Mercado Pago" });
      }
      console.error(
        `[Mercado Pago Webhook] MP verification failed for payment ${paymentId} (HTTP ${mpResponse.status} ${mpResponse.statusText}). Refusing to acknowledge — Mercado Pago will retry.`,
      );
      return res
        .status(502)
        .json({ error: "Mercado Pago verification unavailable" });
    }

    const paymentData = await mpResponse.json();

    // Step 2: VERIFY PAYMENT STATUS — an approved payment is reconciled against
    // the order; a refund/chargeback of the payment that settled an order parks
    // it for manual reconciliation instead of leaving it paid forever.
    const isReversalPayment = REVERSAL_PAYMENT_STATUSES.has(
      String(paymentData.status),
    );

    // A PARTIAL refund returns part of an already-collected charge while
    // Mercado Pago keeps the payment `status: 'approved'` with the original
    // `transaction_amount` — the returned money accumulates in
    // `transaction_amount_refunded` (default 0). Only a still-approved payment
    // can carry one; a positive fractional amount is garbage data and is
    // logged loudly instead of silently treated as absent.
    const rawPartialRefund = Number(paymentData.transaction_amount_refunded);
    let partialRefundAmount = 0;
    if (Number.isInteger(rawPartialRefund) && rawPartialRefund > 0) {
      partialRefundAmount = rawPartialRefund;
    } else if (rawPartialRefund > 0) {
      console.warn(
        `[Mercado Pago Webhook] Payment ${paymentId} reports a non-integer transaction_amount_refunded (${String(
          paymentData.transaction_amount_refunded,
        )}); treating it as absent — reconcile manually.`,
      );
    }

    if (paymentData.status === "approved" || isReversalPayment) {
      const orderId = paymentData.external_reference || paymentData.description;

      // No usable reference: the payment can never be joined to an order.
      // Persist the incident (idempotent by paymentId) and acknowledge only
      // once it is durable; a persistence failure returns 5xx so Mercado Pago
      // retries.
      if (!orderId) {
        return respondMissingOrderIncident(
          res,
          paymentId,
          paymentData,
          "REFERENCIA_NO_UTILIZABLE",
        );
      }

    const cleanOrderId = String(orderId).trim().toUpperCase();
      const adminDb = getAdminFirestore();

      if (!adminDb) {
        // FAIL-CLOSED: a verified payment we cannot reconcile must not
        // be silently acknowledged — money was collected. 5xx makes Mercado Pago
        // retry, so the delivery is processed once Firestore Admin is restored.
        if (!isSimulatedPaymentAllowed()) {
          console.error(
            "[Mercado Pago Webhook] Firestore Admin unavailable in a production runtime; refusing to acknowledge an unreconcilable payment.",
          );
          return res
            .status(500)
            .json({ error: "Webhook processing unavailable" });
        }
        console.warn(
          "Firestore Admin not initialized; skipping database updates",
        );
        return res.status(200).json({
          received: true,
          verifiedStatus: paymentData.status,
          warning: "Firestore Admin unavailable",
        });
      }

      // Resolve the order by document key first — resolving through
      // the `orderId` field alone lets a decoy document shadow the real order.
      const resolvedOrder = await resolveOrderByCanonicalId(adminDb, cleanOrderId);

      if (resolvedOrder) {
        const orderRef = resolvedOrder.ref;
        const orderData = resolvedOrder.data;

        // REFUND / CHARGEBACK: a reversal of the payment that
        // settled this order must park it for manual reconciliation — refunds
        // stay off-platform. Only the payment
        // recorded on the order can reverse it; a reversal of a second
        // (double) payment is not this order's charge.
        if (isReversalPayment) {
          let reversalEvent: string | null = null;
          let reversalStatus: string | null = null;

          await adminDb.runTransaction(async (transaction: Transaction) => {
            // The callback may be re-run by Firestore on contention: reset the
            // closure state so a stale flag cannot leak into the result.
            reversalEvent = null;
            reversalStatus = null;

            const freshOrderSnap = await transaction.get(orderRef);
            const freshOrderData = freshOrderSnap.data() || {};
            const freshStatus = String(freshOrderData.status || "");
            const freshStoredPaymentId = freshOrderData.mercadopagoPaymentId
              ? String(freshOrderData.mercadopagoPaymentId)
              : "";

            // Legacy documents carry no recorded payment id — treated as a
            // match (fail-safe). A recorded, different id belongs to another
            // payment (e.g. the second charge of a double payment).
            if (freshStoredPaymentId && freshStoredPaymentId !== paymentId) {
              return;
            }

            const isPaid = freshStatus === "PAGADO_MERCADOPAGO";
            const isFulfilled =
              freshStatus === "EN_PREPARACION" ||
              freshStatus === "DESPACHADO" ||
              freshStatus === "ENTREGADO";
            // A payment parked in review (amount mismatch / invalid status) can
            // be refunded too: the incident is recorded so the reconciliation is
            // never approved on a stale "the money is in" premise.
            const isInReview = freshStatus === "PAGO_EN_REVISION";
            if (!isPaid && !isFulfilled && !isInReview) {
              return;
            }

            const nowIso = new Date().toISOString();

            // Only a still-paid order is flipped to review: a fulfilled order
            // keeps its status (customer tracking must not regress) and gets
            // the incident record only. No stock movement either way.
            if (isPaid) {
              transaction.update(orderRef, {
                status: "PAGO_EN_REVISION",
                updatedAt: nowIso,
              });
            }

            const reversalHistoryRef = adminDb
              .collection(getCollectionName("order_status_history"))
              .doc();
            transaction.set(reversalHistoryRef, {
              id: reversalHistoryRef.id,
              orderId: cleanOrderId,
              previousStatus: freshStatus,
              newStatus: isPaid ? "PAGO_EN_REVISION" : freshStatus,
              changedBy: "MERCADOPAGO_WEBHOOK",
              changedByEmail: "webhook@mercadopago.cl",
              actorRole: "SYSTEM_WEBHOOK",
              timestamp: nowIso,
              reason: `Pago ${
                paymentData.status === "charged_back"
                  ? "contracargado"
                  : paymentData.status === "refunded"
                    ? "reembolsado"
                    : "cancelado"
              } por Mercado Pago (ID: ${paymentId}). Revisión manual requerida; sin movimiento de stock.`,
              metadata: {
                event: "PAGO_REEMBOLSADO",
                paymentId,
                paymentStatus: paymentData.status,
                transactionAmount: paymentData.transaction_amount,
              },
            });

            reversalEvent = "PAGO_REEMBOLSADO";
            reversalStatus = isPaid ? "PAGO_EN_REVISION" : freshStatus;
          });

          // Never notify the customer on a reversal — alert Melipilla staff only.
          if (reversalEvent) {
            const warehouseEmail = getWarehouseEmail();
            if (warehouseEmail) {
              await sendEmail({
                to: warehouseEmail,
                ...buildWarehouseAlertEmail(
                  toOrderEmailData(cleanOrderId, {
                    ...orderData,
                    status: reversalStatus || String(orderData.status || ""),
                  }),
                  reversalEvent,
                ),
              });
            }
          }

          return res.status(200).json({
            received: true,
            verifiedStatus: paymentData.status,
          });
        }

        // Fast-Path Idempotency Check: ONLY the payment id that
        // settled the order is a duplicate. A different approved payment for an
        // order that already recorded one is a double charge — it must be
        // recorded and alerted, never silently acked as a duplicate.
        if (orderData.mercadopagoPaymentId === paymentId) {
          // A partial refund keeps the payment `approved`, so its update
          // notification arrives through this same fast path. Swallowing it
          // would leave the returned money invisible: record the deduped
          // incident instead of the silent skip.
          if (partialRefundAmount > 0) {
            const refundIncident = await respondPartialRefundIncident({
              adminDb,
              orderRef,
              cleanOrderId,
              paymentId,
              paymentData,
              partialRefundAmount,
            });
            if (refundIncident.duplicate) {
              console.info(
                `[Mercado Pago Webhook] Order "${cleanOrderId}" already recorded the partial-refund incident for payment ${paymentId} (${partialRefundAmount}). Skipping duplicate processing.`,
              );
              return res.status(200).json({
                received: true,
                verifiedStatus: paymentData.status,
                duplicate: true,
                message: "Order already processed",
              });
            }
            console.warn(
              `[Mercado Pago Webhook] Payment ${paymentId} for order "${cleanOrderId}" carries a partial refund (${partialRefundAmount}); incident recorded for manual reconciliation.`,
            );
            const warehouseEmail = getWarehouseEmail();
            if (warehouseEmail) {
              await sendEmail({
                to: warehouseEmail,
                ...buildWarehouseAlertEmail(
                  toOrderEmailData(cleanOrderId, orderData),
                  "PAGO_REEMBOLSO_PARCIAL",
                ),
              });
            }
            return res.status(200).json({
              received: true,
              verifiedStatus: paymentData.status,
              note: "incident",
              incident: "REEMBOLSO_PARCIAL",
            });
          }

          console.info(
            `[Mercado Pago Webhook] Order "${cleanOrderId}" already recorded payment ${paymentId} (status: ${orderData.status}). Skipping duplicate processing.`,
          );
          return res.status(200).json({
            received: true,
            verifiedStatus: paymentData.status,
            duplicate: true,
            message: "Order already processed",
          });
        }

        // Execute atomic transaction for order status update and stock deduction.
        // In Firestore transactions, all reads MUST precede all writes.
        let stockDeducted = false;
        // Post-transaction warehouse alert: the review/incident
        // event to send when the delivery was not a clean approval.
        let flaggedEvent: string | null = null;
        let flaggedStatus: string | null = null;
        // Oversold lines recorded on approval.
        const stockShortfalls: StockShortfall[] = [];
        await adminDb.runTransaction(async (transaction: Transaction) => {
          // The callback may be re-run by Firestore on contention: reset the
          // closure state so a stale flag from a rolled-back attempt can never
          // leak into the committed result.
          stockDeducted = false;
          flaggedEvent = null;
          flaggedStatus = null;
          stockShortfalls.length = 0;

          const freshOrderSnap = await transaction.get(orderRef);
          const freshOrderData = freshOrderSnap.data();
          const freshStatus = String(freshOrderData?.status || "");
          const freshStoredPaymentId = freshOrderData?.mercadopagoPaymentId
            ? String(freshOrderData.mercadopagoPaymentId)
            : "";

          // Concurrency Guard: only the same payment id is a
          // duplicate; a different one falls through to the status guard below.
          if (freshStoredPaymentId === paymentId) {
            console.info(
              `[Mercado Pago Webhook] Order "${cleanOrderId}" was marked as paid during concurrent transaction.`,
            );
            return;
          }

          const nowIso = new Date().toISOString();

          // ORDER-STATUS GUARD: an approved payment may only
          // settle an order that is genuinely awaiting payment — and an order's
          // lines are deducted AT MOST ONCE (`paidAt`/`approvedAt` mark an
          // earlier settlement, e.g. the refunded payment that parked this
          // order in review). A settled order gets an incident record + alert —
          // never a second stock deduction, never a status flip that would
          // regress customer tracking.
          const settledStatus = isSettledOrderStatus(freshStatus);
          const alreadyDeducted = Boolean(
            freshOrderData?.paidAt || freshOrderData?.approvedAt,
          );
          if (settledStatus || alreadyDeducted) {
            console.warn(
              `[Mercado Pago Webhook] Payment ${paymentId} approved for order "${cleanOrderId}" (status: ${freshStatus}) that was already settled; recording a double-payment incident without stock movement.`,
            );
            const incidentHistoryRef = adminDb
              .collection(getCollectionName("order_status_history"))
              .doc();
            transaction.set(incidentHistoryRef, {
              id: incidentHistoryRef.id,
              orderId: cleanOrderId,
              previousStatus: freshStatus,
              newStatus: freshStatus,
              changedBy: "MERCADOPAGO_WEBHOOK",
              changedByEmail: "webhook@mercadopago.cl",
              actorRole: "SYSTEM_WEBHOOK",
              timestamp: nowIso,
              reason: settledStatus
                ? `Segundo pago aprobado (ID: ${paymentId}) para un pedido ya resuelto (estado: ${freshStatus}, pago registrado: ${freshStoredPaymentId || "sin registro"}). Posible doble cobro; reembolso manual requerido.`
                : `Pago aprobado (ID: ${paymentId}) para un pedido cuya mercadería ya fue rebajada por un pago anterior (estado: ${freshStatus}, pago registrado: ${freshStoredPaymentId || "sin registro"}). Posible doble cobro; reembolso manual requerido.`,
              metadata: {
                event: "PAGO_DUPLICADO",
                paymentId,
                previousPaymentId: freshStoredPaymentId || null,
                paymentStatus: paymentData.status,
                transactionAmount: paymentData.transaction_amount,
              },
            });
            flaggedEvent = "PAGO_DUPLICADO";
            flaggedStatus = freshStatus;
            return;
          }

          // Any other non-payable status (cancelled, pending transfer/quote,
          // unknown) is parked for manual reconciliation — never approved.
          if (!PAYABLE_STATUSES.has(freshStatus)) {
            console.warn(
              `[Mercado Pago Webhook] Payment ${paymentId} approved for non-payable order "${cleanOrderId}" (status: ${freshStatus}); parking in PAGO_EN_REVISION without stock movement.`,
            );
            transaction.update(orderRef, {
              status: "PAGO_EN_REVISION",
              mercadopagoPaymentId: paymentId,
              updatedAt: nowIso,
            });
            const guardHistoryRef = adminDb
              .collection(getCollectionName("order_status_history"))
              .doc();
            transaction.set(guardHistoryRef, {
              id: guardHistoryRef.id,
              orderId: cleanOrderId,
              previousStatus: freshStatus || orderData.status || null,
              newStatus: "PAGO_EN_REVISION",
              changedBy: "MERCADOPAGO_WEBHOOK",
              changedByEmail: "webhook@mercadopago.cl",
              actorRole: "SYSTEM_WEBHOOK",
              timestamp: nowIso,
              reason: `Pago aprobado (ID: ${paymentId}) para un pedido en estado "${freshStatus || "desconocido"}", que no admite pago automático. Revisión manual requerida; sin movimiento de stock.`,
              metadata: {
                event: "PAGO_ESTADO_INVALIDO",
                paymentId,
                previousStatus: freshStatus || null,
                paymentStatus: paymentData.status,
                transactionAmount: paymentData.transaction_amount,
              },
            });
            flaggedEvent = "PAGO_ESTADO_INVALIDO";
            flaggedStatus = "PAGO_EN_REVISION";
            return;
          }

          // 1. Read all product documents first (all reads before writes)
          const items = Array.isArray(freshOrderData?.items)
            ? freshOrderData.items
            : Array.isArray(orderData.items)
              ? orderData.items
              : [];

          const productUpdates: Array<{
            ref: any;
            productId: string;
            name: string;
            sku: string;
            previousStock: number;
            newStock: number;
            quantity: number;
            shortfall: number;
            inStock: boolean;
          }> = [];

          // Consolidate duplicate line items by productId to prevent transactional overwrite
          const consolidatedItems = new Map<
            string,
            { qty: number; name?: string }
          >();
          let hasUnverifiableItem = false;
          for (const item of items) {
            const pid = item.productId || item.id;
            if (!pid || typeof pid !== "string") {
              // A line without a resolvable productId can never be price-verified.
              hasUnverifiableItem = true;
              continue;
            }
            const existing = consolidatedItems.get(pid) || {
              qty: 0,
              name: item.name,
            };
            existing.qty += Math.max(1, Number(item.quantity) || 1);
            if (item.name) existing.name = item.name;
            consolidatedItems.set(pid, existing);
          }

          const catalogLines: { price: number; quantity: number }[] = [];
          let catalogComplete = !hasUnverifiableItem && consolidatedItems.size > 0;

          for (const [productId, info] of consolidatedItems.entries()) {
            const productRef = adminDb
              .collection(getCollectionName("products"))
              .doc(productId);
            const productSnap = await transaction.get(productRef);

            if (productSnap.exists) {
              const pData = productSnap.data() || {};
              const currentStock = Number(pData.stockCount) || 0;
              const newStock = Math.max(0, currentStock - info.qty);
              const isActive = pData.isActive !== false;
              const catalogPrice = Number(pData.price);
              if (Number.isInteger(catalogPrice) && catalogPrice > 0) {
                catalogLines.push({ price: catalogPrice, quantity: info.qty });
              } else {
                catalogComplete = false;
              }
              const lineName = pData.name || info.name || productId;
              const shortfall = Math.max(0, info.qty - currentStock);
              // An oversell (stock hit 0 between preference and
              // payment) is still approved — the money is taken — but the
              // shortfall is recorded and alerted, never hidden by the clamp.
              if (shortfall > 0) {
                stockShortfalls.push({
                  productId,
                  name: lineName,
                  requested: info.qty,
                  available: currentStock,
                });
              }
              productUpdates.push({
                ref: productRef,
                productId,
                name: lineName,
                sku: pData.sku || "",
                previousStock: currentStock,
                newStock,
                quantity: info.qty,
                shortfall,
                inStock: newStock > 0 && isActive,
              });
            } else {
              catalogComplete = false;
            }
          }

          // AMOUNT ASSERTION (underpayment exploit):
          // recompute the payable total from the CURRENT Firestore catalog and
          // require BOTH the actually-paid amount and the order's stored total
          // to match it exactly (integer CLP) before marking paid. Any mismatch
          // — underpayment, tampered order total, or unverifiable lines — goes
          // to manual review WITHOUT decrementing stock.
          const discountPercent = resolvePromoPercent(
            freshOrderData?.promoCode ?? orderData.promoCode,
          );
          const expectedAmount = catalogComplete
            ? computeOrderTotal(catalogLines, discountPercent)
            : null;
          const paidAmount = Number(paymentData.transaction_amount);
          const amountVerified =
            expectedAmount !== null &&
            Number.isInteger(paidAmount) &&
            paidAmount === expectedAmount &&
            freshOrderData?.totalAmount === expectedAmount;

          if (!amountVerified) {
            console.warn(
              `[Mercado Pago Webhook] Order "${cleanOrderId}" amount verification failed: paid ${String(paymentData.transaction_amount)}, expected ${String(expectedAmount)}. Flagging for manual review; no stock deducted.`,
            );
            transaction.update(orderRef, {
              status: "PAGO_EN_REVISION",
              mercadopagoPaymentId: String(paymentId),
              updatedAt: nowIso,
            });

            const reviewHistoryRef = adminDb
              .collection(getCollectionName("order_status_history"))
              .doc();
            transaction.set(reviewHistoryRef, {
              id: reviewHistoryRef.id,
              orderId: cleanOrderId,
              previousStatus:
                freshOrderData?.status || orderData.status || null,
              newStatus: "PAGO_EN_REVISION",
              changedBy: "MERCADOPAGO_WEBHOOK",
              changedByEmail: "webhook@mercadopago.cl",
              actorRole: "SYSTEM_WEBHOOK",
              timestamp: nowIso,
              reason:
                expectedAmount === null
                  ? `No fue posible verificar el monto del pago (ID: ${paymentId}) contra el catálogo. Revisión manual requerida.`
                  : `Monto pagado (${String(paymentData.transaction_amount)}) no coincide con el total verificado del pedido (${expectedAmount}). Revisión manual requerida.`,
              metadata: {
                paymentId: String(paymentId),
                paymentStatus: paymentData.status,
                transactionAmount: paymentData.transaction_amount,
                expectedAmount,
              },
            });
            flaggedEvent = "PAGO_EN_REVISION";
            flaggedStatus = "PAGO_EN_REVISION";
            return;
          }

          // 2. Perform all writes: update order document. A payment that was
          // already partially refunded by the time its approval webhook was
          // processed (e.g. Mercado Pago retried the delivery during an outage)
          // still settles — the charge went through and the amount assertion
          // passed — but the refund is recorded in the SAME transaction so the
          // case is never silently fulfilled.
          const partialRefundIncident = partialRefundAmount > 0;
          transaction.update(orderRef, {
            status: "PAGADO_MERCADOPAGO",
            mercadopagoPaymentId: String(paymentId),
            paidAt: nowIso,
            updatedAt: nowIso,
            ...(partialRefundIncident
              ? {
                  partialRefundPaymentId: paymentId,
                  partialRefundAmount,
                  partialRefundAt: nowIso,
                }
              : {}),
          });

          // Record order status history
          const historyRef = adminDb
            .collection(getCollectionName("order_status_history"))
            .doc();
          transaction.set(historyRef, {
            id: historyRef.id,
            orderId: cleanOrderId,
            previousStatus:
              freshOrderData?.status || orderData.status || null,
            newStatus: "PAGADO_MERCADOPAGO",
            changedBy: "MERCADOPAGO_WEBHOOK",
            changedByEmail: "webhook@mercadopago.cl",
            actorRole: "SYSTEM_WEBHOOK",
            timestamp: nowIso,
            reason: `Pago aprobado por Mercado Pago (ID: ${paymentId})`,
            metadata: {
              paymentId: String(paymentId),
              paymentStatus: paymentData.status,
              transactionAmount: paymentData.transaction_amount,
              // Oversold lines travel with the approval so the
              // shortfall is auditable, not just emailed.
              ...(stockShortfalls.length > 0 ? { stockShortfalls } : {}),
            },
          });

          // The settled payment already carried a partial refund: record the
          // incident in the same transaction so the case is auditable from the
          // moment the order is marked paid.
          if (partialRefundIncident) {
            const refundIncidentRef = adminDb
              .collection(getCollectionName("order_status_history"))
              .doc();
            transaction.set(
              refundIncidentRef,
              buildPartialRefundIncidentHistory({
                cleanOrderId,
                previousStatus: String(freshOrderData?.status || orderData.status || ""),
                paymentId,
                paymentData,
                partialRefundAmount,
                nowIso,
                uid: refundIncidentRef.id,
              }),
            );
          }

          // Perform all writes: update product stock documents and audit logs
          for (const prodUpdate of productUpdates) {
            transaction.update(prodUpdate.ref, {
              stockCount: prodUpdate.newStock,
              inStock: prodUpdate.inStock,
              updatedAt: nowIso,
            });

            const auditRef = adminDb
              .collection(getCollectionName("inventory_audit_logs"))
              .doc();
            transaction.set(auditRef, {
              id: auditRef.id,
              productId: prodUpdate.productId,
              productSku: prodUpdate.sku,
              productName: prodUpdate.name,
              changeType: "ORDER_FULFILLMENT_DEDUCTION",
              previousStock: prodUpdate.previousStock,
              newStock: prodUpdate.newStock,
              delta: -prodUpdate.quantity,
              reasonCode: "orden_compra",
              operatorNotes: `Rebaja automática por pago Mercado Pago de orden ${cleanOrderId}`,
              changedBy: "MERCADOPAGO_WEBHOOK",
              changedByEmail: "webhook@mercadopago.cl",
              actorRole: "SYSTEM_WEBHOOK",
              timestamp: nowIso,
              metadata: {
                orderId: cleanOrderId,
                paymentId: String(paymentId),
                ...(prodUpdate.shortfall > 0
                  ? { stockShortfall: prodUpdate.shortfall }
                  : {}),
              },
            });
          }

          stockDeducted = true;
        });

        // Transactional emails (fail-safe, awaited before the 200 so Vercel does
        // not terminate the send): customer payment confirmation + warehouse alert.
        // The customer send's outcome is stamped on the order (`emailDelivery.payment`)
        // so a Resend outage stays visible and manually resendable — never a
        // reason to roll back the committed paid state.
        if (stockDeducted) {
          const emailData = toOrderEmailData(cleanOrderId, {
            ...orderData,
            status: "PAGADO_MERCADOPAGO",
          });
          const customerEmail = String(
            orderData.customer?.email || "",
          ).trim();
          if (customerEmail) {
            const paymentEmailResult = await sendEmail({
              to: customerEmail,
              ...buildPaymentConfirmedEmail(emailData),
            });
            if (paymentEmailResult.sent) {
              await markEmailSent(adminDb, orderRef, "payment", undefined);
            } else {
              await markEmailFailed(
                adminDb,
                orderRef,
                "payment",
                paymentEmailResult.reason || "send_failed",
              );
            }
          } else {
            // Same visibility rule as the confirmation kind: an order without a
            // customer email is a recorded failure, not an invisible skip.
            await markEmailFailed(adminDb, orderRef, "payment", "missing_customer_email");
          }
          const warehouseEmail = getWarehouseEmail();
          if (warehouseEmail) {
            await sendEmail({
              to: warehouseEmail,
              ...buildWarehouseAlertEmail(
                emailData,
                "PAGADO_MERCADOPAGO",
                stockShortfalls,
              ),
            });
            // The settled payment already carried a partial refund: alert the
            // warehouse so the returned money is reconciled manually.
            if (partialRefundAmount > 0) {
              await sendEmail({
                to: warehouseEmail,
                ...buildWarehouseAlertEmail(emailData, "PAGO_REEMBOLSO_PARCIAL"),
              });
            }
          }
        } else if (flaggedEvent) {
          // Never notify the customer that payment succeeded: the delivery was
          // flagged (amount mismatch, settled-order double payment, or a payment
          // for a non-payable order). Alert Melipilla dispatch staff so the case
          // is reconciled manually.
          const flaggedEmailData = toOrderEmailData(cleanOrderId, {
            ...orderData,
            status: flaggedStatus || String(orderData.status || ""),
          });
          const warehouseEmail = getWarehouseEmail();
          if (warehouseEmail) {
            await sendEmail({
              to: warehouseEmail,
              ...buildWarehouseAlertEmail(flaggedEmailData, flaggedEvent),
            });
          }
        }
      } else {
        console.warn(
          `[Mercado Pago Webhook] Order "${cleanOrderId}" not found in Firestore for payment ${paymentId}`,
        );
        // The reference is usable but resolves to no order — persist the
        // incident before acknowledging (see the helper above).
        return respondMissingOrderIncident(
          res,
          paymentId,
          paymentData,
          "PEDIDO_NO_ENCONTRADO",
        );
      }
    }

    return res
      .status(200)
      .json({ received: true, verifiedStatus: paymentData.status });
  } catch (error: any) {
    console.error("Error processing Mercado Pago Webhook:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal Server Error" });
  }
}
