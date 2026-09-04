import { describe, expect, it } from 'vitest'

import {
  displayRelation,
  relationColor,
  relationRecordFor,
  toRelationOptions,
  toRelationValue,
  withSelectedRecord,
  type RelationRecord,
} from './many2one'

const BE: RelationRecord = { id: 'BE', name: 'Belgium' }
const FR: RelationRecord = { id: 'FR', name: 'France' }

describe('displayRelation', () => {
  it('prefers the name', () => {
    expect(displayRelation(BE)).toBe('Belgium')
  })

  it('trims it', () => {
    expect(displayRelation({ id: 'BE', name: '  Belgium  ' })).toBe('Belgium')
  })

  it('accepts a numeric name', () => {
    expect(displayRelation({ id: 7, name: 2024 })).toBe('2024')
  })

  it.each([
    ['absent', {}],
    ['null', { name: null }],
    ['blank', { name: '   ' }],
    ['not a string', { name: { fr: 'Belgique' } }],
  ])('falls back to the id when the name is %s', (_case, extra) => {
    expect(displayRelation({ id: 'BE', ...extra })).toBe('BE')
  })
})

describe('relationColor', () => {
  it('reads an integer index', () => {
    expect(relationColor({ id: 'x', color: 0 })).toBe(0)
    expect(relationColor({ id: 'x', color: 12 })).toBe(12)
  })

  it.each([
    ['absent', {}],
    ['null', { color: null }],
    ['a string', { color: '12' }],
    ['fractional', { color: 1.5 }],
    ['NaN', { color: Number.NaN }],
  ])('is null when the colour is %s', (_case, extra) => {
    expect(relationColor({ id: 'x', ...extra })).toBeNull()
  })
})

describe('toRelationOptions', () => {
  it('is empty without records', () => {
    expect(toRelationOptions(undefined)).toEqual([])
    expect(toRelationOptions([])).toEqual([])
  })

  it('sorts by label, not by the order received', () => {
    expect(toRelationOptions([FR, BE]).map((option) => option.value)).toEqual(['BE', 'FR'])
  })

  it('deduplicates by id', () => {
    expect(toRelationOptions([BE, { id: 'BE', name: 'Belgique' }])).toHaveLength(1)
  })

  it('drops a record with no usable id', () => {
    expect(toRelationOptions([{ name: 'Nowhere' } as unknown as RelationRecord])).toEqual([])
  })

  it('honours a custom display', () => {
    const options = toRelationOptions([BE], (record) => `${String(record.name)} (${record.id})`)
    expect(options[0].label).toBe('Belgium (BE)')
  })

  it('puts every scalar in `search`, so a code still matches locally', () => {
    const [option] = toRelationOptions([{ id: 'IE', name: 'Ireland' }])
    expect(option.search).toContain('IE')
    expect(option.search).toContain('Ireland')
  })

  it('keeps the colour index out of `search`', () => {
    const [option] = toRelationOptions([{ id: 't1', name: 'Urgent', color: 12 }])
    expect(option.color).toBe(12)
    expect(option.search).not.toContain('12')
  })
})

describe('withSelectedRecord', () => {
  const options = toRelationOptions([FR])

  it('is a no-op without a record', () => {
    expect(withSelectedRecord(options, null)).toEqual(options)
  })

  it('adds the selected record the search did not return', () => {
    expect(withSelectedRecord(options, BE).map((option) => option.value)).toEqual(['BE', 'FR'])
  })

  it('does not duplicate a record the search did return', () => {
    expect(withSelectedRecord(options, FR)).toHaveLength(1)
  })
})

describe('relationRecordFor', () => {
  it('returns the record when it describes the value', () => {
    expect(relationRecordFor('BE', BE)).toBe(BE)
  })

  it('compares on the string form, so a numeric id travelling as text matches', () => {
    const tag = { id: 3, name: 'Urgent' }
    expect(relationRecordFor('3', tag)).toBe(tag)
  })

  it('returns null for a stale record', () => {
    expect(relationRecordFor('FR', BE)).toBeNull()
  })

  it.each([null, ''])('returns null for the empty value %p', (value) => {
    expect(relationRecordFor(value, BE)).toBeNull()
  })
})

describe('toRelationValue', () => {
  it('keeps a non-empty id', () => {
    expect(toRelationValue('BE')).toBe('BE')
    expect(toRelationValue(3)).toBe(3)
  })

  it.each([null, undefined, '', Number.NaN, false, {}])('empties %p to null', (next) => {
    expect(toRelationValue(next)).toBeNull()
  })
})
