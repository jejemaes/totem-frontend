/**
 * Server-side list state for a PrimeVue DataTable in `lazy` mode.
 *
 * NOTE: unlike `useTheme`, every piece of state lives INSIDE the function.
 * `useTheme` is a deliberate singleton; this one must give each list its own
 * state, so do not hoist any ref to module scope.
 *
 * The composable never imports a `resources/` module: it receives `fetchPage`.
 * That is what keeps it resource-agnostic and testable with a fake fetcher,
 * without mocking `fetch` or mounting a component.
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

import { ApiError } from '@/api/client'
import {
  listQueryKeys,
  normaliseFilters,
  orderingFrom,
  pageFromOffset,
  readListQuery,
  type ListFilters,
  type ListQuery,
  type Page,
  type QueryLike,
} from '@/api/list'

export type ListFetcher<T, F extends ListFilters> = (
  query: ListQuery<F>,
  signal: AbortSignal,
) => Promise<Page<T>>

export interface UseResourceListOptions<T, F extends ListFilters> {
  fetchPage: ListFetcher<T, F>
  /**
   * Reactive filters merged into every query. ANY change resets to page 1 --
   * a backend-imposed invariant: a page past the last one answers 404, not an
   * empty list. Must be a writable reactive object when `syncUrl` is on.
   */
  filters?: F
  /** Defaults to 20, the backend's own default. */
  pageSize?: number
  sortField?: string | null
  sortOrder?: 1 | -1
  /** Trailing debounce on filter changes only; paging and sorting fire at once. */
  debounceMs?: number
  /** Mirror page / sort / filters in the query string. Needs a router. */
  syncUrl?: boolean
  /** Sortable field whitelist, used to reject a stale or hand-edited URL. */
  sortable?: readonly string[]
}

export interface ResourceList<T> {
  /** shallow: rows are replaced wholesale, never mutated in place. */
  rows: ShallowRef<T[]>
  total: Ref<number>
  loading: Ref<boolean>
  error: Ref<string | null>
  first: Ref<number>
  pageSize: Ref<number>
  sortField: Ref<string | null>
  sortOrder: Ref<1 | -1>
  /** True until the first response settles: drives the skeleton rows. */
  isInitialLoad: ComputedRef<boolean>
  // Structural event types rather than PrimeVue's: its events are assignable to
  // these, and the composable stays importable without PrimeVue.
  onPage(event: { first: number; rows: number }): void
  onSort(event: { sortField?: unknown; sortOrder?: number | null }): void
  /** Same query again: the refresh button, or after a mutation. */
  reload(): Promise<void>
  /** Back to page 1 then reload: after creating a record. */
  reset(): Promise<void>
}

