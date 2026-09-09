<script setup lang="ts">
import Message from 'primevue/message'
import Select from 'primevue/select'
import { computed, onScopeDispose, ref, shallowRef, useId } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import ColorDot from '@/components/ColorDot.vue'

import FieldWrapper from './FieldWrapper.vue'
import {
  displayRelation,
  relationRecordFor,
  toRelationOptions,
  toRelationValue,
  withSelectedRecord,
  type RelationDisplay,
  type RelationOption,
  type RelationRecord,
} from './many2one'
import type { FieldValue, WidgetProps } from './types'

/*
 * A field pointing at ONE record of another endpoint -- a country, a tag, a
 * category.
 *
 * The value is the id of the related record, a primitive, which is what lets
 * this be an ordinary <Field> widget: the draft, the dirty diff and the payload
 * need to know nothing about relations.
 *
 * Two modes, and they do not merely look different:
 *  - editable: the candidates are fetched when the dropdown is OPENED, and the
 *    filter box then searches them BACKEND-side (see onFilter) instead of only
 *    sifting what is already loaded.
 *  - read-only: nothing is fetched at all. The label comes from the record the
 *    resource already returned, nested in `options.record`.
 *
 * Nothing is loaded on mount: a form with five relations would otherwise fire
 * five requests to fill dropdowns the user may never open. The consequence is
 * that `options.record` is what labels the current value until the first open,
 * so an edit form that omits it shows a bare id.
 */
const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

const DEFAULT_FILTER_DELAY = 300

/**
 * A computed rather than a bare call in the template: `can()` instantiates the
 * store on every evaluation -- same reason as UserRolesSelectionWidget.
 *
 * No permission declared means no gate: not every relation lives behind a
 * scope of its own.
 */
const allowed = computed(() => {
  const permission = props.options?.permission
  return typeof permission === 'string' && permission !== '' ? can(permission) : true
})

/*
 * Whether the field is DECLARED read-only -- <Field readonly>, or a read-only
 * <Form> -- as opposed to merely locked while a save is in flight.
 *
 * Read once and kept: `form.readonly` is also true for the duration of a PATCH,
 * and a dropdown that turns into a line of text and back reads as a rendering
 * bug. Being locked is what `:disabled` on the <Select> expresses, exactly as
 * the other widgets do.
 */
const declaredReadonly = props.readonly ?? false

/*
 * Missing the permission degrades to the read-only display rather than hiding
 * the field: unlike the role names, the label IS readable -- it came with the
 * record itself. What is unreachable is the list of candidates.
 */
const editable = computed(() => !declaredReadonly && allowed.value)

const display = computed<RelationDisplay>(() => props.options?.relationDisplay ?? displayRelation)

/** The candidates, as the last fetch returned them. */
const records = shallowRef<RelationRecord[]>([])

/**
 * Every record seen so far, by id.
 *
 * Accumulated rather than replaced: a search narrows `records` down to what
 * matched, and the value the form holds is very often not in it. Without this,
 * picking a country and then typing something else in the filter box would
 * leave the field showing its placeholder while still holding a value.
 */
const seen = shallowRef(new Map<string, RelationRecord>())

const loading = ref(false)
/** True once a fetch has succeeded: what tells a first open from a reopen. */
const loaded = ref(false)
/** A failure to read the candidates -- distinct from the `error` prop, which is
    the backend refusing a value. */
const loadError = ref<string | null>(null)

/**
 * The record behind the current value, or null.
 *
 * A record fetched at some point wins; the record the resource nested in its
 * payload is the fallback, and it is checked against the value itself, so a
 * stale one -- the parent reloaded another contact -- cannot label a value it
 * does not describe.
 */
const selected = computed<RelationRecord | null>(() => {
  const value = props.modelValue
  if (value === null || value === '') return null
  return (
    seen.value.get(String(value)) ?? relationRecordFor(value, props.options?.record ?? null)
  )
})

/**
 * The dropdown entries, with the selected record forced in.
 *
 * That merge is what keeps the closed field labelled: <Select> falls back to
 * its placeholder when no option matches the model value, and a server-side
 * search naturally returns lists that exclude the current one.
 *
 * Named `choices`, not `options`: `options` is this field's own configuration
 * prop -- the same collision SelectionField renames around.
 */
const choices = computed<RelationOption[]>(() =>
  withSelectedRecord(toRelationOptions(records.value, display.value), selected.value, display.value),
)

const selectedOption = computed<RelationOption | null>(() => {
  if (props.modelValue === null || props.modelValue === '') return null
  return choices.value.find((option) => String(option.value) === String(props.modelValue)) ?? null
})

/** What read-only shows. An em dash, never an empty line, when there is no value. */
const readonlyLabel = computed<string>(() => {
  const record = selected.value
  if (record) return display.value(record)
  // A value with no record to describe it: the id is a poor label, but it is
  // the truth -- better than pretending the field is empty.
  return props.modelValue === null || props.modelValue === '' ? '—' : String(props.modelValue)
})

const readonlyColor = computed<number | null>(() => selectedOption.value?.color ?? null)

const placeholder = computed<string>(() =>
  typeof props.options?.placeholder === 'string' ? props.options.placeholder : 'Select…',
)

const filterDelay = computed<number>(() =>
  typeof props.options?.filterDelay === 'number' ? props.options.filterDelay : DEFAULT_FILTER_DELAY,
)

// ------------------------------------------------------------------ loading

/*
 * Same race guard as useResourceForm.load: a monotonic ticket gates every state
 * write and the superseded request is aborted. Here it is the normal case, not
 * an edge one -- type-ahead fires a request per pause.
 */
let seq = 0
let inFlight: AbortController | undefined
let pending: ReturnType<typeof setTimeout> | undefined

