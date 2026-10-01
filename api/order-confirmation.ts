import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminFirestore } from "./_lib/firebaseAdmin.js";
import { resolveOrderByCanonicalId, respondOrderLookupFailed } from "./_lib/orderLookup.js";
import { sendEmail } from "./_lib/email.js";
import {
  claimEmailSend,
  markEmailFailed,
  markEmailSent,
} from "./_lib/emailDelivery.js";
import {
  buildOrderConfirmationEmail,
  toOrderEmailData,
} from "./_lib/emailTemplates.js";
import {
  consumeThrottleAttempt,
  getClientIp,
  recordThrottleFailures,
  respondThrottled,
} from "./_lib/abuseThrottle.js";

function normalizeRut(raw: string): string {
  return (raw || "").replace(/[^0-9kK]/g, "").toUpperCase();
}

/**
 * POST /api/order-confirmation
 * Sends the transactional "order received" confirmation email to the customer.
 *
 * Needed because bank-transfer and WhatsApp-quote orders are written client-side
 * directly to Firestore (no other serverless touchpoint exists at order creation).
 *
 * Security: dual-factor lookup identical to /api/track-order — the request must
 * present the canonical orderId AND the purchaser's Chilean Modulo-11 RUT.
 * Idempotency: orders stamped with `confirmationEmailSentAt` (or the
 * `emailDelivery.confirmation` sent marker) are not re-emailed, and a send is
 * claimed inside a transaction first so two concurrent calls send at most once.
 * A failed send is recorded on the order and stays retryable (or resendable
 * from the backoffice); an unavailable database answers 503, never "sent".
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { orderId, rut } = req.body || {};

    if (!orderId || !rut) {
      return res
        .status(400)
        .json({ error: "Faltan parámetros obligatorios: orderId y rut." });
    }

    const cleanOrderId = String(orderId).trim().toUpperCase();
    const cleanUserRut = normalizeRut(String(rut));

    if (!cleanUserRut || cleanUserRut.length < 8) {
      return res.status(400).json({ error: "Formato de RUT no válido." });
    }

    const adminDb = getAdminFirestore();
    if (!adminDb) {
      // Fail closed: without the database there is no lookup, no send and no
      // telemetry — reporting success here claimed "not sent" was a normal
      // outcome, which hid real outages.
      console.error(
        "[Order Confirmation] Firestore Admin not available — refusing to report a send that cannot happen.",
      );
      return res.status(503).json({
        success: false,
        emailSent: false,
        error: "Servicio no disponible temporalmente. Reintenta más tarde.",
      });
    }

    // Abuse throttling: this endpoint sends a customer email on success, so
    // the attempt budgets are also what bounds Resend-quota abuse — an attacker's own
    // order can trigger at most one confirmation (idempotency), and the IP/order
    // budgets cap how many such calls one source can make per window.
    const clientIp = getClientIp(req);
    const ipDecision = await consumeThrottleAttempt(adminDb, "order-confirmation", "ip", clientIp);
    if (!ipDecision.allowed) {
      return respondThrottled(res, ipDecision.retryAfterSeconds);
    }

    const orderDecision = await consumeThrottleAttempt(adminDb, "order-confirmation", "order", cleanOrderId);
    if (!orderDecision.allowed) {
      return respondThrottled(res, orderDecision.retryAfterSeconds);
    }

    // Resolve the order by document key first; the `orderId` field
    // query is only a legacy fallback (resolveOrderByCanonicalId).
    const resolvedOrder = await resolveOrderByCanonicalId(adminDb, cleanOrderId);

    // Uniform failure: "no such order" and "RUT mismatch" are the SAME
    // response — the old 404/401 split was an enumeration oracle.
    const orderCustomerRut = normalizeRut(
      resolvedOrder?.data.customer?.rut || resolvedOrder?.data.billing?.rut || "",
    );
    if (!resolvedOrder || orderCustomerRut !== cleanUserRut) {
      await recordThrottleFailures(adminDb, "order-confirmation", { ip: clientIp, order: cleanOrderId });
      return respondOrderLookupFailed(res);
    }

    const orderRef = resolvedOrder.ref;

    // Claim the send inside a transaction: concurrent callers serialize on the
    // order document, so the second one sees the claim (or the sent marker)
    // instead of double-sending. The claim re-reads the document fresh — use
    // that data for the email, not the pre-lookup snapshot.
    const claim = await claimEmailSend(adminDb, orderRef, "confirmation");

    if (claim.outcome === "already-sent") {
      return res.status(200).json({
        success: true,
        emailSent: false,
        duplicate: true,
        orderId: cleanOrderId,
        message: "El correo de confirmación ya fue enviado para este pedido.",
      });
    }

    if (claim.outcome === "in-flight") {
      return res.status(200).json({
        success: true,
        emailSent: false,
        inFlight: true,
        orderId: cleanOrderId,
        message: "El correo de confirmación ya se está enviando para este pedido.",
      });
    }

    const orderData = claim.orderData;
    const customerEmail = String(
      (orderData.customer as { email?: string } | undefined)?.email || "",
    ).trim();
    if (!customerEmail) {
      console.warn(
        `[Order Confirmation] Order ${cleanOrderId} has no customer email; skipping send.`,
      );
      await markEmailFailed(
        adminDb,
        orderRef,
        "confirmation",
        "missing_customer_email",
        claim.claimIso,
      );
      return res
        .status(200)
        .json({
          success: true,
          emailSent: false,
          reason: "missing_customer_email",
        });
    }

    const emailData = toOrderEmailData(cleanOrderId, orderData);
    const template = buildOrderConfirmationEmail(emailData);
    const result = await sendEmail({ to: customerEmail, ...template });

    // Commit or release the claim: a success stamps the sent marker (a stamp
    // failure must not error the request — the email already went out), a
    // failure releases the claim and records the cause so the send stays
    // retryable and visible in the backoffice.
    if (result.sent) {
      await markEmailSent(adminDb, orderRef, "confirmation", claim.claimIso);
    } else {
      await markEmailFailed(
        adminDb,
        orderRef,
        "confirmation",
        result.reason || "send_failed",
        claim.claimIso,
      );
    }

    return res.status(200).json({
      success: true,
      emailSent: result.sent,
      orderId: cleanOrderId,
      ...(result.sent ? {} : { reason: result.reason }),
    });
  } catch (error: any) {
    console.error("Error sending order confirmation email:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal Server Error" });
  }
}
