import { describe, expect, it } from 'vitest'

import { viewTypeFromQuery } from './viewSwitcher'

describe('viewTypeFromQuery', () => {
  it('reads the view asked for', () => {
    expect(viewTypeFromQuery({ view_type: 'chart' })).toBe('chart')
    expect(viewTypeFromQuery({ view_type: 'list', page: '2' })).toBe('list')
  })

  it.each([{}, { view_type: 'kanban' }, { view_type: null }, { view_type: '' }])(
    'falls back to the first view for %j',
    (query) => {
      expect(viewTypeFromQuery(query)).toBe('list')
    },
  )

  it('takes the first of a repeated key', () => {
    expect(viewTypeFromQuery({ view_type: ['chart', 'list'] })).toBe('chart')
  })

  it('never answers a view the page does not offer', () => {
    expect(viewTypeFromQuery({ view_type: 'chart' }, ['list'])).toBe('list')
  })
})
