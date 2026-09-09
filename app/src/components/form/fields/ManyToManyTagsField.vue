<script setup lang="ts">
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import { computed, onScopeDispose, ref, shallowRef, useId } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import ColorDot from '@/components/ColorDot.vue'
import ColorTag from '@/components/ColorTag.vue'

import FieldWrapper from './FieldWrapper.vue'
import {
  relationRecordsFor,
  selectedRelationOptions,
  toRelationIds,
  toRelationValues,
  unresolvedRelationIds,
  withSelectedRecords,
} from './many2many'
import {
  displayRelation,
  toRelationOptions,
  type RelationDisplay,
  type RelationOption,
  type RelationRecord,
} from './many2one'
import type { FieldValue, WidgetProps } from './types'

/*
 * A field pointing at SEVERAL records of another endpoint -- the tags of a
 * contact, and anything else shaped like them.
 *
 * The value is the list of ids of the related records, which is the one thing
 * in the <Field> system that is not a primitive: see FieldValue, and the set
 * comparison in Form.vue that a list-valued draft key forces.
 *
 * Two modes, and they do not merely look different:
 *  - editable: a <MultiSelect> whose chips carry the palette colour of their
 *    record. The candidates are fetched when the dropdown is OPENED, and the
 *    filter box then searches them BACKEND-side (see onFilter) instead of only
 *    sifting what is already loaded.
 *  - read-only: nothing is fetched at all. The pills come from the records the
 *    resource already returned, nested in `options.records`.
 *
 * Nothing is loaded on mount -- same as ManyToOneField, and it matters more
 * here: `options.records` is what paints the chips until the first open, so an
 * edit form that omits it shows bare ids. A form nobody opens the dropdown on
 * costs zero requests, in either mode.
 *
 * There is no create-on-the-fly: a tag is made on its own screen.
 */
const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

const DEFAULT_FILTER_DELAY = 300

/**
 * A computed rather than a bare call in the template: `can()` instantiates the
 * store on every evaluation -- same reason as ManyToOneField.
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
 * and a control that turns into a row of pills and back reads as a rendering
 * bug. Being locked is what `:disabled` expresses, exactly as the other
 * widgets do.
 */
const declaredReadonly = props.readonly ?? false

/*
 * Missing the permission degrades to the read-only pills rather than hiding the
 * field: the tag names ARE readable -- they came with the record itself. What
 * is unreachable is the list of candidates.
 */
const editable = computed(() => !declaredReadonly && allowed.value)

const display = computed<RelationDisplay>(() => props.options?.relationDisplay ?? displayRelation)

/** The ids the form holds. Never null, never a bare id: always a list. */
const ids = computed<(string | number)[]>(() => toRelationIds(props.modelValue))

/** The candidates, as the last fetch returned them. */
const records = shallowRef<RelationRecord[]>([])

/**
 * Every record seen so far, by id.
 *
 * Accumulated rather than replaced: a search narrows `records` down to what
 * matched, and the tags the form holds are very often not in it. Without this,
 * picking a tag and then typing something else in the filter box would blank
 * its chip while the id is still selected.
 */
const seen = shallowRef(new Map<string, RelationRecord>())

const loading = ref(false)
/** True once a fetch has succeeded: what tells a first open from a reopen. */
const loaded = ref(false)
/** A failure to read the candidates -- distinct from the `error` prop, which is
    the backend refusing a value. */
const loadError = ref<string | null>(null)

/**
 * The records describing the current ids.
 *
 * A record fetched at some point wins; the records the resource nested in its
 * payload are the fallback, and they are checked against the ids themselves, so
 * a stale `options.records` -- the parent reloaded another contact -- cannot
 * label ids it does not describe.
 */
const selectedRecords = computed<RelationRecord[]>(() => {
  const nested = relationRecordsFor(ids.value, props.options?.records ?? null)
  const byId = new Map(nested.map((record) => [String(record.id), record]))
  for (const id of ids.value) {
    const fetched = seen.value.get(String(id))
    if (fetched) byId.set(String(id), fetched)
  }
  return [...byId.values()]
})

/**
 * The dropdown entries, with the selected records forced in.
 *
 * That merge is what paints the chips at all before the first open, and what
 * keeps them painted after a server-side search that excludes them.
 *
 * Named `choices`, not `options`: `options` is this field's own configuration
 * prop -- the same collision SelectionField renames around.
 */
const choices = computed<RelationOption[]>(() =>
  withSelectedRecords(
    toRelationOptions(records.value, display.value),
    selectedRecords.value,
    display.value,
  ),
)

/** The entries behind the current ids: the chips, and the read-only pills. */
const selected = computed<RelationOption[]>(() => selectedRelationOptions(ids.value, choices.value))

/**
 * Ids nothing can name: a tag deleted since the record was written, or one the
 * resource did not nest and no fetch has reached.
 *
 * Shown as their bare id rather than dropped -- they are still in the value,
 * and they still go out in the payload. Silently hiding them is how a save
 * loses a tag the user never saw.
 *
 * Only the read-only branch needs this list: <MultiSelect> iterates the raw
 * value itself, so an unnameable id already gets a chip there -- see chipLabel.
 */
const unresolved = computed<(string | number)[]>(() =>
  unresolvedRelationIds(ids.value, choices.value),
)

/**
 * Entries by id, for the #chip slot.
 *
 * That slot is handed the raw value of the item -- the id, since the control is
 * bound with `option-value` -- and not the entry behind it, so the label and
 * the colour have to be looked up.
 */
