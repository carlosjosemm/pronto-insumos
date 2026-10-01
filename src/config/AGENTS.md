# PRONTO Shared Commercial Constants Guide (`src/config/`)

Centralized, environment-aware **single sources of truth** for commercial data shared by storefront and backoffice. These files exist so a business value (WhatsApp number, bank account, delivery rules) is declared once — never re-declared in components.

---

## 🎯 1. The One Invariant

> **Components import; they never re-declare.**

Each file's env-var fallback is the **only** sanctioned fallback for that value. The historical failure mode this prevents:

* `Cart` computed free shipping against `150000` while `Footer` advertised `$100.000` — fixed by `delivery.ts`.
* `OrderTrackingModal` hardcoded `wa.me/56987654321`, a different placeholder than the configured line — fixed by `contact.ts`. (`PaymentReturnModal`'s inline `wa.me` + stale `56912345678` fallback was the last holdout — **fixed (Task 2.10, 2026-09-29)**; see [src/components/AGENTS.md](../components/AGENTS.md) §4.1.2.)
* `Footer.tsx` / `CheckoutModal.tsx` hardcode `77.892.410-K` — an **invalid** Modulo-11 check digit; the correct RUT lives in `BANK_DETAILS.rut` (`77.892.410-2`). **Fixed (Task 1.4, 2026-09-28):** both components now render `BANK_DETAILS.rut`, enforced by the `Fiscal RUT single-source guard` in `src/tests/config/bankDetails.test.ts` (details: [src/components/AGENTS.md](../components/AGENTS.md) §2.5).

---

## 📂 2. Files

| File | Exports | Contract |
| :--- | :--- | :--- |
| [`delivery.ts`](./delivery.ts) | `DELIVERY_ZONES` (`['Melipilla','San Antonio']`), `DEFAULT_DELIVERY_ZONE`, `DELIVERY_ZONE_REFERENCE_CODES` (`{ Melipilla: 'MEL', 'San Antonio': 'SAN' }`), `FREE_SHIPPING_THRESHOLD` (`150000`, **both** zones), `MIN_ORDER_OUTSIDE_MELIPILLA` (`60000`, **San Antonio only**), `MIN_ORDER_ZONE`, `isBelowMinimumOrder()`, `normalizeDeliveryZone()` | The only delivery-rule source. Checkout's comuna `<select>` iterates `DELIVERY_ZONES` plus an "Otra comuna (coordinar por WhatsApp)" option; the minimum applies to San Antonio eligibility only — Melipilla has none, and an out-of-zone commune has none (those buyers settle by WhatsApp quote). `normalizeDeliveryZone(value)` is the single commune matcher: case/accent/whitespace-insensitive, returns the canonical zone or `null` for anything else — `isBelowMinimumOrder` and `api/_lib/dispatchReference.ts` both route through it, so a crafted `"san antonio"` can never dodge the minimum and an unknown commune is never silently pinned to a zone. The reference codes prefix the internal dispatch code minted by `dispatch-order` (`MEL-260929-07` — Task 2.13, consumed server-side via [`api/_lib/dispatchReference.ts`](../../api/_lib/dispatchReference.ts)): the zone list is never re-declared in `api/`. Never re-declare thresholds or the zone list locally, and never reintroduce `RM` coverage or pickup wording (root [AGENTS.md](../../AGENTS.md) §3.4). |
| [`contact.ts`](./contact.ts) | `WHATSAPP_NUMBER` (`VITE_WHATSAPP_NUMBER`, **digits-only** — a formatted value like `+56 9 2983 1595` is normalized, and an empty/garbage value falls back to `56929831595`), `WHATSAPP_DISPLAY` (`+56 9 …`), `whatsappLink(text?)` | No component may hardcode a phone number or a `wa.me` URL — all customer-facing links go through `whatsappLink()`. Consumers: Navbar, Hero, Footer, ProductQuickView, ErrorBoundary, OrderTrackingModal, CheckoutModal, LegalModal, PaymentReturnModal (Task 2.10). The single-source guard in `src/tests/config/contact.test.ts` fails the suite if any file under `src/components/`, `src/services/` or `src/admin/` reintroduces a `wa.me` URL, a `569…` literal or a `VITE_WHATSAPP_NUMBER` read. |
| [`bankDetails.ts`](./bankDetails.ts) | `BANK_DETAILS` (`VITE_BANK_*` env-backed: `bankName`, `accountType`, `accountNumber`, `rut`, `companyName`, `email`) | Every transfer-instruction surface (checkout Step 5, tracking voucher box, admin Settings) must render from `BANK_DETAILS`, not literals. `rut` is asserted by `src/tests/config/bankDetails.test.ts`. |
| [`features.ts`](./features.ts) | `REVIEWS_ENABLED` (`false`) | The one-line re-enable switch for the storefront rating/review UI (the same pattern as `FACTURA_ENABLED` in `CheckoutModal.tsx`). While false, `ProductCard` and `ProductQuickView` render no stars or review count and `CategoryFilter` omits the "Mejor Calificados" / "Más Reseñas" sort options; `App` coerces a `sortBy` of `rating`/`reviews` to `featured`. The `rating` / `reviewsCount` fields and the `sortBy` branches in `fetchProducts` stay in place, so turning reviews on later is this flag plus a real review source. |
| [`catalog.ts`](./catalog.ts) | `LOW_STOCK_PUBLIC_THRESHOLD` (`3`) | The only stock figure that is public: a product whose `stockCount` is 1–3 may expose that count (it powers the "Últimas unidades" cue on the card, the quick view and the cart line); every other value is omitted from the public catalog response and the server verifies stock at payment time. Shared by `/api/catalog` (the disclosure bound) and the storefront cues, so the API contract and the UI can never drift. The admin low-stock KPI deliberately stays at ≤ 5 — this constant bounds what CUSTOMERS may see, not internal reporting. |
| [`promos.ts`](./promos.ts) | `MOCK_PROMOS` (`PRONTO10` 10%, `DENT20` 20%), `resolvePromo(code)` → canonical `PromoCode` or `null`, `resolvePromoPercent(code)` (case-insensitive, trimmed; unknown/non-string → `0`) | **Single source of truth for promo codes**, shared with the serverless payment layer: `create-preference` and the webhook recompute the discounted payable total from this same table, so a forged `promoCode` can never discount (unknown ⇒ full price). **`resolvePromo` is the only sanctioned way to turn a code into a discount** — a `PromoCode` object hydrated from `localStorage` is a display artifact, so `cartStorage` re-resolves it on load and `App`/`Cart` re-derive the percent at render; otherwise a hand-edited cart entry would display a discount the payment layer refuses to charge. Re-exported by `src/data/products.ts` for catalog-import compatibility. Pure module — importable from Node (`api/`) and tsx scripts. ⚠️ The **policy** model (expiry, usage limits, redemption audit, product eligibility) is deliberately thin today — tracked as **Task 9.1** in [PRODUCTION_READINESS_TODO.md](../../PRODUCTION_READINESS_TODO.md). |

---

## 🔒 3. Guardrails

1. All values are browser-safe: only `VITE_`-prefixed env vars may appear here (server secrets belong to `api/` `process.env`).
2. Keep these files dependency-free — they are imported by storefront components, admin components, and tests alike.
3. A new commercial constant belongs here the moment a second surface needs it; a new **fallback literal inside a component is always a bug**.
