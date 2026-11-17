/**
 * Runs record actions for a container -- a form, a card grid, a list -- and
 * holds what every one of them draws around a run: which action is busy, and
 * the refusal to show.
 *
 * Without it each container would re-implement the same four steps (confirm,
 * busy flag, error message, follow-up) and they would drift like the form
 * banners did before <FormView>. What differs -- re-seeding a form, reloading a
 * page of cards -- is left to the caller, which reads the outcome.
 *
 * ONE action at a time: a second click while one runs is ignored rather than
 * queued or raced. Two runs on the same record have no meaningful order, and
 * the containers disable their controls meanwhile anyway. That is also why
 * there is no race ticket here, unlike `useResourceList`: no response can
 * land after a newer one.
 *
 * Like every composable, it imports no `resources/` module: the work is the
 * action's own `run`.
 */

import { useConfirm } from 'primevue/useconfirm'
import { onScopeDispose, ref, type Ref } from 'vue'

import { ApiError, NON_FIELD } from '@/api/client'
import type { RecordAction } from '@/components/actions/actions'

/** Resolves true when the user accepts. Injected by the spec, which has no
    app to provide PrimeVue's confirmation service. */
export type AskConfirmation = (confirm: { header: string; message: string }) => Promise<boolean>

export type ActionOutcome<R> =
  | { status: 'done'; result: R | void }
  /** Declined, another action already running, or the container gone. */
  | { status: 'skipped' }
  | { status: 'failed' }

export interface ActionRunner {
  /** The `key` of the action running, or null. */
  running: Ref<string | null>
  /** The last refusal, for the container's banner. Cleared by the next run. */
  error: Ref<string | null>
  execute<R>(action: RecordAction<R>, records: R[]): Promise<ActionOutcome<R>>
}

/** PrimeVue's confirm dialog -- mounted once, in AdminLayout -- as a promise. */
function confirmDialog(): AskConfirmation {
  const confirm = useConfirm()
  return ({ header, message }) =>
    new Promise((resolve) => {
      confirm.require({
        header,
        message,
        icon: 'pi pi-exclamation-triangle',
        rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
        acceptProps: { label: 'Confirm' },
        accept: () => resolve(true),
        reject: () => resolve(false),
        // Escape or the cross: neither accept nor reject would fire, and the
        // run would wait forever.
        onHide: () => resolve(false),
      })
    })
}

export function useActionRunner(ask: AskConfirmation = confirmDialog()): ActionRunner {
  const running = ref<string | null>(null)
  const error = ref<string | null>(null)

  // A run outliving its container -- the Dialog closed mid-request -- must not
  // have its follow-up (a re-seed, a reload) act on a torn-down view.
  let disposed = false
  onScopeDispose(() => {
    disposed = true
  })

  async function execute<R>(action: RecordAction<R>, records: R[]): Promise<ActionOutcome<R>> {
    if (running.value !== null || !records.length) return { status: 'skipped' }

    error.value = null
    if (action.confirm && !(await ask(action.confirm))) return { status: 'skipped' }
    // Checked again: a second action may have started while the dialog was up.
    if (running.value !== null || disposed) return { status: 'skipped' }

    running.value = action.key
    try {
      const result = await action.run(records)
      return disposed ? { status: 'skipped' } : { status: 'done', result }
    } catch (caught) {
      if (disposed) return { status: 'skipped' }
      // `__all__` carries what the backend could not attach to a field; an
      // action has no field to attach anything to, so any field message will do.
      error.value =
        caught instanceof ApiError
          ? (caught.fields?.[NON_FIELD] ?? caught.message)
          : `Could not run “${action.label}”.`
      return { status: 'failed' }
    } finally {
      running.value = null
    }
  }

  return { running, error, execute }
}
