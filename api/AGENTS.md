# PRONTO Serverless Backend Guide (`api/`)

This directory contains the **Vercel Serverless Functions** for PRONTO. It serves as the secure backend boundary for payment processing, external webhook receivers, administrative operations, and third-party integrations.

---

## 🎯 1. Directory Scope & Purpose

* **Runtime:** Node.js (Vercel Serverless Function environment).
* **Current Functions:**
  * [`create-preference.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/api/create-preference.ts): Generates Mercado Pago Checkout Pro preferences using the server-side access token.
  * [`webhooks/mercadopago.ts`](file:///c:/Users/ecmv2/Documents/PRONTO/api/webhooks/mercadopago.ts): Receives asynchronous payment status notifications from Mercado Pago, verifies legitimacy, updates order records, and atomically decrements stock.
* **Roadmap Additions:**
  * Transactional email triggers (e.g., via Resend / SendGrid).
  * Chilean DTE Electronic Invoicing dispatch (Boleta/Factura via SII API provider).

---

## 🚫 2. Anti-Overshooting & Architectural Guardrails

1. **NO Monolithic Frameworks:**
   * Do **NOT** install Express, Fastify, NestJS, or routing frameworks.
   * Write standard Vercel function signatures:
     ```typescript
     import type { VercelRequest, VercelResponse } from '@vercel/node';

     export default async function handler(req: VercelRequest, res: VercelResponse) { ... }
     ```
2. **Stateless Execution:**
   * Serverless functions can spin up and tear down at any moment. Never store state in local variables across requests.
3. **No Heavy ORMs:**
   * Interact with Google Cloud / Firebase using the official `firebase-admin` SDK. Do not install Prisma, TypeORM, or Mongoose.

---

## 🔒 3. Critical Security & Runtime Rules

> [!CAUTION]
> **STRICT RUNTIME ISOLATION:**  
> This directory executes in Node.js, NOT in the browser!

1. **Environment Variables (`process.env` ONLY):**
   * ❌ **NEVER** use `import.meta.env` inside `api/`. It triggers immediate runtime crashes in Vercel Node.js.
   * ✅ Use `process.env.VARIABLE_NAME`.
   * ✅ Server secrets (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `FIREBASE_PRIVATE_KEY`, etc.) belong **exclusively** here and must NEVER have a `VITE_` prefix.
2. **Database Access (`firebase-admin` ONLY):**
   * ❌ **NEVER** import `db` or `auth` from `src/services/firebase.ts`. That file uses the client Web SDK and Vite environment variables.
   * ✅ Use `firebase-admin` initialized with service account credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`).
3. **Webhook Verification & Idempotency:**
   * Webhook handlers must validate cryptographic signatures (`x-signature` header via HMAC-SHA256) when configured.
   * **Idempotency is mandatory:** Always inspect the order document before modifying state or stock. If `order.status === 'PAGADO_MERCADOPAGO'`, return `res.status(200).json({ received: true, message: 'Already processed' })` immediately.
4. **Atomic Inventory Decrements:**
   * Stock decrements must be executed within a Firestore atomic transaction (`db.runTransaction`) to prevent inventory corruption during concurrent orders.
5. **CORS & Response Standard:**
   * Set appropriate CORS headers for methods (`POST, OPTIONS`).
   * Respond with standardized JSON:
     ```typescript
     // Success
     return res.status(200).json({ success: true, ...data });
     // Error
     return res.status(400).json({ success: false, error: 'Descriptive error message' });
     ```

---

## 🚀 4. Deployment of Serverless Functions

Serverless endpoints in `api/` are packaged and deployed directly via the **Vercel CLI**:
* Deploy Preview: `pnpm dlx vercel`
* Deploy Production: `pnpm dlx vercel --prod`
* Server environment variables must be declared in Vercel's Project Settings before deploying.
