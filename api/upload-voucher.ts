import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminFirestore } from "./_lib/firebaseAdmin.js";
import { getCollectionName } from "./_lib/firestoreEnv.js";
import { sendEmail, getWarehouseEmail } from "./_lib/email.js";
import {
  buildWarehouseAlertEmail,
  toOrderEmailData,
} from "./_lib/emailTemplates.js";

function normalizeRut(raw: string): string {
  return (raw || "").replace(/[^0-9kK]/g, "").toUpperCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { orderId, rut, dataUrl, fileName, contentType } = req.body || {};

    if (!orderId || !rut) {
      return res
        .status(400)
        .json({ error: "Faltan parámetros obligatorios: orderId y rut." });
    }

    if (!dataUrl) {
      return res.status(400).json({
        error:
          "No se ha adjuntado el archivo de comprobante (dataUrl ausente).",
      });
    }

    const cleanOrderId = String(orderId).trim().toUpperCase();
    const cleanUserRut = normalizeRut(String(rut));

    if (!cleanUserRut || cleanUserRut.length < 8) {
      return res.status(400).json({ error: "Formato de RUT no válido." });
    }

    const adminDb = getAdminFirestore();
    if (!adminDb) {
      console.warn(
        "Firestore Admin not available. Returning simulated voucher upload response.",
      );
      return res.status(200).json({
        success: true,
        orderId: cleanOrderId,
        voucherUrl: dataUrl,
        status: "TRANSFERENCIA_COMPROBANTE_SUBIDO",
        message: "Comprobante recepcionado exitosamente en modo simulación.",
      });
    }

    // Query order by orderId
    const snapshot = await adminDb
      .collection(getCollectionName("orders"))
      .where("orderId", "==", cleanOrderId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        error: `No se encontró un pedido con el código "${cleanOrderId}".`,
      });
    }

    const orderDoc = snapshot.docs[0];
    const orderData = orderDoc.data();

    // Authorization check: match purchaser's RUT
    const orderCustomerRut = normalizeRut(
      orderData.customer?.rut || orderData.billing?.rut || "",
    );
    if (orderCustomerRut !== cleanUserRut) {
      return res.status(401).json({
        error:
          "El RUT ingresado no coincide con el registrado para este pedido.",
      });
    }

    const cleanFileName = String(
      fileName || "comprobante_transferencia.pdf",
    ).trim();
    const timestamp = new Date().toISOString();

    // Update order in Firestore via Admin SDK and record status history
    const batch = adminDb.batch();
    batch.update(orderDoc.ref, {
      voucherUrl: dataUrl,
      voucherFileName: cleanFileName,
      voucherContentType: contentType || "application/octet-stream",
      voucherUploadedAt: timestamp,
      status: "TRANSFERENCIA_COMPROBANTE_SUBIDO",
      updatedAt: timestamp,
    });

    const historyRef = adminDb
      .collection(getCollectionName("order_status_history"))
      .doc();
    batch.set(historyRef, {
      id: historyRef.id,
      orderId: cleanOrderId,
      previousStatus: orderData.status || "PENDIENTE_TRANSFERENCIA",
      newStatus: "TRANSFERENCIA_COMPROBANTE_SUBIDO",
      changedBy: "CUSTOMER",
      changedByEmail: orderData.customer?.email || null,
      actorRole: "CUSTOMER",
      timestamp,
      reason: `Comprobante de transferencia bancaria adjuntado (${cleanFileName})`,
      metadata: {
        fileName: cleanFileName,
        contentType: contentType || "application/octet-stream",
      },
    });

    await batch.commit();

    // Warehouse alert (fail-safe): voucher received — verify against Banco de Chile
    const warehouseEmail = getWarehouseEmail();
    if (warehouseEmail) {
      const emailData = toOrderEmailData(cleanOrderId, {
        ...orderData,
        status: "TRANSFERENCIA_COMPROBANTE_SUBIDO",
      });
      await sendEmail({
        to: warehouseEmail,
        ...buildWarehouseAlertEmail(
          emailData,
          "TRANSFERENCIA_COMPROBANTE_SUBIDO",
        ),
      });
    }

    return res.status(200).json({
      success: true,
      orderId: cleanOrderId,
      voucherUrl: dataUrl,
      voucherFileName: cleanFileName,
      voucherUploadedAt: timestamp,
      status: "TRANSFERENCIA_COMPROBANTE_SUBIDO",
      message:
        "Comprobante adjuntado exitosamente. En proceso de validación contable.",
    });
  } catch (error: any) {
    console.error("Error uploading transfer voucher:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal Server Error" });
  }
}
