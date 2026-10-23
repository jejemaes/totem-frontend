/*
 * Saving the order a user drags rows into -- with no dependency on Vue.
 *
 * Every drop sends the WHOLE new order (a resequence route numbers only the ids
 * it is given, so a partial order collides with the sequences it skips). Drops
 * are therefore CHAINED, never fired in parallel: each request carries the
 * order of its moment, and an older one landing last would silently undo the
 * newer one -- the race the ticket idiom guards against on reads, here on a
 * write. Extracted from BudgetLineListView, where it was first written, so that
 * <ListView> and its spec share one copy.
 */

export interface ResequenceHooks {
  /** A drop the backend refused. The chain goes on: the next drop is a new order. */
  onError(caught: unknown): void
  /**
   * The chain went idle -- once per burst, not once per drop, so a quick
   * succession of drags is not interrupted by reloads. Called on failure too:
   * the reload is what puts the server's order back on screen.
   */
  onIdle(): void
}

export interface ResequenceQueue {
  push(ids: readonly string[]): void
  /** Drops sent or waiting. */
  pending(): number
}

export function createResequenceQueue(
  send: (ids: string[]) => Promise<unknown>,
  hooks: ResequenceHooks,
): ResequenceQueue {
  let chain: Promise<void> = Promise.resolve()
  let queued = 0

  return {
    push(ids: readonly string[]): void {
      const order = [...ids]
      queued += 1
      chain = chain
        .then(() => send(order))
        .then(
          () => undefined,
          (caught: unknown) => {
            hooks.onError(caught)
          },
        )
        .finally(() => {
          queued -= 1
          if (queued === 0) hooks.onIdle()
        })
    },
    pending: (): number => queued,
  }
}
