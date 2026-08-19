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
    <!-- maxFractionDigits vaut 2 par défaut dans PrimeVue : laissé tel quel,
         ce champ arrondirait silencieusement 3.14159 en 3.14. D'où le 6.
         useGrouping est forcé à false : « 1 234 » dans une zone de saisie
         casse le copier-coller. -->
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