export function useResourceList<T, F extends ListFilters>(
  options: UseResourceListOptions<T, F>,
): ResourceList<T> {
  const filters = (options.filters ?? ({} as F)) as F
  const filterKeys = Object.keys(filters)
  const debounceMs = options.debounceMs ?? 300

  const route = options.syncUrl ? useRoute() : null
  const router = options.syncUrl ? useRouter() : null

  // Hydrate BEFORE any state exists, so the very first request already carries
  // the URL's state. Writing into the list afterwards would cost an extra
  // request and a debounce delay on first paint.
  const restored = route ? readListQuery(route.query, options.sortable) : null
  if (restored) {
    // Only keys the caller declared: a hostile URL must not inject filters.
    for (const key of filterKeys) {
      if (key in restored.filters) (filters as ListFilters)[key] = restored.filters[key]
    }
  }

  const defaultPageSize = options.pageSize ?? 20
  const defaultOrdering = orderingFrom(options.sortField ?? null, options.sortOrder ?? 1)

  const pageSize = ref(restored?.pageSize ?? defaultPageSize)
  const first = ref(restored ? (restored.page - 1) * pageSize.value : 0)
  const sortField = ref<string | null>(restored?.sortField ?? options.sortField ?? null)
  const sortOrder = ref<1 | -1>(restored?.sortOrder ?? options.sortOrder ?? 1)

  const rows = shallowRef<T[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const settled = ref(false)

  const isInitialLoad = computed(() => !settled.value)

  const query = computed<ListQuery<F>>(() => ({
    page: pageFromOffset(first.value, pageSize.value),
    pageSize: pageSize.value,
    ordering: orderingFrom(sortField.value, sortOrder.value),
    filters,
  }))

  let seq = 0
  let inFlight: AbortController | undefined

  async function load(): Promise<void> {
    const ticket = ++seq
    inFlight?.abort()
    const controller = (inFlight = new AbortController())

    loading.value = true
    error.value = null

    try {
      const page = await options.fetchPage(query.value, controller.signal)
      if (ticket !== seq) return // a newer request already won
      rows.value = page.results
      total.value = page.count
    } catch (caught) {
      // An abort we caused is not an error to show: fetch rejects with a
      // DOMException whose message is English and meaningless to the user.
      if (ticket !== seq || controller.signal.aborted) return

      // A page past the last one answers 404, not an empty list. Recover rather
      // than show a dead end (rows deleted elsewhere, a shared ?page=99 link).
      if (caught instanceof ApiError && caught.status === 404 && first.value > 0) {
        first.value = 0
        await load()
        return
      }

      error.value = caught instanceof Error ? caught.message : 'Chargement impossible.'
      rows.value = []
      total.value = 0
    } finally {
      if (ticket === seq) {
        loading.value = false
        settled.value = true
      }
    }
  }

  function onPage(event: { first: number; rows: number }): void {
    // No defensive offset snapping: PrimeVue's paginator already recomputes
    // `page = floor(first / newRows)` and emits `first = rows * page`.
    first.value = event.first
    pageSize.value = event.rows
    void load()
  }

  function onSort(event: { sortField?: unknown; sortOrder?: number | null }): void {
    sortField.value = typeof event.sortField === 'string' ? event.sortField : null
    sortOrder.value = event.sortOrder === -1 ? -1 : 1
    // A new order invalidates the current page: row 41 of the old ordering is
    // not row 41 of the new one.
    first.value = 0
    void load()
  }

  async function reset(): Promise<void> {
    first.value = 0
    await load()
  }

  let timer: ReturnType<typeof setTimeout> | undefined

  // Watching the NORMALISED filters means a trailing space produces the same
  // key and does not re-fetch. Reading every key here is what tracks them.
  watch(
    () => JSON.stringify(normaliseFilters(filters)),
    () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        first.value = 0
        void load()
      }, debounceMs)
    },
  )

  // ---------------------------------------------------------------- URL sync

  /** The subset of the query string this list owns. */
  function ownedQuery(): Record<string, string> {
    const owned: Record<string, string> = {}
    const page = pageFromOffset(first.value, pageSize.value)
    if (page > 1) owned.page = String(page)
    if (pageSize.value !== defaultPageSize) owned.page_size = String(pageSize.value)

    const ordering = orderingFrom(sortField.value, sortOrder.value)
    // Defaults are omitted so the URL stays clean and no '?' appears on first paint.
    if (ordering && ordering !== defaultOrdering) owned.ordering = ordering

    return { ...owned, ...normaliseFilters(filters) }
  }

  if (route && router) {
    const ownedKeys = [...listQueryKeys, ...filterKeys]

    watch(
      () => JSON.stringify(ownedQuery()),
      () => {
        // Anything not ours (a future tab id, a tracking param) is preserved.
        const rest: Record<string, string | null | (string | null)[]> = {}
        for (const [key, value] of Object.entries(route.query)) {
          if (!ownedKeys.includes(key)) rest[key] = value
        }
        // `replace`, never `push`: a history entry per keystroke is hostile,
        // and mixing the two gives a Back button whose behaviour depends on
        // which control you touched last.
        void router.replace({ query: { ...rest, ...ownedQuery() } }).catch(() => {})
      },
      // `immediate` so the URL is normalised on arrival: a link carrying a
      // rejected sort, or a param we ignore, is rewritten to what the list is
      // actually showing instead of claiming something untrue.
      { immediate: true },
    )

    watch(
      () => route.query,
      (incoming) => {
        // Self-correcting echo guard: if the URL already says what we hold,
        // this change came from our own write and there is nothing to do.
        const mine = ownedQuery()
        const theirs = readListQuery(incoming, options.sortable)
        const sameOwned = ownedKeys.every(
          (key) => (mine[key] ?? '') === String(incoming[key] ?? ''),
        )
        if (sameOwned) return

        pageSize.value = theirs.pageSize ?? defaultPageSize
        first.value = (theirs.page - 1) * pageSize.value
        sortField.value = theirs.sortField ?? options.sortField ?? null
        sortOrder.value = theirs.sortOrder
        for (const key of filterKeys) {
          ;(filters as ListFilters)[key] = theirs.filters[key] ?? ''
        }
        void load()
      },
    )
  }

  onScopeDispose(() => {
    clearTimeout(timer)
    inFlight?.abort()
  }, true)

  // A direct call, not onMounted: the request leaves a tick earlier, and the
  // composable stays usable inside a bare effectScope -- which is what makes
  // the tests possible.
  void load()

  return {
    rows,
    total,
    loading,
    error,
    first,
    pageSize,
    sortField,
    sortOrder,
    isInitialLoad,
    onPage,
    onSort,
    reload: load,
    reset,
  }
}

export type { QueryLike }
