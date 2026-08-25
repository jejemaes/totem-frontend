import { postJson } from '@/api/client'
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

/** The only two languages declared by the backend's settings.LANGUAGES. */
export type UserLanguage = 'en-us' | 'fr'

/**
 * Body of POST /users/.
 *
 * The schema accepts only these keys plus `roles`, `user_type` and `avatar`.
 * `is_active`, `password` and `id` are dropped in silence -- note there is no
 * password field in the API at all, so an account created here has no way to
 * sign in until one is set elsewhere.
 */
export interface UserCreatePayload {
  /** The ORM field is `username`; the body accepts ONLY `login`. Unique. */
  login: string
  email: string
  /** Nullable in the database: `null` is accepted and stored as-is. */
  first_name?: string | null
  last_name?: string | null
  /**
   * NOT nullable, merely defaulted: an explicit `null` is a 422. Omitting the
   * key is what lets the backend apply 'fr'.
   */
  language?: UserLanguage
}

/**
 * `roles` is required by the schema but has no widget -- there is no relational
 * field yet -- so it is injected here rather than carried by the form. The
 * account is therefore created with no role at all.
 *
 * `user_type` and `avatar` are ABSENT rather than sent as `null`: both are
 * non-nullable columns with a default, so an explicit `null` is a 422. That is
 * also why the payload is built key by key and never by copying the draft.
 *
 * The response is a full UserSchema, wider than UserRow (it also carries
 * `user_type`, `language`, `avatar`). The extra keys are harmless: the type
 * only promises the ones it declares.
 */
export function createUser(payload: UserCreatePayload): Promise<UserRow> {
  return postJson<UserRow>('/users/', { roles: [], ...payload })
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
