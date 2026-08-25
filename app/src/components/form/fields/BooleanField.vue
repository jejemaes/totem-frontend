<script setup lang="ts">
import RadioButton from 'primevue/radiobutton'
import Select from 'primevue/select'
import { computed, useId } from 'vue'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'

const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const groupId = useId()

/**
 * Required -> two radio buttons (there are only two possible answers).
 * Optional -> a three-entry dropdown, "Unset" being a real state.
 *
 * `options.display` forces the shape when that coupling does not suit: making
 * a field optional should not change its control by surprise.
 */
const asRadio = computed(() => {
  const display = props.options?.display
  if (display) return display === 'radio'
  return Boolean(props.required)
})

/** The `data` may carry "true" or 1: everything narrows to a boolean or null. */
const value = computed<boolean | null>(() => {
  const raw = props.modelValue
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'boolean') return raw
  return raw === 'true' || raw === 1 || raw === '1'
})

/*
 * String sentinels, and emphatically NOT an option valued `null`: PrimeVue
 * treats a null modelValue as "nothing selected" and shows the placeholder, so
 * an option literally valued null would never render as the selected one.
 */
const CHOICES = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
  { value: 'unset', label: 'Unset' },
]

const selected = computed(() => (value.value === null ? 'unset' : String(value.value)))

function onSelect(next: string | null): void {
  emit('update:modelValue', next === null || next === 'unset' ? null : next === 'true')
}

function onRadio(next: boolean): void {
  emit('update:modelValue', next)
}
</script>

<template>
  <FieldWrapper
    :input-id="asRadio ? undefined : groupId"
    :label="label"
    :help="help"
    :required="required"
    :error="error"
    v-slot="{ labelId }"
  >
    <!-- A radio group has no single focusable element: the wrapper's label is
         a <span> and the group points at it through aria-labelledby. -->
    <div v-if="asRadio" class="boolean" role="radiogroup" :aria-labelledby="labelId">
      <div class="boolean__choice">
        <RadioButton
          :input-id="`${groupId}-yes`"
          :name="groupId"
          :value="true"
          :model-value="value"
          :disabled="readonly"
          :invalid="invalid"
          @update:model-value="onRadio"
        />
        <label :for="`${groupId}-yes`">Yes</label>
      </div>

      <div class="boolean__choice">
        <RadioButton
          :input-id="`${groupId}-no`"
          :name="groupId"
          :value="false"
          :model-value="value"
          :disabled="readonly"
          :invalid="invalid"
          @update:model-value="onRadio"
        />
        <label :for="`${groupId}-no`">No</label>
      </div>
    </div>

    <Select
      v-else
      :input-id="groupId"
      fluid
      :options="CHOICES"
      option-label="label"
      option-value="value"
      :model-value="selected"
      :disabled="readonly"
      :invalid="invalid"
      @update:model-value="onSelect"
    />
  </FieldWrapper>
</template>

<style scoped>
.boolean {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  min-height: 2.5rem;
}

.boolean__choice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.boolean__choice label {
  cursor: pointer;
}
</style>
