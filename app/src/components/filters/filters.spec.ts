import { describe, expect, it } from 'vitest'

import {
  activeFilterEntries,
  blankFilters,
  dialogFilterEntries,
  filterDisplay,
  filterFormData,
  filterStore,
  filtersFromQuery,
  filterWidget,
  filterWidgetOptions,
  isFilterActive,
  normaliseFilterValues,
  NULL_FILTER_VALUE,
  parseFilterValue,
  type FilterField,
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

describe('dialogFilterEntries', () => {
  it('offers every declared filter but the search one, in declaration order', () => {
    expect(dialogFilterEntries(FIELDS, 'search').map(([name]) => name)).toEqual([
      'login',
      'is_active',
      'seats',
      'level',
    ])
  })

  it('follows the search key a screen chose', () => {
    expect(dialogFilterEntries(FIELDS, 'login').map(([name]) => name)).toContain('search')
  })

  it('is empty when the search is all a list declares, which hides the button', () => {
    expect(dialogFilterEntries({ search: FIELDS.search! }, 'search')).toEqual([])
  })
})

// ------------------------------------------------------------- multi-valued

const CATEGORY: FilterField = {
  type: 'many2one',
  widget: 'many2many_tags',
  label: 'Category',
  allowNull: true,
  nullLabel: 'Uncategorized',
  options: {
    fetch: async () => [{ id: 'a', name: 'Rent' }],
    resolve: async (ids) => ids.map((id) => ({ id, name: `Label ${id}` })),
  },
}

const SEATS: FilterField = { type: 'integer', widget: 'many2many_tags', label: 'Seats' }

const STATUS: FilterField = {
  type: 'selection',
  widget: 'many2many_tags',
  label: 'Status',
  allowNull: true,
  options: { choices: [{ value: 1, label: 'Draft' }, { value: 2, label: 'Done' }] },
}

describe('multi-valued filters', () => {
  it('are drawn with their widget, and with their type when they name none', () => {
    expect(filterWidget(CATEGORY)).toBe('many2many_tags')
    expect(filterWidget(FIELDS.level!)).toBe('selection')
  })

  it('read a list from the form, stringified and deduplicated', () => {
    expect(parseFilterValue(SEATS, [1, '2', 1, 'x'])).toEqual(['1', '2'])
  })

  it('read the comma-joined string a URL carries', () => {
    // useResourceList restores every filter as that raw string.
    expect(parseFilterValue(CATEGORY, 'a, b,,null')).toEqual(['a', 'b', 'null'])
  })

  it('are unset, not an empty list, when nothing is picked', () => {
    expect(parseFilterValue(CATEGORY, [])).toBeNull()
    expect(parseFilterValue(CATEGORY, '')).toBeNull()
  })

  it('keep the null token only when the filter offers it', () => {
    expect(parseFilterValue(SEATS, 'null,3')).toEqual(['3'])
    expect(parseFilterValue({ ...CATEGORY, allowNull: false }, ['null', 'a'])).toEqual(['a'])
  })

  it('validate a selection item against the choices', () => {
    expect(parseFilterValue(STATUS, '2,9,null')).toEqual(['2', NULL_FILTER_VALUE])
  })

  it('reach the form as [] when unset, the form invariant for a list', () => {
    expect(filterFormData({ category: CATEGORY }, {})).toEqual({ category: [] })
  })

  it('round-trip through a query string', () => {
    expect(filtersFromQuery({ category: CATEGORY }, { category: 'a,null' })).toEqual({
      category: ['a', 'null'],
    })
  })

  it('are counted, not listed, when active', () => {
    expect(filterDisplay(CATEGORY, ['a', 'b'])).toBe('2 selected')
    expect(filterDisplay(CATEGORY, ['null'])).toBe('Uncategorized')
    expect(filterDisplay(STATUS, '1')).toBe('Draft')
  })
})

describe('the null token on a single-valued filter', () => {
  const single: FilterField = { ...CATEGORY, widget: undefined }

  it('is kept as a value of its own', () => {
    expect(parseFilterValue(single, 'null')).toBe(NULL_FILTER_VALUE)
    expect(filterDisplay(single, 'null')).toBe('Uncategorized')
  })

  it('is a choice of a selection, in front of the declared ones', () => {
    const choices = filterWidgetOptions({ ...STATUS, widget: undefined }).choices
    expect(choices?.[0]).toEqual({ value: 'null', label: 'None' })
    expect(choices).toHaveLength(3)
  })
})

describe('filterWidgetOptions', () => {
  it('puts the empty entry in front of a relation\'s candidates, when it matches', async () => {
    const options = filterWidgetOptions(CATEGORY)
    expect((await options.fetch!(null)).map((row) => row.id)).toEqual(['null', 'a'])
    expect((await options.fetch!('uncat')).map((row) => row.id)).toEqual(['null', 'a'])
    expect((await options.fetch!('rent')).map((row) => row.id)).toEqual(['a'])
  })

  it('labels the null token locally, and asks the endpoint for the rest only', async () => {
    const asked: string[][] = []
    const options = filterWidgetOptions({
      ...CATEGORY,
      options: {
        ...CATEGORY.options,
        resolve: async (ids) => {
          asked.push(ids)
          return ids.map((id) => ({ id }))
        },
      },
    })
    expect((await options.resolve!(['null', 'a'])).map((row) => row.id)).toEqual(['null', 'a'])
    expect(await options.resolve!(['null'])).toEqual([{ id: 'null', name: 'Uncategorized' }])
    expect(asked).toEqual([['a']])
  })

  it('labels the empty entry even through a display that reads other keys', () => {
    // A user's display reads `login`, which the empty entry does not carry.
    const options = filterWidgetOptions({
      ...CATEGORY,
      options: { ...CATEGORY.options, relationDisplay: (record) => String(record.login) },
    })
    expect(options.relationDisplay!({ id: 'null' })).toBe('Uncategorized')
    expect(options.relationDisplay!({ id: 'u1', login: 'ada' })).toBe('ada')
  })

  it('leaves a relation without allowNull untouched', () => {
    const plain = { ...CATEGORY, allowNull: false }
    expect(filterWidgetOptions(plain).fetch).toBe(CATEGORY.options!.fetch)
  })

  it('serves a multi-valued selection\'s choices through fetch and resolve', async () => {
    const options = filterWidgetOptions(STATUS)
    expect(await options.fetch!('do')).toEqual([{ id: '2', name: 'Done' }])
    expect((await options.fetch!(null)).map((row) => row.id)).toEqual(['null', '1', '2'])
    expect(await options.resolve!(['1'])).toEqual([{ id: '1', name: 'Draft' }])
  })
})

describe('filterStore', () => {
  it('parses what is written into it, whoever writes it', () => {
    const values = blankFilters({ category: CATEGORY, seats: FIELDS.seats! })
    const store = filterStore({ category: CATEGORY, seats: FIELDS.seats! }, values)
    store.category = 'a,null'
    store.seats = '3'
    expect(values).toEqual({ category: ['a', 'null'], seats: 3 })
  })

  it('lists every declared key, as useResourceList expects', () => {
    const store = filterStore({ category: CATEGORY }, blankFilters({ category: CATEGORY }))
    expect(Object.keys(store)).toEqual(['category'])
    expect(JSON.stringify(store)).toBe('{"category":null}')
  })
})
