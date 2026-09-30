/**
 * Transactional email templates for PRONTO Insumos Odontológicos.
 *
 * Pure functions returning { subject, html, text } — no template engine dependency.
 * All order/customer-supplied values are HTML-escaped before interpolation.
 * Monetary values follow Chilean conventions: integer CLP, "$189.990", 19% IVA.
 */

import { calculateTaxBreakdown } from '../../src/utils/tax.js'

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

export interface OrderEmailData {
  orderId: string
  status?: string
  paymentMethod?: string
  totalAmount: number
  items: { name: string; quantity: number; price: number }[]
  customer: {
    fullName: string
    email: string
    rut: string
    address: string
    city: string
    documentType?: string
    razonSocial?: string
  }
  // `billing` carries the document type only — the stored `taxBreakdown` is a
  // client-writable display artifact and is deliberately NOT surfaced here:
  // every rendered fiscal figure is derived from `totalAmount` (the amount the
  // payment webhook asserts and the transfer approval re-verifies), so a forged
  // persisted breakdown can never reach a customer email.
  billing?: {
    documentType?: string
  }
}

/** Maps a raw Firestore order document to the sanitized email payload. */
export function toOrderEmailData(orderId: string, orderData: any): OrderEmailData {
  const items = Array.isArray(orderData?.items) ? orderData.items : []
  return {
    orderId,
    status: orderData?.status,
    paymentMethod: orderData?.paymentMethod,
    totalAmount: Number(orderData?.totalAmount) || 0,
    items: items.map((i: any) => ({
      name: String(i?.name || 'Insumo odontológico'),
      quantity: Math.max(1, Number(i?.quantity) || 1),
      price: Number(i?.price) || 0
    })),
    customer: {
      fullName: String(orderData?.customer?.fullName || ''),
      email: String(orderData?.customer?.email || ''),
      rut: String(orderData?.customer?.rut || ''),
      address: String(orderData?.customer?.address || ''),
      city: String(orderData?.customer?.city || ''),
      documentType: orderData?.customer?.documentType,
      razonSocial: orderData?.customer?.razonSocial
    },
    billing: orderData?.billing
      ? {
          documentType: orderData.billing.documentType
        }
      : undefined
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Chilean CLP format: integer, period thousands separator, "$189.990". */
function formatCLP(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '$0'
  const rounded = Math.round(amount)
  const formatted = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return rounded < 0 ? `-$${formatted}` : `$${formatted}`
}

/** Bank transfer credentials — mirrors src/config/bankDetails.ts (same VITE_BANK_* env vars). */
const BANK = {
  bankName: process.env.VITE_BANK_NAME || 'Banco de Chile',
  accountType: process.env.VITE_BANK_ACCOUNT_TYPE || 'Cuenta Corriente',
  accountNumber: process.env.VITE_BANK_ACCOUNT_NUMBER || '849-01284-01',
  rut: process.env.VITE_BANK_RUT || '77.892.410-2',
  companyName: process.env.VITE_BANK_COMPANY_NAME || 'PRONTO INSUMOS ODONTOLÓGICOS SPA',
  email: process.env.VITE_BANK_EMAIL || 'pagos@prontoinsumos.cl'
}

function siteUrl(): string {
  return (process.env.SITE_URL || 'https://prontoinsumos.com').replace(/\/+$/, '')
}

function trackingUrl(orderId: string): string {
  return `${siteUrl()}/?track=${encodeURIComponent(orderId)}`
}

function layout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#102748;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:18px;">PRONTO INSUMOS ODONTOLÓGICOS</h1>
      <p style="margin:4px 0 0;font-size:12px;opacity:0.85;">Depósito dental — Melipilla &amp; Región Metropolitana</p>
    </div>
    <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      ${bodyHtml}
    </div>
    <p style="font-size:11px;color:#6b7280;text-align:center;margin:16px 0 0;">
      PRONTO Insumos Odontológicos — Av. Ortúzar 750, Melipilla, Chile.<br>
      Correo transaccional automático, por favor no responder directamente.
    </p>
  </div>
</body>
</html>`
}

function itemsTable(data: OrderEmailData): string {
  const rows = data.items
    .map(
      i => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">${escapeHtml(i.name)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:center;">${i.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;">${formatCLP(i.price * i.quantity)}</td>
      </tr>`
    )
    .join('')
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
    <thead>
      <tr style="text-align:left;color:#6b7280;font-size:12px;text-transform:uppercase;">
        <th style="padding-bottom:8px;border-bottom:2px solid #e5e7eb;">Insumo</th>
        <th style="padding-bottom:8px;border-bottom:2px solid #e5e7eb;text-align:center;">Cant.</th>
        <th style="padding-bottom:8px;border-bottom:2px solid #e5e7eb;text-align:right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
}

