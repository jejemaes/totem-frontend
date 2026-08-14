/**
 * The single place that knows WHERE tokens live.
 *
 * Storage is localStorage: the session survives a browser restart and is shared
 * between tabs. The trade-off is deliberate -- a bearer token in web storage is
 * readable by any XSS, and localStorage widens the exposure window compared to
 * sessionStorage. Everything goes through the three functions below, so moving
 * to sessionStorage is a one-word change here and nowhere else.
 */

const STORAGE_KEY = 'totem.auth'

export interface StoredTokens {
  accessToken: string
  refreshToken: string | null
  /** Space-separated OAuth scopes, i.e. the user's permissions. */
  scope: string
  /** Absolute epoch ms. Tokens are OPAQUE, so this is the only expiry signal. */
  expiresAt: number
}

export function getTokens(): StoredTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<StoredTokens>
    // Anything written by an older build, or hand-edited, is treated as absent
    // rather than crashing the app on boot.
    if (typeof parsed.accessToken !== 'string' || typeof parsed.expiresAt !== 'number') {
      return null
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken ?? null,
      scope: parsed.scope ?? '',
      expiresAt: parsed.expiresAt,
    }
  } catch {
    return null
  }
}

export function setTokens(tokens: StoredTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY)
}
