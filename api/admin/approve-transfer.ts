import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminFirestore } from "../lib/firebaseAdmin";
import { verifyAdminToken } from "../lib/adminAuth";
import { getCollectionName } from "../lib/firestoreEnv";
import { sendEmail, getWarehouseEmail } from "../lib/email";
import {
  buildTransferApprovedEmail,
  buildWarehouseAlertEmail,
  toOrderEmailData,
} from "../lib/emailTemplates";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Método no permitido" });
  }

  const authResult = await verifyAdminToken(req);
  if (!authResult.authenticated) {
    return res.status(403).json({ success: false, error: authResult.error });
  }

  const { orderId } = req.body || {};
  if (!orderId || typeof orderId !== "string") {
    return res
      .status(400)
      .json({ success: false, error: 'El parámetro "orderId" es obligatorio' });
  }

  const db = getAdminFirestore();
  if (!db) {
    return res
      .status(500)
      .json({ success: false, error: "Base de datos no inicializada" });
  }

  const ordersCol = getCollectionName("orders");

  try {
    let orderRef = db.collection(ordersCol).doc(orderId.trim());
    const initialCheck = await orderRef.get();
    if (!initialCheck.exists) {
      const querySnap = await db
        .collection(ordersCol)
        .where("orderId", "==", orderId.trim())
        .limit(1)
        .get();
      if (querySnap.empty) {
        return res.status(404).json({
          success: false,
          error: `Pedido "${orderId}" no encontrado en Firestore`,
        });
      }
      orderRef = querySnap.docs[0].ref;
    }

    let orderDataForEmail: any = null;

    const result = await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) {
        throw new Error(`Pedido "${orderId}" no encontrado en Firestore`);
      }

      const orderData = orderDoc.data() || {};
      orderDataForEmail = orderData;
      const currentStatus = orderData.status;

      // Idempotency: If already approved or paid, acknowledge without double decrementing
      if (
        currentStatus === "TRANSFERENCIA_APROBADA" ||
        currentStatus === "PAGADO_TRANSFERENCIA" ||
        currentStatus === "PAGADO_MERCADOPAGO"
      ) {
        return { duplicate: true, currentStatus };
      }

      const items: any[] = Array.isArray(orderData.items)
        ? orderData.items
        : [];

      // Consolidate line item quantities by productId to prevent duplicate snapshot overwrite
      const consolidatedQty = new Map<string, { qty: number; name?: string }>();
      for (const item of items) {
        const productId = item.productId || item.id;
        if (!productId) continue;
        const existing = consolidatedQty.get(productId) || {
          qty: 0,
          name: item.name,
        };
        existing.qty +=
          typeof item.quantity === "number" ? Math.max(1, item.quantity) : 1;
        if (item.name) existing.name = item.name;
        consolidatedQty.set(productId, existing);
      }

      // Read all products referenced in order items
      const productDocsToUpdate: {
        ref: FirebaseFirestore.DocumentReference;
        productId: string;
        name: string;
        sku: string;
        previousStock: number;
        newStock: number;
        delta: number;
        isActive: boolean;
      }[] = [];

      for (const [productId, itemInfo] of consolidatedQty.entries()) {
        const productRef = db
          .collection(getCollectionName("products"))
          .doc(productId);
        const productDoc = await transaction.get(productRef);

        if (productDoc.exists) {
          const productData = productDoc.data() || {};
          const currentStock =
            typeof productData.stockCount === "number"
              ? productData.stockCount
              : 0;
          const newStock = Math.max(0, currentStock - itemInfo.qty);
          const isActive = productData.isActive !== false;

          productDocsToUpdate.push({
            ref: productRef,
            productId,
            name: productData.name || itemInfo.name || productId,
            sku: productData.sku || "",
            previousStock: currentStock,
            newStock,
            delta: -itemInfo.qty,
            isActive,
          });
        }
      }

      const nowIso = new Date().toISOString();
      const adminActor = authResult.email || authResult.uid || "admin";

      // Execute all inventory writes and audit logs
      for (const update of productDocsToUpdate) {
        transaction.update(update.ref, {
          stockCount: update.newStock,
          inStock: update.newStock > 0 && update.isActive,
          updatedAt: nowIso,
        });

        const auditRef = db
          .collection(getCollectionName("inventory_audit_logs"))
          .doc();
        transaction.set(auditRef, {
          id: auditRef.id,
          productId: update.productId,
          productSku: update.sku,
          productName: update.name,
          changeType: "ORDER_FULFILLMENT_DEDUCTION",
          previousStock: update.previousStock,
          newStock: update.newStock,
          delta: update.delta,
          reasonCode: "venta_manual",
          operatorNotes: `Rebaja automática por aprobación de transferencia de orden ${orderId}`,
          changedBy: authResult.uid || "admin",
          changedByEmail: authResult.email || null,
          actorRole: "ADMIN",
          timestamp: nowIso,
          metadata: { orderId },
        });
      }

      // Update order status
      transaction.update(orderRef, {
        status: "TRANSFERENCIA_APROBADA",
        approvedAt: nowIso,
        approvedBy: adminActor,
        updatedAt: nowIso,
      });

      // Record order status history
      const historyRef = db
        .collection(getCollectionName("order_status_history"))
        .doc();
      transaction.set(historyRef, {
        id: historyRef.id,
        orderId,
        previousStatus: currentStatus,
        newStatus: "TRANSFERENCIA_APROBADA",
        changedBy: authResult.uid || "admin",
        changedByEmail: authResult.email || null,
        actorRole: "ADMIN",
        timestamp: nowIso,
        reason:
          "Aprobación de transferencia bancaria y rebaja de stock en bodega Melipilla",
        metadata: {
          approvedBy: adminActor,
          itemsCount: items.length,
        },
      });

      return { duplicate: false, approvedAt: nowIso };
    });

    // Transactional emails (fail-safe): customer approval notice + warehouse alert
    if (!result.duplicate && orderDataForEmail) {
      const emailData = toOrderEmailData(String(orderId).trim(), {
        ...orderDataForEmail,
        status: "TRANSFERENCIA_APROBADA",
      });
      const customerEmail = String(
        orderDataForEmail.customer?.email || "",
      ).trim();
      if (customerEmail) {
        await sendEmail({
          to: customerEmail,
          ...buildTransferApprovedEmail(emailData),
        });
      }
      const warehouseEmail = getWarehouseEmail();
      if (warehouseEmail) {
        await sendEmail({
          to: warehouseEmail,
          ...buildWarehouseAlertEmail(emailData, "TRANSFERENCIA_APROBADA"),
        });
      }
    }

    return res.status(200).json({
      success: true,
      orderId,
      ...result,
    });
  } catch (err: any) {
    console.error("[Admin API Approve Transfer] Error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Error al aprobar la transferencia",
    });
  }
}
