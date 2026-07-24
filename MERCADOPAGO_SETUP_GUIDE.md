# Mercado Pago Integration Setup Guide
## PRONTO INSUMOS ODONTOLÓGICOS (Melipilla & RM, Chile)

This document provides a step-by-step checklist to complete and go live with the Mercado Pago Chile payment integration, serverless webhooks, and automated Firestore stock deduction.

---

## 📋 Phase 1: Obtain Mercado Pago Credentials (5 minutes)

1. Log in to **[mercadopago.cl/developers](https://www.mercadopago.cl/developers)**.
2. Go to **Tus aplicaciones** → Create or select `PRONTO INSUMOS ODONTOLÓGICOS`.
3. Copy your credentials from **Credenciales de prueba** (Test) and **Credenciales de producción** (Live):
   - **Public Key**: `TEST-...` or `APP_USR-...`
   - **Access Token**: `TEST-...` or `APP_USR-...`

---

## 🔑 Phase 2: Add Keys to Vercel Environment Variables (2 minutes)

In **[Vercel Dashboard](https://vercel.com)** → `pronto-insumos` → **Settings** → **Environment Variables**, add:

- **`VITE_MERCADOPAGO_PUBLIC_KEY`** = *(Your Public Key)*
- **`MERCADOPAGO_ACCESS_TOKEN`** = *(Your Secret Access Token)*
- **`MERCADOPAGO_WEBHOOK_SECRET`** = *(Optional signature secret from MP Developer Portal)*

---

## 🔗 Phase 3: Register Webhook URL in Mercado Pago Portal (2 minutes)

1. In **Mercado Pago Developers** → Your App → **Webhooks / IPN**:
2. Paste **Notification URL**:
   ```
   https://pronto-insumos.vercel.app/api/webhooks/mercadopago
   ```
3. Check event checkboxes: **Pagos** (`payment.created`, `payment.updated`).
4. Click **Guardar** (Save).

---

## 🧪 Phase 4: Perform Test Transaction (3 minutes)

1. Visit `https://pronto-insumos.vercel.app`.
2. Add a dental product to the cart and click **Proceder al Pago**.
3. Select **Pago Inmediato Mercado Pago Chile** and submit.
4. Complete the test payment using a Mercado Pago test card for Chile:
   - **Visa Test Card**: `4509 9500 0000 0000` (Exp: `12/28`, CVC: `123`)
5. Check **Firebase Console → Firestore**:
   - Verify **`orders` collection** updates to `status: "PAGADO_MERCADOPAGO"`.
   - Verify **`products` collection** `stockCount` decreases by the purchased quantity.

---

## 🚀 Phase 5: Switch to Production Credentials & Go Live (1 minute)

1. In Vercel Environment Variables, replace `TEST-...` keys with your **Production Public Key** (`APP_USR-...`) and **Production Access Token** (`APP_USR-...`).
2. Deploy to production:
   ```bash
   pnpm dlx vercel --prod
   ```
3. You are now ready to accept real credit/debit card payments in Chile!
