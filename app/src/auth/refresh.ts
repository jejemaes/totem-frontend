/**
 * Rotation of the token pair, spending each refresh token exactly ONCE.
 *
 * The access token lives 15 minutes, so without a rotation every user would be
 * signed out four times an hour. And the rotation cannot be naive: a refresh
 * token is single use, and the backend answers a second use as a REPLAY -- it
 * cannot tell a stolen copy from a lost response, so it revokes the whole
 * session. Two requests hitting a 401 together, or two tabs waking up after the
 * same expiry, would each spend the same token and sign the user out. Hence:
 *
 *   - one rotation in flight per tab: concurrent callers share its promise;
 *   - one rotation at a time across tabs, under a Web Lock, and inside it the
 *     token is re-read from storage -- if another tab rotated meanwhile, its
 *     fresh pair is ADOPTED rather than spending a token that is already spent.
 *
 * Only a refusal (a 4xx from the endpoint) ends the session. A network error or
 * a 5xx is not proof the session is dead: the tokens are kept and the error
 * propagates, the same rule `ensureSession` follows.
 *
 * Vue-free and built from injected callbacks, like the composables, so the
 * spec drives it with fakes: no `fetch`, no localStorage, no `navigator.locks`.
 */

import { AuthError, exchangeRefreshToken } from './tokenApi'
import { clearTokens, getTokens, setTokens, type StoredTokens } from './tokenStorage'

/**
 * Rotate this long BEFORE the access token expires: a request sent with a
 * token a second from its end would reach the server dead, and pay a 401 plus
 * a retry for nothing.
 */
export const EXPIRY_MARGIN_MS = 30_000

const LOCK_NAME = 'totem.auth.refresh'

export interface RefresherDeps {
  read: () => StoredTokens | null
  write: (tokens: StoredTokens) => void
  clear: () => void
  exchange: (refreshToken: string) => Promise<StoredTokens>
  /** Runs `task` while no other tab runs one under the same lock. */
  lock: <T>(task: () => Promise<T>) => Promise<T>
}

/**
 * Whether `tokens` should be rotated before being sent at all.
 */
export function isExpiring(tokens: StoredTokens, now: number): boolean {
  return tokens.expiresAt - EXPIRY_MARGIN_MS <= now
}

export type Refresh = (spent: StoredTokens) => Promise<StoredTokens | null>

/**
 * Returns `refresh(spent)`: rotates the pair `spent` belongs to and resolves
 * with the pair to use from now on, or with `null` when the session is over.
 *
 * `spent` is the pair the caller was using when it gave up on it. Comparing it
 * with what storage holds is what tells "this token still needs rotating" from
 * "someone already rotated it".
 */
export function createRefresher(deps: RefresherDeps): Refresh {
  let inFlight: Promise<StoredTokens | null> | null = null

  async function rotate(spent: StoredTokens): Promise<StoredTokens | null> {
    const current = deps.read()
    if (!current) return null
    // Another tab, or an earlier rotation of this one, got there first.
    if (current.refreshToken !== spent.refreshToken) return current

    try {
      const next = await deps.exchange(current.refreshToken)
      deps.write(next)
      return next
    } catch (error) {
      if (error instanceof AuthError && error.status < 500) {
        deps.clear()
        return null
      }
      throw error
    }
  }

  return (spent) => {
    inFlight ??= deps.lock(() => rotate(spent)).finally(() => {
      inFlight = null
    })
    return inFlight
  }
}

function withBrowserLock<T>(task: () => Promise<T>): Promise<T> {
  // `navigator.locks` exists only in a secure context (https, or a *.localhost
  // host). Without it the in-tab single flight still holds; only two tabs
  // rotating in the same instant could still collide.
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  return locks ? locks.request(LOCK_NAME, task) : task()
}

/** The app's one refresher, over the real storage, endpoint and lock. */
export const refreshSession = createRefresher({
  read: getTokens,
  write: setTokens,
  clear: clearTokens,
  exchange: exchangeRefreshToken,
  lock: withBrowserLock,
})
