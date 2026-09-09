<script setup lang="ts">
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Textarea from 'primevue/textarea'
import { computed, ref, watch } from 'vue'

import BooleanField from './BooleanField.vue'
import CharField from './CharField.vue'
import FloatField from './FloatField.vue'
import type { HtmlWidgetType } from './html'
import {
  invalidWidgetFields,
  parseWidgetAttrs,
  unmappedAttrs,
  widgetAttrsJson,
  widgetForm,
  widgetFormValues,
  type WidgetFormField,
  type WidgetFormWidget,
} from './htmlWidget'
import IntegerField from './IntegerField.vue'
import SelectionField from './SelectionField.vue'
import type { FieldValue } from './types'
import { isEmpty } from './values'

/*
 * Choosing a widget and filling in its parameters.
 *
 * The parameters form is generated from the widget's own `attribute_schema` --
 * JSON Schema, straight from pydantic -- so this app states no widget's
 * parameters anywhere. Adding a widget backend-side makes it appear here, with
 * its labels, help texts, defaults and bounds, and no frontend change at all.
 * That is the whole reason the endpoint returns a schema rather than a form.
 *
 * The controls are the field widgets from this very folder, used DIRECTLY and
 * not through <Field>. Two reasons, and the second is the hard one:
 *
 *   - a widget injects nothing and is documented as an ordinary v-model
 *     component, usable outside a <Form>. This is exactly that case.
 *   - Field.vue lazily imports HtmlField.vue, so reaching back to Field.vue
 *     from inside it would be a circular import between the registry and one
 *     of its entries.
 *
 * The mapping itself lives in htmlWidget.ts, with its tests: which JSON Schema
 * shape becomes which control is the part that fails silently.
 */
const props = withDefaults(
  defineProps<{
    visible: boolean
    types: readonly HtmlWidgetType[]
    /** The catalogue is still in flight. */
    loading?: boolean
    /** The catalogue could not be loaded. Owned by the parent, which fetches. */
    error?: string | null
    /**
     * Set when editing a marker already in the document, null when inserting.
     * `attrs` is the marker's raw payload, whatever shape it is in.
     */
    initial?: { name: string; attrs: unknown } | null
  }>(),
  { loading: false, error: null, initial: null },
)

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [payload: { name: string; attrs: string | null }]
}>()

const COMPONENTS: Record<WidgetFormWidget, unknown> = {
  string: CharField,
  integer: IntegerField,
  float: FloatField,
  boolean: BooleanField,
  selection: SelectionField,
}

const editing = computed(() => props.initial !== null)

const selectedId = ref<string | null>(null)
const values = ref<Record<string, FieldValue>>({})
/** The parameters no generated control owns -- see `unsupported` below. */
const extraJson = ref('')
const extraError = ref<string | null>(null)
const missing = ref<string[]>([])
/** Fields whose value the schema's own `pattern` refuses. */
const malformed = ref<string[]>([])

const type = computed<HtmlWidgetType | undefined>(() =>
  props.types.find((entry) => entry.id === selectedId.value),
)

const form = computed(() =>
  type.value ? widgetForm(type.value.attribute_schema) : { fields: [], unsupported: [] },
)

/** A widget with no parameters at all: there is nothing to fill in. */
const hasFields = computed(() => form.value.fields.length > 0 || form.value.unsupported.length > 0)

function seed(): void {
  const attrs = parseWidgetAttrs(props.initial?.attrs)
  values.value = widgetFormValues(attrs, form.value.fields)
  const extra = unmappedAttrs(attrs, form.value.fields)
  extraJson.value = Object.keys(extra).length > 0 ? JSON.stringify(extra, null, 2) : ''
  extraError.value = null
  missing.value = []
  malformed.value = []
}

/*
 * Reset on every open, never on close: a dialog that clears itself while it is
 * fading out shows the user its own teardown.
 */
watch(
  () => props.visible,
  (open) => {
    if (!open) return
    selectedId.value = props.initial?.name ?? null
    seed()
  },
)

// Choosing a type -- or the catalogue arriving after the dialog was opened --
// is what decides which fields exist, so the values are seeded from there too.
watch(selectedId, () => seed())
watch(
  () => props.types,
  () => {
    // The single-widget case: presenting a list of one to pick from is a step
    // that asks a question with only one answer.
    if (!editing.value && selectedId.value === null && props.types.length === 1) {
      selectedId.value = props.types[0].id
    }
  },
  { immediate: true },
)

function onFieldInput(field: WidgetFormField, next: FieldValue): void {
  values.value = { ...values.value, [field.name]: next }
  if (missing.value.includes(field.name) && !isEmpty(next)) {
    missing.value = missing.value.filter((name) => name !== field.name)
  }
  // Cleared as soon as it is fixed, rather than waiting for another submit.
  if (malformed.value.includes(field.name)) {
    malformed.value = invalidWidgetFields(values.value, form.value.fields)
  }
}

/**
 * What a control shows under itself.
 *
 * The pattern message quotes the regex: it is the only description of the rule
 * the schema gives -- pydantic emits no prose for a `pattern` -- and a bare
 * "invalid" would leave the author guessing.
 */
