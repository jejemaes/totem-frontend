<script setup lang="ts">
/*
 * An amount of money: a 2-decimal number with its currency's symbol.
 *
 * The currency is NOT part of the value -- that stays a plain number, a
 * FieldValue like FloatField's -- but a sibling field named by
 * `options.currencyField`, read through `values`: picking another currency in
 * the same form moves the symbol at once. Symbols and placement come from
 * `@/resources/currencies`, so the field reads like the list cell beside it.
 */
import InputNumber from 'primevue/inputnumber'
import { computed, useId } from 'vue'

import { currencyAffixes, currencyOf } from '@/resources/currencies'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'
import { toNumberOrNull } from './values'

const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

const code = computed(() => {
  const key = props.options?.currencyField
  return key ? props.values?.[key] : undefined
})
const affixes = computed(() => currencyAffixes(code.value))
const decimals = computed(() => currencyOf(code.value)?.decimals ?? 2)

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
    <!-- The decimals FIXED, min and max alike: a money input that shows
         `12.5` misreads as twelve and five cents to nobody but looks wrong to
         everyone. useGrouping is forced off, as on FloatField: "1 234" inside
         an editable field breaks copy/paste. -->
    <InputNumber
      :input-id="inputId"
      fluid
      mode="decimal"
      locale="fr-FR"
      :min-fraction-digits="decimals"
      :max-fraction-digits="decimals"
      :use-grouping="false"
      :prefix="affixes.prefix"
      :suffix="affixes.suffix"
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
