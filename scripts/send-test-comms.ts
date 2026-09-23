import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

// Auto-load .env.local or .env if running locally from terminal (same pattern as setup-admin.ts)
for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(process.cwd(), envFile)
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim()
        const val = trimmed
          .slice(eqIdx + 1)
          .trim()
          .replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    }
  }
}

/**
 * Manual smoke-test for transactional communications (Phase 5).
 *
 * Sends real emails through Resend using the PRODUCTION templates in
 * api/lib/emailTemplates.ts, to the address in TEST_EMAIL or
 * WAREHOUSE_NOTIFICATION_EMAIL. Also generates the real WhatsApp quote
 * URL and optionally opens it in the browser (wa.me click-to-chat).
 *
 * Usage:
 *   pnpm dlx tsx scripts/send-test-comms.ts                            # send all 4 emails + print WA link
 *   pnpm dlx tsx scripts/send-test-comms.ts --open                     # also open the WA link in browser
 *   pnpm dlx tsx scripts/send-test-comms.ts --only=whatsapp            # only WhatsApp link
 *   pnpm dlx tsx scripts/send-test-comms.ts --only=email               # only emails
 *   pnpm dlx tsx scripts/send-test-comms.ts --to=you@mail.com          # email recipient override
 *   pnpm dlx tsx scripts/send-test-comms.ts --phone=5491166644522      # WhatsApp target number override
 *   TEST_EMAIL=you@mail.com pnpm dlx tsx scripts/send-test-comms.ts
 */

const TEST_ORDER = {
  orderId: 'PRONTO-TEST01',
  status: 'PENDIENTE_TRANSFERENCIA',
  paymentMethod: 'transferencia',
  totalAmount: 269980,
  items: [
    {
      name: 'Turbina LED Alta Velocidad NSK Style',
      quantity: 1,
      price: 189990
    },
    {
      name: 'Kit Composite Restaurador A2 (x4 jeringas)',
      quantity: 1,
      price: 79990
    }
  ],
  customer: {
    fullName: 'Cliente de Prueba (Smoke Test)',
    email: process.env.TEST_EMAIL || process.env.WAREHOUSE_NOTIFICATION_EMAIL || '',
    rut: '11.111.111-1',
    address: 'Av. Ortúzar 750, Of. 12',
    city: 'Melipilla',
    documentType: 'boleta'
  },
  billing: {
    documentType: 'boleta',
    taxBreakdown: { neto: 226874, iva: 43106, total: 269980 }
  }
}

async function main() {
  const args: string[] = process.argv.slice(2)
  const only = args.find((a) => a.startsWith('--only='))?.split('=')[1]
  const shouldOpen = args.includes('--open')
  const toOverride = args
    .find((a) => a.startsWith('--to='))
    ?.split('=')[1]
    ?.trim()
  const phoneOverride = args
    .find((a) => a.startsWith('--phone='))
    ?.split('=')[1]
    ?.replace(/\D/g, '')

  const recipient = (toOverride || process.env.TEST_EMAIL || process.env.WAREHOUSE_NOTIFICATION_EMAIL || '').trim()

  // Dynamic imports AFTER env is loaded (emailTemplates reads VITE_BANK_* at module scope)
  const { sendEmail, getEmailFrom, getWarehouseEmail } = await import('../api/lib/email')
  const templates = await import('../api/lib/emailTemplates')
  const { generateWhatsAppQuoteUrl } = await import('../src/services/whatsapp')

  console.log('--- Config ---')
  console.log(`From:      ${getEmailFrom()}`)
  console.log(`To:        ${recipient || '(none)'}`)
  console.log(`Warehouse: ${getWarehouseEmail() || '(none)'}`)
  console.log(`Resend:    ${process.env.RESEND_API_KEY ? 'key configured' : 'NO KEY — sends will be skipped'}`)
  console.log('--------------\n')

  if (only !== 'whatsapp') {
    if (!recipient) {
      console.error('❌ No recipient: set TEST_EMAIL or WAREHOUSE_NOTIFICATION_EMAIL in .env.local')
    } else {
      const sends: [string, ReturnType<typeof templates.buildOrderConfirmationEmail>][] = [
        ['order-confirmation (transferencia)', templates.buildOrderConfirmationEmail(TEST_ORDER)],
        [
          'payment-confirmed (mercadopago)',
          templates.buildPaymentConfirmedEmail({
            ...TEST_ORDER,
            status: 'PAGADO_MERCADOPAGO',
            paymentMethod: 'mercadopago'
          })
        ],
        [
          'transfer-approved (admin)',
          templates.buildTransferApprovedEmail({
            ...TEST_ORDER,
            status: 'TRANSFERENCIA_APROBADA'
          })
        ],
        ['warehouse-alert (bodega)', templates.buildWarehouseAlertEmail(TEST_ORDER, 'TRANSFERENCIA_COMPROBANTE_SUBIDO')]
      ]
      for (const [label, tpl] of sends) {
        const result = await sendEmail({
          to: recipient,
          subject: `[TEST] ${tpl.subject}`,
          html: tpl.html,
          text: tpl.text
        })
        console.log(
          `${result.sent ? '✅' : '❌'} ${label}: ${result.sent ? `sent (id ${result.id})` : `FAILED — ${result.reason}`}`
        )
      }
    }
  }

  if (only !== 'email') {
    const { customer, items } = TEST_ORDER as unknown as {
      customer: import('../src/types').CustomerInfo
      items: { product: { name: string; price: number }; quantity: number }[]
    }
    let waUrl = generateWhatsAppQuoteUrl({
      orderId: TEST_ORDER.orderId,
      customer,
      items: items as unknown as import('../src/types').CartItem[],
      total: TEST_ORDER.totalAmount
    })
    if (phoneOverride) {
      waUrl = waUrl.replace(/wa\.me\/\d+/, `wa.me/${phoneOverride}`)
    }
    console.log(`\n📱 WhatsApp quote link:\n${waUrl}\n`)
    if (shouldOpen) {
      execSync(`open "${waUrl}"`)
      console.log('Opened in browser — hit send in WhatsApp to deliver it to the business number.')
    } else {
      console.log('(re-run with --open to launch it, or paste the link in your browser/phone)')
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
