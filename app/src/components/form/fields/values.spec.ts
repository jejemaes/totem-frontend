import { describe, expect, it } from 'vitest'

import {
  isEmpty,
  normaliseChoices,
  sameFieldValue,
  toDateOrNull,
  toDateTimeOrNull,
  toIsoDate,
  toIsoDateTime,
  toNumberOrNull,
} from './values'

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

  // A list-valued field holds `[]` when nothing is picked, never `null`, so
  // this is what `required` actually has to catch.
  it('treats the empty list as empty', () => {
    expect(isEmpty([])).toBe(true)
  })

  it('treats a list holding anything as filled', () => {
    expect(isEmpty(['a'])).toBe(false)
    expect(isEmpty([0])).toBe(false)
  })
})

describe('sameFieldValue', () => {
  it('compares scalars the way Object.is does', () => {
    expect(sameFieldValue('a', 'a')).toBe(true)
    expect(sameFieldValue(0, 0)).toBe(true)
    expect(sameFieldValue(false, false)).toBe(true)
    expect(sameFieldValue(null, null)).toBe(true)
    expect(sameFieldValue(undefined, undefined)).toBe(true)

    expect(sameFieldValue('a', 'b')).toBe(false)
    expect(sameFieldValue(0, '0')).toBe(false)
    expect(sameFieldValue(null, undefined)).toBe(false)
    expect(sameFieldValue(false, 0)).toBe(false)
  })

  // The reason the helper exists: the widget rebuilds its array on every pick,
  // so two equal lists are never the same object.
  it('compares two lists by value, not by reference', () => {
    expect(sameFieldValue(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameFieldValue([], [])).toBe(true)
  })

  it('ignores the order: a many-to-many is a set', () => {
    expect(sameFieldValue(['b', 'a'], ['a', 'b'])).toBe(true)
    expect(sameFieldValue([2, 10, 1], [1, 2, 10])).toBe(true)
  })

  it('reads a numeric id and its string form as the same id', () => {
    expect(sameFieldValue([1, 2], ['1', '2'])).toBe(true)
  })

  it('tells different lists apart', () => {
    expect(sameFieldValue(['a'], ['b'])).toBe(false)
    expect(sameFieldValue(['a'], ['a', 'b'])).toBe(false)
    expect(sameFieldValue(['a', 'b'], ['a'])).toBe(false)
    expect(sameFieldValue([], ['a'])).toBe(false)
  })

  // A duplicate is not equality: the lists differ in length, and the widget
  // never produces one anyway.
  it('does not collapse duplicates', () => {
    expect(sameFieldValue(['a', 'a'], ['a'])).toBe(false)
  })

  it('never equates a list with a scalar', () => {
    expect(sameFieldValue(['a'], 'a')).toBe(false)
    expect(sameFieldValue([], null)).toBe(false)
    expect(sameFieldValue([], '')).toBe(false)
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

describe('toDateTimeOrNull', () => {
  it('applies the offset the backend sent', () => {
    // The same instant, written three ways: 12:00Z, 14:00+02:00, 07:00-05:00.
    const utc = toDateTimeOrNull('2024-03-31T12:00:00Z')
    expect(utc?.getTime()).toBe(Date.UTC(2024, 2, 31, 12, 0, 0))
    expect(toDateTimeOrNull('2024-03-31T14:00:00+02:00')?.getTime()).toBe(utc?.getTime())
    expect(toDateTimeOrNull('2024-03-31T07:00:00-05:00')?.getTime()).toBe(utc?.getTime())
  })

  it('accepts what the backend actually emits', () => {
    expect(toDateTimeOrNull('2024-03-31T12:00:00.123456Z')).not.toBeNull()
    expect(toDateTimeOrNull('2024-03-31T12:00:00')).not.toBeNull()
    expect(toDateTimeOrNull('2024-03-31T12:00')).not.toBeNull()
    expect(toDateTimeOrNull('2024-03-31 12:00:00+00:00')).not.toBeNull()
  })

  /*
   * The point of the regex. `new Date('2024-03-31')` succeeds and reads as UTC
   * midnight, which is the previous DAY west of Greenwich -- a calendar day
   * silently promoted to an instant. That is toDateOrNull's job, not this one's.
   */
  it('rejects a calendar day, and everything that is not an instant', () => {
    expect(toDateTimeOrNull('2024-03-31')).toBeNull()
    expect(toDateTimeOrNull('31/03/2024 12:00')).toBeNull()
    expect(toDateTimeOrNull('nope')).toBeNull()
    expect(toDateTimeOrNull('')).toBeNull()
    expect(toDateTimeOrNull(null)).toBeNull()
    expect(toDateTimeOrNull(undefined)).toBeNull()
    expect(toDateTimeOrNull(1711886400000)).toBeNull()
  })

  it('rejects an invalid Date', () => {
    expect(toDateTimeOrNull(new Date('nope'))).toBeNull()
  })

  /*
   * Documented rather than fixed: `new Date` rolls an out-of-range day over to
   * the next month instead of failing, and unlike toDateOrNull -- which builds
   * its Date from the three components and can re-read them -- there is nothing
   * cheap to compare against here, since which components to check depends on
   * whether the string carried an offset. The value always comes from the
   * backend's own DateTimeField, which cannot emit a February 30th.
   */
  it('rolls an out-of-range day over, as the Date constructor does', () => {
    expect(toIsoDateTime('2024-02-30T12:00:00Z')).toBe('2024-03-01T12:00:00.000Z')
  })

  it('passes a valid Date through', () => {
    const date = new Date(Date.UTC(2024, 2, 31, 12))
    expect(toDateTimeOrNull(date)).toBe(date)
  })
})

describe('toIsoDateTime', () => {
  it('serialises in UTC', () => {
    expect(toIsoDateTime(new Date(Date.UTC(2024, 2, 31, 12, 30)))).toBe('2024-03-31T12:30:00.000Z')
  })

  it('returns null when there is no instant', () => {
    expect(toIsoDateTime(null)).toBeNull()
    expect(toIsoDateTime('2024-03-31')).toBeNull()
  })

  /*
   * Unlike toIsoDate, this round trip must NOT be string-exact: the backend may
   * send any offset and this normalises to UTC. What has to survive is the
   * instant, whatever the machine's timezone.
   */
  it('round-trips the instant, not the notation', () => {
    for (const iso of [
      '2024-03-31T00:30:00+02:00',
      '2024-10-27T02:30:00Z',
      '1970-01-01T00:00:00Z',
    ]) {
      const once = toIsoDateTime(iso)
      expect(toDateTimeOrNull(once)?.getTime()).toBe(toDateTimeOrNull(iso)?.getTime())
    }
  })
})
