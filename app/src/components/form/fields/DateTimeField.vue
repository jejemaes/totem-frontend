<script setup lang="ts">
import DatePicker from 'primevue/datepicker'
import { computed, useId } from 'vue'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'
import { toDateTimeOrNull, toIsoDateTime } from './values'

/*
 * An instant, carried as an ISO 8601 string -- what the backend's DateTimeField
 * speaks, and a plain FieldValue, so nothing about the shared form contract has
 * to move for this widget to exist.
 *
 * The sibling of DateField, and deliberately not a variant of it: that one is a
 * calendar day with no time and no timezone, this one is a point in time WITH
 * one. The two conversions live in values.ts because that difference is exactly
 * where the bugs are -- see toIsoDateTime, which may use toISOString() where
 * toIsoDate must not.
 */
const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

/*
 * The same `minDate`/`maxDate` option keys as DateField, parsed as instants
 * here. No new key in FieldOptions: a bound is a bound, and the widget already
 * says how to read it.
 */
const minDate = computed(() => toDateTimeOrNull(props.options?.minDate) ?? undefined)
const maxDate = computed(() => toDateTimeOrNull(props.options?.maxDate) ?? undefined)

/** A cleared picker is `null`, never '' -- see the FieldValue invariant. */
function onInput(next: unknown): void {
  emit('update:modelValue', toIsoDateTime(next))
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
      show-time
      show-icon
      show-button-bar
      hour-format="24"
      icon-display="input"
      date-format="dd/mm/yy"
      :model-value="toDateTimeOrNull(modelValue) ?? null"
      :min-date="minDate"
      :max-date="maxDate"
      :disabled="readonly"
      :invalid="invalid"
      :placeholder="options?.placeholder"
      @update:model-value="onInput"
    />
  </FieldWrapper>
</template>
