/**
 * The wire contract of every `POST <resource>/group-by/` endpoint: the
 * backend's `read_group`, which a chart reads instead of a page of rows.
 *
 * Pure and Vue-free, like list.ts, and for the same reason: the body is where a
 * 422 is born. The backend validates every name against the dimensions and
 * measures the service declared, refuses an `ordering` naming something not
 * asked, and caps `limit` at 1000 -- so the names and bounds are fixed here,
 * once, rather than in each resource.
 *
 * A POST and not a GET because the body carries lists (`group_by_fields`,
 * `measures`, `ordering`) and the list's filter object. The filters are the
 * SAME keys the list endpoint takes as query parameters: a URL describing a
 * list also describes its chart.
 */

import { apiFetch } from './client'
import { normaliseFilters, type ListFilters } from './list'

/** One group: the keys asked for -- the dimensions, then the measures -- and nothing else. */
export type Group = Record<string, unknown>

export interface GroupPage {
  /** The number of groups over every page, not the number of records. */
  count: number
  results: Group[]
}

export interface GroupQuery<F extends ListFilters = ListFilters> {
  /** The dimensions, in order: the first one varies slowest. */
  dimensions: readonly string[]
  measures: readonly string[]
  /** One dimension or measure, `-` prefixed for descending, or null for the
      backend's default: the dimensions, in order. */
  ordering?: string | null
  filters?: F
}

/** The backend's `group_by_max_dimensions`. A fourth is a 422. */
export const MAX_DIMENSIONS = 3

/**
 * The backend's `group_by_max_limit`. Asked for in full: a chart draws every
 * group or misleads, and a reader cannot page through a pie. Past it, the
 * caller is told -- see GroupPage.count.
 */
export const MAX_GROUPS = 1000

/** What the body of a group-by request holds. snake_case: it is the wire. */
export interface GroupByBody {
  group_by_fields: string[]
  measures: string[]
  ordering: string[]
  /** Stringified, blanks dropped: the same normalisation as a list's query string. */
  filters: Record<string, string>
  limit: number
}

/**
 * The query -> the body. The filters go through `normaliseFilters` exactly as
 * a list's do: `?search=` with an empty box must not filter on the empty
 * string, and `false` must survive.
 */
export function groupByBody(query: GroupQuery): GroupByBody {
  return {
    group_by_fields: [...query.dimensions],
    measures: [...query.measures],
    ordering: query.ordering ? [query.ordering] : [],
    filters: normaliseFilters(query.filters),
    limit: MAX_GROUPS,
  }
}

/**
 * `path` is the endpoint's own, trailing slash included
 * (`/accounting/movements/group-by/`). `apiFetch` rather than `postJson`: a
 * superseded chart request must be abortable like a list's.
 */
export function fetchGroups(
  path: string,
  query: GroupQuery,
  signal?: AbortSignal,
): Promise<GroupPage> {
  return apiFetch<GroupPage>(path, {
    method: 'POST',
    body: JSON.stringify(groupByBody(query)),
    signal,
  })
}
