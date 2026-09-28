# PRONTO React Hooks Guide (`src/hooks/`)

Reusable React hooks with **DOM / browser side effects**. This directory exists because [`src/utils/`](../utils) is contractually pure — no hooks, no DOM, no side effects (root [AGENTS.md](../../AGENTS.md) §5).

---

## 🎯 1. Boundary Contract

* ✅ **Lives here:** hooks that touch `document`, `window`, focus, scroll position, or own shared component-lifecycle behaviour used by more than one surface.
* ❌ **Does not live here:** pure helpers (go to `src/utils/`), domain/business logic (checkout, tax, delivery rules — those belong to components or `src/services/`), and one-off hooks only a single component uses.
* All hooks follow the React Compiler-era `react-hooks` rules enforced by `pnpm lint` — derived state over reset effects, no synchronous `setState` inside an effect body. The remount/lazy-initializer conventions these hooks support are documented in [src/components/AGENTS.md](../components/AGENTS.md) §2.1.

---

## 📂 2. Files

| File | Contract |
| :--- | :--- |
| [`useScrollLock.ts`](./useScrollLock.ts) | Freezes `document.body.style.overflow` while an overlay is open, restores the prior value on cleanup. Used by all five overlay surfaces: `Cart`, `CheckoutModal`, `OrderTrackingModal`, `PaymentReturnModal`, `ProductQuickView`. **Any new overlay must adopt it** — without it the page scrolls behind the overlay. |
| [`useFocusTrap.ts`](./useFocusTrap.ts) | Attach to the element carrying `role="dialog"`: moves initial focus to the first focusable element, wraps Tab/Shift+Tab, restores focus on unmount. Same five consumers as `useScrollLock`. Covered by `src/tests/hooks/useFocusTrap.test.tsx`. **No third-party focus-trap dependency** — do not add one. |
| [`useIncrementalReveal.ts`](./useIncrementalReveal.ts) | Catalog progressive reveal for `ProductList`: page size `PRODUCTS_PAGE_SIZE = 16`, `revealMore()` advances one page, and the visible count is **derived** (`Math.min(visibleCount, max)`) so a shrinking result set clamps without an effect. Reset-on-filter-change is achieved by remount (`key={catalogRequestKey}` in `App.tsx`), not by a reset effect. **Reveal is button-only** — the IntersectionObserver auto-reveal sentinel was deliberately removed at the store owner's request (2026-09-24); do not reintroduce scroll-based loading without asking. |

---

## 🔒 3. Guardrails

1. Every hook must be generic over its DOM concern — no product/order/cart types may appear in a signature here.
2. Side effects must clean up symmetrically (restore overflow, restore focus, remove listeners) — these hooks run inside modals that mount/unmount frequently.
3. `useIncrementalReveal` keeps its reveal semantics inside the hook; pagination chrome (`.load-more-row`, `Mostrando N de M` live region) stays in `ProductList` — see [src/components/AGENTS.md](../components/AGENTS.md) §2.4.
