<script setup lang="ts">
import Password from 'primevue/password'
import { computed, useId } from 'vue'

import FieldWrapper from './FieldWrapper.vue'
import { patternError } from './password'
import type { FieldValue, WidgetProps } from './types'

/*
 * A masked text input with an eye to reveal it, and an optional `pattern`.
 *
 * Not CharField with `type="password"`: PrimeVue's <Password> carries the
 * reveal toggle, which is the point -- a masked field with no way to check
 * what was typed is how a typo becomes a password.
 *
 * The pattern is shown, not enforced: <Form> only knows `required`, and
 * teaching it validators would change the contract of every form. The caller
 * that must refuse a mismatch runs the same `patternError` before sending
 * (see newPasswordErrors).
 */
const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

/** The form's error first -- a refusal from the backend outranks a hint --
    then the live pattern check, which stays silent on an empty field. */
const shownError = computed(() => props.error ?? patternError(props.modelValue, props.options))

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
    :error="shownError"
  >
    <Password
      :input-id="inputId"
      fluid
      toggle-mask
      :feedback="false"
      :model-value="typeof modelValue === 'string' ? modelValue : ''"
      :disabled="readonly"
      :invalid="invalid || shownError !== undefined"
      :placeholder="options?.placeholder"
      :autocomplete="options?.autocomplete ?? 'off'"
      @update:model-value="onInput"
    />
  </FieldWrapper>
</template>
