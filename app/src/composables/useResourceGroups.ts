/**
 * Server-side group-by state for a chart: `useResourceList`'s counterpart, for
 * a `POST .../group-by/` instead of a page of rows.
 *
 * NOTE: like `useResourceList`, every piece of state lives INSIDE the
 * function -- do not hoist any ref to module scope.
 *
 * The composable never imports a `resources/` module: it receives
 * `fetchGroups`. Same reason as the list: resource-agnostic, and testable with
 * a fake fetcher in a bare effect scope.
 *
 * --- The URL, and why only the filters ---
 *
 * A chart and a list of the same records share a query string: the page shows
 * one or the other (`?view_type=`), and switching must keep the filters. So
 * with `syncUrl`, this writes the filter keys exactly as `useResourceList`
 * does -- same names, same normalisation -- and leaves every other key alone:
 * `view_type`, which the page owns, and the list's `page` / `ordering`, which
 * mean nothing here but must still be there when the user switches back.
 *
 * The dimensions, measures and type are NOT in the URL: they are a per-user
 * preference (localStorage, see components/chart/prefs.ts), the way a list's
 * columns are.
 *
 * Only one view is mounted at a time, so there is still a single writer.
 */

import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { Group, GroupPage, GroupQuery } from '@/api/groupBy'
import { normaliseFilters, type ListFilters } from '@/api/list'

export type GroupFetcher<F extends ListFilters> = (
  query: GroupQuery<F>,
  signal: AbortSignal,
) => Promise<GroupPage>

/** What the chart asks for, besides the filters. */
export interface GroupSelection {
  dimensions: readonly string[]
  measures: readonly string[]
  ordering: string | null
}

export interface UseResourceGroupsOptions<F extends ListFilters> {
  fetchGroups: GroupFetcher<F>
  /** Reactive filters merged into every query, from useFilter. Debounced. */
  filters?: F
  /**
   * The dimensions, measures and ordering, read reactively. A change fetches at
   * once: it is one deliberate pick in a dropdown, and the race ticket
   * discards whatever a quick succession of them supersedes.
   */
  selection: () => GroupSelection
  debounceMs?: number
  /** Mirror the filters in the query string. Needs a router. */
  syncUrl?: boolean
  /** Fetch at creation. Defaults to true; see useResourceList's own option. */
  immediate?: boolean
}

export interface ResourceGroups {
  /** shallow: replaced wholesale, never mutated in place. */
  groups: ShallowRef<Group[]>
  /**
   * The selection `groups` answers -- NOT the current one, which runs ahead of
   * it while a request is in flight. Labels and datasets are built from this,
   * or a measure just picked would draw as an empty series over the old groups.
   */
  shown: ShallowRef<GroupSelection | null>
  /** The number of groups over every page: more than `groups` when capped. */
  total: Ref<number>
  loading: Ref<boolean>
  error: Ref<string | null>
  /** True until the first response settles. */
  isInitialLoad: ComputedRef<boolean>
  reload(): Promise<void>
}

export function useResourceGroups<F extends ListFilters>(
  options: UseResourceGroupsOptions<F>,
): ResourceGroups {
  const filters = (options.filters ?? ({} as F)) as F
  const filterKeys = Object.keys(filters)
  const debounceMs = options.debounceMs ?? 300

  const route = options.syncUrl ? useRoute() : null
  const router = options.syncUrl ? useRouter() : null

  const groups = shallowRef<Group[]>([])
  const shown = shallowRef<GroupSelection | null>(null)
  const total = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const settled = ref(false)

  const isInitialLoad = computed(() => !settled.value)

  // The race-ticket idiom of useResourceList: an older response landing last
  // would draw the previous measure under the new legend.
  let seq = 0
  let inFlight: AbortController | undefined
  let started = false

  async function load(): Promise<void> {
    started = true
    const ticket = ++seq
    inFlight?.abort()
    const controller = (inFlight = new AbortController())

    loading.value = true
    error.value = null

    try {
      const selection = options.selection()
      const page = await options.fetchGroups(
        {
          dimensions: selection.dimensions,
          measures: selection.measures,
          ordering: selection.ordering,
          filters,
        },
        controller.signal,
      )
      if (ticket !== seq) return
      groups.value = page.results
      shown.value = selection
      total.value = page.count
    } catch (caught) {
      // An abort we caused is not an error to show.
      if (ticket !== seq || controller.signal.aborted) return
      error.value = caught instanceof Error ? caught.message : 'The chart could not be loaded.'
      groups.value = []
      shown.value = null
      total.value = 0
    } finally {
      if (ticket === seq) {
        loading.value = false
        settled.value = true
      }
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined

  // The NORMALISED filters, as the list watches them: a trailing space is no
  // new query.
  watch(
    () => JSON.stringify(normaliseFilters(filters)),
    () => {
      clearTimeout(timer)
      timer = setTimeout(() => void load(), debounceMs)
    },
  )

  watch(
    () => JSON.stringify(options.selection()),
    () => {
      // Until the first load, a change is the query being assembled.
      if (started) void load()
    },
  )

  // ---------------------------------------------------------------- URL sync

  /** The subset of the query string this chart owns: the filters, and only them. */
  function ownedQuery(): Record<string, string> {
    return normaliseFilters(filters)
  }

  if (route && router) {
    watch(
      () => JSON.stringify(ownedQuery()),
      () => {
        const rest: Record<string, string | null | (string | null)[]> = {}
        for (const [key, value] of Object.entries(route.query)) {
          if (!filterKeys.includes(key)) rest[key] = value
        }
        // `replace`, never `push`, as the list does.
        void router.replace({ query: { ...rest, ...ownedQuery() } }).catch(() => {})
      },
      { immediate: true },
    )

    // Back / Forward, or a link to this very page with other filters. The same
    // echo guard as the list: a URL already saying what we hold is our own write.
    watch(
      () => route.query,
      (incoming) => {
        const mine = ownedQuery()
        const same = filterKeys.every((key) => (mine[key] ?? '') === String(incoming[key] ?? ''))
        if (same) return
        for (const key of filterKeys) {
          const value = incoming[key]
          // Raw strings, as useResourceList restores them: every consumer parses.
          ;(filters as ListFilters)[key] = typeof value === 'string' ? value : null
        }
      },
    )
  }

  onScopeDispose(() => {
    clearTimeout(timer)
    inFlight?.abort()
  }, true)

  if (options.immediate ?? true) void load()

  return { groups, shown, total, loading, error, isInitialLoad, reload: load }
}
