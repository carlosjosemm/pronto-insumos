import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminFirestore } from "./lib/firebaseAdmin";
import { getCollectionName } from "./lib/firestoreEnv";
import { sendEmail } from "./lib/email";
import {
  buildOrderConfirmationEmail,
  toOrderEmailData,
} from "./lib/emailTemplates";

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
 * Idempotency: orders stamped with `confirmationEmailSentAt` are not re-emailed.
 * The stamp is only written after a successful Resend send, so a failed send can retry.
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
      console.warn(
        "Firestore Admin not available. Skipping order confirmation email.",
      );
      return res
        .status(200)
        .json({
          success: true,
          emailSent: false,
          note: "Firestore Admin unavailable",
        });
    }

    const snapshot = await adminDb
      .collection(getCollectionName("orders"))
      .where("orderId", "==", cleanOrderId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json({
          error: `No se encontró un pedido con el código "${cleanOrderId}".`,
        });
    }

    const orderDoc = snapshot.docs[0];
    const orderData = orderDoc.data();

    // Authorization check: match purchaser's RUT (same contract as /api/track-order)
    const orderCustomerRut = normalizeRut(
      orderData.customer?.rut || orderData.billing?.rut || "",
    );
    if (orderCustomerRut !== cleanUserRut) {
      return res.status(401).json({
        error:
          "El RUT ingresado no coincide con el registrado para este pedido.",
      });
    }

    // Idempotency: confirmation already sent
    if (orderData.confirmationEmailSentAt) {
      return res.status(200).json({
        success: true,
        emailSent: false,
        duplicate: true,
        orderId: cleanOrderId,
        message: "El correo de confirmación ya fue enviado para este pedido.",
      });
    }

    const customerEmail = String(orderData.customer?.email || "").trim();
    if (!customerEmail) {
      console.warn(
        `[Order Confirmation] Order ${cleanOrderId} has no customer email; skipping send.`,
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

    // Stamp idempotency flag only after a successful send (failed sends may retry).
    // A stamp failure must not error the request — the email already went out.
    if (result.sent) {
      try {
        const nowIso = new Date().toISOString();
        await orderDoc.ref.update({
          confirmationEmailSentAt: nowIso,
          updatedAt: nowIso,
        });
      } catch (stampErr: any) {
        console.warn(
          `[Order Confirmation] Email sent but failed to stamp flag for ${cleanOrderId}: ${stampErr?.message || stampErr}`,
        );
      }
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