/** The term of the last load, so a retry repeats the search, not the full list. */
const term = ref<string | null>(null)

async function load(search: string | null): Promise<void> {
  const fetcher = props.options?.fetch
  // Not merely an optimisation in either case: there is nothing to call, or the
  // request is a guaranteed 403 and the field is showing its label instead.
  if (!fetcher || !editable.value) return

  const ticket = ++seq
  inFlight?.abort()
  const controller = (inFlight = new AbortController())

  term.value = search
  loading.value = true
  loadError.value = null

  try {
    const rows = await fetcher(search, controller.signal)
    if (ticket !== seq) return
    records.value = rows
    seen.value = new Map([...seen.value, ...rows.map((row) => [String(row.id), row] as const)])
    loaded.value = true
  } catch (caught) {
    if (ticket !== seq || controller.signal.aborted) return
    // An abort is not a failure: the `aborted` guard above keeps its
    // DOMException from being shown as a message.
    loadError.value = caught instanceof ApiError ? caught.message : 'Could not load the list.'
  } finally {
    if (ticket === seq) loading.value = false
  }
}

/**
 * The filter box searches the BACKEND.
 *
 * Debounced: without it every keystroke is a request, and the ticket guard
 * would be discarding most of them anyway.
 */
function onFilter(event: unknown): void {
  const value = (event as { value?: unknown } | null)?.value
  const search = typeof value === 'string' && value.trim() !== '' ? value.trim() : null

  if (pending) clearTimeout(pending)
  pending = setTimeout(() => void load(search), filterDelay.value)
}

/**
 * Opening the dropdown is what loads it.
 *
 * `loaded` stays false after a failure, so simply reopening retries -- there is
 * no Retry button to press. The last search term is repeated rather than the
 * full list: the filter box still shows it.
 */
function onOpen(): void {
  if (loaded.value || loading.value) return
  void load(term.value)
}

/**
 * A search still waiting on its debounce dies with the panel.
 *
 * Two reasons: its result would land in a dropdown nobody is looking at, and
 * <Select> ignores clicks on its trigger while `loading` is true -- so a
 * request fired after the panel closed would make the field briefly inert for
 * nothing. A request already in flight is left to finish: it is what the filter
 * box still displays, so the next open shows a list that matches it.
 */
function onHide(): void {
  if (pending) clearTimeout(pending)
  pending = undefined
}

function onSelect(next: unknown): void {
  // Nothing to remember here: the picked record is already in `seen` -- it can
  // only have come from a fetch, or from `options.record`, which is consulted
  // on every read anyway.
  emit('update:modelValue', toRelationValue(next))
}

onScopeDispose(() => {
  if (pending) clearTimeout(pending)
  inFlight?.abort()
})
</script>

<template>
  <!-- Editable: the dropdown, and everything that filling it can go through. -->
  <FieldWrapper
    v-if="editable"
    :input-id="inputId"
    :label="label"
    :help="help"
    :required="required"
    :error="error"
  >
    <!-- No loader is a configuration mistake, not a normal state: the same
         reasoning as SelectionField's empty choice list. -->
    <Message v-if="!options?.fetch" severity="warn" :closable="false">
      No loader configured: set <code>options.fetch</code>.
    </Message>

    <!-- The <Select> is mounted from the first paint even though it holds no
         candidate yet: opening it is what loads them, so there is nothing to
         put in its place. Until then it shows the label of the current value,
         which comes from `options.record`. -->
    <template v-else>
      <Select
        :input-id="inputId"
        fluid
        :options="choices"
        option-label="label"
        option-value="value"
        :model-value="modelValue"
        :show-clear="!required"
        :disabled="readonly"
        :invalid="invalid"
        :loading="loading"
        :placeholder="placeholder"
        :filter="options?.filter !== false"
        :filter-placeholder="
          typeof options?.filterPlaceholder === 'string' ? options.filterPlaceholder : 'Search…'
        "
        :filter-fields="['label', 'search']"
        :empty-filter-message="loading ? 'Searching…' : 'No match'"
        :empty-message="loading ? 'Loading…' : 'No option'"
        :reset-filter-on-hide="false"
        @before-show="onOpen"
        @hide="onHide"
        @filter="onFilter"
        @update:model-value="onSelect"
      >
        <!-- The two slots exist for the colour dot. Without them the label is
             right but a coloured relation (a tag) reads like a plain one. -->
        <template #value>
          <span v-if="selectedOption" class="many2one__shown">
            <ColorDot :color="selectedOption.color" />
            {{ selectedOption.label }}
          </span>
          <span v-else>{{ placeholder }}</span>
        </template>

        <template #option="{ option }">
          <span class="many2one__shown">
            <ColorDot :color="option.color" />
            {{ option.label }}
          </span>
        </template>
      </Select>

      <!-- A failed load, reported next to the dropdown rather than in place of
           it: the previous candidates are still there, the value in the draft
           is untouched, and reopening the panel tries again. This degrades to
           "not editable right now", never to a silent wipe. -->
      <small v-if="loadError" class="many2one__load-error">{{ loadError }}</small>
    </template>
  </FieldWrapper>

  <!-- Read-only: no request at all. The label is the one the resource already
       delivered, nested in the record. -->
  <FieldWrapper v-else :label="label" :help="help" :required="required" :error="error">
    <p class="many2one__shown many2one__readonly">
      <ColorDot :color="readonlyColor" />
      {{ readonlyLabel }}
    </p>
  </FieldWrapper>
</template>

<style scoped>
.many2one__shown {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.many2one__readonly {
  /* Aligns the text with the fields above and below, whose control has a
     border and a padding this one does not. */
  margin: 0;
  padding: 0.5rem 0;
}

.many2one__load-error {
  font-size: 0.85rem;
  color: var(--p-red-500);
}
</style>
