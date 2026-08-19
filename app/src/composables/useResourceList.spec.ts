import { effectScope, nextTick, reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import type { ListQuery, Page } from '@/api/list'

import { useResourceList, type ResourceList } from './useResourceList'

interface Row {
  id: string
}

function page(results: Row[], count = results.length): Page<Row> {
  return { count, next: null, previous: null, results }
}

/** A promise whose settlement the test controls, to interleave responses. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Drains the microtask queue; safe under fake timers, unlike setTimeout(0). */
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve()
  await nextTick()
}

/** Runs the composable in a bare scope -- no component, no router. */
function mount(options: Parameters<typeof useResourceList<Row, never>>[0] | object) {
  const scope = effectScope()
  let list!: ResourceList<Row>
  scope.run(() => {
    list = useResourceList(options as never)
  })
  return { list, scope }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useResourceList', () => {
  it('loads immediately, without waiting for onMounted', async () => {
    const fetchPage = vi.fn(async () => page([{ id: 'a' }], 1))
    const { list, scope } = mount({ fetchPage })

    expect(fetchPage).toHaveBeenCalledTimes(1)
    await flush()
    expect(list.rows.value).toEqual([{ id: 'a' }])
    expect(list.total.value).toBe(1)
    expect(list.isInitialLoad.value).toBe(false)
    scope.stop()
  })

  it('does not let a slow earlier response overwrite a newer one', async () => {
    // The regression this refactor exists for: type, then sort. The sorted
    // response lands first; the older unsorted one must be discarded, or the
    // rows and the sort arrow disagree with no way back.
    const first = deferred<Page<Row>>()
    const second = deferred<Page<Row>>()
    const responses = [first.promise, second.promise]
    const fetchPage = vi.fn(() => responses.shift()!)

    const { list, scope } = mount({ fetchPage })
    list.onSort({ sortField: 'email', sortOrder: -1 })
    expect(fetchPage).toHaveBeenCalledTimes(2)

    second.resolve(page([{ id: 'newer' }]))
    await flush()
    expect(list.rows.value).toEqual([{ id: 'newer' }])

    first.resolve(page([{ id: 'older' }]))
    await flush()
    expect(list.rows.value).toEqual([{ id: 'newer' }])
    expect(list.loading.value).toBe(false)
    scope.stop()
  })

  it('aborts the superseded request', async () => {
    const signals: AbortSignal[] = []
    const fetchPage = vi.fn(async (_q: ListQuery<never>, signal: AbortSignal) => {
      signals.push(signal)
      return page([])
    })

    const { list, scope } = mount({ fetchPage })
    list.onSort({ sortField: 'email', sortOrder: 1 })
    await flush()

    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)
    scope.stop()
  })

  it('debounces filter changes into a single request and returns to page 1', async () => {
    vi.useFakeTimers()
    // Parameters are declared so `mock.calls[n][0]` is typed: an untyped mock
    // gives vi.fn an empty tuple and indexing it is a compile error.
    const fetchPage = vi.fn(async (_query: ListQuery<{ search: string }>, _signal: AbortSignal) =>
      page([], 100),
    )
    const filters = reactive({ search: '' })
    const { list, scope } = mount({ fetchPage, filters, pageSize: 10 })

    list.onPage({ first: 20, rows: 10 })
    await flush()
    expect(list.first.value).toBe(20)
    expect(fetchPage).toHaveBeenCalledTimes(2)

    filters.search = 'a'
    await flush()
    filters.search = 'ab'
    await flush()
    expect(fetchPage).toHaveBeenCalledTimes(2) // still waiting

    vi.advanceTimersByTime(300)
    await flush()
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(list.first.value).toBe(0)
    expect(fetchPage.mock.calls[2]![0]).toMatchObject({ page: 1, filters: { search: 'ab' } })
    scope.stop()
  })

  it('does not re-fetch when a filter change normalises to the same value', async () => {
    vi.useFakeTimers()
    const fetchPage = vi.fn(async () => page([]))
    const filters = reactive({ search: 'ad' })
    const { scope } = mount({ fetchPage, filters })

    filters.search = 'ad  ' // trailing whitespace is trimmed away
    await flush()
    vi.advanceTimersByTime(300)
    await flush()

    expect(fetchPage).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('stops working once its scope is disposed', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const fetchPage = vi.fn(async (_q: ListQuery<never>, signal: AbortSignal) => {
      signals.push(signal)
      return page([])
    })
    const filters = reactive({ search: '' })
    const { scope } = mount({ fetchPage, filters })
    await flush()

    filters.search = 'a'
    await flush()
    scope.stop()
    vi.advanceTimersByTime(1000)
    await flush()

    expect(fetchPage).toHaveBeenCalledTimes(1) // the pending debounce never fired
    expect(signals[0]!.aborted).toBe(true)
  })

  it('recovers from a 404 past the last page by falling back to page 1', async () => {
    // Rows deleted elsewhere, or a shared ?page=99 link: the backend answers
    // 404, not an empty list, and the UI must not show a dead end.
    const calls: ListQuery<never>[] = []
    const fetchPage = vi.fn(async (query: ListQuery<never>) => {
      calls.push(query)
      if (query.page > 1) throw new ApiError('Object not found', 404)
      return page([{ id: 'a' }], 1)
    })

    const { list, scope } = mount({ fetchPage, pageSize: 10 })
    await flush()

    list.onPage({ first: 90, rows: 10 })
    await flush()

    expect(calls.map((c) => c.page)).toEqual([1, 10, 1])
    expect(list.first.value).toBe(0)
    expect(list.error.value).toBeNull()
    expect(list.rows.value).toEqual([{ id: 'a' }])
    scope.stop()
  })

  it('surfaces other errors and empties the table', async () => {
    const fetchPage = vi.fn(async () => {
      throw new ApiError('You do not have permission to perform this action.', 403)
    })
    const { list, scope } = mount({ fetchPage })
    await flush()

    expect(list.error.value).toBe('You do not have permission to perform this action.')
    expect(list.rows.value).toEqual([])
    expect(list.total.value).toBe(0)
    expect(list.isInitialLoad.value).toBe(false)
    scope.stop()
  })
})
