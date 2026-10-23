import { describe, expect, it, vi } from 'vitest'

import { createResequenceQueue } from './resequence'

/** A promise whose settlement the test controls. */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** A macrotask: the chain is several promise hops per drop, deeper than a fixed
    count of microtasks can be trusted to drain. Real timers throughout. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('createResequenceQueue', () => {
  it('sends the drops one after the other, in drop order', async () => {
    const first = deferred()
    const second = deferred()
    const pending = [first, second]
    const send = vi.fn(() => pending.shift()!.promise)
    const queue = createResequenceQueue(send, { onError: vi.fn(), onIdle: vi.fn() })

    queue.push(['a', 'b'])
    queue.push(['b', 'a'])
    await flush()
    // The second order waits for the first: in parallel, it could land first.
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenLastCalledWith(['a', 'b'])

    first.resolve()
    await flush()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith(['b', 'a'])
    second.resolve()
    await flush()
  })

  it('goes idle once per burst, not once per drop', async () => {
    const onIdle = vi.fn()
    const queue = createResequenceQueue(async () => {}, { onError: vi.fn(), onIdle })

    queue.push(['a'])
    queue.push(['b'])
    queue.push(['c'])
    expect(queue.pending()).toBe(3)
    await flush()
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(queue.pending()).toBe(0)
  })

  it('reports a refused drop, keeps going, and still goes idle', async () => {
    const onError = vi.fn()
    const onIdle = vi.fn()
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('refused'))
      .mockResolvedValueOnce(undefined)
    const queue = createResequenceQueue(send, { onError, onIdle })

    queue.push(['a'])
    queue.push(['b'])
    await flush()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(2)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('sends a copy, so a caller reusing its array cannot rewrite a queued order', async () => {
    const send = vi.fn(async (_ids: string[]) => {})
    const queue = createResequenceQueue(send, { onError: vi.fn(), onIdle: vi.fn() })
    const ids = ['a', 'b']
    queue.push(ids)
    ids.reverse()
    await flush()
    expect(send).toHaveBeenCalledWith(['a', 'b'])
  })
})