/**
 * Neto/IVA/total table. The breakdown is always derived from `data.totalAmount`
 * (the order's verified payable amount) — never from the stored billing map.
 * `provisional` is for sends that go out before any server-side catalog or
 * payment verification (the "order received" email for transfer/quote orders):
 * the amount is still stated — the customer needs it to transfer — but labelled
 * referencial so it cannot read as a settled fiscal figure.
 */
function totalsBlock(data: OrderEmailData, provisional = false): string {
  const { neto, iva, total } = calculateTaxBreakdown(data.totalAmount)
  const totalLabel = provisional ? 'Total referencial (IVA incluido)' : 'Total (IVA incluido)'
  const provisionalNote = provisional
    ? `<tr><td colspan="2" style="padding-top:6px;font-size:12px;color:#6b7280;">Monto referencial — se confirma al validar tu pago.</td></tr>`
    : ''
  return `<table style="width:100%;font-size:14px;margin-top:12px;">
    <tr><td style="color:#6b7280;padding:2px 0;">Neto</td><td style="text-align:right;padding:2px 0;">${formatCLP(neto)}</td></tr>
    <tr><td style="color:#6b7280;padding:2px 0;">IVA (19%)</td><td style="text-align:right;padding:2px 0;">${formatCLP(iva)}</td></tr>
    <tr><td style="padding-top:8px;font-size:16px;font-weight:bold;">${totalLabel}</td><td style="padding-top:8px;text-align:right;font-size:16px;font-weight:bold;color:#102748;">${formatCLP(total)}</td></tr>
    ${provisionalNote}
  </table>`
}

function customerBlock(data: OrderEmailData): string {
  const c = data.customer
  const fiscal = c.documentType === 'factura' || data.billing?.documentType === 'factura'
  const fiscalLines = fiscal
    ? `<br><strong>Factura Electrónica:</strong> ${escapeHtml(c.razonSocial || '')} (RUT ${escapeHtml(c.rut)})`
    : `<br><strong>RUT:</strong> ${escapeHtml(c.rut)}`
  return `<p style="margin:16px 0 0;font-size:13px;color:#374151;line-height:1.7;">
    <strong>Cliente:</strong> ${escapeHtml(c.fullName)}${fiscalLines}<br>
    <strong>Despacho:</strong> ${escapeHtml(c.address)}, ${escapeHtml(c.city)}
  </p>`
}

function itemsText(data: OrderEmailData): string {
  return data.items.map(i => `  - ${i.quantity}x ${i.name} — ${formatCLP(i.price * i.quantity)}`).join('\n')
}

// ---------------------------------------------------------------------------
// Customer templates
// ---------------------------------------------------------------------------

