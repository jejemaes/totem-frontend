<script setup lang="ts">
import Button from 'primevue/button'
import Message from 'primevue/message'
import { computed, provide, reactive, ref, toRaw, watch } from 'vue'

import { FORM_CONTEXT, type FormData } from './context'
import type { FieldValue } from './fields/types'
import { isEmpty, sameFieldValue } from './fields/values'

const props = withDefaults(
  defineProps<{
    /** Initial values. Never mutated: the form works on a copy. */
    data: FormData
    saveLabel?: string
    /** Disables every field and hides the actions row. */
    readonly?: boolean
    /** Spinner on the save button while a request is in flight. */
    saving?: boolean
    /**
     * Errors returned by the backend, keyed by field name. A key matching no
     * <Field> -- `__all__` typically -- is shown nowhere here: it stays with
     * the parent's banner.
     */
    errors?: Record<string, string>
  }>(),
  { saveLabel: 'Save', readonly: false, saving: false, errors: undefined },
)

const emit = defineEmits<{
  /**
   * Detached snapshots, never the internal reactive proxy.
   *
   * `values` is the whole draft; `changed` holds only the keys that differ
   * from the `data` the form was seeded with. A create sends the first, an
   * update the second -- a PATCH should carry what was edited and nothing
   * else, both to avoid pointless writes and because a backend may react to
   * the mere presence of a key.
   */
  save: [values: FormData, changed: FormData]
}>()

defineSlots<{
  default(props: { draft: Readonly<FormData>; dirty: boolean }): unknown
  actions?(props: { invalid: boolean; dirty: boolean }): unknown
}>()

const draft = reactive<FormData>({ ...props.data })

/**
 * What the form was seeded with, to tell an edit from an untouched value. A
 * ref rather than a plain object so `changed` recomputes when a new record
 * replaces the current one.
 */
const baseline = ref<FormData>({ ...props.data })

/** Filled in by the mounted <Field>s: the form cannot discover them any other
    way, they live in its default slot. */
const requiredNames = reactive(new Set<string>())

/** Required fields left empty by the last rejected submit. */
const missing = ref<string[]>([])

/**
 * Local copy of the server errors: a prop must not be mutated, and fixing a
 * field has to clear its error at once, the same way `required` does.
 */
const serverErrors = ref<Record<string, string>>({})
watch(() => props.errors, (next) => { serverErrors.value = { ...next } }, { immediate: true })

/** Locks the fields. `saving` counts: a value already sent to the backend must
    not keep changing under it. */
const readonly = computed(() => props.readonly || props.saving)

/** The actions row, on the other hand, follows ONLY `readonly`: during a save
    the button must stay mounted to carry its spinner. */
const showActions = computed(() => !props.readonly)

/**
 * The keys whose value differs from the seed.
 *
 * A key ABSENT from `data` counts as changed as soon as it holds anything: it
 * was filled by a <Field default>, and the caller does not have that value
 * yet.
 *
 * `sameFieldValue` and not `Object.is`: a list-valued field is rebuilt on every
 * pick, so reference equality would report it as edited forever -- Save would
 * never disable, and every PATCH would carry it.
 */
const changed = computed<FormData>(() => {
  const result: FormData = {}
  for (const [key, value] of Object.entries(draft)) {
    if (!sameFieldValue(value, baseline.value[key])) result[key] = value
  }
  return result
})

const dirty = computed(() => Object.keys(changed.value).length > 0)

/** A field's error message: the `required` constraint first, then whatever the
    server answered. */
function errorFor(name: string): string | undefined {
  if (missing.value.includes(name)) return 'This field is required.'
  return serverErrors.value[name]
}

// Watch on IDENTITY, definitely not `deep`: a deep watch would clobber the
// user's edits every time the parent touched its own object. A new object means
// a new record, so the draft is re-seeded.
watch(
  () => props.data,
  (next) => {
    for (const key of Object.keys(draft)) delete draft[key]
    Object.assign(draft, next)
    baseline.value = { ...next }
    missing.value = []
    serverErrors.value = {}
  },
)

provide(FORM_CONTEXT, {
  values: draft,
  set(name: string, value: FieldValue) {
    draft[name] = value
    // Fixing a field clears its error immediately, without waiting for another
    // submit. A server error goes on the first keystroke: it is the backend's
    // job to say whether the new value is acceptable.
    if (missing.value.includes(name) && !isEmpty(value)) {
      missing.value = missing.value.filter((entry) => entry !== name)
    }
    if (name in serverErrors.value) {
      const rest = { ...serverErrors.value }
      delete rest[name]
      serverErrors.value = rest
    }
  },
  register(name: string, defaultValue: FieldValue) {
    // Only when the key is absent: a `null` present in `data` is a real value
    // ("known empty") and must not be overwritten by the default.
    if (!(name in draft)) draft[name] = defaultValue
  },
  setRequired(name: string, required: boolean) {
    if (required) requiredNames.add(name)
    else requiredNames.delete(name)
  },
  unregister(name: string) {
    requiredNames.delete(name)
    missing.value = missing.value.filter((entry) => entry !== name)
  },
  invalid: (name: string) => Boolean(errorFor(name)),
  error: errorFor,
  readonly,
})

function onSubmit(): void {
  // A new submit starts from a clean slate: the previous attempt's errors are
  // worthless, only the coming response counts.
  serverErrors.value = {}
  missing.value = [...requiredNames].filter((name) => isEmpty(draft[name]))
  if (missing.value.length) return
  emit('save', { ...toRaw(draft) }, { ...changed.value })
}
</script>

<template>
  <!-- novalidate: the browser's native bubbles must not compete with our own
       messages. The <form> is kept so that Enter submits, as in LoginView. -->
  <form class="form" novalidate @submit.prevent="onSubmit">
    <div class="form__fields">
      <slot :draft="draft" :dirty="dirty" />
    </div>

    <Message v-if="missing.length" severity="error" :closable="false">
      Please fill in the required fields.
    </Message>

    <div v-if="showActions" class="form__actions">
      <slot name="actions" :invalid="missing.length > 0" :dirty="dirty">
        <Button type="submit" :label="saveLabel" icon="pi pi-check" :loading="saving" />
      </slot>
    </div>
  </form>
</template>

<style scoped>
.form {
  display: grid;
  gap: 1rem;
}

.form__fields {
  display: grid;
  gap: 1rem;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
