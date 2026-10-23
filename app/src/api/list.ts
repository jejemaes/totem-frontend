/**
 * The wire contract shared by every list endpoint of the Totem API.
 *
 * Pure and Vue-free on purpose: these helpers are the part that silently
 * produces 422s in production, so they must be unit-testable in a plain node
 * environment. Everything here is about *parameter names and bounds*; nothing
 * here knows about a specific resource, and nothing knows about the UI.
 */

import { apiFetch } from './client'

export interface Page<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type FilterValue = string | number | boolean | null | undefined
export type ListFilters = Record<string, FilterValue>

export interface ListQuery<F extends ListFilters = ListFilters> {
  /** 1-based: the schema declares exclusiveMinimum 0. */
  page: number
  pageSize: number
  /** Comma-separated PUBLIC field names, '-' prefix for descending. */
  ordering?: string | null
  filters?: F
  /**
   * The keys to ask for, replacing the resource's own `XXX_LIST_FIELDS` -- for
   * a list whose columns the user picks. Absent, the resource's default holds,
   * so every existing `listXxx()` gained this without being touched.
   */
  fields?: readonly string[]
}

/** `page_size` is declared exclusiveMaximum: 200, so 200 itself is a 422. */
export const MAX_PAGE_SIZE = 199

/** DataTable counts in offsets, the API counts in pages. */
export function pageFromOffset(first: number, pageSize: number): number {
  if (pageSize <= 0) return 1
  return Math.floor(Math.max(0, first) / pageSize) + 1
}

/** null when nothing is sorted, so the caller can omit the parameter entirely. */
export function orderingFrom(field: string | null | undefined, order: 1 | -1): string | null {
  if (!field) return null
  return `${order === -1 ? '-' : ''}${field}`
}

/**
 * Drops what must never be sent (`?login=` would filter on the empty string),
 * and stringifies what remains. `false` and `0` are meaningful values and
 * survive -- which is why this cannot be a plain truthiness test.
 */
export function normaliseFilters(filters?: ListFilters): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed === '') continue
      out[key] = trimmed
      continue
    }
    out[key] = String(value)
  }
  return out
}

export function listParams(query: ListQuery, fields: readonly string[]): URLSearchParams {
  const pageSize = Math.min(Math.max(1, Math.floor(query.pageSize)), MAX_PAGE_SIZE)

  const params = new URLSearchParams({
    page: String(Math.max(1, Math.floor(query.page))),
    page_size: String(pageSize),
  })

  // The query's own list wins: it is the caller saying what is on screen. An
  // EMPTY one does not -- no `?fields=` means every field, the opposite of
  // what an empty list would suggest.
  const wanted = query.fields?.length ? query.fields : fields
  if (wanted.length) params.set('fields', wanted.join(','))
  if (query.ordering) params.set('ordering', query.ordering)

  for (const [key, value] of Object.entries(normaliseFilters(query.filters))) {
    params.set(key, value)
  }

  return params
}

/**
 * `path` keeps its trailing slash: the backend requires it.
 * `signal` lets the caller abort a superseded request.
 */
export function fetchList<T>(
  path: string,
  query: ListQuery,
  fields: readonly string[],
  signal?: AbortSignal,
): Promise<Page<T>> {
  return apiFetch<Page<T>>(`${path}?${listParams(query, fields).toString()}`, { signal })
}

/**
 * A stop, not a tuning knob: a backend answering with a non-null `next` forever
 * would otherwise loop until the tab dies. 10 * 199 rows is far past anything a
 * caller of `fetchAllPages` can sensibly put in front of a user.
 */
const MAX_PAGES = 10

/**
 * Every page of a list endpoint, concatenated.
 *
 * For the callers that need a WHOLE result set rather than a page of it -- a
 * relation dropdown, a catalogue to group. Asking for MAX_PAGE_SIZE means one
 * request in practice, but stopping at the first page would silently drop the
 * rest, which is exactly the kind of bug that only shows up once the table
 * grows past 199 rows.
 *
 * `next` is only ever TESTED, never dereferenced: it is an absolute URL built
 * by the backend, and `apiFetch` prefixes /api/v1, so following it would
 * request `/api/v1http://...`. The page number is ours to increment.
 */