/** "Order received" confirmation — sent from /api/order-confirmation (transfer & WhatsApp quote orders). */
export function buildOrderConfirmationEmail(data: OrderEmailData): EmailTemplate {
  const isQuote = data.paymentMethod === 'whatsapp'
  const subject = isQuote
    ? `Cotización ${data.orderId} recibida — PRONTO Insumos Odontológicos`
    : `Pedido ${data.orderId} recibido — PRONTO Insumos Odontológicos`

  const intro = isQuote
    ? `Hemos registrado tu solicitud de cotización <strong>${escapeHtml(data.orderId)}</strong>. Nuestro equipo te contactará por WhatsApp para confirmar disponibilidad y condiciones de despacho.`
    : `Hemos registrado tu pedido <strong>${escapeHtml(data.orderId)}</strong> exitosamente.`

  const bankBlock =
    data.paymentMethod === 'transferencia'
      ? `<div style="background:#f0f4f8;border:1px solid #d9e2ec;border-radius:8px;padding:16px;margin-top:20px;">
          <h3 style="margin:0 0 8px;font-size:14px;color:#102748;">Datos para Transferencia Bancaria</h3>
          <p style="margin:0;font-size:13px;line-height:1.8;">
            <strong>Banco:</strong> ${escapeHtml(BANK.bankName)}<br>
            <strong>Tipo de cuenta:</strong> ${escapeHtml(BANK.accountType)}<br>
            <strong>N° de cuenta:</strong> ${escapeHtml(BANK.accountNumber)}<br>
            <strong>RUT:</strong> ${escapeHtml(BANK.rut)}<br>
            <strong>Nombre:</strong> ${escapeHtml(BANK.companyName)}<br>
            <strong>Email comprobante:</strong> ${escapeHtml(BANK.email)}
          </p>
          <p style="margin:12px 0 0;font-size:13px;">
            Una vez realizada la transferencia, sube tu comprobante aquí:<br>
            <a href="${trackingUrl(data.orderId)}" style="color:#102748;font-weight:bold;">${trackingUrl(data.orderId)}</a>
          </p>
        </div>`
      : ''

  const bankText =
    data.paymentMethod === 'transferencia'
      ? `\nDatos para Transferencia Bancaria:\n  Banco: ${BANK.bankName}\n  ${BANK.accountType} N° ${BANK.accountNumber}\n  RUT: ${BANK.rut}\n  Nombre: ${BANK.companyName}\n  Email comprobante: ${BANK.email}\n\nSube tu comprobante en: ${trackingUrl(data.orderId)}`
      : ''

  const html = layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#102748;">${isQuote ? 'Cotización registrada' : '¡Gracias por tu pedido!'}</h2>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${intro}</p>
    ${itemsTable(data)}
    ${totalsBlock(data, true)}
    ${customerBlock(data)}
    ${bankBlock}
    <p style="margin:20px 0 0;font-size:13px;color:#374151;">
      Puedes revisar el estado de tu pedido en cualquier momento:<br>
      <a href="${trackingUrl(data.orderId)}" style="color:#102748;font-weight:bold;">${trackingUrl(data.orderId)}</a>
    </p>`)

  const text = `${isQuote ? 'Cotización registrada' : 'Pedido recibido'} — ${data.orderId}\n\n${itemsText(data)}\n\nTotal referencial (IVA incluido): ${formatCLP(data.totalAmount)} — monto sujeto a confirmación.${bankText}\n\nSeguimiento: ${trackingUrl(data.orderId)}\n\nPRONTO Insumos Odontológicos — Melipilla, Chile`

  return { subject, html, text }
}

/** Payment confirmation — sent by the Mercado Pago webhook after PAGADO_MERCADOPAGO. */
export function buildPaymentConfirmedEmail(data: OrderEmailData): EmailTemplate {
  const subject = `Pago confirmado — Pedido ${data.orderId}`

  const html = layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#102748;">Pago confirmado</h2>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
      Tu pago para el pedido <strong>${escapeHtml(data.orderId)}</strong> fue aprobado por Mercado Pago.
      Nuestra bodega en Melipilla ya está preparando tus insumos.
    </p>
    ${itemsTable(data)}
    ${totalsBlock(data)}
    ${customerBlock(data)}
    <p style="margin:20px 0 0;font-size:13px;color:#374151;">
      Sigue el despacho de tu pedido aquí:<br>
      <a href="${trackingUrl(data.orderId)}" style="color:#102748;font-weight:bold;">${trackingUrl(data.orderId)}</a>
    </p>`)

  const text = `Pago confirmado — Pedido ${data.orderId}\n\nTu pago fue aprobado por Mercado Pago. Estamos preparando tu pedido en Melipilla.\n\n${itemsText(data)}\n\nTotal (IVA incluido): ${formatCLP(data.totalAmount)}\n\nSeguimiento: ${trackingUrl(data.orderId)}`

  return { subject, html, text }
}

