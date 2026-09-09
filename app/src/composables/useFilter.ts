/**
 * The filter set of a list screen: its values, its restore from the URL, and
 * the two ways a screen changes it.
 *
 * NOTE: like `useResourceList` and unlike `useTheme`, every piece of state
 * lives INSIDE the function -- do not hoist any ref to module scope.
 *
 * The composable never imports a `resources/` module: it is handed a dict of
 * declared filters, and the dict's keys ARE the query parameter names. That is
 * what keeps it resource-agnostic, and what makes a URL a faithful description
 * of the request that was made.
 *
 * --- Who writes the URL, and why it is not this one ---
 *
 * This composable READS the query string and never writes it. `useResourceList`
 * writes it, because page, page size, ordering and the filters share one query
 * string and must be replaced in one `router.replace` -- two writers would each
 * preserve a stale copy of the other's keys, and a filter change would land in
 * the URL before the page reset that goes with it. So a screen wires the two
 * together:
 *
 *     const { filters, setFilters, updateFilters, activeFilters } = useFilter(FIELDS)
 *     const list = useResourceList({ fetchPage, filters, syncUrl: true, ... })
 *
 * `useResourceList` then hydrates those very keys from the same query string a
 * moment later, and it restores them as RAW STRINGS. That redundancy is
 * deliberate, not an oversight: every consumer of a filter value parses it (see
 * filters.ts), so the typed value produced here and the string produced there
 * are interchangeable. What the read below buys is a filter set that is already
 * correct before any list exists -- which is what makes this composable usable,
 * and testable, on its own.
 */

import { computed, reactive, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'

import type { ListFilters } from '@/api/list'
import type { FieldValue } from '@/components/form/fields/types'
import {
  activeFilterEntries,
  blankFilters,
  DEFAULT_SEARCH_KEY,
  filtersFromQuery,
  parseFilterValue,
  type ActiveFilter,
  type FilterFields,
  type FilterValues,
} from '@/components/list/filters'

export interface UseFilterOptions {
  /**
   * The field bound to the toolbar's search box. Excluded from
   * `activeFilters`, and so from the button's badge: it is already on screen.
   */
  searchKey?: string
  /** Restore from the current route's query string. Needs a router. */
  syncUrl?: boolean
}

export interface RecordFilters<F extends ListFilters> {
  /**
   * The live filter values, ready to hand to `useResourceList`. Reactive, and
   * every declared key is present -- see blankFilters for why that matters.
   */
  filters: F
  /**
   * "These are the filters now": every declared key absent from `values` is
   * cleared. What the dialog's Apply calls, so that emptying a control in the
   * form actually drops the filter.
   */
  setFilters(values: Record<string, FieldValue | undefined>): void
  /**
   * Merge a subset, leaving every other filter alone. What the search box
   * calls on each keystroke.
   */
  updateFilters(patch: Record<string, FieldValue | undefined>): void
  /** The filters doing something, search excluded. The badge counts these. */
  activeFilters: ComputedRef<ActiveFilter[]>
}

export function useFilter<F extends ListFilters = FilterValues>(
  fields: FilterFields,
  options: UseFilterOptions = {},
): RecordFilters<F> {
  const searchKey = options.searchKey ?? DEFAULT_SEARCH_KEY
  const route = options.syncUrl === false ? null : useRoute()

  const values = reactive<FilterValues>({
    ...blankFilters(fields),
    ...(route ? filtersFromQuery(fields, route.query) : {}),
  })

  function setFilters(next: Record<string, FieldValue | undefined>): void {
    // Assigned key by key rather than replacing the object: `useResourceList`
    // holds a reference to this very object, and a filter key it has already
    // claimed must keep existing even once it is cleared.
    for (const [name, field] of Object.entries(fields)) {
      values[name] = parseFilterValue(field, next[name])
    }
  }

  function updateFilters(patch: Record<string, FieldValue | undefined>): void {
    for (const [name, value] of Object.entries(patch)) {
      const field = fields[name]
      // An undeclared key is ignored, not stored: it would never reach the URL
      // (useResourceList reads the key list once) and would only be a filter
      // that silently does nothing.
      if (!field) continue
      values[name] = parseFilterValue(field, value)
    }
  }

  const activeFilters = computed(() => activeFilterEntries(fields, values, searchKey))

  return {
    /*
     * The one assertion in here, and it is the resource's own Filters type.
     * The dict is what actually guarantees the shape, and TypeScript cannot
     * check a record built from runtime keys against it -- exactly as
     * useResourceList casts to ListFilters to write a key it only knows by
     * name. Declaring a filter the endpoint does not accept is a 422 no
     * signature would have caught either.
     */
    filters: values as F,
    setFilters,
    updateFilters,
    activeFilters,
  }
}
