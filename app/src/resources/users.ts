import { apiFetch } from '@/api/client'

/**
 * Fields requested from the list endpoint.
 *
 * List responses are serialised with `exclude_unset=True`, so ONLY the keys
 * asked for in `?fields=` come back. Declaring them once, `as const`, keeps the
 * query string and the row type from drifting apart.
 */
export const USER_LIST_FIELDS = [
  'id',
  'login',
  'email',
  'first_name',
  'last_name',
  'is_active',
  'roles',
] as const

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

/** DRF-style envelope returned by every list endpoint. */
export interface Page<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface ListUsersQuery {
  /** 1-based. The API rejects 0. */
  page: number
  pageSize: number
  /** Public field name, optionally prefixed with '-' for descending. */
  ordering?: string | null
  /** Matches login OR email, case-insensitive. */
  search?: string | null
}

export function listUsers(query: ListUsersQuery): Promise<Page<UserRow>> {
  const params = new URLSearchParams({
    page: String(Math.max(1, query.page)),
    // The schema declares exclusiveMaximum: 200, so 200 itself is a 422.
    page_size: String(Math.min(query.pageSize, 199)),
    fields: USER_LIST_FIELDS.join(','),
  })

  if (query.ordering) params.set('ordering', query.ordering)
  if (query.search) params.set('search', query.search)

  return apiFetch<Page<UserRow>>(`/users/?${params.toString()}`)
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
