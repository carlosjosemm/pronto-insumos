/**
 * Transactional email sender for PRONTO serverless functions (Resend).
 *
 * FAIL-SAFE CONTRACT: this module NEVER throws. An email outage or a missing
 * RESEND_API_KEY must never break payment webhooks, voucher uploads, or admin
 * operations. Callers receive { sent: false, reason } and should only log.
 *
 * Runtime: Node.js (Vercel Serverless) — process.env ONLY, never import.meta.env.
 */

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  sent: boolean;
  id?: string;
  reason?: string;
}

const RESEND_API_ENDPOINT = "https://api.resend.com/emails";

export function getEmailFrom(): string {
  return (
    process.env.EMAIL_FROM || "PRONTO Insumos <pedidos@prontoinsumos.com>"
  ).trim();
}

export function getWarehouseEmail(): string {
  return (process.env.WAREHOUSE_NOTIFICATION_EMAIL || "").trim();
}

export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();

  if (!apiKey) {
    console.warn(
      `[Email] RESEND_API_KEY not configured; skipping "${params.subject}".`,
    );
    return { sent: false, reason: "missing_api_key" };
  }

  const recipients = (Array.isArray(params.to) ? params.to : [params.to])
    .map((r) => String(r || "").trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    console.warn(
      `[Email] No recipient for "${params.subject}"; skipping send.`,
    );
    return { sent: false, reason: "missing_recipient" };
  }

  try {
    const response = await fetch(RESEND_API_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getEmailFrom(),
        to: recipients,
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.warn(
        `[Email] Resend API rejected "${params.subject}" (HTTP ${response.status}): ${errBody}`,
      );
      return { sent: false, reason: `http_${response.status}` };
    }

    const data: any = await response.json().catch(() => ({}));
    return { sent: true, id: data?.id };
  } catch (error: any) {
    console.warn(
      `[Email] Failed to send "${params.subject}": ${error?.message || error}`,
    );
    return { sent: false, reason: "network_error" };
  }
}
