/**
 * GET /api/v1/user-roles/ -- the role catalogue.
 *
 * Read-only: the backend controller only exposes `read`, gated on the
 * `totem.userrole.read` permission. There is no create/update/delete here, so
 * roles are administered elsewhere and merely granted from this application.
 */

import { fetchList, MAX_PAGE_SIZE, type ListQuery, type Page } from '@/api/list'

/**
 * One entry of the list.
 *
 * The schema also carries `permissions` and `rules`; neither is read here, so
 * neither is asked for -- see USER_ROLE_LIST_FIELDS.
 */
export interface UserRoleRow {
  /** A human-written key, not a number: 'USERTYPE_ADMIN'. It is the primary key. */
  id: string
  name: string
}

/**
 * List responses are serialised with `exclude_unset=True`, so ONLY the keys
 * asked for in `?fields=` come back. `permissions` and `rules` are arrays of
 * up to a few hundred strings each: omitting them is most of the payload.
 */
export const USER_ROLE_LIST_FIELDS = ['id', 'name'] as const satisfies readonly (keyof UserRoleRow)[]

/**
 * No `ordering` is ever sent: `id` and `name` are the only fields the backend
 * whitelists, and anything else is a 422. The role list is short enough to sort
 * client-side, where the widget needs it grouped anyway.
 */
export function listUserRoles(query: ListQuery, signal?: AbortSignal): Promise<Page<UserRoleRow>> {
  return fetchList<UserRoleRow>('/user-roles/', query, USER_ROLE_LIST_FIELDS, signal)
}

/**
 * A stop, not a tuning knob: a backend answering with a non-null `next` forever
 * would otherwise loop until the tab dies. 10 * 199 roles is far past anything
 * this endpoint can plausibly hold.
 */
const MAX_PAGES = 10

/**
 * Every role, for a widget that needs the whole catalogue to group it.
 *
 * The endpoint is paginated, so this pages through it. Asking for
 * MAX_PAGE_SIZE means one request in practice -- three roles exist today -- but
 * stopping at the first page would silently drop the rest, which is exactly the
 * kind of bug that only shows up once someone adds the 200th role.
 *
 * `next` is only ever TESTED, never dereferenced: it is an absolute URL built
 * by the backend, and `apiFetch` prefixes /api/v1, so following it would
 * request `/api/v1http://...`. The page number is ours to increment.
 */
export async function fetchAllUserRoles(signal?: AbortSignal): Promise<UserRoleRow[]> {
  const roles: UserRoleRow[] = []

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await listUserRoles({ page, pageSize: MAX_PAGE_SIZE }, signal)
    roles.push(...result.results)

    // An empty page is also a stop: without it, a backend whose `next` never
    // goes null would spin through every allowed page for nothing.
    if (!result.next || !result.results.length || roles.length >= result.count) break
  }

  return roles
}
