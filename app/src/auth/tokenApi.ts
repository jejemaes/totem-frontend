/**
 * Raw calls to the token endpoints of totem-backend (`/api/v1/auth/token/...`).
 *
 * These deliberately use plain `fetch` rather than the API client: the client
 * reacts to a 401 by refreshing the session, and routing the token endpoints
 * through it would make a failed login or a failed refresh able to trigger that
 * logic recursively.
 *
 * URLs are relative on purpose. In production totem-proxy serves the SPA under
 * /tabou/ and sends every other path on the same domain to the tenant backend,
 * so there is no cross-origin request and no CORS. In development the Vite dev
 * server proxies /api to the backend container (see vite.config.ts).
 *
 * No `client_id` and no `grant_type`: these replaced the OAuth2 endpoints of
 * django-oauth-toolkit, and a public SPA gained nothing from registering a
 * client it cannot keep a secret for. Vue-free, so `refresh.ts` and its spec can
 * name `AuthError` without a DOM.
 */

import type { StoredTokens } from './tokenStorage'

const AUTH_BASE = '/api/v1/auth/token'

/** TokenPairSchema: what a login and a rotation both return. */
interface TokenPair {
  access_token: string
  /** SINGLE USE: exchanging it returns a new one and invalidates this one. */
  refresh_token: string
  token_type: string
  expires_in: number
  scope: string
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

function toStoredTokens(body: TokenPair): StoredTokens {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    scope: body.scope ?? '',
    // A duration, not an absolute expiry: the backend does not trust the
    // client's clock, so the deadline is computed against that same clock.
    expiresAt: Date.now() + body.expires_in * 1000,
  }
}

async function postToken(path: string, payload: unknown): Promise<Response> {
  return fetch(`${AUTH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function readPair(response: Response, rejected: string): Promise<StoredTokens> {
  const body = (await response.json().catch(() => null)) as TokenPair | null
  if (!response.ok || !body?.access_token || !body.refresh_token) {
    // 401 is the backend's one answer for every refusal -- an unknown login, a
    // wrong password and a disabled account alike, or an unknown, expired or
    // replayed refresh token -- since telling them apart would be an oracle.
    const message = response.status === 401 ? rejected : `Sign-in failed (${response.status}).`
    throw new AuthError(message, response.status)
  }
  return toStoredTokens(body)
}

/** Exchanges credentials for the first pair of a session. */
export async function requestToken(username: string, password: string): Promise<StoredTokens> {
  const response = await postToken('/', { username, password })
  return readPair(response, 'Invalid login or password.')
}

/**
 * Rotates a pair. Never call it directly: go through `refreshSession()`, which
 * makes sure a given refresh token is spent only ONCE -- the backend treats a
 * second use as a replay and revokes the whole session.
 */
export async function exchangeRefreshToken(refreshToken: string): Promise<StoredTokens> {
  const response = await postToken('/refresh/', { refresh_token: refreshToken })
  return readPair(response, 'Your session has expired.')
}

/**
 * Best-effort revocation of the session the refresh token belongs to. Never
 * block logout on it: the local session is cleared regardless, and a network
 * failure here must not strand the user in a logged-in UI. The access token is
 * a JWT and stays valid until it expires; there is nothing to revoke for it.
 */
export async function revokeToken(refreshToken: string): Promise<void> {
  try {
    await postToken('/revoke/', { refresh_token: refreshToken })
  } catch {
    /* ignored on purpose */
  }
}
