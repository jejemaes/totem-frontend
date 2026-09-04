<script setup lang="ts">
import DatePicker from 'primevue/datepicker'
import { computed, useId } from 'vue'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'
import { toDateOrNull, toIsoDate } from './values'

/*
 * A calendar day, carried as an ISO `YYYY-MM-DD` string -- which is both what
 * the backend's DateField speaks and a plain FieldValue, so nothing about the
 * shared form contract has to move for this widget to exist.
 *
 * DatePicker's own v-model is a `Date`, so this component is essentially the
 * two conversions. They live in values.ts, not here: turning a Date back into a
 * string through `toISOString()` shifts the day by one east of Greenwich, and
 * that bug deserves a unit test rather than a comment.
 */
const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

/*
 * Its own `minDate`/`maxDate` keys rather than the numeric fields' `min`/`max`:
 * those are typed as numbers, and overloading them would have meant widening
 * their type for every other widget. Undefined when absent or unparseable -- a
 * malformed bound must not silently forbid every date.
 */
const minDate = computed(() => toDateOrNull(props.options?.minDate) ?? undefined)
const maxDate = computed(() => toDateOrNull(props.options?.maxDate) ?? undefined)

/** A cleared picker is `null`, never '' -- see the FieldValue invariant. */
function onInput(next: unknown): void {
  emit('update:modelValue', toIsoDate(next))
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
    <DatePicker
      :input-id="inputId"
      fluid
      show-icon
      show-button-bar
      icon-display="input"
      date-format="dd/mm/yy"
      :model-value="toDateOrNull(modelValue) ?? null"
      :min-date="minDate"
      :max-date="maxDate"
      :disabled="readonly"
      :invalid="invalid"
      :placeholder="options?.placeholder"
      @update:model-value="onInput"
    />
  </FieldWrapper>
</template>
