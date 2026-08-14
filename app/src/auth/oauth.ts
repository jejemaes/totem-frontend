/**
 * Raw calls to the OAuth2 endpoints of totem-backend (django-oauth-toolkit).
 *
 * These deliberately use plain `fetch` rather than the API client: the client
 * reacts to 401 by ending the session, and routing the token endpoints through
 * it would make a failed login able to trigger that logic recursively.
 *
 * URLs are relative on purpose. In production totem-proxy serves the SPA under
 * /tabou/ and sends every other path on the same domain to the tenant backend,
 * so there is no cross-origin request and no CORS. In development the Vite dev
 * server proxies /o and /api to the backend container (see vite.config.ts).
 */

import type { StoredTokens } from './tokenStorage'

const OAUTH_BASE = '/o'

/**
 * Public OAuth client. Public by construction: it ships inside the JS bundle,
 * so it is an identifier, not a secret.
 */
const CLIENT_ID = import.meta.env.VITE_OAUTH_CLIENT_ID

/** Shape returned by django-oauth-toolkit's /o/token/ endpoint. */
interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope: string
}

export class OAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'OAuthError'
  }
}

function toStoredTokens(body: TokenResponse): StoredTokens {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    scope: body.scope ?? '',
    // Computed at receipt: an opaque token carries no readable expiry.
    expiresAt: Date.now() + body.expires_in * 1000,
  }
}

/**
 * Resource Owner Password grant.
 *
 * Chosen because it is the only grant currently provisioned on the backend.
 * Swapping to authorization-code + PKCE later touches this file and the login
 * view only: everything downstream sees the same StoredTokens.
 */
export async function requestToken(username: string, password: string): Promise<StoredTokens> {
  const response = await fetch(`${OAUTH_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      username,
      password,
      client_id: CLIENT_ID,
    }),
  })

  const body = (await response.json().catch(() => null)) as (TokenResponse & { error?: string }) | null

  if (!response.ok || !body?.access_token) {
    // The endpoint answers 401 invalid_grant for bad credentials and 401
    // invalid_client when the OAuth app is missing from the database -- worth
    // distinguishing, because the second one is a deployment problem.
    const code = body?.error
    const message =
      code === 'invalid_grant'
        ? 'Identifiant ou mot de passe incorrect.'
        : code === 'invalid_client'
          ? "Client OAuth inconnu du backend. La base a-t-elle été initialisée (manage.py populate) ?"
          : `Échec de la connexion (${response.status}).`
    throw new OAuthError(message, response.status)
  }

  return toStoredTokens(body)
}

/**
 * Best-effort revocation. Never block logout on it: the local session is
 * cleared regardless, and a network failure here must not strand the user in a
 * logged-in UI.
 */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${OAUTH_BASE}/revoke-token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, client_id: CLIENT_ID }),
    })
  } catch {
    /* ignored on purpose */
  }
}
