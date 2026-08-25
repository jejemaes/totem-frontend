<script setup lang="ts">
import InputNumber from 'primevue/inputnumber'
import { useId } from 'vue'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'
import { toNumberOrNull } from './values'

defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

function onInput(next: number | null): void {
  emit('update:modelValue', next)
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
    <!-- maxFractionDigits defaults to 2 in PrimeVue: left alone, this field
         would silently round 3.14159 to 3.14. Hence the 6. useGrouping is
         forced off: "1 234" inside an editable field breaks copy/paste. -->
    <InputNumber
      :input-id="inputId"
      fluid
      mode="decimal"
      locale="fr-FR"
      :min-fraction-digits="0"
      :max-fraction-digits="options?.maxFractionDigits ?? 6"
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
