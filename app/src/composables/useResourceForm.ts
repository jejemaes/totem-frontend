/**
 * Create-or-edit state for a single record behind the generic <Form>.
 *
 * One screen serves both modes: with no id it is a blank create form, with an
 * id it loads the record first and saves with an update. Everything that
 * differs between the two lives here, so the view only declares its fields.
 *
 * NOTE: like `useResourceList` and unlike `useTheme`, every piece of state
 * lives INSIDE the function -- do not hoist any ref to module scope.
 *
 * The composable never imports a `resources/` module: it receives `fetchOne`,
 * `create` and `update`. That is what keeps it resource-agnostic and testable
 * with fake callbacks, without mocking `fetch` or mounting a component.
 */

import { computed, onScopeDispose, ref, toValue, watch, type ComputedRef, type Ref } from 'vue'

import { ApiError, NON_FIELD } from '@/api/client'
import type { FormData } from '@/components/form/context'

/** Reads as either a plain value, a ref, or a getter -- Vue 3.5's `toValue`. */
type Reactive<T> = T | Ref<T> | (() => T)

export interface UseResourceFormOptions<T> {
  /**
   * The record's id, or null for a create form. A getter so the composable
   * follows a route param: vue-router reuses the component when only the param
   * changes, and the record has to be refetched when it does.
   */
  id: Reactive<string | null>
  /** Values for a blank form. One key per <Field> the view declares. */
  defaults: FormData
  /** Narrows a fetched record down to the keys the form owns. */
  toForm(record: T): FormData
  /** Loads the record being edited. Only needed when `id` can be non-null. */
  fetchOne?(id: string, signal: AbortSignal): Promise<T>
  create(values: FormData): Promise<T>
  /**
   * Receives ONLY the keys the user edited, not the whole draft: a PATCH
   * should carry what changed and nothing else. Never called with an empty
   * object -- see `save`.
   */
  update(id: string, changed: FormData): Promise<T>
  /**
   * Runs when a record has been loaded, and with `null` on a create form once
   * the defaults are seeded.
   *
   * For state living OUTSIDE the <Form> draft -- the value of a standalone
   * widget, which is not a <Field> and therefore registers nothing. Nothing
   * else would re-seed it when the route param changes under a reused
   * component, so without this hook such a widget keeps showing the previous
   * record's value.
   */
  onLoaded?(record: T | null): void
  /**
   * True when that outside state was edited.
   *
   * Without it, an edit that touched only a standalone widget leaves `changed`
   * empty, `save` below takes its no-op shortcut, and the change is dropped in
   * silence -- the screen even navigates away as if it had been saved.
   */
  hasExternalChanges?(): boolean
  /**
   * Runs after a successful save -- typically a redirect. Its resolved value
   * is ignored, so `router.push` can be returned straight from an arrow
   * without discarding its NavigationFailure.
   */
  onSaved?(record: T, mode: 'create' | 'edit'): void | Promise<unknown>
  /** Message for a non-ApiError failure. */
  saveErrorMessage?: string
  /** Message for a 404 while loading. */
  notFoundMessage?: string
}

export interface ResourceForm {
  /** True for a create form: drives the title, the button and the payload. */
  isNew: ComputedRef<boolean>
  /**
   * What to hand <Form>. Null while the record loads, so the view can render a
   * placeholder and mount <Form> once, already seeded.
   */
  data: Ref<FormData | null>
  loading: Ref<boolean>
  /** The record could not be read at all: there is no form to show. */
  loadError: Ref<string | null>
  saving: Ref<boolean>
  /** Banner message for a failed save: what could not be pinned to a field. */
  error: Ref<string | null>
  /** Server errors per field, straight into <Form>'s `errors` prop. */
  fieldErrors: Ref<Record<string, string>>
  /**
   * Hand this to <Form>'s `save` event, which supplies both arguments: the
   * whole draft, and the subset that differs from what the form was seeded
   * with.
   */
  save(values: FormData, changed?: FormData): Promise<void>
  /** Load the record again, discarding any edit in progress. */
  reload(): Promise<void>
}

