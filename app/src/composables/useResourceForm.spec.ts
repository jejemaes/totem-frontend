import { effectScope, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { ApiError, NON_FIELD } from '@/api/client'
import type { FormData } from '@/components/form/context'

import { useResourceForm, type ResourceForm, type UseResourceFormOptions } from './useResourceForm'

interface Record {
  id: string
  name: string
}

const DEFAULTS: FormData = { name: null }

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

/** Drains the microtask queue. */
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve()
  await nextTick()
}

/** Runs the composable in a bare scope -- no component, no router. */
function mount(overrides: Partial<UseResourceFormOptions<Record>> = {}) {
  const scope = effectScope()
  let form!: ResourceForm
  scope.run(() => {
    form = useResourceForm<Record>({
      id: null,
      defaults: DEFAULTS,
      toForm: (record) => ({ name: record.name }),
      create: vi.fn(async () => ({ id: '1', name: 'created' })),
      update: vi.fn(async () => ({ id: '1', name: 'updated' })),
      ...overrides,
    })
  })
  return { form, scope }
}

describe('useResourceForm — create mode', () => {
  it('seeds from the defaults without fetching', async () => {
    const fetchOne = vi.fn()
    const { form } = mount({ fetchOne })
    await flush()

    expect(form.isNew.value).toBe(true)
    expect(form.data.value).toEqual(DEFAULTS)
    expect(form.loading.value).toBe(false)
    expect(fetchOne).not.toHaveBeenCalled()
  })

  // A shared object would let one visit's edits leak into the next.
  it('hands out a fresh copy of the defaults', async () => {
    const { form } = mount()
    await flush()
    expect(form.data.value).not.toBe(DEFAULTS)
  })

  it('calls create, not update, and reports the mode to onSaved', async () => {
    const create = vi.fn(async () => ({ id: '1', name: 'created' }))
    const update = vi.fn()
    const onSaved = vi.fn()
    const { form } = mount({ create, update, onSaved })
    await flush()

    await form.save({ name: 'x' })

    expect(create).toHaveBeenCalledWith({ name: 'x' })
    expect(update).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith({ id: '1', name: 'created' }, 'create')
    expect(form.saving.value).toBe(false)
  })
})

describe('useResourceForm — edit mode', () => {
  it('loads the record and narrows it through toForm', async () => {
    const fetchOne = vi.fn(async () => ({ id: '7', name: 'Totem' }))
    const { form } = mount({ id: '7', fetchOne })
    await flush()

    expect(form.isNew.value).toBe(false)
    expect(fetchOne).toHaveBeenCalledWith('7', expect.anything())
    // Only the keys toForm returns: `id` must not reach the draft, or it would
    // be sent back in the payload.
    expect(form.data.value).toEqual({ name: 'Totem' })
  })

  it('calls update with the id', async () => {
    const update = vi.fn(async () => ({ id: '7', name: 'Renamed' }))
    const { form } = mount({ id: '7', fetchOne: async () => ({ id: '7', name: 'Totem' }), update })
    await flush()

    await form.save({ name: 'Renamed' })
    expect(update).toHaveBeenCalledWith('7', { name: 'Renamed' })
  })

  it('refetches when the id changes under a reused component', async () => {
    const id = ref<string | null>('1')
    const fetchOne = vi.fn(async (given: string) => ({ id: given, name: `n${given}` }))
    const { form } = mount({ id, fetchOne })
    await flush()
    expect(form.data.value).toEqual({ name: 'n1' })

    id.value = '2'
    await flush()

    expect(fetchOne).toHaveBeenCalledTimes(2)
    expect(form.data.value).toEqual({ name: 'n2' })
  })

  // Clicking quickly from one record to another must not let the older
  // response paint over the newer one.
  it('ignores a response that a newer request has superseded', async () => {
    const first = deferred<Record>()
    const second = deferred<Record>()
    const responses = [first, second]
    const id = ref<string | null>('1')
    const { form } = mount({ id, fetchOne: () => responses.shift()!.promise })
    await flush()

    id.value = '2'
    await flush()

    second.resolve({ id: '2', name: 'newer' })
    await flush()
    first.resolve({ id: '1', name: 'older' })
    await flush()

    expect(form.data.value).toEqual({ name: 'newer' })
  })

  it('reports a 404 with the caller-supplied message and shows no form', async () => {
    const fetchOne = vi.fn(async () => {
      throw new ApiError('User not found.', 404)
    })
    const { form } = mount({ id: '7', fetchOne, notFoundMessage: 'Gone.' })
    await flush()

    expect(form.loadError.value).toBe('Gone.')
    expect(form.data.value).toBeNull()
    expect(form.loading.value).toBe(false)
  })

  it('passes a non-404 load failure through with the backend wording', async () => {
    const fetchOne = vi.fn(async () => {
      throw new ApiError('You do not have permission.', 403)
    })
    const { form } = mount({ id: '7', fetchOne })
    await flush()

    expect(form.loadError.value).toBe('You do not have permission.')
  })
})

