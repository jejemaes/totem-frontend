/**
 * The single place that knows WHERE tokens live.
 *
 * Storage is localStorage: the session survives a browser restart and is shared
 * between tabs. The trade-off is deliberate -- a bearer token in web storage is
 * readable by any XSS, and localStorage widens the exposure window compared to
 * sessionStorage. Everything goes through the functions below, so moving to
 * sessionStorage is a one-word change here and nowhere else.
 *
 * Writers are several (a login, a rotation from the API client, another tab),
 * so whoever mirrors the tokens -- the auth store -- subscribes through
 * `onTokensChange` rather than assuming it is the only one writing.
 */

const STORAGE_KEY = 'totem.auth'

export interface StoredTokens {
  accessToken: string
  /** Single use: a rotation spends it, see `refresh.ts`. */
  refreshToken: string
  /** Space-separated scopes, i.e. the user's permissions. */
  scope: string
  /** Absolute epoch ms, computed at receipt from `expires_in`. */
  expiresAt: number
}

type Listener = (tokens: StoredTokens | null) => void

const listeners = new Set<Listener>()

function notify(tokens: StoredTokens | null): void {
  for (const listener of listeners) listener(tokens)
}

export function getTokens(): StoredTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<StoredTokens>
    // Anything written by an older build, or hand-edited, is treated as absent
    // rather than crashing the app on boot. That includes the opaque tokens of
    // the OAuth2 era, which carried no refresh token and are dead anyway.
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      scope: parsed.scope ?? '',
      expiresAt: parsed.expiresAt,
    }
  } catch {
    return null
  }
}

export function setTokens(tokens: StoredTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
  notify(tokens)
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY)
  notify(null)
}

/**
 * Called on every write, from this tab or from another one. Returns the
 * unsubscribe function.
 */
export function onTokensChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// The `storage` event fires only in the OTHER tabs, which is exactly what is
// missing: a logout in one tab now ends the session in all of them, and a
// rotation there hands its fresh scopes here. Guarded so the module still
// imports under the specs' node environment.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) notify(getTokens())
  })
}