/** Bank transfer approval — sent by /api/admin/approve-transfer. */
export function buildTransferApprovedEmail(data: OrderEmailData): EmailTemplate {
  const subject = `Transferencia aprobada — Pedido ${data.orderId}`

  const html = layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#102748;">Transferencia verificada</h2>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
      Hemos verificado tu transferencia bancaria para el pedido <strong>${escapeHtml(data.orderId)}</strong>.
      Tu pedido está confirmado y en preparación en nuestra bodega de Melipilla.
    </p>
    ${itemsTable(data)}
    ${totalsBlock(data)}
    ${customerBlock(data)}
    <p style="margin:20px 0 0;font-size:13px;color:#374151;">
      Sigue el despacho de tu pedido aquí:<br>
      <a href="${trackingUrl(data.orderId)}" style="color:#102748;font-weight:bold;">${trackingUrl(data.orderId)}</a>
    </p>`)

  const text = `Transferencia aprobada — Pedido ${data.orderId}\n\nTu transferencia fue verificada. Tu pedido está en preparación en Melipilla.\n\n${itemsText(data)}\n\nTotal (IVA incluido): ${formatCLP(data.totalAmount)}\n\nSeguimiento: ${trackingUrl(data.orderId)}`

  return { subject, html, text }
}

/**
 * Payment-review resolution — sent by /api/admin/resolve-payment-review when an
 * administrator confirms (after manual reconciliation) a payment the webhook had
 * flagged as `PAGO_EN_REVISION`.
 */
export function buildPaymentReviewResolvedEmail(data: OrderEmailData): EmailTemplate {
  const subject = `Pago verificado — Pedido ${data.orderId}`

  const html = layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#102748;">Pago verificado</h2>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
      Revisamos el pago de tu pedido <strong>${escapeHtml(data.orderId)}</strong> y quedó confirmado.
      Nuestra bodega en Melipilla ya está preparando tus insumos.
    </p>
    ${itemsTable(data)}
    ${totalsBlock(data)}
    ${customerBlock(data)}
    <p style="margin:20px 0 0;font-size:13px;color:#374151;">
      Sigue el despacho de tu pedido aquí:<br>
      <a href="${trackingUrl(data.orderId)}" style="color:#102748;font-weight:bold;">${trackingUrl(data.orderId)}</a>
    </p>`)

  const text = `Pago verificado — Pedido ${data.orderId}\n\nRevisamos el pago de tu pedido y quedó confirmado. Estamos preparando tus insumos en Melipilla.\n\n${itemsText(data)}\n\nTotal (IVA incluido): ${formatCLP(data.totalAmount)}\n\nSeguimiento: ${trackingUrl(data.orderId)}`

  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Internal warehouse alert
// ---------------------------------------------------------------------------

const WAREHOUSE_EVENT_LABELS: Record<string, string> = {
  PAGADO_MERCADOPAGO: 'Pago Mercado Pago confirmado',
  TRANSFERENCIA_COMPROBANTE_SUBIDO: 'Comprobante de transferencia recibido',
  TRANSFERENCIA_APROBADA: 'Transferencia aprobada por administración',
  // A WhatsApp quote converted into a verified sale by the operator
  // (resolve-quote): the money settled off-platform and stock was deducted.
  PAGADO_TRANSFERENCIA: 'Venta de cotización WhatsApp confirmada (transferencia verificada)',
  PAGO_EN_REVISION: 'Pago Mercado Pago en revisión — monto inconsistente',
  CANCELADO: 'Pedido cancelado por administración',
  // Reconciliation incidents raised by the Mercado Pago webhook.
  PAGO_DUPLICADO: 'Doble pago detectado — posible doble cobro',
  PAGO_ESTADO_INVALIDO: 'Pago aprobado para un pedido que no admite pago',
  PAGO_REEMBOLSADO: 'Pago reembolsado o contracargado — revisión manual'
}

