import { describe, expect, it } from 'vitest'

import { activeSwitchField, type FieldSwitchChoice } from './fieldSwitch'

const CHOICES: FieldSwitchChoice[] = [
  { field: 'page', label: 'Page' },
  { field: 'link', label: 'Link' },
]

describe('activeSwitchField', () => {
  it('deduces the field that is filled', () => {
    expect(activeSwitchField(CHOICES, { page: '01H', link: null })).toBe('page')
    expect(activeSwitchField(CHOICES, { page: null, link: 'https://x' })).toBe('link')
  })

  it('falls back to the first choice when nothing is filled', () => {
    // A root menu item legitimately has neither: the switch still has to be
    // somewhere, and the first position is the one the form was designed around.
    expect(activeSwitchField(CHOICES, { page: null, link: null })).toBe('page')
    expect(activeSwitchField(CHOICES, {})).toBe('page')
    expect(activeSwitchField(CHOICES, undefined)).toBe('page')
  })

  it('prefers the first filled choice when both are set', () => {
    // The backend's constraint is "at least one", not "exactly one", so both
    // CAN be stored -- and its own `url` property reads `page` first.
    expect(activeSwitchField(CHOICES, { page: '01H', link: 'https://x' })).toBe('page')
  })

  it('lets an explicit pick win over the deduction', () => {
    expect(activeSwitchField(CHOICES, { page: '01H', link: null }, 'link')).toBe('link')
    expect(activeSwitchField(CHOICES, { page: null, link: 'https://x' }, 'page')).toBe('page')
  })

  it('ignores a pick that names no choice', () => {
    // A stale selection must not leave the form with no visible field at all.
    expect(activeSwitchField(CHOICES, { page: null, link: 'https://x' }, 'gone')).toBe('link')
    expect(activeSwitchField(CHOICES, { page: null, link: null }, '')).toBe('page')
  })

  /*
   * isEmpty's line, and the reason this does not use truthiness: a numeric field
   * answered 0, or a boolean answered no, is FILLED.
   */
  it('reads 0 and false as filled', () => {
    const numeric: FieldSwitchChoice[] = [
      { field: 'count', label: 'Count' },
      { field: 'label', label: 'Label' },
    ]
    expect(activeSwitchField(numeric, { count: 0, label: 'x' })).toBe('count')
    expect(activeSwitchField(numeric, { count: false, label: 'x' })).toBe('count')
    expect(activeSwitchField(numeric, { count: '', label: 'x' })).toBe('label')
    expect(activeSwitchField(numeric, { count: [], label: 'x' })).toBe('label')
  })

  it('returns null when there is no choice', () => {
    expect(activeSwitchField([], { page: '01H' })).toBeNull()
  })
})
