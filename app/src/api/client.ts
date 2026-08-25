/**
 * Minimal typed wrapper around fetch for the Totem REST API.
 *
 * Deliberately hand-written and small at this stage. It will be replaced by a
 * client generated from /api/v1/openapi.json once the admin screens land.
 */

import { getTokens } from '@/auth/tokenStorage'

const API_BASE = '/api/v1'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /**
     * Per-field messages from a 422, keyed by the PUBLIC field name (`login`,
     * never the ORM's `username`). Undefined for every other error shape.
     */
    readonly fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * What the backend could not attach to any field. Same sentinel as its own
 * core.services.exceptions.NON_FIELD_ERRORS.
 *
 * This is where a duplicate login lands: `username` is not `unique=True` on the
 * model, it is a UniqueConstraint, so the clash is only caught by the database
 * and comes back as an integrity error with no field attached.
 */
export const NON_FIELD = '__all__'

export interface ParsedApiError {
  message: string
  /** Only present for a 422. */
  fields?: Record<string, string>
}

/** One entry of django-ninja's 422 body. */
interface ValidationDetail {
  loc?: unknown[]
  msg?: string
}

function isValidationDetail(item: unknown): item is ValidationDetail {
  return typeof item === 'object' && item !== null && 'msg' in item
}

/**
 * The last element of `loc` is the public field name:
 * ["body", "request_body", "login"].
 */
function fieldOf(detail: ValidationDetail): string {
  const last = detail.loc?.[detail.loc.length - 1]
  return typeof last === 'string' ? last : NON_FIELD
}

/**
 * Turns the backend's three error-body shapes into a message, plus per-field
 * messages when it is a validation failure.
 *
 *   404      {"detail": "Object not found"}          -- a string
 *   400/403  {"detail": ["...", "..."]}              -- strings
 *   422      {"detail": [{type, loc, msg, ctx}, ...] -- OBJECTS
 *
 * The third shape used to be dropped wholesale by the string filter, which is
 * why every validation failure read "Error 422" and there was no way to tell
 * the user what the backend had actually refused.
 *
 * Strings are checked before objects so 400/403 behave exactly as before.
 */
export function parseApiError(body: unknown, status: number): ParsedApiError {
  const detail = (body as { detail?: unknown } | null)?.detail

  if (typeof detail === 'string') return { message: detail }

  if (Array.isArray(detail)) {
    const messages = detail.filter((item): item is string => typeof item === 'string')
    if (messages.length) return { message: messages.join(' ') }

    const fields: Record<string, string> = {}
    for (const item of detail) {
      if (!isValidationDetail(item) || !item.msg) continue
      const name = fieldOf(item)
      fields[name] = fields[name] ? `${fields[name]} ${item.msg}` : item.msg
    }

    const collected = Object.values(fields)
    if (collected.length) return { message: collected.join(' '), fields }
  }

  return { message: `Error ${status}` }
}

/**
 * Note the trailing slash on every path: the backend requires it.
 *
 * There is no refresh-on-401 yet. A 401 simply surfaces to the caller, which
 * ends the session. Automatic refresh is blocked on a backend bug anyway --
 * REFRESH_TOKEN_EXPIRE_SECONDS (5h) is shorter than
 * ACCESS_TOKEN_EXPIRE_SECONDS (10h), so a refresh token is always dead by the
 * time the access token expires.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tokens = getTokens()

  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (tokens) headers.set('Authorization', `Bearer ${tokens.accessToken}`)

  // Only for an already-serialised body. A FormData body (the avatar, later)
  // must keep the Content-Type the browser computes for it, otherwise the
  // multipart boundary is missing and the backend parses nothing. Without this,
  // a string body goes out as text/plain and django-ninja ignores it.
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const { message, fields } = parseApiError(body, response.status)
    throw new ApiError(message, response.status, fields)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** POST a JSON body. The trailing-slash rule applies here too. */
export function postJson<T>(path: string, payload: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(payload) })
}

/** Subset of the profile returned by GET /api/v1/users/me/. */
export interface UserProfile {
  id: string
  /** The ORM field is `username`; the API exposes and expects `login`. */
  login: string
  email: string | null
  first_name: string | null
  last_name: string | null
  language: string | null
}

export function fetchProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/users/me/')
}
