<script setup lang="ts">
import InputNumber from 'primevue/inputnumber'
import { useId } from 'vue'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'
import { toNumberOrNull } from './values'

/*
 * InputNumber plutôt qu'un InputText + inputmode : son v-model est déjà un
 * `number | null` (champ vidé -> null, ce qui est exactement notre invariant),
 * et `maxFractionDigits: 0` EMPÊCHE matériellement de taper un séparateur
 * décimal — là où `inputmode="numeric"` n'est qu'une suggestion de clavier
 * virtuel qui ne bloque rien. Avec un InputText il faudrait parser à chaque
 * frappe et gérer à la main « - », « 1. », « 1, » qui valent tous NaN en cours
 * de saisie.
 */
defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

/** Ceinture et bretelles : maxFractionDigits interdit déjà la saisie décimale. */
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
