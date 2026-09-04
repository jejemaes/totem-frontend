import { describe, expect, it } from 'vitest'

import { colorAt, colorStyle, FIELD_COLORS, MAX_COLOR_INDEX } from './colors'

describe('FIELD_COLORS', () => {
  it('holds the 16 entries the backend constraint allows', () => {
    expect(FIELD_COLORS).toHaveLength(16)
    expect(MAX_COLOR_INDEX).toBe(15)
  })

  it('holds no duplicate, so two indexes never paint the same', () => {
    expect(new Set(FIELD_COLORS).size).toBe(FIELD_COLORS.length)
  })
})

describe('colorAt', () => {
  it('returns the entry at the index', () => {
    expect(colorAt(0)).toBe(FIELD_COLORS[0])
    expect(colorAt(MAX_COLOR_INDEX)).toBe(FIELD_COLORS[MAX_COLOR_INDEX])
  })

  // Every one of these can reach the palette straight from backend JSON, and
  // none of them may produce `undefined` -- that paints a transparent chip,
  // which reads as a rendering bug rather than as a bad value.
  it.each([
    ['above the range', 16],
    ['far above the range', 9999],
    ['negative', -1],
    ['not an integer', 1.5],
    ['NaN', Number.NaN],
    ['a numeric string', '3'],
    ['null', null],
    ['undefined', undefined],
    ['a boolean', true],
    ['an object', {}],
  ])('falls back to the first entry when the index is %s', (_label, index) => {
    expect(colorAt(index)).toBe(FIELD_COLORS[0])
  })
})

describe('colorStyle', () => {
  it('fills with the palette entry and writes in white', () => {
    expect(colorStyle(2)).toEqual({ backgroundColor: FIELD_COLORS[2], color: '#fff' })
  })

  it('falls back with colorAt rather than producing an empty background', () => {
    expect(colorStyle(9999)).toEqual({ backgroundColor: FIELD_COLORS[0], color: '#fff' })
  })
})
