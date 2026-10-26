import { describe, expect, it } from 'vitest'

import type { ChartFieldDeclaration } from './fields/types'
import {
  chartPrefsKey,
  orderingOptions,
  parseChartPrefs,
  resolveChartPrefs,
  serialiseChartPrefs,
  type ChartPrefs,
} from './prefs'

function field(
  name: string,
  kind: ChartFieldDeclaration['kind'],
  sortable = true,
): ChartFieldDeclaration {
  return { name, kind, widget: kind === 'measure' ? 'float' : 'string', label: name, sortable }
}

const DECLARED: ChartFieldDeclaration[] = [
  field('category', 'dimension'),
  field('date_month', 'dimension'),
  field('date_year', 'dimension'),
  field('date_day', 'dimension', false),
  field('amount_sum', 'measure'),
  field('count', 'measure'),
  field('amount_share', 'measure', false),
]

const DEFAULTS = { dimensions: ['date_month'], measures: ['amount_sum'], type: 'bar' } as const

function defaults(): Omit<ChartPrefs, 'ordering'> {
  return { dimensions: [...DEFAULTS.dimensions], measures: [...DEFAULTS.measures], type: 'bar' }
}

describe('chartPrefsKey', () => {
  it('is namespaced apart from the lists', () => {
    expect(chartPrefsKey('account-movements')).toBe('totem.chart.account-movements')
  })
})

describe('parseChartPrefs', () => {
  it('reads what serialiseChartPrefs wrote', () => {
    const prefs: ChartPrefs = {
      dimensions: ['category'],
      measures: ['count', 'amount_sum'],
      type: 'pie',
      ordering: '-count',
    }
    expect(parseChartPrefs(serialiseChartPrefs(prefs))).toEqual(prefs)
  })

  it.each([
    null,
    '',
    'not json',
    '42',
    'null',
    '{"dimensions":"a","measures":[],"type":"bar","ordering":null}',
    '{"dimensions":[],"measures":[1],"type":"bar","ordering":null}',
    '{"dimensions":[],"measures":[],"type":"radar","ordering":null}',
    '{"dimensions":[],"measures":[],"type":"bar","ordering":3}',
  ])('answers null for %j rather than throwing', (raw) => {
    expect(parseChartPrefs(raw)).toBeNull()
  })
})

describe('resolveChartPrefs', () => {
  it('takes the defaults when nothing is stored', () => {
    expect(resolveChartPrefs(DECLARED, null, defaults())).toEqual({
      dimensions: ['date_month'],
      measures: ['amount_sum'],
      type: 'bar',
      ordering: null,
    })
  })

  it('keeps the stored ORDER: it is the order of the keys in each label', () => {
    const stored = { dimensions: ['date_year', 'category'], measures: ['count', 'amount_sum'] }
    const prefs = resolveChartPrefs(DECLARED, stored, defaults())
    expect(prefs.dimensions).toEqual(['date_year', 'category'])
    expect(prefs.measures).toEqual(['count', 'amount_sum'])
  })

  it('drops undeclared names and duplicates', () => {
    const stored = { dimensions: ['gone', 'category', 'category'], measures: ['amount', 'count'] }
    const prefs = resolveChartPrefs(DECLARED, stored, defaults())
    expect(prefs.dimensions).toEqual(['category'])
    expect(prefs.measures).toEqual(['count'])
  })

  it('caps the dimensions at what the backend accepts', () => {
    const stored = { dimensions: ['category', 'date_month', 'date_year', 'date_day'] }
    expect(resolveChartPrefs(DECLARED, stored, defaults()).dimensions).toEqual([
      'category',
      'date_month',
      'date_year',
    ])
  })

  it('falls back to the defaults, then to the first declared field, when a list ends empty', () => {
    expect(resolveChartPrefs(DECLARED, { dimensions: ['gone'] }, defaults()).dimensions).toEqual([
      'date_month',
    ])
    const broken = { dimensions: ['gone'], measures: ['gone'], type: 'bar' as const }
    const prefs = resolveChartPrefs(DECLARED, null, broken)
    expect(prefs.dimensions).toEqual(['category'])
    expect(prefs.measures).toEqual(['amount_sum'])
  })

  it('only keeps an allowed type', () => {
    expect(resolveChartPrefs(DECLARED, { type: 'pie' }, defaults(), ['bar', 'line']).type).toBe(
      'bar',
    )
    expect(resolveChartPrefs(DECLARED, { type: 'pie' }, defaults(), ['line']).type).toBe('line')
    expect(resolveChartPrefs(DECLARED, { type: 'line' }, defaults()).type).toBe('line')
  })

  it('keeps an ordering on a picked sortable field, in either direction', () => {
    const stored = { measures: ['amount_sum', 'count'], ordering: '-count' }
    expect(resolveChartPrefs(DECLARED, stored, defaults()).ordering).toBe('-count')
  })

  it.each([
    ['a name no longer picked -- the backend refuses it', '-count'],
    ['a field that is not sortable', 'amount_share'],
    ['an undeclared name', 'amount'],
  ])('clears an ordering on %s', (_, ordering) => {
    const stored = { measures: ['amount_sum', 'amount_share'], ordering }
    expect(resolveChartPrefs(DECLARED, stored, defaults()).ordering).toBeNull()
  })

  it('lets a stored null ordering override the default one', () => {
    const withOrdering = { ...defaults(), ordering: '-amount_sum' }
    expect(resolveChartPrefs(DECLARED, null, withOrdering).ordering).toBe('-amount_sum')
    expect(resolveChartPrefs(DECLARED, { ordering: null }, withOrdering).ordering).toBeNull()
  })
})

describe('orderingOptions', () => {
  it('offers the default, then each picked sortable field both ways', () => {
    const options = orderingOptions(DECLARED, {
      dimensions: ['date_day', 'category'],
      measures: ['amount_share', 'count'],
    })
    expect(options.map((option) => option.value)).toEqual([
      null,
      'category',
      '-category',
      'count',
      '-count',
    ])
  })
})
