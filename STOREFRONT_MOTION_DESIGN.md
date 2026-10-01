# Storefront Motion Design — PRONTO Insumos

**Status:** design of record for storefront motion (written 2026-09-30, from a read of `src/index.css`, the overlay components and `src/hooks/`). Implemented by roadmap tasks **2.22** (foundation + exits) and **2.23** (micro-interactions + loading polish) in [PRODUCTION_READINESS_TODO.md](./PRODUCTION_READINESS_TODO.md).
**Scope:** the customer storefront only. The admin portal ships its own `admin.css`; it may adopt these tokens later but is out of scope.
**Authority:** the implementing agent should not invent timings, distances or behaviours — this document decides them. Where it conflicts with an `AGENTS.md` file, this document wins during implementation and the `AGENTS.md` files are updated to the as-built state in the same change.
**Guardrails respected:** Vanilla CSS and React 18 only. **No animation library** (no Framer Motion, GSAP, react-spring, Lottie), no new dependency of any kind. Palette, typography and layout are untouched (see [UI_UX_EVALUATION_AND_REDESIGN_PROPOSAL.md](./UI_UX_EVALUATION_AND_REDESIGN_PROPOSAL.md)).
**Code-comment rule:** comments written for this work must explain the constraint inline (for example "exit animations must finish before unmount or the dialog snaps shut"). Pointers to this file, task numbers or any `.md` document inside code comments are rejected by `pnpm lint`.

---

## 1. Design intent

The brand voice is **Quiet Clinical Confidence**: a dental supply depot that feels established, precise and calm. Motion exists to do three jobs and nothing else:

1. **Explain a change of state** — something appeared, disappeared, was added, changed value or moved to the next step.
2. **Acknowledge an action** — a press, an add-to-cart, a saved field.
3. **Remove abruptness** — an overlay that snaps shut feels unfinished; a grid that jumps feels unstable.

Three tests every animation must pass before it ships:

- **Information test:** if the animation is removed, does the shopper lose a cue about what just changed? If not, delete it.
- **Speed test:** can it finish in ≤ 280 ms (≤ 180 ms when leaving)? Buyers are clinic staff reordering supplies; slow motion reads as slow software.
- **Hardware test:** would it hold 60 fps on a four-year-old Android phone on mobile data? If it needs `will-change`, a blur or a layout property, it does not belong.

What makes an interface look "generated" is mostly uniformity and sloppiness — identical timings everywhere, `transition: all`, things that appear without leaving. The refinement here comes from **consistent tokens, matched enter/exit pairs, and restraint**, not from more movement.

---

## 2. What exists today (audit of `src/index.css`)

| Finding | Detail | Disposition |
| :-- | :-- | :-- |
| Implicit `transition: all` everywhere | `--transition-fast` / `--transition-base` hold only a duration + curve, so every `transition: var(--transition-fast)` (36 declarations) has **no property list** — CSS then defaults to `all`, animating box-shadow, width, padding and anything else that changes. `--transition: all 180ms…` is explicit `all` (2 uses). | **Replace** with explicit property lists (§4). |
| Nothing animates out | `Cart`, `CheckoutModal`, `OrderTrackingModal`, `PaymentReturnModal`, `LegalModal` return `null` the instant `isOpen` flips; `ProductQuickView` returns `null` when `product` is cleared; toasts are filtered out of state at 3 s. Every overlay animates in and snaps out. | **Add exits** (§5, §6). |
| Layout properties animated | `toastDrain` animates `width`; `.progress-fill` transitions `width 0.4s`. Both trigger layout. | **Convert** to `transform: scaleX`. |
| Hover lift on touch devices | `.product-card:hover` lifts on tap and sticks. | **Gate** behind `@media (hover: hover) and (pointer: fine)`. |
| Entrance stagger on every remount | `ProductList` is remounted on each filter change (keyed by the catalog request key), so every toggle replays the card entrance with `(index % 4) * 60ms` delays. | **Limit** to first reveal and "Cargar más" batches (§6.9). |
| Two scattered reduced-motion blocks | One only disables `.checkout-panel`; another enumerates classes with `animation: none !important`. New animations are easy to miss. | **Consolidate** into token-driven reduction (§7). |
| Referenced but undefined keyframe | `OrderTrackingModal` animates its loading icon with `spin 2s linear infinite`, but no `@keyframes spin` exists in `src/index.css`, so the icon never rotates. | **Define** `spin` in the foundation task (task 2.22), stopped under reduced motion; it is the only other `linear infinite` besides the skeleton shimmer and must be added to the §3 `linear` allowance. |
| Good existing pieces | `imageFadeIn` (opacity only, deliberately no fill-mode so a skipped animation never leaves an image invisible), `badgePulse` (transform), skeleton shimmer, `cardEntrance`, aspect-ratio boxes. | **Keep**, retune to tokens. |

