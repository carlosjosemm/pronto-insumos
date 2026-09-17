import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminFirestore } from './lib/firebaseAdmin'

function normalizeRut(raw: string): string {
  return (raw || '').replace(/[^0-9kK]/g, '').toUpperCase()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { orderId, rut } = req.body || {}

    if (!orderId || !rut) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios: orderId y rut.' })
    }

    const cleanOrderId = String(orderId).trim().toUpperCase()
    const cleanUserRut = normalizeRut(String(rut))

    if (!cleanUserRut || cleanUserRut.length < 8) {
      return res.status(400).json({ error: 'Formato de RUT no válido.' })
    }

    const adminDb = getAdminFirestore()
    if (!adminDb) {
      console.warn('Firestore Admin not available. Returning simulated order tracking response.')
      return res.status(200).json({
        orderId: cleanOrderId,
        createdAt: new Date().toISOString(),
        status: 'PENDIENTE_TRANSFERENCIA',
        paymentMethod: 'transferencia',
        totalAmount: 189990,
        items: [
          {
            productId: 'odon-101',
            name: 'Turbina Odontológica LED MasterTorque',
            quantity: 1,
            price: 189990
          }
        ],
        customer: {
          fullName: 'Dra. Andrea Morales',
          email: 'contacto@moralesdental.cl',
          rut: cleanUserRut,
          address: 'Av. Ortúzar 750, Of. 302',
          city: 'Melipilla',
          documentType: 'factura',
          razonSocial: 'CLÍNICA DENTAL MORALES SPA'
        },
        billing: {
          documentType: 'factura',
          status: 'PENDIENTE_EMISION_SII'
        },
        voucher: {
          uploaded: false
        },
        fulfillment: {
          currentStep: 1,
          statusTitle: 'Pedido Registrado',
          statusDescription: 'Esperando recepción y verificación del comprobante de transferencia.',
          courier: 'Despacho Local Express Melipilla'
        }
      })
    }

    // Query order by orderId
    const snapshot = await adminDb
      .collection('orders')
      .where('orderId', '==', cleanOrderId)
      .limit(1)
      .get()

    if (snapshot.empty) {
      return res.status(404).json({ error: `No se encontró un pedido con el código "${cleanOrderId}".` })
    }

    const orderDoc = snapshot.docs[0]
    const orderData = orderDoc.data()

    // Authorization check: match purchaser's RUT
    const orderCustomerRut = normalizeRut(orderData.customer?.rut || orderData.billing?.rut || '')
    if (orderCustomerRut !== cleanUserRut) {
      return res.status(401).json({
        error: 'El RUT ingresado no coincide con el registrado para este pedido.'
      })
    }

    // Map order status to fulfillment step (1 to 5)
    let currentStep: 1 | 2 | 3 | 4 | 5 = 1
    let statusTitle = 'Pedido Registrado'
    let statusDescription = 'Tu pedido ha sido recibido en el sistema de PRONTO.'

    switch (orderData.status) {
      case 'PENDIENTE_TRANSFERENCIA':
        currentStep = 1
        statusTitle = 'Pendiente de Transferencia'
        statusDescription = 'Esperando recepción y comprobante de transferencia bancaria (Banco de Chile).'
        break
      case 'TRANSFERENCIA_COMPROBANTE_SUBIDO':
        currentStep = 2
        statusTitle = 'Comprobante en Verificación'
        statusDescription = 'Comprobante recibido. Nuestro equipo contable está validando los fondos.'
        break
      case 'PAGADO_TRANSFERENCIA':
      case 'PAGADO_MERCADOPAGO':
        currentStep = 2
        statusTitle = 'Pago Acreditado'
        statusDescription = 'El pago ha sido acreditado exitosamente. En cola de preparación de inventario.'
        break
      case 'EN_PREPARACION':
        currentStep = 3
        statusTitle = 'Preparando en Bodega'
        statusDescription = 'Tus insumos odontológicos están siendo acondicionados en nuestra bodega central en Melipilla.'
        break
      case 'DESPACHADO':
        currentStep = 4
        statusTitle = 'En Ruta / Despachado'
        statusDescription = orderData.courier
          ? `En tránsito con ${orderData.courier}${orderData.trackingNumber ? ` (N° Seguimiento: ${orderData.trackingNumber})` : ''}.`
          : 'En tránsito hacia la dirección de tu clínica.'
        break
      case 'ENTREGADO':
        currentStep = 5
        statusTitle = 'Entregado en Clínica'
        statusDescription = 'El pedido ha sido entregado exitosamente o retirado en Av. Ortúzar 750, Melipilla.'
        break
      case 'COTIZACION_SOLICITADA_WHATSAPP':
        currentStep = 1
        statusTitle = 'Cotización Formal'
        statusDescription = 'Cotización emitida en espera de aprobación administrativa vía WhatsApp.'
        break
      case 'CANCELADO':
        currentStep = 1
        statusTitle = 'Pedido Cancelado'
        statusDescription = 'Este pedido fue cancelado.'
        break
      default:
        currentStep = 1
    }

    const trackingPayload = {
      orderId: orderData.orderId,
      createdAt: orderData.createdAt ? (orderData.createdAt.toDate ? orderData.createdAt.toDate().toISOString() : orderData.createdAt) : new Date().toISOString(),
      status: orderData.status,
      paymentMethod: orderData.paymentMethod || 'transferencia',
      totalAmount: Number(orderData.totalAmount || 0),
      items: Array.isArray(orderData.items) ? orderData.items : [],
      customer: {
        fullName: orderData.customer?.fullName || '',
        email: orderData.customer?.email || '',
        rut: orderData.customer?.rut || '',
        address: orderData.customer?.address || '',
        city: orderData.customer?.city || '',
        documentType: orderData.customer?.documentType || 'boleta',
        razonSocial: orderData.customer?.razonSocial
      },
      billing: orderData.billing ? {
        documentType: orderData.billing.documentType,
        status: orderData.billing.status,
        taxBreakdown: orderData.billing.taxBreakdown
      } : undefined,
      voucher: {
        uploaded: Boolean(orderData.voucherUrl),
        url: orderData.voucherUrl,
        fileName: orderData.voucherFileName,
        uploadedAt: orderData.voucherUploadedAt
      },
      fulfillment: {
        currentStep,
        statusTitle,
        statusDescription,
        courier: orderData.courier || (orderData.customer?.city?.toLowerCase().includes('melipilla') ? 'Despacho Local Express Melipilla' : 'Starken / Chilexpress Regional'),
        trackingNumber: orderData.trackingNumber
      }
    }

    return res.status(200).json(trackingPayload)
  } catch (error: any) {
    console.error('Error tracking order:', error)
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
}