export async function fetchAllPages<T>(
  path: string,
  fields: readonly string[],
  options?: { filters?: ListFilters; ordering?: string | null },
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = []

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await fetchList<T>(
      path,
      { page, pageSize: MAX_PAGE_SIZE, ordering: options?.ordering, filters: options?.filters },
      fields,
      signal,
    )
    rows.push(...result.results)

    // An empty page is also a stop: without it, a backend whose `next` never
    // goes null would spin through every allowed page for nothing.
    if (!result.next || !result.results.length || rows.length >= result.count) break
  }

  return rows
}

// -------------------------------------------------------------- display names

/**
 * The ids an endpoint's `display-name/` route is asked for, deduplicated and
 * with the blanks dropped -- or null when nothing is left to ask.
 *
 * Null rather than an empty string because the backend answers a missing or
 * empty `id` with a 422, not with `[]`: an empty list is the caller's business
 * to short-circuit, never a request to send.
 */
export function displayNameIds(ids: readonly string[]): string | null {
  const kept = [...new Set(ids.map((id) => id.trim()).filter((id) => id !== ''))]
  return kept.length ? kept.join(',') : null
}

/**
 * `GET <path>display-name/?id=a,b,c`: the label of a few known records.
 *
 * What a relation widget needs when it holds an id and nothing to label it with
 * -- a filter restored from a URL. One request for exactly those rows, where
 * `fetchAllPages` would load the whole table and still miss them past its cap.
 *
 * One comma-separated `id`, not a repeated one: the form the backend reads.
 * An id that is unknown or out of the user's reach is simply ABSENT from the
 * answer -- the backend does not tell the two apart, and neither does this.
 */
export async function fetchDisplayNames<T>(
  path: string,
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<T[]> {
  const joined = displayNameIds(ids)
  if (joined === null) return []
  const params = new URLSearchParams({ id: joined })
  return apiFetch<T[]>(`${path}display-name/?${params.toString()}`, { signal })
}

// ----------------------------------------------------------------- URL state

/** Structural stand-in for vue-router's LocationQuery, so this stays router-free. */
export type QueryLike = Record<string, string | null | (string | null)[] | undefined>

/** Query-string keys owned by the list machinery itself, as opposed to filters. */
export const listQueryKeys = ['page', 'page_size', 'ordering'] as const

function firstString(value: QueryLike[string]): string | null {
  if (Array.isArray(value)) return firstString(value[0])
  return typeof value === 'string' ? value : null
}

export interface RestoredListQuery {
  page: number
  pageSize?: number
  sortField: string | null
  sortOrder: 1 | -1
  /** Everything that is not a listQueryKey, treated as a filter. */
  filters: Record<string, string>
}

/**
 * Pure: a query string -> initial list state. No side effects, no router.
 *
 * This is where hostile input arrives -- a hand-edited or stale link -- so every
 * value is clamped or dropped rather than forwarded. In particular a sort on a
 * column the backend does not accept is ignored instead of producing a 422.
 */
export function readListQuery(q: QueryLike, sortable?: readonly string[]): RestoredListQuery {
  const page = Number(firstString(q.page))
  const size = Number(firstString(q.page_size))

  const ordering = firstString(q.ordering) ?? ''
  const field = ordering.replace(/^-/, '')
  const known = !sortable || sortable.includes(field)

  const filters: Record<string, string> = {}
  for (const [key, value] of Object.entries(q)) {
    if ((listQueryKeys as readonly string[]).includes(key)) continue
    const single = firstString(value)
    if (single !== null) filters[key] = single
  }

  return {
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
    pageSize:
      Number.isFinite(size) && size >= 1 ? Math.min(Math.floor(size), MAX_PAGE_SIZE) : undefined,
    sortField: field && known ? field : null,
    sortOrder: ordering.startsWith('-') ? -1 : 1,
    filters,
  }
}