Existing keyframes and their fate: `fadeIn` → keep, add `fade-out`; `slideUp` → replaced by `modal-in` / `toast-in`; `slideLeft` → replaced by `drawer-in`; `checkout-panel-in` → replaced by directional variants; `cardEntrance` → retuned; `imageFadeIn` → keep; `badgePulse` → retuned; `toastDrain` → rewritten with `scaleX`; `skeleton-shimmer` → slower, lower contrast.

---

## 3. Motion tokens

Add to `:root` in `src/index.css`. Every duration, curve and distance in the stylesheet must come from these; the legacy `--transition-fast` / `--transition-base` stay as thin aliases during migration so nothing breaks mid-change, and `--transition` (the explicit `all`) is deleted.

```css
:root {
  /* Durations — leaving is always faster than arriving. */
  --motion-instant: 90ms;   /* press feedback */
  --motion-fast: 140ms;     /* hover, focus, small state change */
  --motion-base: 200ms;     /* small surfaces entering: toast, step panel, cards */
  --motion-slow: 280ms;     /* large surfaces entering: modal, drawer */
  --motion-exit: 180ms;     /* EVERY exit */

  /* Curves */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);   /* arriving: fast start, long soft settle */
  --ease-in: cubic-bezier(0.4, 0, 1, 1);       /* leaving: accelerates away */
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1); /* in-place change (colour, shadow) */

  /* Distances — zeroed under prefers-reduced-motion (§7), so keyframes become pure fades. */
  --motion-shift-sm: 6px;
  --motion-shift-md: 12px;
  --motion-drawer-from: 100%;
  --motion-scale-from: 0.98;

  /* Explicit property lists — never `all`. */
  --transition-interactive:
    color var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard),
    opacity var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-out);
}
```

Rules of use:
- Animate **`transform` and `opacity`** for anything that moves or appears. Colour, background-color, border-color and `box-shadow` are allowed on hover/focus of a single element only.
- Never animate `width`, `height`, `top/left`, `margin`, `padding`, `max-height` or `filter`/`backdrop-filter`.
- `linear` is permitted for exactly three things: the skeleton shimmer, the toast countdown bar and the loading-icon `spin`.
- No `will-change` in the stylesheet. Browsers promote a layer for the duration of a running transform/opacity animation on their own, and a permanent hint costs memory on low-end phones.
- Total delay (including stagger) never exceeds 120 ms.
- At most three surfaces animate concurrently on mobile.

`MOTION_EXIT_MS = 180` is exported from a new `src/config/motion.ts` (the JS twin of `--motion-exit`, needed because React must know how long to keep a closing surface mounted). A stylesheet-content test asserts the two values are equal (§9).

---

## 4. Interaction states

| Element | Behaviour |
| :-- | :-- |
| `.btn-primary`, `.btn-secondary`, `.btn-add-cart`, `.qty-btn`, `.modal-close-btn`, `.btn-load-more` | Hover: colour/border/shadow change via `--transition-interactive`. **Press:** `:active { transform: translateY(1px); transition-duration: var(--motion-instant); }`. Disabled elements have no hover or press change. Focus ring appears instantly (never delay a focus indicator). |
| `.product-card` | Lift only on `@media (hover: hover) and (pointer: fine)`: `translateY(-2px)` + `--shadow-sm → --shadow-md` + border colour, `--motion-fast`. No tilt, no scale. `:focus-visible` unchanged (instant outline). |
| Product / category / hero image hover zoom | `transform: scale(1.03)` maximum, `--motion-slow` `--ease-out`, hover-capable pointers only. Current 0.4 s `ease-out` zooms are retuned to this token. |
| Links and text buttons | Colour change `--motion-fast`. No underline animation. |

