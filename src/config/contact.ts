/**
 * Centralized commercial contact data — no component may hardcode phone
 * numbers or wa.me URLs again.
 */
const CANONICAL_WHATSAPP_NUMBER = '56929831595'

/** Digits-only canonical line: a formatted env value (`+56 9 2983 1595`) must never produce a dead `wa.me` link. */
export const WHATSAPP_NUMBER: string =
  (import.meta.env?.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '') || CANONICAL_WHATSAPP_NUMBER

/** "+56 9 XXXX XXXX" — derived from the digits-only env var. */
export const WHATSAPP_DISPLAY = `+${WHATSAPP_NUMBER.slice(0, 2)} ${WHATSAPP_NUMBER.slice(2, 3)} ${WHATSAPP_NUMBER.slice(3, 7)} ${WHATSAPP_NUMBER.slice(7)}`

export function whatsappLink(text?: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
