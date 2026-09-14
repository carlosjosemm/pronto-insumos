import type { VercelRequest, VercelResponse } from '@vercel/node'

const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { orderId, items, customer, total } = req.body || {}

    if (!orderId || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing required parameters: orderId and items array' })
    }

    const host = req.headers.host || 'pronto-insumos.vercel.app'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = `${protocol}://${host}`

    // If MERCADOPAGO_ACCESS_TOKEN is missing or placeholder, return a sandbox simulated response
    if (!MERCADOPAGO_ACCESS_TOKEN || MERCADOPAGO_ACCESS_TOKEN === 'YOUR_MERCADOPAGO_ACCESS_TOKEN') {
      console.warn('Mercado Pago Access Token missing. Returning simulated fallback checkout URL.')
      return res.status(200).json({
        success: true,
        isSimulated: true,
        preferenceId: 'PREF-SIMULATED-' + Math.floor(100000 + Math.random() * 900000),
        initPoint: `${baseUrl}/?status=approved&orderId=${orderId}`
      })
    }

    // Prepare Mercado Pago Preference Payload
    const mpPreference = {
      items: items.map((i: any) => ({
        id: i.product?.id || 'odon-item',
        title: i.product?.name || 'Insumo Odontológico',
        quantity: i.quantity || 1,
        unit_price: Number(i.product?.price || 0),
        currency_id: 'CLP'
      })),
      payer: {
        name: customer?.fullName || 'Cliente Clínica',
        email: customer?.email || 'contacto@clinica.cl',
        identification: customer?.rut ? {
          type: 'RUT',
          number: customer.rut
        } : undefined
      },
      external_reference: orderId,
      back_urls: {
        success: `${baseUrl}/?status=approved&orderId=${orderId}`,
        failure: `${baseUrl}/?status=failure&orderId=${orderId}`,
        pending: `${baseUrl}/?status=pending&orderId=${orderId}`
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/webhooks/mercadopago`
    }

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
      },
      body: JSON.stringify(mpPreference)
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Mercado Pago Preference API error:', errText)
      return res.status(502).json({ error: 'Mercado Pago preference creation failed', details: errText })
    }

    const data = await response.json()

    return res.status(200).json({
      success: true,
      isSimulated: false,
      preferenceId: data.id,
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point
    })
  } catch (error: any) {
    console.error('Error creating Mercado Pago preference:', error)
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
}
