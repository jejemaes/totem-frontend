import { describe, expect, it } from 'vitest'

import {
  columnPrefsKey,
  moveColumn,
  parseColumnPrefs,
  requestedFields,
  resolveColumns,
  serialiseColumnPrefs,
  toggleColumn,
  type ColumnDeclaration,
} from './columns'

const DECLARED: ColumnDeclaration[] = [
  { name: 'name', defaultDisplay: true, fields: ['first_name', 'last_name'] },
  { name: 'email', defaultDisplay: true, fields: ['email'] },
  { name: 'city', defaultDisplay: false, fields: ['city'] },
]

describe('parseColumnPrefs', () => {
  it('reads what serialiseColumnPrefs wrote', () => {
    const raw = serialiseColumnPrefs([
      { name: 'email', visible: true },
      { name: 'name', visible: false },
    ])
    expect(parseColumnPrefs(raw)).toEqual({ order: ['email', 'name'], hidden: ['name'] })
  })

  it.each([null, '', 'not json', '42', 'null', '{"order":"a","hidden":[]}', '{"order":[1]}'])(
    'answers null for %j rather than throwing',
    (raw) => {
      expect(parseColumnPrefs(raw)).toBeNull()
    },
  )
})

describe('columnPrefsKey', () => {
  it('namespaces the key', () => {
    expect(columnPrefsKey('contacts')).toBe('totem.list.contacts')
  })
})

describe('resolveColumns', () => {
  it('follows defaultDisplay when nothing is stored', () => {
    expect(resolveColumns(DECLARED, null)).toEqual([
      { name: 'name', visible: true },
      { name: 'email', visible: true },
      { name: 'city', visible: false },
    ])
  })

  it('applies the stored order and visibility', () => {
    const prefs = { order: ['city', 'name', 'email'], hidden: ['email'] }
    expect(resolveColumns(DECLARED, prefs)).toEqual([
      { name: 'city', visible: true },
      { name: 'name', visible: true },
      { name: 'email', visible: false },
    ])
  })

  it('drops a stored name the view no longer declares', () => {
    const prefs = { order: ['gone', 'email', 'name', 'city'], hidden: ['gone'] }
    expect(resolveColumns(DECLARED, prefs).map((column) => column.name)).toEqual([
      'email',
      'name',
      'city',
    ])
  })

  it('appends a column added since, with its own default', () => {
    const prefs = { order: ['email', 'name'], hidden: [] }
    expect(resolveColumns(DECLARED, prefs)).toEqual([
      { name: 'email', visible: true },
      { name: 'name', visible: true },
      { name: 'city', visible: false },
    ])
  })

  it('never resolves to a table with no visible column', () => {
    const prefs = { order: ['name', 'email', 'city'], hidden: ['name', 'email', 'city'] }
    expect(resolveColumns(DECLARED, prefs)[0]).toEqual({ name: 'name', visible: true })
  })

  it('answers an empty list for no declaration', () => {
    expect(resolveColumns([], null)).toEqual([])
  })
})

describe('toggleColumn', () => {
  const state = resolveColumns(DECLARED, null)

  it('flips one column', () => {
    expect(toggleColumn(state, 'city')[2]).toEqual({ name: 'city', visible: true })
    expect(toggleColumn(state, 'email')[1]).toEqual({ name: 'email', visible: false })
  })

  it('refuses to hide the last visible column', () => {
    const one = toggleColumn(state, 'email')
    expect(toggleColumn(one, 'name')).toEqual(one)
  })

  it('ignores an unknown name', () => {
    expect(toggleColumn(state, 'nope')).toEqual(state)
  })

  it('never mutates its input', () => {
    toggleColumn(state, 'city')
    expect(state[2].visible).toBe(false)
  })
})

describe('moveColumn', () => {
  const state = resolveColumns(DECLARED, null)

  it('moves a column to the drop position', () => {
    expect(moveColumn(state, 0, 2).map((column) => column.name)).toEqual([
      'email',
      'city',
      'name',
    ])
    expect(moveColumn(state, 2, 0).map((column) => column.name)).toEqual([
      'city',
      'name',
      'email',
    ])
  })

  it.each([
    [-1, 0],
    [0, 3],
    [1, 1],
    [0.5, 1],
  ])('leaves the order alone for %d -> %d', (from, to) => {
    expect(moveColumn(state, from, to)).toEqual(state)
  })
})

describe('requestedFields', () => {
  it('asks for id, then what the visible cells read', () => {
    const state = resolveColumns(DECLARED, null)
    expect(requestedFields(DECLARED, state)).toEqual(['id', 'first_name', 'last_name', 'email'])
  })

  it('does not ask for a hidden column', () => {
    const state = toggleColumn(resolveColumns(DECLARED, null), 'email')
    expect(requestedFields(DECLARED, state)).not.toContain('email')
  })

  it('follows the column order and adds the extras once', () => {
    const state = moveColumn(toggleColumn(resolveColumns(DECLARED, null), 'city'), 2, 0)
    expect(requestedFields(DECLARED, state, ['sequence', 'id'])).toEqual([
      'id',
      'city',
      'first_name',
      'last_name',
      'email',
      'sequence',
    ])
  })
})
