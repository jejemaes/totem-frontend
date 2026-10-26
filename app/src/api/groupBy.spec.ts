import { describe, expect, it } from 'vitest'

import { groupByBody, MAX_GROUPS } from './groupBy'

describe('groupByBody', () => {
  it('names the body as the backend does, and asks for every group', () => {
    expect(
      groupByBody({
        dimensions: ['category', 'date_month'],
        measures: ['amount_sum'],
        ordering: '-amount_sum',
      }),
    ).toEqual({
      group_by_fields: ['category', 'date_month'],
      measures: ['amount_sum'],
      ordering: ['-amount_sum'],
      filters: {},
      limit: MAX_GROUPS,
    })
  })

  it('sends no ordering rather than a null one', () => {
    expect(groupByBody({ dimensions: ['a'], measures: ['b'], ordering: null }).ordering).toEqual([])
  })

  it('normalises the filters as a list query string does', () => {
    const body = groupByBody({
      dimensions: ['a'],
      measures: ['b'],
      filters: { search: '  ', direction: 'debit', active: false, category: null },
    })
    expect(body.filters).toEqual({ direction: 'debit', active: 'false' })
  })
})