const optionById = computed<Map<string, RelationOption>>(
  () => new Map(choices.value.map((option) => [String(option.value), option])),
)

/** The id itself when nothing describes it: a bare ULID is a poor label, but it
    is the truth -- better than a blank chip. */
function chipLabel(id: unknown): string {
  return optionById.value.get(String(id))?.label ?? String(id)
}

function chipColor(id: unknown): number | null {
  return optionById.value.get(String(id))?.color ?? null
}

const placeholder = computed<string>(() =>
  typeof props.options?.placeholder === 'string' ? props.options.placeholder : 'Select…',
)

const filterDelay = computed<number>(() =>
  typeof props.options?.filterDelay === 'number' ? props.options.filterDelay : DEFAULT_FILTER_DELAY,
)

// ------------------------------------------------------------------ loading

/*
 * Same race guard as ManyToOneField: a monotonic ticket gates every state write
 * and the superseded request is aborted. Here it is the normal case, not an
 * edge one -- type-ahead fires a request per pause.
 */
let seq = 0
let inFlight: AbortController | undefined
let pending: ReturnType<typeof setTimeout> | undefined

/** The term of the last load, so a retry repeats the search, not the full list. */
const term = ref<string | null>(null)

async function load(search: string | null): Promise<void> {
  const fetcher = props.options?.fetch
  // Not merely an optimisation in either case: there is nothing to call, or the
  // request is a guaranteed 403 and the field is showing its pills instead.
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
    loadError.value = caught instanceof ApiError ? caught.message : 'Could not load the tags.'
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
 * Its result would land in a dropdown nobody is looking at, and it would make
 * the control briefly inert for nothing. A request already in flight is left to
 * finish: it is what the filter box still displays, so the next open shows a
 * list that matches it.
 */
function onHide(): void {
  if (pending) clearTimeout(pending)
  pending = undefined
}

/**
 * The one and only emit -- and always a NEW array.
 *
 * The invariant the whole dirty diff rests on: <Form> holds its baseline as a
 * shallow copy, so mutating this list in place would edit the baseline too and
 * the field would read as untouched forever.
 */
function onSelect(next: unknown): void {
  emit('update:modelValue', toRelationValues(next))
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

    <!-- The <MultiSelect> is mounted from the first paint even though it holds
         no candidate yet: opening it is what loads them, so there is nothing to
         put in its place. Until then its chips come from `options.records`. -->
    <template v-else>
      <MultiSelect
        :input-id="inputId"
        fluid
        display="chip"
        :options="choices"
        option-label="label"
        option-value="value"
        :model-value="ids"
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
        :empty-message="loading ? 'Loading…' : 'No tag'"
        :reset-filter-on-hide="false"
        :show-toggle-all="false"
        class="m2m-tags__control"
        @before-show="onOpen"
        @hide="onHide"
        @filter="onFilter"
        @update:model-value="onSelect"
      >
        <!-- #chip and not #value: this slot replaces the whole <Chip>, so the
             colour reaches the pill's BACKGROUND, and it comes with the
             `removeCallback` that keeps a chip droppable without reopening the
             dropdown. <MultiSelect> keeps ownership of the iteration and of the
             placeholder, which is the half there is no reason to reimplement.

             It also means an id nothing describes still gets a chip -- it is in
             the value, so it is iterated -- rather than vanishing from the
             control while still being saved. -->
        <template #chip="{ value: id, removeCallback }">
          <ColorTag
            :label="chipLabel(id)"
            :color="chipColor(id)"
            removable
            :remove-label="`Remove the tag ${chipLabel(id)}`"
            @remove="(event: MouseEvent) => removeCallback(event, id)"
          />
        </template>

        <template #option="{ option }">
          <span class="m2m-tags__option">
            <ColorDot :color="option.color" />
            {{ option.label }}
          </span>
        </template>
      </MultiSelect>

      <!-- A failed load, reported next to the dropdown rather than in place of
           it: the chips are still there, the value in the draft is untouched,
           and reopening the panel tries again. This degrades to "cannot pick a
           new tag right now", never to a silent wipe. -->
      <small v-if="loadError" class="m2m-tags__load-error">{{ loadError }}</small>
    </template>
  </FieldWrapper>

  <!-- Read-only: no request at all. The pills are the ones the resource already
       delivered, nested in the records. -->
  <FieldWrapper v-else :label="label" :help="help" :required="required" :error="error">
    <p class="m2m-tags__readonly">
      <template v-if="selected.length || unresolved.length">
        <ColorTag
          v-for="option in selected"
          :key="option.value"
          :label="option.label"
          :color="option.color"
        />
        <ColorTag v-for="id in unresolved" :key="id" :label="String(id)" :color="null" />
      </template>
      <!-- An em dash, never an empty line: an empty row reads as a broken
           layout rather than as "no tag". -->
      <template v-else>—</template>
    </p>
  </FieldWrapper>
</template>

<style scoped>
.m2m-tags__readonly {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  /* Aligns the pills with the fields above and below, whose control has a
     border and a padding this one does not. */
  margin: 0;
  padding: 0.5rem 0;
}

.m2m-tags__option {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.m2m-tags__load-error {
  font-size: 0.85rem;
  color: var(--p-red-500);
}

/* A contact can carry more tags than fit on one line, and the control's label
   does not wrap on its own. */
.m2m-tags__control :deep(.p-multiselect-label) {
  display: block;
  white-space: normal;
}
</style>
