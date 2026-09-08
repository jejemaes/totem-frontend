<script setup lang="ts">
import SelectButton from 'primevue/selectbutton'
import { computed, useId } from 'vue'

import { activeSwitchField, type FieldSwitchChoice } from './fieldSwitch'
import type { FieldValue } from './fields/types'

/*
 * Picks which one of several mutually exclusive fields a form shows.
 *
 * PURELY VISUAL, and that is the whole point: its value is not data. It is in
 * no draft, in no payload, and nothing persists it -- because the backend
 * stores no discriminator either. The active field is DEDUCED from which of the
 * fields is filled, so reopening a record puts the switch back where the data
 * says it belongs.
 *
 * Generic on purpose: it takes the field names and the resource's values, and
 * knows nothing of any model. The caller keeps a `ref<string | null>` for the
 * user's pick (`null` = deduce) and drives its own `v-if` from the same
 * activeSwitchField call.
 *
 * Not a <Field>: it injects no form context, registers no key, and belongs to
 * no widget registry. Its CSS mirrors FieldWrapper's spacing so it lines up
 * with the fields around it -- without importing it, since that component is
 * internal to <Field>.
 */
const props = withDefaults(
  defineProps<{
    /** The field the user picked, or `null` to deduce it from `values`. */
    modelValue: string | null
    choices: readonly FieldSwitchChoice[]
    /** The resource's values, which is what the deduction reads. */
    values?: Readonly<Record<string, FieldValue>>
    label?: string
    help?: string
    readonly?: boolean
  }>(),
  { values: undefined, label: undefined, help: undefined, readonly: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const labelId = useId()

/** The position shown, pick or deduction -- the same call the caller makes. */
const active = computed(() => activeSwitchField(props.choices, props.values, props.modelValue))

/*
 * SelectButton emits null when the active button is clicked again, even with
 * `allow-empty` false in some versions. An empty switch would hide every field
 * at once, so a null is dropped rather than forwarded.
 */
function onSelect(next: unknown): void {
  if (typeof next === 'string' && next !== '') emit('update:modelValue', next)
}
</script>

<template>
  <div class="field-switch">
    <span v-if="label" :id="labelId" class="field-switch__label">{{ label }}</span>

    <SelectButton
      :model-value="active"
      :options="[...choices]"
      option-label="label"
      option-value="field"
      :allow-empty="false"
      :disabled="readonly"
      :aria-labelledby="label ? labelId : undefined"
      @update:model-value="onSelect"
    />

    <small v-if="help" class="field-switch__help">{{ help }}</small>
  </div>
</template>

<style scoped>
/* Mirrors FieldWrapper's `.field` spacing so this sits on the same grid as the
   fields around it. */
.field-switch {
  display: grid;
  gap: 0.35rem;
  justify-items: start;
}

.field-switch__label {
  font-size: 0.9rem;
  color: var(--app-muted);
}

.field-switch__help {
  font-size: 0.85rem;
  color: var(--app-muted);
}
</style>
