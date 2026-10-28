import { describe, expect, it, vi } from 'vitest'

import { createRefresher, EXPIRY_MARGIN_MS, isExpiring, type RefresherDeps } from './refresh'
import { AuthError } from './tokenApi'
import type { StoredTokens } from './tokenStorage'

function pair(n: number): StoredTokens {
  return { accessToken: `access-${n}`, refreshToken: `refresh-${n}`, scope: 'a b', expiresAt: n }
}

/** An in-memory storage, and a lock that serialises like the browser's would. */
function setup(stored: StoredTokens | null, exchange: RefresherDeps['exchange']) {
  const state = { stored }
  let queue: Promise<unknown> = Promise.resolve()
  const deps: RefresherDeps = {
    read: () => state.stored,
    write: (tokens) => {
      state.stored = tokens
    },
    clear: () => {
      state.stored = null
    },
    exchange: vi.fn(exchange),
    lock: <T>(task: () => Promise<T>): Promise<T> => {
      const run = queue.then(task)
      queue = run.catch(() => undefined)
      return run
    },
  }
  return { state, deps, refresh: createRefresher(deps) }
}

describe('isExpiring', () => {
  it('rotates within the margin, not before', () => {
    const tokens = { ...pair(1), expiresAt: 100_000 }
    expect(isExpiring(tokens, 100_000 - EXPIRY_MARGIN_MS - 1)).toBe(false)
    expect(isExpiring(tokens, 100_000 - EXPIRY_MARGIN_MS)).toBe(true)
    expect(isExpiring(tokens, 200_000)).toBe(true)
  })
})

describe('createRefresher', () => {
  it('rotates and stores the new pair', async () => {
    const { state, refresh } = setup(pair(1), async () => pair(2))

    await expect(refresh(pair(1))).resolves.toEqual(pair(2))
    expect(state.stored).toEqual(pair(2))
  })

  it('spends a refresh token once for concurrent callers', async () => {
    const { deps, refresh } = setup(pair(1), async () => pair(2))

    const results = await Promise.all([refresh(pair(1)), refresh(pair(1)), refresh(pair(1))])

    expect(results).toEqual([pair(2), pair(2), pair(2)])
    expect(deps.exchange).toHaveBeenCalledTimes(1)
  })

  it('adopts a pair another tab rotated instead of replaying the spent one', async () => {
    // Storage already holds pair 2: the caller still had pair 1 in hand.
    const { deps, refresh } = setup(pair(2), async () => pair(3))

    await expect(refresh(pair(1))).resolves.toEqual(pair(2))
    expect(deps.exchange).not.toHaveBeenCalled()
  })

  it('does not replay after a rotation that finished before a late caller', async () => {
    const { deps, refresh } = setup(pair(1), async () => pair(2))

    await refresh(pair(1))
    await expect(refresh(pair(1))).resolves.toEqual(pair(2))
    expect(deps.exchange).toHaveBeenCalledTimes(1)
  })

  it('ends the session on a refusal', async () => {
    const { state, refresh } = setup(pair(1), async () => {
      throw new AuthError('Your session has expired.', 401)
    })

    await expect(refresh(pair(1))).resolves.toBeNull()
    expect(state.stored).toBeNull()
  })

  it('keeps the session on a network error or a 5xx', async () => {
    const network = setup(pair(1), async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(network.refresh(pair(1))).rejects.toThrow('Failed to fetch')
    expect(network.state.stored).toEqual(pair(1))

    const server = setup(pair(1), async () => {
      throw new AuthError('Sign-in failed (502).', 502)
    })
    await expect(server.refresh(pair(1))).rejects.toThrow(AuthError)
    expect(server.state.stored).toEqual(pair(1))
  })

  it('tries again after a failed rotation rather than caching the failure', async () => {
    let fail = true
    const { refresh } = setup(pair(1), async () => {
      if (fail) throw new TypeError('Failed to fetch')
      return pair(2)
    })

    await expect(refresh(pair(1))).rejects.toThrow()
    fail = false
    await expect(refresh(pair(1))).resolves.toEqual(pair(2))
  })

  it('answers null once signed out', async () => {
    const { deps, refresh } = setup(null, async () => pair(2))

    await expect(refresh(pair(1))).resolves.toBeNull()
    expect(deps.exchange).not.toHaveBeenCalled()
  })
})
