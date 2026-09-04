import { describe, expect, it } from 'vitest'

import { isEmpty, normaliseChoices, toDateOrNull, toIsoDate, toNumberOrNull } from './values'

describe('isEmpty', () => {
  it('treats null, undefined and the empty string as empty', () => {
    expect(isEmpty(null)).toBe(true)
    expect(isEmpty(undefined)).toBe(true)
    expect(isEmpty('')).toBe(true)
  })

  // The whole point of the helper: a required boolean answered "Non" is filled
  // in, and so is a required number set to zero.
  it('does not treat false, 0 or "0" as empty', () => {
    expect(isEmpty(false)).toBe(false)
    expect(isEmpty(0)).toBe(false)
    expect(isEmpty('0')).toBe(false)
  })

  it('keeps whitespace as a value', () => {
    expect(isEmpty(' ')).toBe(false)
  })
})

describe('toNumberOrNull', () => {
  it('passes finite numbers through', () => {
    expect(toNumberOrNull(3)).toBe(3)
    expect(toNumberOrNull(0)).toBe(0)
    expect(toNumberOrNull(-2.5)).toBe(-2.5)
  })

  it('parses numeric strings', () => {
    expect(toNumberOrNull('3.5')).toBe(3.5)
    expect(toNumberOrNull('  42 ')).toBe(42)
  })

  it('returns null for anything that is not a usable number', () => {
    expect(toNumberOrNull('')).toBeNull()
    expect(toNumberOrNull('   ')).toBeNull()
    expect(toNumberOrNull('abc')).toBeNull()
    expect(toNumberOrNull(null)).toBeNull()
    expect(toNumberOrNull(undefined)).toBeNull()
    expect(toNumberOrNull(Number.NaN)).toBeNull()
    expect(toNumberOrNull(Number.POSITIVE_INFINITY)).toBeNull()
  })

  // Number(true) === 1, which would silently turn a checkbox into a quantity.
  it('refuses booleans', () => {
    expect(toNumberOrNull(true)).toBeNull()
    expect(toNumberOrNull(false)).toBeNull()
  })
})

describe('normaliseChoices', () => {
  it('leaves the full form untouched', () => {
    const choices = [{ value: 'draft', label: 'Brouillon' }]
    expect(normaliseChoices(choices)).toEqual(choices)
  })

  it('expands the bare shorthand', () => {
    expect(normaliseChoices(['a', 2])).toEqual([
      { value: 'a', label: 'a' },
      { value: 2, label: '2' },
    ])
  })

  it('accepts a mixed list', () => {
    expect(normaliseChoices(['a', { value: 'b', label: 'Bravo' }])).toEqual([
      { value: 'a', label: 'a' },
      { value: 'b', label: 'Bravo' },
    ])
  })

  it('returns an empty list when nothing is configured', () => {
    expect(normaliseChoices(undefined)).toEqual([])
    expect(normaliseChoices([])).toEqual([])
  })
})

describe('toDateOrNull', () => {
  it('parses an ISO date at local midnight', () => {
    const date = toDateOrNull('2024-03-31')
    expect(date).toBeInstanceOf(Date)
    // Local components, not UTC ones: that is the whole point of the helper.
    expect(date?.getFullYear()).toBe(2024)
    expect(date?.getMonth()).toBe(2)
    expect(date?.getDate()).toBe(31)
    expect(date?.getHours()).toBe(0)
  })

  it('passes a valid Date through and rejects an invalid one', () => {
    const date = new Date(2024, 0, 15)
    expect(toDateOrNull(date)).toBe(date)
    expect(toDateOrNull(new Date(Number.NaN))).toBeNull()
  })

  it('refuses anything that is not a bare ISO date', () => {
    expect(toDateOrNull('')).toBeNull()
    expect(toDateOrNull('31/03/2024')).toBeNull()
    expect(toDateOrNull('2024-3-1')).toBeNull()
    expect(toDateOrNull('2024-03-31T12:00:00Z')).toBeNull()
    expect(toDateOrNull(null)).toBeNull()
    expect(toDateOrNull(undefined)).toBeNull()
    expect(toDateOrNull(20240331)).toBeNull()
  })

  // new Date(2023, 1, 30) silently rolls over to March 2nd.
  it('refuses a day that does not exist', () => {
    expect(toDateOrNull('2023-02-30')).toBeNull()
    expect(toDateOrNull('2024-13-01')).toBeNull()
  })
})

describe('toIsoDate', () => {
  it('formats from the local components', () => {
    expect(toIsoDate(new Date(2024, 2, 31))).toBe('2024-03-31')
    expect(toIsoDate(new Date(2024, 0, 5))).toBe('2024-01-05')
  })

  it('returns null when there is no date', () => {
    expect(toIsoDate(null)).toBeNull()
    expect(toIsoDate(undefined)).toBeNull()
    expect(toIsoDate('nope')).toBeNull()
  })

  /*
   * The regression this guards: `toISOString().slice(0, 10)` would answer
   * 2024-03-30 for a date picked on the 31st anywhere east of Greenwich. The
   * round trip must be exact whatever the machine's timezone, which is why
   * these assert equality rather than an absolute offset.
   */
  it('round-trips every date, including across a DST switch', () => {
    // Europe/Paris springs forward on 2024-03-31 and falls back on 2024-10-27.
    for (const iso of ['2024-03-30', '2024-03-31', '2024-04-01', '2024-10-27', '2024-12-31', '1970-01-01']) {
      expect(toIsoDate(toDateOrNull(iso))).toBe(iso)
    }
  })
})
