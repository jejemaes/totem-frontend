import { describe, expect, it } from 'vitest'

import { isEmpty, normaliseChoices, toNumberOrNull } from './values'

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
