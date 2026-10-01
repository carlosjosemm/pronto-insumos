import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdminPreflight, setAdminResponseHeaders } from "./adminHttp.js";
import { getAdminFirestore } from "../firebaseAdmin.js";
import { verifyAdminToken } from "../adminAuth.js";
import { getCollectionName } from "../firestoreEnv.js";
import { sendEmail, getWarehouseEmail } from "../email.js";
import { markEmailFailed, markEmailSent } from "../emailDelivery.js";
import {
  buildTransferApprovedEmail,
  buildWarehouseAlertEmail,
  toOrderEmailData,
} from "../emailTemplates.js";
import type { StockShortfall } from "../emailTemplates.js";
import { resolvePromoPercent } from "../../../src/config/promos.js";
import { computeDiscountedUnitPrice, normalizeQuantity } from "../../../src/utils/orderTotal.js";

/** Source states from which a bank transfer may be approved. */
const APPROVABLE_STATUSES = new Set([
  "PENDIENTE_TRANSFERENCIA",
  "TRANSFERENCIA_COMPROBANTE_SUBIDO",
]);

const MAX_RECONCILIATION_REFERENCE_LENGTH = 120;

/**
 * Transaction outcome, discriminated so the response and email paths narrow
 * cleanly. `conflict` carries the operator-facing reason for a 409.
 */
type ApprovalOutcome =
  | { outcome: "duplicate"; currentStatus: string }
  | { outcome: "conflict"; currentStatus: string; message: string }
  | { outcome: "approved"; approvedAt: string };

