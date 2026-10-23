/*
 * A boolean that turns on only once its input has stayed on for a while --
 * with no dependency on Vue.
 *
 * What <ListView>'s loading mask follows. Shown at once, the mask greyed the
 * table on every sort and page, even for a response landing in 80 ms: the wait
 * was no longer, it was just visible every time, and the lists FELT slower
 * than the hand-wired ones, which never had a mask. Delayed, a quick answer
 * swaps the rows with no flash, and only a request slow enough to wonder about
 * gets the spinner.
 *
 * It turns OFF at once: a mask lingering over fresh rows would hide them.
 */

export interface DelayedFlag {
  /** The raw input -- `loading`. */
  set(on: boolean): void
  /** Drops a pending turn-on: the owner is going away. */
  dispose(): void
}

export function createDelayedFlag(
  delayMs: number,
  onChange: (on: boolean) => void,
): DelayedFlag {
  let timer: ReturnType<typeof setTimeout> | undefined
  let shown = false

  function show(next: boolean): void {
    if (next === shown) return
    shown = next
    onChange(next)
  }

  return {
    set(on: boolean): void {
      clearTimeout(timer)
      timer = undefined
      if (!on) {
        show(false)
        return
      }
      // Already shown: a reload chained on a slow one keeps the mask, rather
      // than blinking it off and on.
      if (shown) return
      timer = setTimeout(() => {
        timer = undefined
        show(true)
      }, delayMs)
    },
    dispose(): void {
      clearTimeout(timer)
      timer = undefined
    },
  }
}
