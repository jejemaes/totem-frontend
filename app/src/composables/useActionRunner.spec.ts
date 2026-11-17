import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { ApiError, NON_FIELD } from '@/api/client'
import type { RecordAction } from '@/components/actions/actions'

import { useActionRunner, type ActionRunner, type AskConfirmation } from './useActionRunner'

type Doc = { id: string; state: string }

const doc: Doc = { id: '1', state: 'draft' }

/** A promise whose settlement the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Runs the composable in a bare scope -- no component, no PrimeVue. */
function mount(ask: AskConfirmation = async () => true) {
  const scope = effectScope()
  let runner!: ActionRunner
  scope.run(() => {
    runner = useActionRunner(ask)
  })
  return { runner, scope }
}

function action(extra: Partial<RecordAction<Doc>> = {}): RecordAction<Doc> {
  return { key: 'publish', label: 'Publish', run: vi.fn(), ...extra }
}

describe('useActionRunner', () => {
  it('runs on the records and hands back what run returned', async () => {
    const published = { ...doc, state: 'published' }
    const run = vi.fn(async () => published)
    const { runner } = mount()

    const outcome = await runner.execute(action({ run }), [doc])

    expect(run).toHaveBeenCalledWith([doc])
    expect(outcome).toEqual({ status: 'done', result: published })
    expect(runner.running.value).toBeNull()
  })

  it('marks the action busy while it runs, and ignores a second one', async () => {
    const pending = deferred<void>()
    const other = vi.fn()
    const { runner } = mount()

    const first = runner.execute(action({ run: () => pending.promise }), [doc])
    expect(runner.running.value).toBe('publish')
    expect(await runner.execute(action({ key: 'other', run: other }), [doc])).toEqual({
      status: 'skipped',
    })
    expect(other).not.toHaveBeenCalled()

    pending.resolve()
    expect((await first).status).toBe('done')
    expect(runner.running.value).toBeNull()
  })

  it('asks first, and runs nothing when declined', async () => {
    const ask = vi.fn(async () => false)
    const run = vi.fn()
    const { runner } = mount(ask)
    const confirm = { header: 'Publish?', message: 'It goes live.' }

    expect(await runner.execute(action({ run, confirm }), [doc])).toEqual({ status: 'skipped' })
    expect(ask).toHaveBeenCalledWith(confirm)
    expect(run).not.toHaveBeenCalled()
  })

  it('does not ask an action without a confirmation', async () => {
    const ask = vi.fn(async () => true)
    const { runner } = mount(ask)
    await runner.execute(action(), [doc])
    expect(ask).not.toHaveBeenCalled()
  })

  it('shows the refusal of the backend, the non-field one first', async () => {
    const { runner } = mount()

    const refused = new ApiError('Validation error.', 422, { [NON_FIELD]: 'Already published.' })
    expect(await runner.execute(action({ run: () => Promise.reject(refused) }), [doc])).toEqual({
      status: 'failed',
    })
    expect(runner.error.value).toBe('Already published.')

    await runner.execute(action({ run: () => Promise.reject(new ApiError('Forbidden.', 403)) }), [
      doc,
    ])
    expect(runner.error.value).toBe('Forbidden.')
  })

  it('names the action on any other failure, and clears it on the next run', async () => {
    const { runner } = mount()

    await runner.execute(action({ run: () => Promise.reject(new TypeError('x')) }), [doc])
    expect(runner.error.value).toBe('Could not run “Publish”.')

    await runner.execute(action(), [doc])
    expect(runner.error.value).toBeNull()
  })

  it('skips the follow-up once its container is gone', async () => {
    const pending = deferred<Doc>()
    const { runner, scope } = mount()

    const outcome = runner.execute(action({ run: () => pending.promise }), [doc])
    scope.stop()
    pending.resolve(doc)

    expect(await outcome).toEqual({ status: 'skipped' })
  })

  it('runs nothing on an empty set', async () => {
    const run = vi.fn()
    const { runner } = mount()
    expect(await runner.execute(action({ run }), [])).toEqual({ status: 'skipped' })
    expect(run).not.toHaveBeenCalled()
  })
})
