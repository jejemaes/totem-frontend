import { effectScope } from 'vue'
import { describe, expect, it } from 'vitest'

import type { FilterFields } from '@/components/list/filters'

import { useFilter, type RecordFilters } from './useFilter'

const FIELDS: FilterFields = {
  search: { type: 'string', label: 'Search' },
  login: { type: 'string', label: 'Login' },
  is_active: { type: 'boolean', label: 'Active' },
}

/**
 * Runs the composable in a bare scope -- no component, no router, hence
 * `syncUrl: false`. The restore itself is pure and tested in
 * components/list/filters.spec.ts.
 */
function mount(): RecordFilters<Record<string, string | number | boolean | null>> {
  const scope = effectScope()
  let filter!: RecordFilters<Record<string, string | number | boolean | null>>
  scope.run(() => {
    filter = useFilter(FIELDS, { syncUrl: false })
  })
  return filter
}

describe('useFilter', () => {
  it('starts with every declared key present and unset', () => {
    const { filters } = mount()
    expect(filters).toEqual({ search: null, login: null, is_active: null })
  })

  it('setFilters clears what the caller left out', () => {
    const { filters, setFilters } = mount()
    setFilters({ login: 'ada', is_active: true })
    expect(filters).toEqual({ search: null, login: 'ada', is_active: true })

    setFilters({ login: 'ada' })
    expect(filters.is_active).toBeNull()
  })

  it('setFilters keeps the keys it clears, so the URL can drop them', () => {
    const { filters, setFilters } = mount()
    setFilters({})
    expect(Object.keys(filters)).toEqual(['search', 'login', 'is_active'])
  })

  it('updateFilters leaves every other filter alone', () => {
    const { filters, setFilters, updateFilters } = mount()
    setFilters({ login: 'ada', is_active: true })
    updateFilters({ search: 'jane' })
    expect(filters).toEqual({ search: 'jane', login: 'ada', is_active: true })
  })

  it('updateFilters normalises what it is given', () => {
    const { filters, updateFilters } = mount()
    updateFilters({ is_active: 'false', login: '  ada  ' })
    expect(filters.is_active).toBe(false)
    expect(filters.login).toBe('ada')
  })

  it('ignores a key the screen never declared', () => {
    const { filters, updateFilters } = mount()
    updateFilters({ is_superuser: true })
    expect(filters.is_superuser).toBeUndefined()
  })

  it('counts the active filters, search excluded', () => {
    const { setFilters, activeFilters } = mount()
    setFilters({ search: 'jane' })
    expect(activeFilters.value).toEqual([])

    // `false` is a filter: the list shows inactive accounts only.
    setFilters({ search: 'jane', is_active: false })
    expect(activeFilters.value).toEqual([
      { name: 'is_active', label: 'Active', value: false, display: 'No' },
    ])
  })

  it('recomputes the active filters when a value changes', () => {
    const { updateFilters, activeFilters } = mount()
    updateFilters({ login: 'ada' })
    expect(activeFilters.value).toHaveLength(1)
    updateFilters({ login: '' })
    expect(activeFilters.value).toHaveLength(0)
  })
})
