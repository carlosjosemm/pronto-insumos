/**
 * Missing-order payment incidents.
 *
 * When the Mercado Pago webhook verifies a real settlement (approved, refunded
 * or charged_back) that can never be joined to an order — no usable
 * `external_reference`/`description`, or a reference that resolves to no
 * Firestore order — it must not acknowledge the delivery silently. A small
 * incident document is persisted here, keyed idempotently by `paymentId`, for
 * warehouse/manual reconciliation.
 *
 * Idempotency: the document id is `mp-<paymentId>` and is written with
 * Firestore `create()`, which atomically fails when the document already
 * exists. A duplicate delivery therefore performs no second write and no
 * second warehouse alert.
 *
 * Runtime: Node.js (Vercel Serverless) — process.env ONLY, never import.meta.env.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getCollectionName } from "./firestoreEnv.js";
import { sendEmail, getWarehouseEmail } from "./email.js";
import { formatCLP } from "../../src/utils/currency.js";

export type PaymentIncidentReason =
  | "REFERENCIA_NO_UTILIZABLE"
  | "PEDIDO_NO_ENCONTRADO";

export interface PaymentIncidentInput {
  paymentId: string;
  paymentData: Record<string, unknown>;
  reason: PaymentIncidentReason;
}

export interface PaymentIncidentResult {
  persisted: boolean;
  /** True when this delivery is a retry of an already-recorded incident. */
  duplicate?: boolean;
}

const INCIDENT_COLLECTION = "payment_incidents";

/** Firestore rejects `create()` on an existing document with ALREADY_EXISTS. */
function isAlreadyExistsError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (code === 6 || code === "already-exists") return true;
  return /already\s*exists/i.test(
    String((error as { message?: unknown })?.message || ""),
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;")
    .replace(/'/g, "\u0026#39;");
}

/**
 * Persists the incident. Throws on any real persistence failure so the webhook
 * can fail closed (5xx → Mercado Pago retries); only a duplicate delivery
 * resolves without a write.
 */
export async function persistPaymentIncident(
  adminDb: Firestore,
  { paymentId, paymentData, reason }: PaymentIncidentInput,
): Promise<PaymentIncidentResult> {
  const nowIso = new Date().toISOString();
  const payerEmail =
    (paymentData.payer as { email?: unknown } | undefined)?.email ?? null;

  try {
    await adminDb
      .collection(getCollectionName(INCIDENT_COLLECTION))
      .doc(`mp-${paymentId}`)
      .create({
        paymentId,
        paymentStatus: String(paymentData.status || ""),
        transactionAmount: Number(paymentData.transaction_amount) || 0,
        currencyId: String(paymentData.currency_id || "CLP"),
        externalReference:
          typeof paymentData.external_reference === "string"
            ? paymentData.external_reference.trim() || null
            : null,
        description:
          typeof paymentData.description === "string"
            ? paymentData.description.trim() || null
            : null,
        payerEmail: typeof payerEmail === "string" ? payerEmail : null,
        reason,
        status: "PENDIENTE_RECONCILIACION_MANUAL",
        resolved: false,
        source: "MERCADOPAGO_WEBHOOK",
        createdAt: nowIso,
        updatedAt: nowIso,
      });
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      // Duplicate delivery (Mercado Pago retry): the incident already exists,
      // so this is idempotent success without a second write.
      return { persisted: true, duplicate: true };
    }
    throw error;
  }

  return { persisted: true };
}

/**
 * Warehouse alert for a newly persisted incident. Fire-safe: the durable
 * incident document is the authority, so an email failure is only logged.
 * Duplicate deliveries (already-recorded incident) do not re-alert.
 */
export async function sendPaymentIncidentAlert({
  paymentId,
  paymentData,
  reason,
  duplicate = false,
}: PaymentIncidentInput & { duplicate?: boolean }): Promise<void> {
  if (duplicate) return;

  const warehouseEmail = getWarehouseEmail();
  if (!warehouseEmail) return;

  const reasonLabel =
    reason === "REFERENCIA_NO_UTILIZABLE"
      ? "El pago no trae external_reference ni description utilizables"
      : "La referencia del pago no corresponde a ningún pedido en Firestore";
  const payerEmail = (paymentData.payer as { email?: unknown } | undefined)
    ?.email;
  const amount = Number(paymentData.transaction_amount) || 0;

  const subject = `[PRONTO] Pago sin pedido — revisión manual (ID: ${paymentId})`;
  const lines = [
    `Se registró un incidente de reconciliación manual en la colección "payment_incidents" (doc mp-${paymentId}).`,
    `Motivo: ${reasonLabel}.`,
    `Estado del pago: ${String(paymentData.status || "desconocido")}.`,
    `Monto: ${formatCLP(amount)} CLP.`,
    payerEmail ? `Email del pagador: ${String(payerEmail)}.` : null,
    `Conciliar contra la ledger de Mercado Pago antes de emitir o despachar.`,
  ].filter(Boolean);

  await sendEmail({
    to: warehouseEmail,
    subject,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a">${lines
      .map((l) => `<p>${escapeHtml(l)}</p>`)
      .join("")}</div>`,
    text: lines.join("\n"),
  });
}
