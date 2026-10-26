import { describe, expect, it } from 'vitest'

import {
  dimensionLabel,
  EMPTY_LABEL,
  fieldLabel,
  formatPeriod,
  groupLabel,
  isoWeek,
  measureValue,
} from './labels'
import type { ChartFieldDeclaration } from './types'

// A fixed locale: the default one is the machine's.
const LOCALE = 'en-US'

describe('isoWeek', () => {
  it.each([
    ['2026-01-05', 2, 2026],
    // The Monday of week 1 of 2026 is still in 2025.
    ['2025-12-29', 1, 2026],
    // 2020 has a week 53, whose Monday is in December.
    ['2020-12-28', 53, 2020],
    ['2026-09-14', 38, 2026],
  ])('%s is week %i of %i', (day, week, year) => {
    const [y, m, d] = day.split('-').map(Number)
    expect(isoWeek(new Date(y, m - 1, d))).toEqual({ week, year })
  })
})

describe('formatPeriod', () => {
  it.each([
    ['day', '2026-09-14', '9/14/2026'],
    ['week', '2026-09-14', 'W38 2026'],
    ['month', '2026-09-01', 'Sep 2026'],
    ['quarter', '2026-07-01', 'Q3 2026'],
    ['quarter', '2026-12-01', 'Q4 2026'],
    ['year', '2026-01-01', '2026'],
  ] as const)('a %s reads %s as %s', (period, value, expected) => {
    expect(formatPeriod(value, period, LOCALE)).toBe(expected)
  })

  it('keeps the calendar day: the 1st of a month is not the last day of the one before', () => {
    expect(formatPeriod('2026-10-01', 'month', LOCALE)).toBe('Oct 2026')
  })

  it.each([null, '', 'not a date', '2026-02-30', 42])('answers null for %j', (value) => {
    expect(formatPeriod(value, 'month', LOCALE)).toBeNull()
  })
})

describe('fieldLabel', () => {
  it('names the period of a truncated date', () => {
    expect(fieldLabel('Date', 'date', { period: 'day' })).toBe('Date (Day)')
    expect(fieldLabel('Due date', 'date', { period: 'quarter' })).toBe('Due date (Quarter)')
  })

  it('leaves every other field as labelled', () => {
    expect(fieldLabel('Date', 'date')).toBe('Date')
    expect(fieldLabel('Category', 'many2one')).toBe('Category')
    // A period on anything but a date means nothing.
    expect(fieldLabel('Count', 'integer', { period: 'month' })).toBe('Count')
  })
})

describe('dimensionLabel', () => {
  it('labels a nested relation through its display', () => {
    expect(dimensionLabel({ id: 'c1', name: 'Rent', color: 3 }, 'many2one')).toBe('Rent')
  })

  it('uses the field-level relationDisplay when given', () => {
    const options = { relationDisplay: (record: { id: string | number }) => `#${record.id}` }
    expect(dimensionLabel({ id: 'c1', name: 'Rent' }, 'many2one', options)).toBe('#c1')
  })

  it.each([
    [null, 'many2one'],
    [undefined, 'string'],
    ['', 'string'],
    [null, 'date'],
    [null, 'boolean'],
    [null, 'integer'],
  ] as const)('labels an empty %j %s as EMPTY_LABEL, never drops it', (value, widget) => {
    expect(dimensionLabel(value, widget)).toBe(EMPTY_LABEL)
  })

  it('shows false and 0 as values, not as empty', () => {
    expect(dimensionLabel(false, 'boolean')).toBe('No')
    expect(dimensionLabel(true, 'boolean')).toBe('Yes')
    expect(dimensionLabel(0, 'integer', undefined, LOCALE)).toBe('0')
  })

  it('formats a date by its period, or as a day without one', () => {
    expect(dimensionLabel('2026-09-01', 'date', { period: 'month' }, LOCALE)).toBe('Sep 2026')
    expect(dimensionLabel('2026-09-01', 'date', undefined, LOCALE)).toBe('9/1/2026')
  })

  it('labels a selection by its choice, and an unknown value raw', () => {
    const options = { choices: [{ value: 'debit', label: 'Debit' }] }
    expect(dimensionLabel('debit', 'selection', options)).toBe('Debit')
    expect(dimensionLabel('other', 'selection', options)).toBe('other')
  })
})

describe('groupLabel', () => {
  const dimensions: ChartFieldDeclaration[] = [
    { name: 'category', kind: 'dimension', widget: 'many2one', label: 'Category', sortable: true },
    {
      name: 'date_month',
      kind: 'dimension',
      widget: 'date',
      label: 'Month',
      options: { period: 'month' },
      sortable: true,
    },
  ]

  it('joins every dimension, in the order picked', () => {
    const group = { category: { id: 'c1', name: 'Rent' }, date_month: '2026-09-01', count: 2 }
    expect(groupLabel(group, dimensions, LOCALE)).toBe('Rent / Sep 2026')
    expect(groupLabel(group, [...dimensions].reverse(), LOCALE)).toBe('Sep 2026 / Rent')
  })

  it('keeps the group with no category', () => {
    expect(groupLabel({ category: null, date_month: '2026-09-01' }, dimensions, LOCALE)).toBe(
      `${EMPTY_LABEL} / Sep 2026`,
    )
  })
})

describe('measureValue', () => {
  it('reads a decimal string as a number', () => {
    expect(measureValue('-40.00')).toBe(-40)
    expect(measureValue(86.67)).toBe(86.67)
  })

  it('keeps null as null -- a sum over nothing is not zero', () => {
    expect(measureValue(null)).toBeNull()
    expect(measureValue(undefined)).toBeNull()
    expect(measureValue(0)).toBe(0)
  })
})
