<script setup lang="ts">
import Message from 'primevue/message'
import Select from 'primevue/select'
import { computed, useId } from 'vue'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'
import { normaliseChoices } from './values'

const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

/*
 * Name collision worth keeping in mind: our `options` prop is the field's
 * free-form configuration, while <Select>'s own `options` prop is the list of
 * entries. Hence the rename to `choices` here.
 */
const choices = computed(() => normaliseChoices(props.options?.choices))

function onSelect(next: FieldValue): void {
  emit('update:modelValue', next ?? null)
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
    <Select
      v-if="choices.length"
      :input-id="inputId"
      fluid
      :options="choices"
      option-label="label"
      option-value="value"
      :model-value="modelValue"
      :show-clear="!required"
      :disabled="readonly"
      :invalid="invalid"
      :placeholder="options?.placeholder ?? 'Select…'"
      @update:model-value="onSelect"
    />
    <!-- An empty list is a configuration mistake, not a normal state: better
         to say so than to render an unusable dropdown. -->
    <Message v-else severity="warn" :closable="false">
      No choices configured: set <code>options.choices</code>.
    </Message>
  </FieldWrapper>
</template>
