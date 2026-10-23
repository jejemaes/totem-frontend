import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDelayedFlag } from './delayedFlag'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createDelayedFlag', () => {
  it('stays off for an input shorter than the delay', () => {
    const onChange = vi.fn()
    const flag = createDelayedFlag(300, onChange)

    flag.set(true)
    vi.advanceTimersByTime(250)
    flag.set(false)
    vi.advanceTimersByTime(1000)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('turns on once the input has lasted the delay, and off at once', () => {
    const onChange = vi.fn()
    const flag = createDelayedFlag(300, onChange)

    flag.set(true)
    vi.advanceTimersByTime(300)
    expect(onChange).toHaveBeenLastCalledWith(true)

    flag.set(false)
    expect(onChange).toHaveBeenLastCalledWith(false)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('keeps showing through a second slow input rather than blinking', () => {
    const onChange = vi.fn()
    const flag = createDelayedFlag(300, onChange)

    flag.set(true)
    vi.advanceTimersByTime(300)
    flag.set(true)
    vi.advanceTimersByTime(1000)

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('restarts the delay for each new input', () => {
    const onChange = vi.fn()
    const flag = createDelayedFlag(300, onChange)

    flag.set(true)
    vi.advanceTimersByTime(200)
    flag.set(false)
    flag.set(true)
    vi.advanceTimersByTime(200)
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('fires nothing once disposed', () => {
    const onChange = vi.fn()
    const flag = createDelayedFlag(300, onChange)

    flag.set(true)
    flag.dispose()
    vi.advanceTimersByTime(1000)

    expect(onChange).not.toHaveBeenCalled()
  })
})