---

## 5. Overlays: matched enter and exit

Every overlay gets an `open` / `closed` phase exposed as `data-state="open" | "closed"` on its overlay and panel. CSS keys the exit animation off `[data-state="closed"]`; React keeps the surface mounted until the exit finishes (§6.1).

| Surface | Enter | Exit |
| :-- | :-- | :-- |
| **Overlay scrim** (`.modal-overlay`, `.cart-drawer-overlay`) | opacity `0 → 1`, `--motion-base`, `--ease-out` | opacity `1 → 0`, `--motion-exit`, `--ease-in` |
| **Modal card** (`.modal-card`, `.modal-card-vertical`) | `modal-in`: opacity `0 → 1`, `translateY(var(--motion-shift-md)) scale(var(--motion-scale-from)) → none`, `--motion-slow`, `--ease-out` | `modal-out`: opacity `1 → 0`, `→ translateY(var(--motion-shift-sm))`, `--motion-exit`, `--ease-in`, `forwards` |
| **Cart drawer** (`.cart-drawer`) | `drawer-in`: opacity `0 → 1` plus `translateX(var(--motion-drawer-from)) → 0`, `--motion-slow`, `--ease-out` | `drawer-out`: reverse, `--motion-exit`, `--ease-in`, `forwards`. On ≤ 560 px the drawer is full-width; the same slide applies. |
| **Toast** (`.toast-item`) | `toast-in`: opacity + `translateY(var(--motion-shift-sm))`, `--motion-base`, `--ease-out` | `toast-out`: opacity `1 → 0`, `--motion-exit`, `--ease-in`. Remaining toasts do not animate their reflow (non-goal). |
| **Countdown bar** (`.toast-progress`) | `transform: scaleX(1 → 0)`, `transform-origin: left`, 3 s `linear` (replaces the `width` animation). | — |

During an exit the closing surface receives `pointer-events: none` and `aria-hidden="true"`, so a click cannot land on a dying dialog and screen readers do not read stale content. Scroll lock and focus-trap release follow `open` (they release at the **start** of the exit, not the end).

---

## 6. Behaviour specs

### 6.1 Exit mechanism — `usePresence`

New hook `src/hooks/usePresence.ts`, owned by the hooks directory (it touches timers and exists to serve more than one surface):

```ts
usePresence(open: boolean, exitMs: number = MOTION_EXIT_MS): { rendered: boolean; state: 'open' | 'closed' }
```

Semantics:
- `open` true → `rendered: true`, `state: 'open'`.
- `open` flips false → `state: 'closed'` immediately, `rendered` stays true for `exitMs`, then becomes false.
- `open` flips true again during the exit → the pending timer is cancelled and `state` returns to `'open'` (re-open must never be swallowed).
- Timer is cleared on unmount. Timer-based, **not** `animationend`-based, because jsdom never fires animation events and a missed event would leave a dead overlay mounted.
- A value-carrying variant, `usePresenceValue<T>(value: T | null)`, returns the last non-null value while exiting, for `ProductQuickView` (whose `product` prop becomes `null` on close and would otherwise blank the dialog mid-animation).
- Must satisfy the repo's `react-hooks` lint rules: no ref reads during render, no synchronous `setState` in an effect body (set state from the timeout callback or adjust state during render), symmetric cleanup.