describe('useResourceForm — only what changed', () => {
  const record = { id: '7', name: 'Totem' }

  it('sends update the changed subset, not the whole draft', async () => {
    const update = vi.fn(async () => record)
    const { form } = mount({ id: '7', fetchOne: async () => record, update })
    await flush()

    await form.save({ name: 'Renamed', other: 'untouched' }, { name: 'Renamed' })

    expect(update).toHaveBeenCalledWith('7', { name: 'Renamed' })
  })

  // An empty PATCH body updates no row, and the backend reports that as a 404,
  // so the request must not be made at all.
  it('makes no request when nothing was edited', async () => {
    const update = vi.fn()
    const onSaved = vi.fn()
    const { form } = mount({ id: '7', fetchOne: async () => record, update, onSaved })
    await flush()

    await form.save({ name: 'Totem' }, {})

    expect(update).not.toHaveBeenCalled()
    // The screen still moves on: Save with no edits is not an error.
    expect(onSaved).toHaveBeenCalledWith(record, 'edit')
    expect(form.error.value).toBeNull()
  })

  // A create has no baseline to diff against, so an empty `changed` must not
  // suppress it.
  it('still creates when nothing looks changed', async () => {
    const create = vi.fn(async () => record)
    const { form } = mount({ create })
    await flush()

    await form.save({ name: 'x' }, {})

    expect(create).toHaveBeenCalledWith({ name: 'x' })
  })

  it('falls back to the full draft when no subset is given', async () => {
    const update = vi.fn(async () => record)
    const { form } = mount({ id: '7', fetchOne: async () => record, update })
    await flush()

    await form.save({ name: 'Renamed' })

    expect(update).toHaveBeenCalledWith('7', { name: 'Renamed' })
  })
})

describe('useResourceForm — save errors', () => {
  it('routes field-keyed 422 messages to fieldErrors', async () => {
    const create = vi.fn(async () => {
      throw new ApiError('Field required', 422, { name: 'Field required' })
    })
    const { form } = mount({ create })
    await flush()

    await form.save({ name: null })

    expect(form.fieldErrors.value).toEqual({ name: 'Field required' })
    // The fields show their own messages, so the banner does not repeat them.
    expect(form.error.value).toBe('Please fix the fields in error.')
  })

  // A duplicate login is caught by a database constraint, not a field
  // validator, so it arrives with no field attached and only the banner can
  // carry it.
  it('surfaces a non-field 422 in the banner verbatim', async () => {
    const create = vi.fn(async () => {
      throw new ApiError('Taken.', 422, { [NON_FIELD]: 'Taken.' })
    })
    const { form } = mount({ create })
    await flush()

    await form.save({ name: 'x' })

    expect(form.error.value).toBe('Taken.')
  })

  it('falls back to the backend message when there are no field errors', async () => {
    const create = vi.fn(async () => {
      throw new ApiError('Error 500', 500)
    })
    const { form } = mount({ create })
    await flush()

    await form.save({ name: 'x' })
    expect(form.error.value).toBe('Error 500')
    expect(form.fieldErrors.value).toEqual({})
  })

  it('uses the caller message for a non-ApiError failure', async () => {
    const create = vi.fn(async () => {
      throw new TypeError('network')
    })
    const { form } = mount({ create, saveErrorMessage: 'Nope.' })
    await flush()

    await form.save({ name: 'x' })
    expect(form.error.value).toBe('Nope.')
  })

  it('clears saving and the previous errors on a retry', async () => {
    let fail = true
    const create = vi.fn(async () => {
      if (fail) throw new ApiError('Taken.', 422, { name: 'Taken.' })
      return { id: '1', name: 'ok' }
    })
    const { form } = mount({ create })
    await flush()

    await form.save({ name: 'x' })
    expect(form.fieldErrors.value).toEqual({ name: 'Taken.' })

    fail = false
    await form.save({ name: 'y' })

    expect(form.fieldErrors.value).toEqual({})
    expect(form.error.value).toBeNull()
    expect(form.saving.value).toBe(false)
  })

  it('does not call onSaved when the save failed', async () => {
    const onSaved = vi.fn()
    const create = vi.fn(async () => {
      throw new ApiError('nope', 422)
    })
    const { form } = mount({ create, onSaved })
    await flush()

    await form.save({ name: 'x' })
    expect(onSaved).not.toHaveBeenCalled()
  })
})