const WAREHOUSE_ACTION_HINTS: Record<string, string> = {
  TRANSFERENCIA_COMPROBANTE_SUBIDO:
    'Verificar el comprobante contra la cartola de Banco de Chile y aprobar en el portal /admin.',
  PAGADO_MERCADOPAGO: 'Pago acreditado: preparar y despachar el pedido.',
  PAGADO_TRANSFERENCIA:
    'Cotización WhatsApp convertida en venta verificada: preparar y despachar el pedido.',
  PAGO_EN_REVISION:
    'El monto pagado no coincide con el total verificado del pedido. NO despachar: conciliar el pago en el portal /admin.',
  CANCELADO:
    'Pedido cancelado al conciliar un pago inconsistente. NO despachar: gestionar el reembolso manualmente si corresponde.',
  PAGO_DUPLICADO:
    'Ya existe un pago acreditado para este pedido. NO despachar: verificar el segundo cobro y gestionar su reembolso manual.',
  PAGO_ESTADO_INVALIDO:
    'El pedido no estaba pendiente de pago cuando se aprobó el cobro. NO despachar: conciliar en el portal /admin antes de continuar.',
  PAGO_REEMBOLSADO:
    'El pago fue reembolsado o contracargado. Verificar el pedido en /admin y gestionar el reembolso manualmente (no se procesa en la plataforma).'
}

const DEFAULT_ACTION_HINT = 'Pedido confirmado: preparar y despachar.'

/**
 * Stock shortfall detected while deducting an order's inventory:
 * the sale is approved (the money is in) but the warehouse must know that the
 * physical stock could not cover the line.
 */
export interface StockShortfall {
  productId: string
  name: string
  requested: number
  available: number
}

/** Internal alert to Melipilla dispatch staff (WAREHOUSE_NOTIFICATION_EMAIL). */
export function buildWarehouseAlertEmail(
  data: OrderEmailData,
  event: string,
  shortfalls?: StockShortfall[]
): EmailTemplate {
  // Own-property lookups: an event string such as `toString` must never resolve
  // to an inherited Object.prototype member (the repo guards this pattern in the
  // admin router and `resolvePromo` too).
  const eventLabel = Object.prototype.hasOwnProperty.call(WAREHOUSE_EVENT_LABELS, event)
    ? WAREHOUSE_EVENT_LABELS[event]
    : event
  const subject = `[Bodega] ${eventLabel} — ${data.orderId}`

  const shortfallHint = (shortfalls || [])
    .filter((line) => line.requested > line.available)
    .map((line) => `${line.requested - line.available}× «${line.name}» (disponible ${line.available})`)
    .join(', ')

  const actionHint =
    (Object.prototype.hasOwnProperty.call(WAREHOUSE_ACTION_HINTS, event)
      ? WAREHOUSE_ACTION_HINTS[event]
      : DEFAULT_ACTION_HINT) +
    (shortfallHint
      ? ` Stock insuficiente: faltan ${shortfallHint}. Reponer/coordinar antes del despacho.`
      : '')

  const html = layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#102748;">${escapeHtml(eventLabel)}</h2>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
      Pedido <strong>${escapeHtml(data.orderId)}</strong> — Estado: <strong>${escapeHtml(data.status || event)}</strong><br>
      Acción requerida: ${escapeHtml(actionHint)}
    </p>
    ${itemsTable(data)}
    ${totalsBlock(data)}
    ${customerBlock(data)}`)

  const text = `[Bodega] ${eventLabel} — ${data.orderId}\n\nEstado: ${data.status || event}\nAcción: ${actionHint}\n\n${itemsText(data)}\n\nTotal (IVA incluido): ${formatCLP(data.totalAmount)}\n\nCliente: ${data.customer.fullName} (${data.customer.rut})\nDespacho: ${data.customer.address}, ${data.customer.city}`

  return { subject, html, text }
}
