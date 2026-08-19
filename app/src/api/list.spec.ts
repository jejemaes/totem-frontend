import { describe, expect, it } from 'vitest'

import {
  listParams,
  MAX_PAGE_SIZE,
  normaliseFilters,
  orderingFrom,
  pageFromOffset,
  readListQuery,
} from './list'

describe('pageFromOffset', () => {
  it('turns a DataTable offset into a 1-based page', () => {
    expect(pageFromOffset(0, 10)).toBe(1)
    expect(pageFromOffset(10, 10)).toBe(2)
    expect(pageFromOffset(45, 10)).toBe(5)
  })

  it('never returns a page the API would reject', () => {
    expect(pageFromOffset(-5, 10)).toBe(1)
    expect(pageFromOffset(10, 0)).toBe(1)
  })
})

describe('orderingFrom', () => {
  it('prefixes descending with a dash', () => {
    expect(orderingFrom('login', 1)).toBe('login')
    expect(orderingFrom('login', -1)).toBe('-login')
  })

  it('returns null when nothing is sorted, so the param can be omitted', () => {
    expect(orderingFrom(null, 1)).toBeNull()
    expect(orderingFrom('', -1)).toBeNull()
  })
})

describe('normaliseFilters', () => {
  it('drops what must never be sent', () => {
    // `?login=` would filter on the empty string rather than not filtering.
    expect(normaliseFilters({ login: '', email: null, search: undefined })).toEqual({})
  })

  it('keeps false and 0, which are meaningful values', () => {
    expect(normaliseFilters({ is_active: false, count: 0 })).toEqual({
      is_active: 'false',
      count: '0',
    })
  })

  it('trims strings', () => {
    expect(normaliseFilters({ search: '  ad  ' })).toEqual({ search: 'ad' })
  })
})

describe('listParams', () => {
  const fields = ['id', 'login'] as const

  it('serialises the base query', () => {
    const params = listParams({ page: 2, pageSize: 10 }, fields)
    expect(params.get('page')).toBe('2')
    expect(params.get('page_size')).toBe('10')
    expect(params.get('fields')).toBe('id,login')
    expect(params.get('ordering')).toBeNull()
  })

  it('clamps page_size below the exclusiveMaximum of 200', () => {
    expect(listParams({ page: 1, pageSize: 200 }, fields).get('page_size')).toBe(
      String(MAX_PAGE_SIZE),
    )
    expect(listParams({ page: 1, pageSize: 5000 }, fields).get('page_size')).toBe(
      String(MAX_PAGE_SIZE),
    )
  })

  it('never sends a page below 1', () => {
    expect(listParams({ page: 0, pageSize: 10 }, fields).get('page')).toBe('1')
  })

  it('omits ordering when null and merges normalised filters', () => {
    const params = listParams(
      {
        page: 1,
        pageSize: 10,
        ordering: null,
        filters: { search: ' ad ', is_active: false, login: '' },
      },
      fields,
    )
    expect(params.get('ordering')).toBeNull()
    expect(params.get('search')).toBe('ad')
    expect(params.get('is_active')).toBe('false')
    expect(params.has('login')).toBe(false)
  })
})

describe('readListQuery', () => {
  const sortable = ['login', 'email'] as const

  it('restores page, size, ordering and filters', () => {
    expect(
      readListQuery({ page: '3', page_size: '20', ordering: '-email', search: 'ad' }, sortable),
    ).toEqual({
      page: 3,
      pageSize: 20,
      sortField: 'email',
      sortOrder: -1,
      filters: { search: 'ad' },
    })
  })

  it('falls back to sane defaults on an empty query', () => {
    expect(readListQuery({})).toEqual({
      page: 1,
      pageSize: undefined,
      sortField: null,
      sortOrder: 1,
      filters: {},
    })
  })

  it('ignores a sort on a column the backend does not accept', () => {
    // A stale link naming `roles` must not turn into a 422.
    expect(readListQuery({ ordering: 'roles' }, sortable).sortField).toBeNull()
  })

  it('clamps hostile values instead of forwarding them', () => {
    expect(readListQuery({ page: '-4' }).page).toBe(1)
    expect(readListQuery({ page: 'nope' }).page).toBe(1)
    expect(readListQuery({ page_size: '9999' }).pageSize).toBe(MAX_PAGE_SIZE)
    expect(readListQuery({ page_size: '0' }).pageSize).toBeUndefined()
  })

  it('takes the first value when a key is repeated', () => {
    expect(readListQuery({ search: ['a', 'b'] }).filters.search).toBe('a')
  })
})
