import { describe, expect, it } from 'vitest'

import {
  DEFAULT_FALSE_LABEL,
  DEFAULT_TRUE_LABEL,
  toggleLabels,
  toggleValue,
} from './booleanToggle'

describe('toggleValue', () => {
  it('reads the true values as on', () => {
    expect(toggleValue(true)).toBe(true)
    expect(toggleValue('true')).toBe(true)
    expect(toggleValue(1)).toBe(true)
    expect(toggleValue('1')).toBe(true)
  })

  it('reads the false values as off', () => {
    expect(toggleValue(false)).toBe(false)
    expect(toggleValue('false')).toBe(false)
    expect(toggleValue(0)).toBe(false)
  })

  it('reads an unset value as off: a switch has no third state', () => {
    expect(toggleValue(null)).toBe(false)
    expect(toggleValue(undefined)).toBe(false)
    expect(toggleValue('')).toBe(false)
  })
})

describe('toggleLabels', () => {
  it('uses the declared labels', () => {
    expect(toggleLabels({ true_label: 'Company', false_label: 'Person' })).toEqual({
      on: 'Company',
      off: 'Person',
    })
  })

  it('falls back on Yes / No for a missing or blank label', () => {
    expect(toggleLabels()).toEqual({ on: DEFAULT_TRUE_LABEL, off: DEFAULT_FALSE_LABEL })
    expect(toggleLabels({ true_label: '  ', false_label: 'Person' })).toEqual({
      on: DEFAULT_TRUE_LABEL,
      off: 'Person',
    })
  })
})
