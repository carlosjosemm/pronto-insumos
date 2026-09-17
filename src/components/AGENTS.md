# PRONTO UI Components Guide (`src/components/`)

This directory contains the user interface layer of PRONTO, built with **React 18** and styled using our custom, high-performance **Vanilla CSS Clinical Design System** located at [src/index.css](file:///c:/Users/ecmv2/Documents/PRONTO/src/index.css).

---

## 🎯 1. Directory Scope & Component Architecture

* **Role:** Presentation and user interaction. Components receive props, maintain localized UI state, dispatch user actions, and emit events.
* **Design Philosophy:** "Clinical Precision & Local Trust". Authentic Chilean dental depot aesthetic combining **Deep Navy (`#0b192c`)**, **Surgical Teal (`#088395`)**, crisp slate neutrals (`#334155`), and technical 6px–8px radii. Zero radioactive neon glowing halos or fake SaaS telemetry.
* **Key Components:**
  * [`Navbar.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/Navbar.tsx): Top commercial utility bar (Melipilla express delivery, Av. Ortúzar pickup, Factura Electrónica 19% IVA, WhatsApp clinical hotline), brand logo `PRONTO ODONTOLOGÍA`, technical search input, and dynamic cart badge.
  * [`Hero.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/Hero.tsx): Authentic clinical depot value proposition paired with the **Commercial Guarantee Card** (Factura Electrónica SII, Melipilla warehouse dispatch, ISP sanitary compliance, and technical WhatsApp line).
  * [`CategoryFilter.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/CategoryFilter.tsx): Segmented category control tabs with accessible roles, instant stock toggle, and sort controls.
  * [`ProductCard.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/ProductCard.tsx): Clinical catalog item card featuring technical header with REF SKU code (e.g. `REF: OD-101`), discreet out-of-stock indicators (`Sin Stock` / `Agotado`), sterile media presentation with primary photo display, interactive media/title triggers opening the detail modal, simple `IVA incluido` pricing, and dedicated add-to-cart action. Internal warehouse stock counts are strictly confidential and omitted from customer views.
  * [`ProductList.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/ProductList.tsx): Responsive grid container with clinical empty and loading states.
  * [`ProductQuickView.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/ProductQuickView.tsx): Vertical (1-column) Product Detail Modal featuring multi-photo gallery (with thumbnail strip, next/prev navigation, and keyboard arrow controls), ISP compliance notices, itemized pricing (`IVA incluido`), technical specs checklist, package contents ("Contenido del Empaque") checklist, and stock-capped quantity stepper.
  * [`Cart.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/Cart.tsx): Slide-over cart drawer with line item editing, Chilean free shipping threshold tracker ($150.000 / Melipilla), promo code support, itemized tax calculation, real-time visual stock cues (`Sin stock disponible`, `Máximo disponible (X unid.)`, `Excede stock (X unid. disp.)`), quantity stepper capped at physical warehouse stock with informative tooltip, warning alert banner for depleted or over-limit items, and disabled checkout action (`Insumos sin Stock Suficiente`).
  * [`CheckoutModal.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/CheckoutModal.tsx): Multi-step checkout (Despacho, Chilean Delivery Zone, Boleta/Factura Electrónica with Chilean Modulo 11 RUT validation, Payment method selector). Enforces pre-flight inventory validation guards blocking Step 1 -> Step 2 progression and order submission if items in the cart exceed physical warehouse stock or are depleted. Zero raw credit card inputs stored in state (PCI-DSS compliant).
  * [`PaymentReturnModal.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/PaymentReturnModal.tsx): Post-payment return modal managing Mercado Pago return states (`approved`, `failure`, `pending`), displaying order identifiers, clearing cart on approved payments, offering direct WhatsApp dispatch coordination, and providing recovery actions.
  * [`OrderTrackingModal.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/OrderTrackingModal.tsx): Public order tracking modal secured by canonical Order ID (`PRONTO-XXXXXX`) and Chilean Modulo 11 customer RUT. Displays a 5-step visual timeline (*Registrado*, *Comprobante/Pago*, *Preparación en Melipilla*, *En Ruta*, *Entregado*), bank transfer voucher upload form for pending orders, delivery details, itemized summary, and direct WhatsApp customer support.
  * [`Footer.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/Footer.tsx): Grounded 4-column B2B distributor layout (Av. Ortúzar 750 warehouse address, tracking action, regional routes, ISP compliance, and payment channels). Zero prototype seed buttons.
  * [`ErrorBoundary.tsx`](file:///c:/Users/ecmv2/Documents/PRONTO/src/components/ErrorBoundary.tsx): Fallback wrapper to catch and gracefully report runtime UI errors with direct WhatsApp escalation.

---

## 🚫 2. Anti-Overshooting & Styling Guardrails

1. **NO External UI Libraries or Tailwind:**
   * Do **NOT** install Tailwind CSS, Bootstrap, MUI, Chakra, Radix, or Shadcn.
   * Style components using semantic classes and CSS custom variables defined in [src/index.css](file:///c:/Users/ecmv2/Documents/PRONTO/src/index.css) (e.g., `btn-primary`, `btn-secondary`, `product-card`, `modal-overlay`, `var(--navy-900)`, `var(--teal-600)`).
2. **Icons:**
   * Use [`lucide-react`](https://lucide.dev) for UI icons (already installed).
   * Always import icons by name (e.g., `import { ShoppingBag, ShieldCheck, MapPin } from 'lucide-react'`).
3. **Keep Components Manageable:**
   * Avoid giant monolith files. Keep component responsibilities focused on presentation and state dispatch.
4. **No Heavy State Managers:**
   * Manage local UI state with standard React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`). Do not inject global store providers.

---

## 🔒 3. Payment & Security Rules in UI Components

> [!CAUTION]
> **CRITICAL PAYMENT INTEGRITY:**  
> The browser is an untrusted environment. NEVER execute financial approvals or inventory deductions here.

1. **No Client-Side Inventory Decrement:**
   * ❌ **FORBIDDEN:** Calling `deductOrderStock()` or altering Firestore `stockCount` directly from `CheckoutModal.tsx`.
   * ✅ Physical stock is deducted exclusively by the verified serverless backend webhook at `/api/webhooks/mercadopago`.
2. **Initial Order Status is Always Pending:**
   * When creating an order in checkout, it must be assigned `'PENDIENTE_PAGO_MERCADOPAGO'` or `'PENDIENTE_TRANSFERENCIA'`.
   * Never store an order as `'PAGADO_MERCADOPAGO'` from the client.
3. **Zero Card Input Handling (PCI-DSS Compliance):**
   * Never render raw credit card number, expiration, or CVC input fields, and never store mock card values in component state.
   * Mercado Pago payments must redirect to the official Checkout Pro URL generated by `/api/create-preference` or open the official secure Mercado Pago modal.
4. **No Database Admin Buttons in Public UI:**
   * The public `Footer.tsx` must never contain database wipe, seed, or debug buttons.
5. **Clean Form State & Zero Hardcoded Mock Data:**
   * `CheckoutModal.tsx` must always initialize customer fields to empty strings with illustrative placeholder text (no hardcoded test names like "Camila Fuentes").
   * Component state and order submission payloads must never contain payment card fields (`cardNumber`, `expDate`, `cvc`), maintaining zero PCI-DSS liability.
   * Text inputs are automatically trimmed of whitespace before submission to Firestore or payment services.

---

## 🇨🇱 4. Chilean Localization in Components

1. **Currency Display:**
   * Formatted as Chilean Pesos with clear indication that prices include tax (`IVA incluido`).
2. **RUT Inputs & Validation:**
   * Any input capturing a Chilean RUT (personal or company) must format with thousands dots and dash (`12.345.678-K`) and validate using `validateRut()` from [src/utils/rut.ts](file:///c:/Users/ecmv2/Documents/PRONTO/src/utils/rut.ts).
3. **B2B Factura Fields:**
   * When the customer toggles **Factura Electrónica**, the UI collects:
     * Company Name (*Razón Social*)
     * Company RUT (*RUT Empresa*)
     * Commercial Activity (*Giro Comercial*)
     * Tax Address (*Dirección de Entrega / Consulta*)
4. **Sanitary Compliance (ISP Chile & SIS):**
   * When the cart contains controlled/prescription dental products (`prescriptionRequired: true`), the UI displays:
     * `⚕️ Requiere SIS` badge on product cards and in quick-view modal.
     * Amber alert banner in cart drawer notifying customer of controlled supply status.
     * Mandatory **Validación Sanitaria ISP / SIS** section in `CheckoutModal.tsx` requiring the dentist's Superintendencia de Salud (SIS) registration number (minimum 4 digits) and optional credential/prescription file attachment before progressing to payment.
     * Confirmation summary and pro-forma purchase voucher display the verified SIS registration number.
5. **Testing Contracts:**
   * Interactive buttons, inputs, and badges maintain accessible labels and text attributes matching the test suites in [src/tests/components/](file:///c:/Users/ecmv2/Documents/PRONTO/src/tests/components). Zero test regressions.
