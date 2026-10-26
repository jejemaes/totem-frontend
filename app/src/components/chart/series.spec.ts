import { describe, expect, it } from 'vitest'

import type { ChartFieldDeclaration } from './fields/types'
import { buildChartData, hasNegativeValue, styleChartData, type ChartData } from './series'

const CATEGORY: ChartFieldDeclaration = {
  name: 'category',
  kind: 'dimension',
  widget: 'many2one',
  label: 'Category',
  sortable: true,
}
const AMOUNT: ChartFieldDeclaration = {
  name: 'amount_sum',
  kind: 'measure',
  widget: 'float',
  label: 'Total',
  sortable: true,
}
const CREDIT: ChartFieldDeclaration = { ...AMOUNT, name: 'credit_sum', label: 'Credits' }

const GROUPS = [
  { category: { id: 'c1', name: 'Rent' }, amount_sum: '-160.00', credit_sum: null },
  { category: null, amount_sum: '190.00', credit_sum: '190.00' },
]

describe('buildChartData', () => {
  it('draws one label per group and one dataset per measure, in the order given', () => {
    expect(buildChartData(GROUPS, [CATEGORY], [AMOUNT, CREDIT])).toEqual({
      labels: ['Rent', 'None'],
      datasets: [
        { label: 'Total', data: [-160, 190] },
        { label: 'Credits', data: [null, 190] },
      ],
    })
  })

  it('reads a measure missing from a group as a gap', () => {
    expect(buildChartData([{ category: null }], [CATEGORY], [AMOUNT]).datasets[0].data).toEqual([
      null,
    ])
  })
})

describe('styleChartData', () => {
  const data: ChartData = {
    labels: ['a', 'b', 'c'],
    datasets: [
      { label: 'x', data: [1, 2, 3] },
      { label: 'y', data: [4, 5, 6] },
    ],
  }
  const colors = { palette: ['green', 'blue'], surface: 'white' }

  it('colours a bar per dataset', () => {
    const styled = styleChartData(data, 'bar', colors)
    expect(styled.datasets.map((dataset) => dataset.backgroundColor)).toEqual(['green', 'blue'])
  })

  it('colours a pie per slice, cycling, and the same on every ring', () => {
    const styled = styleChartData(data, 'pie', colors)
    for (const dataset of styled.datasets) {
      expect(dataset.backgroundColor).toEqual(['green', 'blue', 'green'])
      expect(dataset.borderColor).toBe('white')
    }
  })

  it('does not touch the input', () => {
    styleChartData(data, 'line', colors)
    expect(data.datasets[0]).toEqual({ label: 'x', data: [1, 2, 3] })
  })
})

describe('hasNegativeValue', () => {
  it('spots a negative total, and ignores gaps', () => {
    expect(hasNegativeValue({ labels: [], datasets: [{ label: 'x', data: [null, 0, 2] }] })).toBe(
      false,
    )
    expect(hasNegativeValue({ labels: [], datasets: [{ label: 'x', data: [null, -1] }] })).toBe(true)
  })
})
