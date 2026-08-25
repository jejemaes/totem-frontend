<script setup lang="ts">
import InputNumber from 'primevue/inputnumber'
import { useId } from 'vue'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'
import { toNumberOrNull } from './values'

/*
 * InputNumber rather than an InputText + inputmode: its v-model is already a
 * `number | null` (cleared -> null, exactly our invariant), and
 * `maxFractionDigits: 0` PHYSICALLY prevents typing a decimal separator --
 * where `inputmode="numeric"` is only a soft-keyboard hint that blocks nothing.
 * An InputText would mean parsing on every keystroke and hand-policing "-",
 * "1." and "1," which all read as NaN mid-typing.
 */
defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

/** Belt and braces: maxFractionDigits already forbids decimal input. */
function onInput(next: number | null): void {
  emit('update:modelValue', next === null ? null : Math.trunc(next))
}
</script>

<template>
  <FieldWrapper
    :input-id="inputId"
    :label="label"
    :help="help"
    :required="required"
    :error="error"
  >
    <InputNumber
      :input-id="inputId"
      fluid
      mode="decimal"
      locale="fr-FR"
      :max-fraction-digits="0"
      :use-grouping="false"
      :model-value="toNumberOrNull(modelValue)"
      :min="options?.min"
      :max="options?.max"
      :disabled="readonly"
      :invalid="invalid"
      :placeholder="options?.placeholder"
      @update:model-value="onInput"
    />
  </FieldWrapper>
</template>
