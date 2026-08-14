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
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Turns the backend's error bodies into a single message.
 * 404 answers {"detail": "..."} while 400/403 answer {"detail": [msg, ...]}.
 */
function messageFrom(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail.filter((item): item is string => typeof item === 'string')
    if (messages.length) return messages.join(' ')
  }
  return `Erreur ${status}`
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

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new ApiError(messageFrom(body, response.status), response.status)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
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
