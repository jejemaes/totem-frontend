import { describe, expect, it } from 'vitest'

import { toRelationOptions } from './many2one'
import {
  relationRecordsFor,
  selectedRelationOptions,
  toRelationIds,
  toRelationValues,
  unresolvedRelationIds,
  withSelectedRecords,
} from './many2many'

/* Three tags, deliberately NOT in alphabetical order: the sort is under test. */
const URGENT = { id: 'u', name: 'Urgent', color: 2 }
const BILLING = { id: 'b', name: 'Billing', color: 7 }
const ARCHIVED = { id: 'a', name: 'Archived', color: 0 }

const OPTIONS = toRelationOptions([URGENT, BILLING, ARCHIVED])

describe('toRelationIds', () => {
  it('keeps a list of usable ids, in order', () => {
    expect(toRelationIds(['b', 'u'])).toEqual(['b', 'u'])
    expect(toRelationIds([3, 1])).toEqual([3, 1])
  })

  it('reads a bare id as a one-element list', () => {
    expect(toRelationIds('b')).toEqual(['b'])
    expect(toRelationIds(7)).toEqual([7])
  })

  // The same tag as 3 and as '3' is one tag: two chips for it would let the
  // user "remove" it and watch it stay.
  it('deduplicates on the string form', () => {
    expect(toRelationIds(['b', 'b'])).toEqual(['b'])
    expect(toRelationIds([3, '3'])).toEqual([3])
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['the empty string', ''],
    ['an object', {}],
    ['a boolean', true],
    ['NaN', Number.NaN],
  ])('empties %s to an empty list', (_label, value) => {
    expect(toRelationIds(value)).toEqual([])
  })

  it('drops the unusable entries of a list rather than the whole list', () => {
    expect(toRelationIds(['b', null, '', undefined, {}, Number.NaN, 'u'])).toEqual(['b', 'u'])
  })
})

describe('toRelationValues', () => {
  // The invariant every list-valued widget holds: empty is [], never null.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
    ['a boolean', true],
  ])('turns %s into an empty list, never null', (_label, value) => {
    expect(toRelationValues(value)).toEqual([])
  })

  // <MultiSelect> emits the list, but a caller holding a single id means a
  // one-element selection -- not an empty one.
  it('reads a bare usable id as a one-element list', () => {
    expect(toRelationValues('b')).toEqual(['b'])
  })

  it('returns a fresh array, so the form does not share the control’s', () => {
    const source = ['b', 'u']
    expect(toRelationValues(source)).not.toBe(source)
  })
})

describe('relationRecordsFor', () => {
  it('returns the records matching the ids', () => {
    expect(relationRecordsFor(['b'], [URGENT, BILLING])).toEqual([BILLING])
  })

  it('compares on the string form: the draft may hold a numeric id as a string', () => {
    expect(relationRecordsFor(['3'], [{ id: 3, name: 'Three' }])).toEqual([{ id: 3, name: 'Three' }])
  })

  // A stale `options.records` -- the parent loaded another contact -- must not
  // label ids it does not describe.
  it('drops the records matching no id', () => {
    expect(relationRecordsFor(['b'], [URGENT])).toEqual([])
  })

  it.each([
    ['no records', ['b'], null],
    ['no ids', [], [URGENT]],
  ])('returns an empty list with %s', (_label, ids, records) => {
    expect(relationRecordsFor(ids as string[], records)).toEqual([])
  })
})

describe('withSelectedRecords', () => {
  it('leaves the entries alone when every record is already one', () => {
    expect(withSelectedRecords(OPTIONS, [BILLING])).toEqual(OPTIONS)
  })

  // Before the first open there are no fetched entries at all: these records
  // are the only thing that can paint a chip.
  it('is the whole list when nothing has been fetched', () => {
    expect(withSelectedRecords([], [BILLING, URGENT]).map((option) => option.label)).toEqual([
      'Billing',
      'Urgent',
    ])
  })

  it('forces a missing record in, and re-sorts the whole list', () => {
    const narrowed = toRelationOptions([URGENT])
    expect(withSelectedRecords(narrowed, [ARCHIVED]).map((option) => option.label)).toEqual([
      'Archived',
      'Urgent',
    ])
  })

  it('lets a fetched entry win over the record the resource nested', () => {
    const fetched = toRelationOptions([{ id: 'b', name: 'Billing (renamed)', color: 7 }])
    expect(withSelectedRecords(fetched, [BILLING]).map((option) => option.label)).toEqual([
      'Billing (renamed)',
    ])
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty list', []],
  ])('returns the entries unchanged when the records are %s', (_label, records) => {
    expect(withSelectedRecords(OPTIONS, records)).toEqual(OPTIONS)
  })

  it('does not mutate the entries it was given', () => {
    const before = [...OPTIONS]
    withSelectedRecords(OPTIONS, [{ id: 'z', name: 'Zeta' }])
    expect(OPTIONS).toEqual(before)
  })
})

describe('selectedRelationOptions', () => {
  it('paints the ids in the order they are held, not in the entries’ order', () => {
    expect(selectedRelationOptions(['u', 'a'], OPTIONS).map((option) => option.label)).toEqual([
      'Urgent',
      'Archived',
    ])
  })

  it('carries the colour through, so a chip is painted from the record', () => {
    expect(selectedRelationOptions(['b'], OPTIONS)[0].color).toBe(7)
  })

  it('skips an id no entry describes', () => {
    expect(selectedRelationOptions(['b', 'gone'], OPTIONS).map((option) => option.label)).toEqual([
      'Billing',
    ])
  })

  it('returns an empty list for no ids', () => {
    expect(selectedRelationOptions([], OPTIONS)).toEqual([])
  })
})

describe('unresolvedRelationIds', () => {
  // The counterpart of the skip above: an id the form cannot name must still be
  // visible, or saving would drop a tag the user never saw.
  it('reports the ids no entry describes', () => {
    expect(unresolvedRelationIds(['b', 'gone'], OPTIONS)).toEqual(['gone'])
  })

  it('reports nothing when every id is described', () => {
    expect(unresolvedRelationIds(['b', 'u'], OPTIONS)).toEqual([])
  })

  it('matches on the string form, like everything else here', () => {
    const options = toRelationOptions([{ id: 3, name: 'Three' }])
    expect(unresolvedRelationIds(['3'], options)).toEqual([])
  })
})
