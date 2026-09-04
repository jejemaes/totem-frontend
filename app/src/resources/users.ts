import { apiFetch, patchJson, postJson } from '@/api/client'
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
 * The schema accepts only these keys plus `user_type` and `avatar`.
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
  /**
   * Role ids, e.g. ['USERTYPE_ADMIN']. Relations are read as nested objects
   * and written as id arrays.
   *
   * Required by the schema, so `createUser` injects `[]` for a caller that
   * omits it. On an UPDATE the same key means something else entirely -- see
   * UserUpdatePayload, and do not send it lightly.
   */
  roles?: string[]
}

/**
 * `roles` is required by the schema, so an empty list is injected for a caller
 * that does not carry one -- an account with no role at all. UserFormView does
 * carry one, through UserRolesSelectionWidget, and its value wins over the
 * default below.
 *
 * `user_type` and `avatar` are ABSENT rather than sent as `null`: both are
 * non-nullable columns with a default, so an explicit `null` is a 422. That is
 * also why the payload is built key by key and never by copying the draft.
 *
 * The 201 body is a full UserSchema, the same shape a retrieve returns.
 */
export function createUser(payload: UserCreatePayload): Promise<UserDetail> {
  return postJson<UserDetail>('/users/', { roles: [], ...payload })
}

/**
 * What GET /users/{id}/ returns: the full UserSchema, wider than the row the
 * list asks for. No `?fields=` is sent -- the detail endpoint is a single
 * record, so trimming it buys nothing and would only be one more thing to keep
 * in sync with the form.
 */
export interface UserDetail extends UserRow {
  language: string | null
  user_type: string | null
  avatar: string | null
}

export function fetchUser(id: string, signal?: AbortSignal): Promise<UserDetail> {
  return apiFetch<UserDetail>(`/users/${encodeURIComponent(id)}/`, { signal })
}

/**
 * Body of PATCH /users/{id}/.
 *
 * Every key is optional, and that is load-bearing rather than merely
 * permissive: the backend builds its update from the schema with
 * `exclude_unset=True`, so **an omitted key is left untouched** while an
 * explicit `null` is written. The two are not interchangeable.
 *
 * That is what makes it safe for the edit form to leave `user_type` and
 * `avatar` out entirely, and it is why `roles` must reach this body ONLY when
 * the user actually edited them: omitting the key keeps the account's existing
 * roles, where `roles: []` -- as creation sends -- wipes them. So does
 * `roles: null`, which the service turns into an empty list. There is no way to
 * say "leave the roles alone" other than not mentioning them, so an unedited
 * roles list must never be echoed back. Sending `roles: []` on purpose, by
 * clearing every dropdown, is then a deliberate wipe rather than an accident.
 *
 * `user_type` must be omitted for a second reason: UserQuerySet.update fires
 * `user_change_rights` on the mere PRESENCE of that key, which invalidates the
 * account's tokens. Echoing it back unchanged would sign the user out.
 *
 * `email`, `login`, `language` and `user_type` must also never be sent as
 * `null` here: unlike on create they pass schema validation (every update
 * field is Optional), reach the database, and fail its NOT NULL constraint --
 * so the 422 comes back under `__all__` with no field attached.
 */
export type UserUpdatePayload = Partial<UserCreatePayload>

export function updateUser(id: string, payload: UserUpdatePayload): Promise<UserDetail> {
  return patchJson<UserDetail>(`/users/${encodeURIComponent(id)}/`, payload)
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
