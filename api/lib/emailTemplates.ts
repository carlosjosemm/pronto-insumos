/**
 * Transactional email templates for PRONTO Insumos Odontológicos.
 *
 * Pure functions returning { subject, html, text } — no template engine dependency.
 * All order/customer-supplied values are HTML-escaped before interpolation.
 * Monetary values follow Chilean conventions: integer CLP, "$189.990", 19% IVA.
 */

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
  billing?: {
    documentType?: string
    taxBreakdown?: { neto: number; iva: number; total: number }
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
          documentType: orderData.billing.documentType,
          taxBreakdown: orderData.billing.taxBreakdown
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

function totalsBlock(data: OrderEmailData): string {
  const total = data.billing?.taxBreakdown?.total ?? data.totalAmount
  const neto = data.billing?.taxBreakdown?.neto ?? Math.round(total / 1.19)
  const iva = data.billing?.taxBreakdown?.iva ?? Math.round(total - neto)
  return `<table style="width:100%;font-size:14px;margin-top:12px;">
    <tr><td style="color:#6b7280;padding:2px 0;">Neto</td><td style="text-align:right;padding:2px 0;">${formatCLP(neto)}</td></tr>
    <tr><td style="color:#6b7280;padding:2px 0;">IVA (19%)</td><td style="text-align:right;padding:2px 0;">${formatCLP(iva)}</td></tr>
    <tr><td style="padding-top:8px;font-size:16px;font-weight:bold;">Total (IVA incluido)</td><td style="padding-top:8px;text-align:right;font-size:16px;font-weight:bold;color:#102748;">${formatCLP(total)}</td></tr>
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
    ${totalsBlock(data)}
    ${customerBlock(data)}
    ${bankBlock}
    <p style="margin:20px 0 0;font-size:13px;color:#374151;">
      Puedes revisar el estado de tu pedido en cualquier momento:<br>
      <a href="${trackingUrl(data.orderId)}" style="color:#102748;font-weight:bold;">${trackingUrl(data.orderId)}</a>
    </p>`)

  const text = `${isQuote ? 'Cotización registrada' : 'Pedido recibido'} — ${data.orderId}\n\n${itemsText(data)}\n\nTotal (IVA incluido): ${formatCLP(data.billing?.taxBreakdown?.total ?? data.totalAmount)}${bankText}\n\nSeguimiento: ${trackingUrl(data.orderId)}\n\nPRONTO Insumos Odontológicos — Melipilla, Chile`

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

  const text = `Pago confirmado — Pedido ${data.orderId}\n\nTu pago fue aprobado por Mercado Pago. Estamos preparando tu pedido en Melipilla.\n\n${itemsText(data)}\n\nTotal (IVA incluido): ${formatCLP(data.billing?.taxBreakdown?.total ?? data.totalAmount)}\n\nSeguimiento: ${trackingUrl(data.orderId)}`

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

  const text = `Transferencia aprobada — Pedido ${data.orderId}\n\nTu transferencia fue verificada. Tu pedido está en preparación en Melipilla.\n\n${itemsText(data)}\n\nTotal (IVA incluido): ${formatCLP(data.billing?.taxBreakdown?.total ?? data.totalAmount)}\n\nSeguimiento: ${trackingUrl(data.orderId)}`

  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Internal warehouse alert
// ---------------------------------------------------------------------------

const WAREHOUSE_EVENT_LABELS: Record<string, string> = {
  PAGADO_MERCADOPAGO: 'Pago Mercado Pago confirmado',
  TRANSFERENCIA_COMPROBANTE_SUBIDO: 'Comprobante de transferencia recibido',
  TRANSFERENCIA_APROBADA: 'Transferencia aprobada por administración'
}

/** Internal alert to Melipilla dispatch staff (WAREHOUSE_NOTIFICATION_EMAIL). */
export function buildWarehouseAlertEmail(data: OrderEmailData, event: string): EmailTemplate {
  const eventLabel = WAREHOUSE_EVENT_LABELS[event] || event
  const subject = `[Bodega] ${eventLabel} — ${data.orderId}`

  const actionHint =
    event === 'TRANSFERENCIA_COMPROBANTE_SUBIDO'
      ? 'Verificar el comprobante contra la cartola de Banco de Chile y aprobar en el portal /admin.'
      : event === 'PAGADO_MERCADOPAGO'
        ? 'Pago acreditado: preparar y despachar el pedido.'
        : 'Pedido confirmado: preparar y despachar.'

  const html = layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#102748;">${escapeHtml(eventLabel)}</h2>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
      Pedido <strong>${escapeHtml(data.orderId)}</strong> — Estado: <strong>${escapeHtml(data.status || event)}</strong><br>
      Acción requerida: ${escapeHtml(actionHint)}
    </p>
    ${itemsTable(data)}
    ${totalsBlock(data)}
    ${customerBlock(data)}`)

  const text = `[Bodega] ${eventLabel} — ${data.orderId}\n\nEstado: ${data.status || event}\nAcción: ${actionHint}\n\n${itemsText(data)}\n\nTotal (IVA incluido): ${formatCLP(data.billing?.taxBreakdown?.total ?? data.totalAmount)}\n\nCliente: ${data.customer.fullName} (${data.customer.rut})\nDespacho: ${data.customer.address}, ${data.customer.city}`

  return { subject, html, text }
}