Adoption: `Cart`, `CheckoutModal` and `PaymentReturnModal` own an `isOpen` prop and return `null` when it is false — they replace that guard with `if (!rendered) return null` and pass `state` to `data-state`. Three surfaces are **conditionally rendered by their parent** instead, and the presence logic must live in the parent so the exit can play: `ProductQuickView` (rendered with `key={product.id}`; `product` becomes `null` on close → `usePresenceValue`), `LegalModal` (`Footer` renders it while `legalSection` is set → `usePresenceValue` on that state) and `OrderTrackingModal` (`App` renders it only while `isTrackingOpen` is true **on purpose**, so its form state re-initialises from `initialOrderId` / `initialRut` on every open). For the last one, keep that remount-on-open guarantee: mount it while `rendered`, and re-key it per open cycle so a re-open during an exit starts from a fresh form, never from stale state. `useScrollLock` and `useFocusTrap` keep receiving the real `open` value.

Toasts: `App.addToast` marks a toast `closing` at `3000 − MOTION_EXIT_MS` and removes it at 3000 ms, so the toast has the same visible lifetime as today.

### 6.2 Checkout step panel

Replace `checkout-panel-in` (6 px vertical) with a directional version: forward steps enter from `translateX(var(--motion-shift-sm))`, backward steps from `translateX(calc(-1 * var(--motion-shift-sm)))`, opacity `0 → 1`, `--motion-base`, `--ease-out`. `CheckoutModal` derives the direction by comparing the new step with the previous one and sets `data-direction="forward|back"` on `.checkout-panel`. No exit animation for panels (the keyed remount replaces them; an exit would double the perceived step time).

### 6.3 Add to cart

- `btn-add-cart` swaps to a confirmed state for 1400 ms: the label and a check icon sit in a grid so the button **never changes width**; label crossfade `--motion-fast`, icon `scale(0.6 → 1)` + fade `--motion-base` `--ease-out`. Confirmed state uses the accent colours (`--accent-soft` / `--accent`), not `--success` (status colours stay quarantined to functional states).
- Cart count badge: retune `badgePulse` to `scale(1 → 1.15 → 1)`, 260 ms, `--ease-out`.
- The existing toast remains the screen-reader announcement; the button swap is purely visual.
- **Not doing:** a "fly to cart" particle. It is the single most "template-looking" motion in e-commerce.

### 6.4 Changed values (cart total, checkout total, repriced lines)

When an amount changes because of a cart edit, a promo, or the last-moment price check (task 2.19), the changed figure gets a **value flash**: a `--accent-soft` background that fades to transparent over 900 ms (`--ease-out`), re-triggered by changing the element's `key`. **No counting-up numbers** — digits tweening is slow, hostile to screen readers and makes totals harder to verify. Colour-only, so it is kept under reduced motion.

### 6.5 Form validation

An inline error enters with opacity `0 → 1` and `translateY(-4px → 0)`, `--motion-fast`; the field border colour transitions with `--motion-fast`. No height animation, no shake.

### 6.6 Order-tracking progress

`.progress-fill` becomes a full-width bar scaled with `transform: scaleX(var(--progress))` and `transform-origin: left`, transition `--motion-slow` `--ease-out`. The tracking timeline's current step may use a **single** soft ring fade on first render; nothing loops.

### 6.7 Catalog loading → content

- Skeleton shimmer: 1.6 s (from 1.2 s), lower contrast, static under reduced motion.
- Cards: `cardEntrance` uses `translateY(var(--motion-shift-sm))`, `--motion-base`, `--ease-out`; stagger `min(index % 4, 3) * 40ms` (max 120 ms).
- Images keep `imageFadeIn` (opacity only, no fill-mode — that guarantee is deliberate and must not be lost).

### 6.8 "Cargar más insumos"

Newly revealed cards enter with the same card entrance; already-visible cards do not re-animate.

### 6.9 Filter, sort and stock-toggle changes

Cards **do not** replay their entrance on a filter change. While a request is in flight the grid container eases to `opacity: 0.55` and back to `1` (`--motion-fast`). The entrance animation applies only to (a) the first catalog render and (b) cards added by "Cargar más". (Task 2.20 stops remounting the grid on every filter change; whichever lands first, the acceptance test in §9 holds.)

### 6.10 Not doing (explicit non-goals)

Page or route transitions, scroll-triggered reveals, parallax, scroll-jacking, number count-ups, confetti, fly-to-cart, Lottie/SVG morphing, looping attention animations, skeleton redesign, dark mode, reflow animation for a stack of toasts, any animation of the Hero beyond the existing image fade.

