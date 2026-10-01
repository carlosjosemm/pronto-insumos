import { describe, it, expect } from 'vitest'
import {
  DELIVERY_ZONES,
  MIN_ORDER_OUTSIDE_MELIPILLA,
  MIN_ORDER_ZONE,
  isBelowMinimumOrder,
  normalizeDeliveryZone
} from '../../config/delivery'

describe('delivery config — normalizeDeliveryZone', () => {
  it('resolves the canonical zones exactly', () => {
    expect(normalizeDeliveryZone('Melipilla')).toBe('Melipilla')
    expect(normalizeDeliveryZone('San Antonio')).toBe('San Antonio')
  })

  it('ignores case, accents and repeated whitespace', () => {
    expect(normalizeDeliveryZone('melipilla')).toBe('Melipilla')
    expect(normalizeDeliveryZone('MELIPILLA')).toBe('Melipilla')
    expect(normalizeDeliveryZone('san antonio')).toBe('San Antonio')
    expect(normalizeDeliveryZone('sán antonio')).toBe('San Antonio')
    expect(normalizeDeliveryZone('SAN   ANTONIO')).toBe('San Antonio')
    expect(normalizeDeliveryZone('  Melipilla  ')).toBe('Melipilla')
  })

  it('returns null for out-of-zone, empty and non-string values', () => {
    expect(normalizeDeliveryZone('Curicó')).toBeNull()
    expect(normalizeDeliveryZone('san antonio este')).toBeNull()
    expect(normalizeDeliveryZone('')).toBeNull()
    expect(normalizeDeliveryZone('   ')).toBeNull()
    expect(normalizeDeliveryZone(null)).toBeNull()
    expect(normalizeDeliveryZone(undefined)).toBeNull()
    expect(normalizeDeliveryZone(42)).toBeNull()
    expect(normalizeDeliveryZone({ city: 'Melipilla' })).toBeNull()
  })

  it('never maps an unknown commune onto the default zone', () => {
    // The dispatch reference may fall back to Melipilla for its route code,
    // but the zone resolver itself must report out-of-zone as null — a
    // crafted "melipilla " with trailing junk is not a zone either way.
    expect(normalizeDeliveryZone('melipilla')).toBe('Melipilla')
    expect(normalizeDeliveryZone('melipilla sur')).toBeNull()
  })
})

describe('delivery config — isBelowMinimumOrder', () => {
  it('gates San Antonio at the minimum and exempts Melipilla', () => {
    expect(isBelowMinimumOrder('San Antonio', MIN_ORDER_OUTSIDE_MELIPILLA - 1)).toBe(true)
    expect(isBelowMinimumOrder('San Antonio', MIN_ORDER_OUTSIDE_MELIPILLA)).toBe(false)
    expect(isBelowMinimumOrder('San Antonio', MIN_ORDER_OUTSIDE_MELIPILLA + 1)).toBe(false)
    expect(isBelowMinimumOrder('Melipilla', 1)).toBe(false)
  })

  it('gates on the normalized commune, not the raw string', () => {
    // A crafted lowercase/extra-space commune must hit the same minimum as
    // the canonical zone name.
    expect(isBelowMinimumOrder('san antonio', MIN_ORDER_OUTSIDE_MELIPILLA - 1)).toBe(true)
    expect(normalizeDeliveryZone('san antonio')).toBe(MIN_ORDER_ZONE)
  })

  it('applies no minimum to out-of-zone or garbage communes', () => {
    // Out-of-zone buyers settle by WhatsApp quote — the minimum is a San
    // Antonio eligibility rule, not a global floor.
    expect(isBelowMinimumOrder('Curicó', 1)).toBe(false)
    expect(isBelowMinimumOrder('', 1)).toBe(false)
    expect(isBelowMinimumOrder(undefined, 1)).toBe(false)
    expect(isBelowMinimumOrder(null, 1)).toBe(false)
  })

  it('keeps the zone list and thresholds as the single source', () => {
    expect(DELIVERY_ZONES).toEqual(['Melipilla', 'San Antonio'])
    expect(MIN_ORDER_ZONE).toBe('San Antonio')
    expect(MIN_ORDER_OUTSIDE_MELIPILLA).toBe(60000)
  })
})
