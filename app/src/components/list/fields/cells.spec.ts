import { describe, expect, it } from 'vitest'

import {
  colorIndex,
  formatDate,
  formatDateTime,
  formatNumber,
  formatText,
  isBlankCell,
  relationLabel,
  relationOf,
  relationsOf,
  selectionLabel,
  toBooleanCell,
} from './cells'

describe('isBlankCell', () => {
  it.each([null, undefined, '', '   ', []])('reads %j as empty', (value) => {
    expect(isBlankCell(value)).toBe(true)
  })

  it.each([false, 0, 'x', ['a']])('reads %j as a value to show', (value) => {
    expect(isBlankCell(value)).toBe(false)
  })
})

describe('formatText', () => {
  it('shows strings and finite numbers, 0 included', () => {
    expect(formatText('BANK')).toBe('BANK')
    expect(formatText(0)).toBe('0')
  })

  it.each([null, undefined, '', NaN, { id: 1 }])('is empty for %j', (value) => {
    expect(formatText(value)).toBeNull()
  })
})

describe('formatNumber', () => {
  it('reads a decimal sent as a string', () => {
    expect(formatNumber('1234.5', {}, 'en-US')).toBe('1,234.5')
  })

  it('shows 0, which is a value', () => {
    expect(formatNumber(0, {}, 'en-US')).toBe('0')
  })

  it('rounds an integer column and honours maxFractionDigits', () => {
    expect(formatNumber(2.6, { integer: true }, 'en-US')).toBe('3')
    expect(formatNumber(1.23456, { maxFractionDigits: 3 }, 'en-US')).toBe('1.235')
  })

  it.each([null, undefined, '', 'abc', true])('is empty for %j', (value) => {
    expect(formatNumber(value, {}, 'en-US')).toBeNull()
  })
})

describe('toBooleanCell', () => {
  it('keeps three states', () => {
    expect(toBooleanCell(true)).toBe(true)
    expect(toBooleanCell(false)).toBe(false)
    expect(toBooleanCell(null)).toBeNull()
    expect(toBooleanCell(undefined)).toBeNull()
    expect(toBooleanCell('false')).toBeNull()
  })
})

describe('formatDate', () => {
  it('keeps a calendar day on its day', () => {
    expect(formatDate('2024-03-31', 'en-US')).toBe('3/31/2024')
  })

  it.each([null, undefined, '', '2023-02-30', 'nope'])('is empty for %j', (value) => {
    expect(formatDate(value, 'en-US')).toBeNull()
  })
})

describe('formatDateTime', () => {
  it('formats an instant', () => {
    expect(formatDateTime('2024-03-31T10:00:00Z', 'en-US')).toMatch(/3\/31\/24|4\/1\/24/)
  })

  it('refuses a bare day', () => {
    expect(formatDateTime('2024-03-31', 'en-US')).toBeNull()
  })
})

describe('selectionLabel', () => {
  const choices = [{ value: 'draft', label: 'Draft' }, { value: 0, label: 'Zero' }]

  it('labels a known value, 0 included', () => {
    expect(selectionLabel('draft', choices)).toBe('Draft')
    expect(selectionLabel(0, choices)).toBe('Zero')
  })

  it('shows an unknown value raw rather than blanking the row', () => {
    expect(selectionLabel('archived', choices)).toBe('archived')
  })

  it('is empty for null', () => {
    expect(selectionLabel(null, choices)).toBeNull()
  })
})

describe('relations', () => {
  it('reads a nested record and wraps a bare id', () => {
    expect(relationOf({ id: 'BE', name: 'Belgium' })).toEqual({ id: 'BE', name: 'Belgium' })
    expect(relationOf('BE')).toEqual({ id: 'BE' })
    expect(relationOf(3)).toEqual({ id: 3 })
  })

  it.each([null, undefined, '', {}, { name: 'no id' }, []])('is empty for %j', (value) => {
    expect(relationOf(value)).toBeNull()
  })

  it('keeps the usable entries of a list', () => {
    expect(relationsOf([{ id: 1, name: 'A' }, null, 'b'])).toEqual([{ id: 1, name: 'A' }, { id: 'b' }])
    expect(relationsOf(null)).toEqual([])
  })

  it('labels through the column display when given', () => {
    expect(relationLabel({ id: 1, name: 'A' })).toBe('A')
    expect(relationLabel({ id: 1, code: 'X' }, { relationDisplay: (r) => String(r.code) })).toBe('X')
  })
})

describe('colorIndex', () => {
  it('accepts an integer index, 0 included, and nothing else', () => {
    expect(colorIndex(0)).toBe(0)
    expect(colorIndex(3.5)).toBeNull()
    expect(colorIndex('3')).toBeNull()
  })
})