export function useResourceForm<T>(options: UseResourceFormOptions<T>): ResourceForm {
  const id = computed(() => toValue(options.id))
  const isNew = computed(() => !id.value)

  const data = ref<FormData | null>(null)
  const loading = ref(false)
  const loadError = ref<string | null>(null)

  const saving = ref(false)
  const error = ref<string | null>(null)
  const fieldErrors = ref<Record<string, string>>({})

  // Same race guard as useResourceList: a monotonic ticket gates every state
  // write, and the superseded request is aborted. Clicking quickly from one
  // record to another must not let the older response paint over the newer.
  let seq = 0
  let inFlight: AbortController | undefined

  /** The record as fetched, kept so a no-op save still has something to hand
      to `onSaved`. */
  let loaded: T | null = null

  async function load(): Promise<void> {
    const ticket = ++seq
    inFlight?.abort()
    const controller = (inFlight = new AbortController())

    error.value = null
    fieldErrors.value = {}

    // A create form has nothing to fetch: seed it and stop. A fresh copy of
    // `defaults` every time, so a reload really does reset the fields.
    if (!id.value || !options.fetchOne) {
      loaded = null
      loadError.value = null
      loading.value = false
      data.value = { ...options.defaults }
      options.onLoaded?.(null)
      return
    }

    loading.value = true
    loadError.value = null
    data.value = null

    try {
      const record = await options.fetchOne(id.value, controller.signal)
      if (ticket !== seq) return
      loaded = record
      data.value = options.toForm(record)
      // Inside the ticket guard above, so a superseded response cannot re-seed
      // a widget with the record the user has already navigated away from.
      options.onLoaded?.(record)
    } catch (caught) {
      if (ticket !== seq || controller.signal.aborted) return
      loadError.value =
        caught instanceof ApiError && caught.status === 404
          ? (options.notFoundMessage ?? 'This record no longer exists.')
          : caught instanceof ApiError
            ? caught.message
            : 'Could not load this record.'
    } finally {
      if (ticket === seq) loading.value = false
    }
  }

  async function save(values: FormData, changed: FormData = values): Promise<void> {
    // Captured before any await: the id must not change mid-save.
    const current = id.value

    // Nothing was touched. Skipping the request is not just an optimisation:
    // an empty PATCH body updates no row, and the backend reports that as a
    // 404. The screen still moves on, which is what Save is expected to do.
    //
    // `hasExternalChanges` is the escape hatch: the draft can be untouched
    // while a standalone widget outside it was edited, and that edit still has
    // to be sent.
    if (current && !Object.keys(changed).length && !options.hasExternalChanges?.()) {
      if (loaded) await options.onSaved?.(loaded, 'edit')
      return
    }

    saving.value = true
    error.value = null
    fieldErrors.value = {}

    try {
      const record = current
        ? await options.update(current, changed)
        : await options.create(values)
      await options.onSaved?.(record, current ? 'edit' : 'create')
    } catch (caught) {
      if (caught instanceof ApiError) {
        fieldErrors.value = caught.fields ?? {}
        // `__all__` carries what the backend could not attach to a field --
        // a duplicate login, caught by a uniqueness constraint in the database
        // rather than by a field validator, lands there. Field errors are
        // already shown under their fields, so the banner does not repeat them.
        error.value =
          caught.fields?.[NON_FIELD] ??
          (Object.keys(caught.fields ?? {}).length
            ? 'Please fix the fields in error.'
            : caught.message)
      } else {
        error.value = options.saveErrorMessage ?? 'Could not save.'
      }
    } finally {
      saving.value = false
    }
  }

  // `immediate`, and keyed on the id rather than onMounted: it works inside a
  // plain effectScope, and it refetches when the route param changes under a
  // reused component.
  watch(id, () => void load(), { immediate: true })

  onScopeDispose(() => inFlight?.abort())

  return { isNew, data, loading, loadError, saving, error, fieldErrors, save, reload: load }
}
