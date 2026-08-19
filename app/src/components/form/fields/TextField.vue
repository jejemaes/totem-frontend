<script setup lang="ts">
import Textarea from 'primevue/textarea'
import { useId } from 'vue'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'

defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

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
    <Textarea
      :id="inputId"
      fluid
      auto-resize
      :rows="options?.rows ?? 4"
      :model-value="modelValue === null ? '' : String(modelValue)"
      :disabled="readonly"
      :invalid="invalid"
      :maxlength="options?.maxLength"
      :placeholder="options?.placeholder"
      @update:model-value="onInput"
    />
  </FieldWrapper>
</template>
