import { describe, it, expect } from 'vitest'
import {
  DISPATCH_REFERENCE_COLLECTION,
  chileanDateKey,
  counterDocumentId,
  formatDispatchReference,
  planDispatchReference,
  resolveDispatchReferencePrefix
} from '../../../api/_lib/dispatchReference'

describe('Internal dispatch reference (Task 2.13)', () => {
  describe('chileanDateKey — the reference is dated in Chilean local time', () => {
    it('buckets a 22:00 Santiago dispatch into that local day, not the UTC one', () => {
      // 2026-09-30T01:00Z is 2026-09-29T22:00 in Chile (DST, UTC-3).
      expect(chileanDateKey(new Date('2026-09-30T01:00:00Z'))).toBe('260929')
    })

    it('buckets a winter-time evening dispatch into the local day (UTC-4)', () => {
      // 2026-06-16T02:00Z is 2026-06-15T22:00 in Chile (standard time, UTC-4).
      expect(chileanDateKey(new Date('2026-06-16T02:00:00Z'))).toBe('260615')
    })

    it('returns the plain YYMMDD for a midday dispatch', () => {
      expect(chileanDateKey(new Date('2026-06-15T15:00:00Z'))).toBe('260615')
    })

    it('handles a summer-time evening dispatch (UTC-3)', () => {
      expect(chileanDateKey(new Date('2026-01-16T01:00:00Z'))).toBe('260115')
    })
  })

  describe('resolveDispatchReferencePrefix — zone codes from the delivery config', () => {
    it('maps the two configured delivery zones', () => {
      expect(resolveDispatchReferencePrefix('Melipilla')).toBe('MEL')
      expect(resolveDispatchReferencePrefix('San Antonio')).toBe('SAN')
    })

    it('is case/whitespace/accent tolerant', () => {
      expect(resolveDispatchReferencePrefix('  san antonio ')).toBe('SAN')
      expect(resolveDispatchReferencePrefix('SAN ANTONIO')).toBe('SAN')
      expect(resolveDispatchReferencePrefix('Melipílla')).toBe('MEL')
    })

    it('falls back to the default zone for legacy free-text communes and missing values', () => {
      for (const city of ['Santiago', 'Melipilla Centro', '', undefined]) {
        expect(resolveDispatchReferencePrefix(city)).toBe('MEL')
      }
      // @ts-expect-error deliberate invalid input to assert runtime resilience
      expect(resolveDispatchReferencePrefix(null)).toBe('MEL')
    })
  })

  describe('reference formatting', () => {
    it('builds the counter document id from prefix + date key', () => {
      expect(counterDocumentId('MEL', '260929')).toBe('MEL-260929')
    })

    it('zero-pads the daily sequence to two digits', () => {
      expect(formatDispatchReference('MEL', '260929', 1)).toBe('MEL-260929-01')
      expect(formatDispatchReference('SAN', '260929', 7)).toBe('SAN-260929-07')
    })

    it('grows naturally past 99 instead of wrapping or truncating', () => {
      expect(formatDispatchReference('MEL', '260929', 100)).toBe('MEL-260929-100')
    })

    it('never emits an unparseable sequence', () => {
      for (const invalid of [0, -3, 1.5, NaN]) {
        expect(formatDispatchReference('MEL', '260929', invalid)).toBe('MEL-260929-01')
      }
    })
  })

  describe('planDispatchReference — generated default, admin override, never downgraded', () => {
    it('treats a typed code as a manual override (a real courier guía)', () => {
      expect(planDispatchReference({ typedCode: 'STK-998877' })).toEqual({
        kind: 'manual',
        reference: 'STK-998877'
      })
      // The UI sends a numeric guía as-is; the planner coerces it to a string.
      // @ts-expect-error deliberate invalid input to assert runtime resilience
      expect(planDispatchReference({ typedCode: 998877 })).toEqual({
        kind: 'manual',
        reference: '998877'
      })
    })

    it('trims the typed code before it becomes the reference', () => {
      expect(planDispatchReference({ typedCode: '  CHX-84192  ' })).toEqual({
        kind: 'manual',
        reference: 'CHX-84192'
      })
    })

    it('keeps an existing generated route code across a code-less re-dispatch', () => {
      expect(planDispatchReference({ existingReference: 'MEL-260929-07', existingSource: 'generated' })).toEqual({
        kind: 'keep',
        reference: 'MEL-260929-07',
        source: 'generated'
      })
    })

    it('never downgrades a manual guía to a generated code', () => {
      expect(planDispatchReference({ existingReference: 'STK-998877', existingSource: 'manual' })).toEqual({
        kind: 'keep',
        reference: 'STK-998877',
        source: 'manual'
      })
      // A whitespace-only typed value is "no code" — the manual guía survives.
      expect(
        planDispatchReference({ typedCode: '   ', existingReference: 'STK-998877', existingSource: 'manual' })
      ).toEqual({ kind: 'keep', reference: 'STK-998877', source: 'manual' })
    })

    it('defaults an unknown/absent source to generated, so an internal code is never labeled a guía', () => {
      expect(planDispatchReference({ existingReference: 'MEL-260929-07' })).toEqual({
        kind: 'keep',
        reference: 'MEL-260929-07',
        source: 'generated'
      })
      expect(planDispatchReference({ existingReference: 'MEL-260929-07', existingSource: 'weird' })).toEqual({
        kind: 'keep',
        reference: 'MEL-260929-07',
        source: 'generated'
      })
    })

    it('mints when there is no reference yet (and for a blank stored value)', () => {
      expect(planDispatchReference({})).toEqual({ kind: 'mint' })
      expect(planDispatchReference({ typedCode: '', existingReference: '   ' })).toEqual({ kind: 'mint' })
      expect(planDispatchReference({ typedCode: undefined, existingReference: undefined })).toEqual({ kind: 'mint' })
    })
  })

  it('exposes the server-only counter collection name', () => {
    expect(DISPATCH_REFERENCE_COLLECTION).toBe('dispatch_counters')
  })
})
