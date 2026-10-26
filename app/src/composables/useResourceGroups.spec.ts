import { effectScope, nextTick, reactive, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GroupPage, GroupQuery } from '@/api/groupBy'

import {
  useResourceGroups,
  type ResourceGroups,
  type UseResourceGroupsOptions,
} from './useResourceGroups'

type Filters = { search?: string | null }

function page(results: GroupPage['results'], count = results.length): GroupPage {
  return { count, results }
}

/** A promise whose settlement the test controls, to interleave responses. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** Drains the microtask queue; safe under fake timers, unlike setTimeout(0). */
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve()
  await nextTick()
}

/** Runs the composable in a bare scope -- no component, no router. */
function mount(options: UseResourceGroupsOptions<Filters>) {
  const scope = effectScope()
  let chart!: ResourceGroups
  scope.run(() => {
    chart = useResourceGroups(options)
  })
  return { chart, scope }
}

const SELECTION = { dimensions: ['category'], measures: ['amount_sum'], ordering: null }

afterEach(() => {
  vi.useRealTimers()
})

describe('useResourceGroups', () => {
  it('loads immediately, with the selection and the filters', async () => {
    const filters = reactive<Filters>({ search: 'rent' })
    const fetchGroups = vi.fn(async () => page([{ category: null, amount_sum: '1.00' }], 1))
    const { chart, scope } = mount({ fetchGroups, filters, selection: () => SELECTION })

    expect(fetchGroups).toHaveBeenCalledTimes(1)
    const [query] = fetchGroups.mock.calls[0] as unknown as [GroupQuery<Filters>]
    expect(query).toMatchObject({ ...SELECTION, filters: { search: 'rent' } })
    await flush()
    expect(chart.groups.value).toEqual([{ category: null, amount_sum: '1.00' }])
    expect(chart.total.value).toBe(1)
    expect(chart.isInitialLoad.value).toBe(false)
    scope.stop()
  })

  it('discards an older response landing last', async () => {
    const first = deferred<GroupPage>()
    const second = deferred<GroupPage>()
    const fetchGroups = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const measures = ref(['amount_sum'])
    const { chart, scope } = mount({
      fetchGroups,
      selection: () => ({ ...SELECTION, measures: measures.value }),
    })

    measures.value = ['count']
    await flush()
    expect(fetchGroups).toHaveBeenCalledTimes(2)

    second.resolve(page([{ count: 2 }]))
    await flush()
    first.resolve(page([{ amount_sum: '9.00' }]))
    await flush()

    expect(chart.groups.value).toEqual([{ count: 2 }])
    // What the groups answer, so the labels never pair the old groups with the new measure.
    expect(chart.shown.value?.measures).toEqual(['count'])
    scope.stop()
  })

  it('reloads at once on a new selection, but debounces the filters', async () => {
    vi.useFakeTimers()
    const filters = reactive<Filters>({ search: null })
    const ordering = ref<string | null>(null)
    const fetchGroups = vi.fn(async () => page([]))
    const { scope } = mount({
      fetchGroups,
      filters,
      selection: () => ({ ...SELECTION, ordering: ordering.value }),
    })
    expect(fetchGroups).toHaveBeenCalledTimes(1)

    ordering.value = '-amount_sum'
    await flush()
    expect(fetchGroups).toHaveBeenCalledTimes(2)

    filters.search = 'r'
    await flush()
    filters.search = 're'
    await flush()
    expect(fetchGroups).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(300)
    expect(fetchGroups).toHaveBeenCalledTimes(3)
    scope.stop()
  })

  it('fetches nothing on a selection change before its first load', async () => {
    const measures = ref(['amount_sum'])
    const fetchGroups = vi.fn(async () => page([]))
    const { chart, scope } = mount({
      fetchGroups,
      selection: () => ({ ...SELECTION, measures: measures.value }),
      immediate: false,
    })

    measures.value = ['count']
    await flush()
    expect(fetchGroups).not.toHaveBeenCalled()

    await chart.reload()
    expect(fetchGroups).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('shows a failure, and clears the groups', async () => {
    const fetchGroups = vi.fn(async () => {
      throw new Error('Boom')
    })
    const { chart, scope } = mount({ fetchGroups, selection: () => SELECTION })
    await flush()
    expect(chart.error.value).toBe('Boom')
    expect(chart.groups.value).toEqual([])
    expect(chart.loading.value).toBe(false)
    scope.stop()
  })
})