function fieldError(field: WidgetFormField): string | undefined {
  if (missing.value.includes(field.name)) return 'This field is required.'
  if (malformed.value.includes(field.name)) return `This must match ${field.pattern}`
  return undefined
}

function close(): void {
  emit('update:visible', false)
}

function submit(): void {
  const current = type.value
  if (!current) return

  missing.value = form.value.fields
    .filter((field) => field.required && isEmpty(values.value[field.name]))
    .map((field) => field.name)
  malformed.value = invalidWidgetFields(values.value, form.value.fields)
  if (missing.value.length > 0 || malformed.value.length > 0) return

  let extra: Record<string, unknown> = {}
  if (extraJson.value.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(extraJson.value)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        extraError.value = 'This must be a JSON object, for example {"tags": ["news"]}.'
        return
      }
      extra = parsed as Record<string, unknown>
    } catch {
      extraError.value = 'This is not valid JSON.'
      return
    }
  }
  extraError.value = null

  emit('submit', {
    name: current.id,
    attrs: widgetAttrsJson(values.value, form.value.fields, extra),
  })
  close()
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissable-mask
    :header="editing ? 'Edit widget' : 'Insert a widget'"
    :style="{ width: '32rem' }"
    @update:visible="emit('update:visible', $event)"
  >
    <Message v-if="error" severity="error" :closable="false" class="wd__message">
      {{ error }}
    </Message>

    <div v-else-if="loading && types.length === 0" class="wd__loading">
      <ProgressSpinner style="width: 2rem; height: 2rem" aria-label="Loading the widgets" />
    </div>

    <!-- Not an error: a registry can legitimately be empty, and saying so beats
         an empty box the user has to interpret. -->
    <Message v-else-if="types.length === 0" severity="info" :closable="false" class="wd__message">
      No widget is available.
    </Message>

    <!-- Step one, and only when there is a choice to make. -->
    <div v-else-if="!type" class="wd__types">
      <button
        v-for="entry in types"
        :key="entry.id"
        type="button"
        class="wd__type"
        @click="selectedId = entry.id"
      >
        <span class="wd__type-title">{{ entry.title }}</span>
        <span class="wd__type-id">{{ entry.id }}</span>
      </button>
    </div>

    <div v-else class="wd__form">
      <p class="wd__chosen">
        <span class="wd__type-title">{{ type.title }}</span>
        <!-- Only when there is somewhere to go back to: editing is bound to the
             marker's own widget, and a single-widget registry has no list. -->
        <Button
          v-if="!editing && types.length > 1"
          label="Change"
          size="small"
          text
          @click="selectedId = null"
        />
      </p>

      <p v-if="!hasFields" class="wd__none">This widget takes no parameters.</p>

      <component
        :is="COMPONENTS[field.widget]"
        v-for="field in form.fields"
        :key="field.name"
        :model-value="values[field.name] ?? null"
        :label="field.label"
        :help="field.help"
        :required="field.required"
        :options="field.options"
        :invalid="missing.includes(field.name) || malformed.includes(field.name)"
        :error="fieldError(field)"
        @update:model-value="(next: FieldValue) => onFieldInput(field, next)"
      />

      <!-- The escape hatch. A parameter this form cannot express is NAMED and
           handed over as raw JSON rather than dropped: a silently missing
           parameter is how a widget renders wrong with nothing to explain it,
           and the 422 would come back pointing at `content`. -->
      <template v-if="form.unsupported.length > 0">
        <Message severity="warn" :closable="false" class="wd__message">
          {{
            form.unsupported.length === 1
              ? `The parameter "${form.unsupported[0]}" is not a simple value, so it has no control here.`
              : `These parameters are not simple values, so they have no control here: ${form.unsupported.join(', ')}.`
          }}
          Edit them as JSON below.
        </Message>
        <div class="field">
          <label class="field__label" for="wd-extra">Other parameters (JSON)</label>
          <Textarea
            id="wd-extra"
            v-model="extraJson"
            fluid
            spellcheck="false"
            :rows="4"
            :invalid="Boolean(extraError)"
            class="wd__json"
            placeholder="{}"
          />
          <small v-if="extraError" class="field__error">{{ extraError }}</small>
        </div>
      </template>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="close" />
      <Button
        :label="editing ? 'Save' : 'Insert'"
        icon="pi pi-check"
        :disabled="!type"
        @click="submit"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.wd__message {
  margin-bottom: 0.75rem;
}

.wd__loading {
  display: grid;
  place-items: center;
  padding: 1.5rem;
}

.wd__types {
  display: grid;
  gap: 0.4rem;
}

.wd__type {
  display: grid;
  gap: 0.15rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--p-content-border-color, var(--app-border));
  border-radius: var(--p-content-border-radius, 6px);
  background: var(--p-content-background, var(--app-panel));
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
}

.wd__type:hover {
  border-color: var(--p-primary-color);
}

.wd__type:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 1px;
}

.wd__type-title {
  font-weight: 600;
}

.wd__type-id {
  color: var(--app-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8rem;
}

/* The same vertical rhythm as <Form>'s own field stack, so a generated form
   does not read as a different kind of form. */
.wd__form {
  display: grid;
  gap: 0.9rem;
}

.wd__chosen {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0;
}

.wd__none {
  margin: 0;
  color: var(--app-muted);
}

.wd__json :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85rem;
}
</style>
