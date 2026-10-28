/**
 * Minimal typed wrapper around fetch for the Totem REST API.
 *
 * Deliberately hand-written and small at this stage. It will be replaced by a
 * client generated from /api/v1/openapi.json once the admin screens land.
 */

import { isExpiring, refreshSession } from '@/auth/refresh'
import { getTokens, type StoredTokens } from '@/auth/tokenStorage'

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

function send(path: string, init: RequestInit, tokens: StoredTokens | null): Promise<Response> {
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

  // Sent twice at most, which is fine for every body this client builds: a
  // string or a FormData can be read again, unlike a stream.
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

/**
 * Note the trailing slash on every path: the backend requires it.
 *
 * The session is kept alive here, the one place every request goes through: an
 * access token about to expire is rotated BEFORE the request, and a 401 is
 * answered by one rotation and one retry. A second 401 is final -- retrying in
 * a loop would hammer the backend for a user it has disabled. When the rotation
 * is refused, `refreshSession` clears the tokens, the auth store follows, and
 * the 401 surfaces to the caller as before.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let tokens = getTokens()
  if (tokens && isExpiring(tokens, Date.now())) tokens = await refreshSession(tokens)

  let response = await send(path, init, tokens)
  if (response.status === 401 && tokens) {
    tokens = await refreshSession(tokens)
    if (tokens) response = await send(path, init, tokens)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const { message, fields } = parseApiError(body, response.status)
    throw new ApiError(message, response.status, fields)
  }

  if (response.status === 204) return undefined as T
  // Read as text first: a 201 can carry NO body at all (POST .../resequence/
  // answers exactly that), and `response.json()` on an empty body throws a
  // SyntaxError -- a write that succeeded would then reach the caller as a
  // failure. An empty body is `undefined`, like a 204.
  const text = await response.text()
  return (text === '' ? undefined : JSON.parse(text)) as T
}

/** POST a JSON body. The trailing-slash rule applies here too. */
export function postJson<T>(path: string, payload: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(payload) })
}

/** PATCH a JSON body. The backend exposes PATCH for updates, never PUT. */
export function patchJson<T>(path: string, payload: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(payload) })
}

/**
 * DELETE, with no body either way.
 *
 * The backend answers 204, which apiFetch already turns into `undefined` -- so
 * there is nothing to parse and nothing to return. A refusal is an ApiError
 * like any other: several of these models are referenced through
 * `on_delete=PROTECT`, so "this row is still in use" is an ordinary outcome
 * and the caller has to show it rather than assume success.
 */
export function apiDelete(path: string): Promise<void> {
  return apiFetch<void>(path, { method: 'DELETE' })
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
