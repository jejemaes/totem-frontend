/*
 * The `?view_type=` contract of a page offering several views of one resource,
 * with no dependency on Vue nor on the router.
 *
 * Read from a URL, so hostile input arrives here: a stale link, a hand-edited
 * `?view_type=kanban`, a repeated key. Each must land on a view that exists
 * rather than on a page with nothing mounted.
 */

import type { QueryLike } from '@/api/list'

export type ViewType = 'list' | 'chart'

export const VIEW_TYPES: readonly ViewType[] = ['list', 'chart']

/** The query-string key. Shared by every page, so a link reads the same everywhere. */
export const VIEW_TYPE_KEY = 'view_type'

/** The view a query string asks for, among those offered; the first one otherwise. */
export function viewTypeFromQuery(
  query: QueryLike,
  offered: readonly ViewType[] = VIEW_TYPES,
): ViewType {
  const raw = query[VIEW_TYPE_KEY]
  const value = Array.isArray(raw) ? raw[0] : raw
  return offered.find((view) => view === value) ?? offered[0]
}
