<script setup lang="ts">
import InputText from 'primevue/inputtext'
import { useId } from 'vue'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'

defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

/** A cleared field is `null`, never '' -- see the FieldValue invariant. */
function onInput(next: string | undefined): void {
  const text = String(next ?? '')
  emit('update:modelValue', text === '' ? null : text)
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
    <InputText
      :id="inputId"
      fluid
      :model-value="modelValue === null ? '' : String(modelValue)"
      :disabled="readonly"
      :invalid="invalid"
      :maxlength="options?.maxLength"
      :placeholder="options?.placeholder"
      @update:model-value="onInput"
    />
  </FieldWrapper>
</template>
