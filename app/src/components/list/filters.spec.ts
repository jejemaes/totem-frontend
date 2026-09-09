import { describe, expect, it } from 'vitest'

import {
  activeFilterEntries,
  blankFilters,
  filterDisplay,
  filterFormData,
  filtersFromQuery,
  isFilterActive,
  normaliseFilterValues,
  parseFilterValue,
  type FilterFields,
} from './filters'

const FIELDS: FilterFields = {
  search: { type: 'string', label: 'Search', help_text: 'Filter on login or email.' },
  login: { type: 'string', label: 'Login' },
  is_active: { type: 'boolean', label: 'Active' },
  seats: { type: 'integer', label: 'Seats' },
  level: {
    type: 'selection',
    label: 'Level',
    options: { choices: [{ value: 1, label: 'One' }, { value: 2, label: 'Two' }] },
  },
}

describe('blankFilters', () => {
  it('holds every declared key, so useResourceList can claim them all', () => {
    expect(Object.keys(blankFilters(FIELDS))).toEqual([
      'search',
      'login',
      'is_active',
      'seats',
      'level',
    ])
    expect(Object.values(blankFilters(FIELDS)).every((value) => value === null)).toBe(true)
  })
})

describe('parseFilterValue', () => {
  it('reads a boolean from the string a URL carries', () => {
    expect(parseFilterValue(FIELDS.is_active, 'true')).toBe(true)
    expect(parseFilterValue(FIELDS.is_active, '1')).toBe(true)
    // The whole point: a naive restore binds this non-empty string as `true`.
    expect(parseFilterValue(FIELDS.is_active, 'false')).toBe(false)
    expect(parseFilterValue(FIELDS.is_active, '0')).toBe(false)
    expect(parseFilterValue(FIELDS.is_active, true)).toBe(true)
    expect(parseFilterValue(FIELDS.is_active, false)).toBe(false)
  })

  it('drops a boolean it cannot read rather than guessing', () => {
    expect(parseFilterValue(FIELDS.is_active, 'yes')).toBeNull()
    expect(parseFilterValue(FIELDS.is_active, '')).toBeNull()
  })

  it('reads a number, and refuses what is not one', () => {
    expect(parseFilterValue(FIELDS.seats, '12')).toBe(12)
    expect(parseFilterValue(FIELDS.seats, 12)).toBe(12)
    expect(parseFilterValue(FIELDS.seats, 'twelve')).toBeNull()
  })

  it('restores a selection with the TYPE its choices declare', () => {
    expect(parseFilterValue(FIELDS.level, '1')).toBe(1)
    expect(parseFilterValue(FIELDS.level, 2)).toBe(2)
  })

  it('drops a choice the field does not offer', () => {
    expect(parseFilterValue(FIELDS.level, '9')).toBeNull()
  })

  it('trims a string and reads an empty one as unset', () => {
    expect(parseFilterValue(FIELDS.login, '  admin  ')).toBe('admin')
    expect(parseFilterValue(FIELDS.login, '   ')).toBeNull()
    expect(parseFilterValue(FIELDS.login, null)).toBeNull()
    expect(parseFilterValue(FIELDS.login, undefined)).toBeNull()
  })

  it('refuses a list: a query parameter has no shape for one', () => {
    expect(parseFilterValue(FIELDS.login, ['a', 'b'])).toBeNull()
  })
})

describe('isFilterActive', () => {
  it('counts `false` and `0` as active filters', () => {
    expect(isFilterActive(false)).toBe(true)
    expect(isFilterActive(0)).toBe(true)
  })

  it('counts nothing, null and the empty string as unset', () => {
    expect(isFilterActive(null)).toBe(false)
    expect(isFilterActive(undefined)).toBe(false)
    expect(isFilterActive('')).toBe(false)
  })
})

describe('filtersFromQuery', () => {
  it('restores only declared keys, typed', () => {
    const values = filtersFromQuery(FIELDS, { search: 'ada', is_active: 'false', seats: '3' })
    expect(values).toEqual({
      search: 'ada',
      login: null,
      is_active: false,
      seats: 3,
      level: null,
    })
  })

  it('ignores a parameter the screen never declared', () => {
    expect(filtersFromQuery(FIELDS, { is_superuser: 'true' }).is_superuser).toBeUndefined()
  })

  it('ignores the list machinery own keys', () => {
    const values = filtersFromQuery({ page: { type: 'string', label: 'Page' } }, { page: '3' })
    expect(values.page).toBeNull()
  })

  it('takes the first value of a repeated parameter rather than a list', () => {
    expect(filtersFromQuery(FIELDS, { login: ['ada', 'bob'] }).login).toBe('ada')
  })
})

describe('normaliseFilterValues', () => {
  it('clears every declared key the caller left out', () => {
    const values = normaliseFilterValues(FIELDS, { login: 'ada' })
    expect(values).toEqual({ search: null, login: 'ada', is_active: null, seats: null, level: null })
  })

  it('drops what was never declared', () => {
    expect(normaliseFilterValues(FIELDS, { is_superuser: true }).is_superuser).toBeUndefined()
  })
})

describe('filterFormData', () => {
  it('carries the search field through, so an Apply does not clear the box', () => {
    expect(filterFormData(FIELDS, { search: 'ada', is_active: 'true' })).toEqual({
      search: 'ada',
      login: null,
      is_active: true,
      seats: null,
      level: null,
    })
  })
})

describe('filterDisplay', () => {
  it('reads a boolean as a word', () => {
    expect(filterDisplay(FIELDS.is_active, true)).toBe('Yes')
    expect(filterDisplay(FIELDS.is_active, 'false')).toBe('No')
  })

  it('reads a selection through its label', () => {
    expect(filterDisplay(FIELDS.level, '2')).toBe('Two')
  })

  it('is empty for an unset filter', () => {
    expect(filterDisplay(FIELDS.login, null)).toBe('')
  })
})

describe('activeFilterEntries', () => {
  it('lists the active filters in declaration order', () => {
    const active = activeFilterEntries(FIELDS, { login: 'ada', is_active: false, seats: null })
    expect(active).toEqual([
      { name: 'login', label: 'Login', value: 'ada', display: 'ada' },
      { name: 'is_active', label: 'Active', value: false, display: 'No' },
    ])
  })

  it('skips the search field: its box is already on screen', () => {
    const active = activeFilterEntries(FIELDS, { search: 'ada', login: 'bob' }, 'search')
    expect(active.map((entry) => entry.name)).toEqual(['login'])
  })

  it('drops a filter whose value its field cannot express', () => {
    expect(activeFilterEntries(FIELDS, { level: 'nope' }, 'search')).toEqual([])
  })
})
