# PRONTO Shared Commercial Constants Guide (`src/config/`)

Centralized, environment-aware **single sources of truth** for commercial data shared by storefront and backoffice. These files exist so a business value (WhatsApp number, bank account, delivery rules) is declared once — never re-declared in components.

---

## 🎯 1. The One Invariant

> **Components import; they never re-declare.**

Each file's env-var fallback is the **only** sanctioned fallback for that value. The historical failure mode this prevents:

* `Cart` computed free shipping against `150000` while `Footer` advertised `$100.000` — fixed by `delivery.ts`.
* `OrderTrackingModal` hardcoded `wa.me/56987654321`, a different placeholder than the configured line — fixed by `contact.ts`. (`PaymentReturnModal` still carries the last literal `wa.me` + a stale fallback; see [src/components/AGENTS.md](../components/AGENTS.md) §4.1.2.)
* `Footer.tsx` / `CheckoutModal.tsx` hardcode `77.892.410-K` — an **invalid** Modulo-11 check digit; the correct RUT lives in `BANK_DETAILS.rut` (`77.892.410-2`). Still open — see [src/components/AGENTS.md](../components/AGENTS.md) §2.5.

---

## 📂 2. Files

| File | Exports | Contract |
| :--- | :--- | :--- |
| [`delivery.ts`](./delivery.ts) | `DELIVERY_ZONES` (`['Melipilla','San Antonio']`), `DEFAULT_DELIVERY_ZONE`, `FREE_SHIPPING_THRESHOLD` (`150000`, **both** zones), `MIN_ORDER_OUTSIDE_MELIPILLA` (`60000`, **San Antonio only**), `MIN_ORDER_ZONE`, `isBelowMinimumOrder()` | The only delivery-rule source. Checkout's comuna `<select>` iterates `DELIVERY_ZONES`; the minimum applies to San Antonio eligibility only — Melipilla has no minimum. Never re-declare thresholds or the zone list locally, and never reintroduce `RM` coverage or pickup wording (root [AGENTS.md](../../AGENTS.md) §3.4). |
| [`contact.ts`](./contact.ts) | `WHATSAPP_NUMBER` (`VITE_WHATSAPP_NUMBER`, fallback `56929831595`), `WHATSAPP_DISPLAY` (`+56 9 …`), `whatsappLink(text?)` | No component may hardcode a phone number or a `wa.me` URL — all customer-facing links go through `whatsappLink()`. Consumers: Navbar, Hero, Footer, ProductQuickView, ErrorBoundary, OrderTrackingModal, CheckoutModal. |
| [`bankDetails.ts`](./bankDetails.ts) | `BANK_DETAILS` (`VITE_BANK_*` env-backed: `bankName`, `accountType`, `accountNumber`, `rut`, `companyName`, `email`) | Every transfer-instruction surface (checkout Step 5, tracking voucher box, admin Settings) must render from `BANK_DETAILS`, not literals. `rut` is asserted by `src/tests/config/bankDetails.test.ts`. |

---

## 🔒 3. Guardrails

1. All values are browser-safe: only `VITE_`-prefixed env vars may appear here (server secrets belong to `api/` `process.env`).
2. Keep these files dependency-free — they are imported by storefront components, admin components, and tests alike.
3. A new commercial constant belongs here the moment a second surface needs it; a new **fallback literal inside a component is always a bug**.