---

## 7. Reduced motion

One block replaces the two existing ones:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-shift-sm: 0px;
    --motion-shift-md: 0px;
    --motion-drawer-from: 0%;
    --motion-scale-from: 1;
  }
  .skeleton-block { animation: none; }
  .toast-progress { animation: none; transform: scaleX(0); }
}
```

Effect: every keyframe that uses a distance token degrades to a pure opacity fade; nothing translates or scales. Opacity fades and colour changes are retained — they are not vestibular triggers and they keep the open/close legible. Infinite or decorative loops (shimmer, countdown bar) stop. Hover lifts and image zooms are already hover-gated and are additionally set to `transform: none`.

---

## 8. Browser notes

- Everything above is plain CSS transitions and keyframes (universal support). The optional View Transitions API is **not** used.
- Safari: avoid animating `box-shadow` on large containers (repaint cost) — restricted to cards and buttons.
- The 44 px minimum tap target is unchanged by press feedback (`translateY(1px)` does not alter layout).

---

## 9. Test and verification plan

Automated (Vitest/jsdom — jsdom cannot evaluate media queries or run CSS animations, so CSS rules are guarded by stylesheet-content assertions, the established pattern in `src/tests/styles/storefrontCss.test.ts`):

1. **Tokens:** every `--motion-*` / `--ease-*` token in §3 exists; the `MOTION_EXIT_MS` constant equals the `--motion-exit` value parsed from `index.css`.
2. **No implicit/explicit `all`:** the stylesheet contains no `transition: all` and no `transition: var(--transition…)` shorthand without a property (the legacy aliases may remain only if no declaration uses them bare).
3. **No layout-property animation:** no `@keyframes` or `transition` list targets `width`, `height`, `top`, `left`, `margin` or `padding`.
4. **Reduced motion:** the single block exists and zeroes the four distance/scale tokens; every keyframe that moves uses a distance token (so none can translate under reduced motion).
5. **Hover gating:** `.product-card:hover` lift sits inside `@media (hover: hover)`.
6. **`usePresence`** (`src/tests/hooks/usePresence.test.tsx`, fake timers): open → rendered; close → `state: 'closed'` immediately, still rendered until `exitMs`, then unmounted; re-open during exit cancels the timer; unmount clears the timer; `usePresenceValue` holds the last value through the exit.
7. **Component exit behaviour:** `Cart`, `CheckoutModal`, `OrderTrackingModal`, `PaymentReturnModal`, `LegalModal`, `ProductQuickView` stay in the DOM with `data-state="closed"` and `aria-hidden="true"` after closing, and are removed after `act(() => vi.advanceTimersByTime(MOTION_EXIT_MS))`. Existing suites that assert an overlay vanishes synchronously must be updated to advance the timers — **do not** add a test-only branch to production code.
8. **Toasts** keep their 3 s visible lifetime and gain a `closing` phase; **grid** does not replay `product-card-entrance` on a filter toggle (2.23).
9. The existing 1255-test suite stays green.

Manual (the `browser_preview` / preview deploy; required, because CSS motion cannot be proven in jsdom):

- Open and close every overlay at 390 px and at desktop width; no snap, no flash of unstyled content, no stuck dim scrim.
- DevTools → Rendering → **Emulate prefers-reduced-motion: reduce**: nothing slides or scales; fades only.
- DevTools → Performance with **4× CPU throttling**: no long frames while the drawer and a toast animate together.
- Throttle the network to Slow 4G: skeleton → card → image sequence settles without layout shift (target CLS ≤ 0.05).
- Keyboard: Tab order and focus return after closing each overlay are unchanged; Escape still closes.

---

## 10. Documentation to sync in the same change

`src/components/AGENTS.md` (a Motion section: the tokens, the `data-state` contract, the rule that new overlays must adopt `usePresence`), `src/hooks/AGENTS.md` (`usePresence` / `usePresenceValue` contract and its lint constraints), `src/config/AGENTS.md` (`motion.ts` and its CSS twin guard), and the `PRODUCTION_READINESS_TODO.md` history table.