/**
 * Approves a bank transfer: verifies the order is genuinely pending transfer,
 * re-derives the payable total from the CURRENT catalog (promo-aware), then
 * deducts stock and marks the order approved in one transaction.
 *
 * A voucher upload is not evidence that the money settled, and the server cannot
 * read the bank ledger — so the operator must attest with a reconciliation
 * reference (the Banco de Chile cartola line), which is recorded in the order
 * history. Never store bank credentials, only the reference.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setAdminResponseHeaders(res);

  if (isAdminPreflight(req)) {
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

  const { orderId, reconciliationReference } = req.body || {};
  if (!orderId || typeof orderId !== "string") {
    return res
      .status(400)
      .json({ success: false, error: 'El parámetro "orderId" es obligatorio' });
  }
  if (
    typeof reconciliationReference !== "string" ||
    reconciliationReference.trim().length === 0
  ) {
    return res.status(400).json({
      success: false,
      error:
        'El parámetro "reconciliationReference" es obligatorio: verifica el abono en la cartola de Banco de Chile y registra la referencia (nunca credenciales bancarias).',
    });
  }
  const cleanReference = reconciliationReference
    .trim()
    .slice(0, MAX_RECONCILIATION_REFERENCE_LENGTH);
  // Normalize once: the lookup trims, so every written field must use the same
  // value or order-history queries (which filter on `orderId`) would miss it.
  const cleanOrderId = orderId.trim();

  const db = getAdminFirestore();
  if (!db) {
    return res
      .status(500)
      .json({ success: false, error: "Base de datos no inicializada" });
  }

  const ordersCol = getCollectionName("orders");

  try {
    let orderRef = db.collection(ordersCol).doc(cleanOrderId);
    const initialCheck = await orderRef.get();
    if (!initialCheck.exists) {
      const querySnap = await db
        .collection(ordersCol)
        .where("orderId", "==", cleanOrderId)
        .limit(1)
        .get();
      if (querySnap.empty) {
        return res.status(404).json({
          success: false,
          error: `Pedido "${cleanOrderId}" no encontrado en Firestore`,
        });
      }
      orderRef = querySnap.docs[0].ref;
    }

    let orderDataForEmail: Record<string, unknown> | null = null;
    // Oversold lines are recorded on approval. Reset inside the
    // transaction callback, which Firestore may re-run on contention.
    const stockShortfalls: StockShortfall[] = [];

    const result = await db.runTransaction(async (transaction) => {
      stockShortfalls.length = 0;
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) {
        throw new Error(`Pedido "${cleanOrderId}" no encontrado en Firestore`);
      }

      const orderData = orderDoc.data() || {};
      orderDataForEmail = orderData;
      const currentStatus = String(orderData.status || "");

      // Idempotency: a retried approval of the SAME order is a no-op, never a
      // second stock deduction.
      if (currentStatus === "TRANSFERENCIA_APROBADA") {
        return { outcome: "duplicate", currentStatus } satisfies ApprovalOutcome;
      }

      // Only a pending transfer may be approved. A quote, cancelled, dispatched,
      // delivered, MP-paid or review-parked order must never deduct stock here.
      if (!APPROVABLE_STATUSES.has(currentStatus)) {
        return {
          outcome: "conflict",
          currentStatus,
          message: `El pedido no está pendiente de transferencia (estado actual: ${
            currentStatus || "desconocido"
          }). No se rebajó stock.`,
        } satisfies ApprovalOutcome;
      }

      // A settlement marker (`approvedAt` / `paidAt`) means the lines were
      // already deducted by an earlier payment; approving again must not deduct.
      if (orderData.approvedAt || orderData.paidAt) {
        return {
          outcome: "conflict",
          currentStatus,
          message:
            "El pedido ya registra un pago o rebaja anterior; no se rebaja stock por segunda vez. Cancela el pedido o concilia el reembolso manualmente.",
        } satisfies ApprovalOutcome;
      }

      const items: Array<Record<string, unknown>> = Array.isArray(orderData.items)
        ? (orderData.items as Array<Record<string, unknown>>)
        : [];

      // The promo percent comes from the shared catalog via the order's own code —
      // never from the request — so the verified total cannot be dictated by a caller.
      const discountPercent = resolvePromoPercent(orderData.promoCode);

      // Consolidate line quantities by productId so a duplicated line cannot
      // overwrite its own snapshot.
      const consolidatedQty = new Map<string, { qty: number; name?: string }>();
      for (const item of items) {
        const rawProductId = item.productId || item.id;
        if (typeof rawProductId !== "string" || rawProductId.length === 0) {
          return {
            outcome: "conflict",
            currentStatus,
            message:
              "El pedido tiene una línea sin producto identificable; no se puede verificar el monto. No se rebajó stock.",
          } satisfies ApprovalOutcome;
        }
        const existing = consolidatedQty.get(rawProductId) || {
          qty: 0,
          name: typeof item.name === "string" ? item.name : undefined,
        };
        existing.qty += normalizeQuantity(item.quantity);
        if (typeof item.name === "string") existing.name = item.name;
        consolidatedQty.set(rawProductId, existing);
      }

      if (consolidatedQty.size === 0) {
        return {
          outcome: "conflict",
          currentStatus,
          message:
            "El pedido no tiene insumos registrados; no se puede aprobar la transferencia.",
        } satisfies ApprovalOutcome;
      }

      // Read every product first (all reads before all writes) and rebuild the
      // payable total from the CURRENT catalog prices.
      const productDocsToUpdate: {
        ref: FirebaseFirestore.DocumentReference;
        productId: string;
        name: string;
        sku: string;
        previousStock: number;
        newStock: number;
        delta: number;
        shortfall: number;
        isActive: boolean;
      }[] = [];
      let expectedTotal = 0;

      for (const [productId, itemInfo] of consolidatedQty.entries()) {
        const productRef = db
          .collection(getCollectionName("products"))
          .doc(productId);
        const productDoc = await transaction.get(productRef);

        // A missing product fails closed: a partial deduction must never be
        // recorded as a full approval.
        if (!productDoc.exists) {
          return {
            outcome: "conflict",
            currentStatus,
            message: `El producto "${
              itemInfo.name || productId
            }" ya no existe en el catálogo; no se puede verificar el monto. No se rebajó stock.`,
          } satisfies ApprovalOutcome;
        }

        const productData = productDoc.data() || {};
        const catalogPrice = Number(productData.price);
        if (!Number.isInteger(catalogPrice) || catalogPrice <= 0) {
          return {
            outcome: "conflict",
            currentStatus,
            message: `El producto "${
              productData.name || productId
            }" no tiene un precio de catálogo válido; no se puede aprobar la transferencia.`,
          } satisfies ApprovalOutcome;
        }
        expectedTotal += computeDiscountedUnitPrice(catalogPrice, discountPercent) * itemInfo.qty;

        const currentStock =
          typeof productData.stockCount === "number"
            ? productData.stockCount
            : 0;
        const newStock = Math.max(0, currentStock - itemInfo.qty);
        const isActive = productData.isActive !== false;
        const lineName = productData.name || itemInfo.name || productId;
        const shortfall = Math.max(0, itemInfo.qty - currentStock);
        // An approval that oversells is still approved (the money
        // is in) but the shortfall is recorded and alerted — never hidden by
        // the Math.max clamp.
        if (shortfall > 0) {
          stockShortfalls.push({
            productId,
            name: lineName,
            requested: itemInfo.qty,
            available: currentStock,
          });
        }

        productDocsToUpdate.push({
          ref: productRef,
          productId,
          name: lineName,
          sku: productData.sku || "",
          previousStock: currentStock,
          newStock,
          delta: -itemInfo.qty,
          shortfall,
          isActive,
        });
      }

      // Server-authoritative amount check: the stored total must equal the total
      // recomputed from the current catalog before any stock moves.
      const storedTotal = Number(orderData.totalAmount);
      if (!Number.isInteger(storedTotal) || storedTotal !== expectedTotal) {
        return {
          outcome: "conflict",
          currentStatus,
          message: `El total verificado del pedido (${expectedTotal}) no coincide con el monto registrado (${
            orderData.totalAmount ?? "sin registro"
          }). Corrige el pedido o cotiza por WhatsApp; no se rebajó stock.`,
        } satisfies ApprovalOutcome;
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
          operatorNotes: `Rebaja automática por aprobación de transferencia de orden ${cleanOrderId}`,
          changedBy: authResult.uid || "admin",
          changedByEmail: authResult.email || null,
          actorRole: "ADMIN",
          timestamp: nowIso,
          metadata: {
            orderId: cleanOrderId,
            ...(update.shortfall > 0
              ? { stockShortfall: update.shortfall }
              : {}),
          },
        });
      }

      // Update order status
      transaction.update(orderRef, {
        status: "TRANSFERENCIA_APROBADA",
        approvedAt: nowIso,
        approvedBy: adminActor,
        updatedAt: nowIso,
      });

      // Record order status history, carrying the operator's reconciliation
      // reference so the approval is auditable without ever storing bank secrets.
      const historyRef = db
        .collection(getCollectionName("order_status_history"))
        .doc();
      transaction.set(historyRef, {
        id: historyRef.id,
        orderId: cleanOrderId,
        previousStatus: currentStatus,
        newStatus: "TRANSFERENCIA_APROBADA",
        changedBy: authResult.uid || "admin",
        changedByEmail: authResult.email || null,
        actorRole: "ADMIN",
        timestamp: nowIso,
        reason: `Aprobación de transferencia verificada en cartola (ref. ${cleanReference}) y rebaja de stock en bodega Melipilla`,
        metadata: {
          approvedBy: adminActor,
          reconciliationReference: cleanReference,
          reconciledAt: nowIso,
          itemsCount: items.length,
          orderTotalAmount: storedTotal,
          // Oversold lines travel with the approval so the
          // shortfall is auditable, not just emailed.
          ...(stockShortfalls.length > 0 ? { stockShortfalls } : {}),
        },
      });

      return { outcome: "approved", approvedAt: nowIso } satisfies ApprovalOutcome;
    });

    if (result.outcome === "conflict") {
      return res.status(409).json({
        success: false,
        error: result.message,
        currentStatus: result.currentStatus,
      });
    }

    // Transactional emails (fail-safe): customer approval notice + warehouse alert
    if (result.outcome === "approved" && orderDataForEmail) {
      // Cast because the assignment happens inside the transaction callback, which
      // TypeScript's control-flow analysis does not follow across the `await`.
      const approvedData = orderDataForEmail as Record<string, unknown>;
      const emailData = toOrderEmailData(String(orderId).trim(), {
        ...approvedData,
        status: "TRANSFERENCIA_APROBADA",
      });
      const customerEmail = String(
        (approvedData.customer as { email?: string } | undefined)?.email || "",
      ).trim();
      if (customerEmail) {
        const emailResult = await sendEmail({
          to: customerEmail,
          ...buildTransferApprovedEmail(emailData),
        });
        // The approval is already committed — the send outcome is stamped for
        // backoffice visibility (and manual resend), never rolled back.
        if (emailResult.sent) {
          await markEmailSent(db, orderRef, "payment", undefined);
        } else {
          await markEmailFailed(
            db,
            orderRef,
            "payment",
            emailResult.reason || "send_failed",
          );
        }
      } else {
        // Same visibility rule as the confirmation kind: an order without a
        // customer email is a recorded failure, not an invisible skip.
        await markEmailFailed(db, orderRef, "payment", "missing_customer_email");
      }
      const warehouseEmail = getWarehouseEmail();
      if (warehouseEmail) {
        await sendEmail({
          to: warehouseEmail,
          ...buildWarehouseAlertEmail(
            emailData,
            "TRANSFERENCIA_APROBADA",
            stockShortfalls,
          ),
        });
      }
    }

    return res.status(200).json({
      success: true,
      orderId: cleanOrderId,
      duplicate: result.outcome === "duplicate",
      ...(result.outcome === "approved"
        ? { approvedAt: result.approvedAt }
        : {}),
    });
  } catch (err: unknown) {
    console.error("[Admin API Approve Transfer] Error:", err);
    return res.status(500).json({
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error al aprobar la transferencia",
    });
  }
}
