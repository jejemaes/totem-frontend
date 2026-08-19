import { fetchList, type ListQuery, type Page } from '@/api/list'

/**
 * Fields requested from the list endpoint.
 *
 * List responses are serialised with `exclude_unset=True`, so ONLY the keys
 * asked for in `?fields=` come back. Declaring them once, `as const`, keeps the
 * query string and the row type from drifting apart -- and `satisfies` makes a
 * typo here a compile error rather than a silently missing column.
 */
export const USER_LIST_FIELDS = [
  'id',
  'login',
  'email',
  'first_name',
  'last_name',
  'is_active',
  'roles',
] as const satisfies readonly (keyof UserRow)[]

/**
 * Fields the backend accepts in `?ordering=`. Kept next to the row type because
 * it is the same contract: `roles` is deliberately absent, it is not sortable,
 * and asking for it would be a 422.
 */
export const USER_SORTABLE = ['login', 'email', 'first_name', 'is_active', 'date_joined'] as const

/** Relations are read as nested objects and written as id arrays. */
export interface UserRoleRef {
  id: string
  name: string
}

export interface UserRow {
  id: string
  /** The ORM field is `username`; the API exposes and expects `login`. */
  login: string
  email: string | null
  first_name: string | null
  last_name: string | null
  is_active: boolean
  roles: UserRoleRef[] | null
}

/**
 * Filters this endpoint accepts, as plain query params.
 *
 * A `type` and not an `interface`: only type aliases get the implicit index
 * signature that makes them assignable to `ListFilters`.
 */
export type UserFilters = {
  /** Matches login OR email, case-insensitive. */
  search?: string
  login?: string
  email?: string
  is_active?: boolean
}

export function listUsers(
  query: ListQuery<UserFilters>,
  signal?: AbortSignal,
): Promise<Page<UserRow>> {
  return fetchList<UserRow>('/users/', query, USER_LIST_FIELDS, signal)
}

/** Display name falling back to the login when no real name is set. */
export function fullName(user: UserRow): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ')
}

/** Initials for the avatar: from the real name when available, else the login. */
export function initials(user: UserRow): string {
  const name = fullName(user)
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('')
  }
  return user.login.slice(0, 2).toUpperCase()
}
