<script setup lang="ts">
/*
 * A file shown, never edited: its value is the file's URL, a plain string --
 * a FieldValue, so this is an ordinary widget, not a detached one -- and it
 * NEVER emits `update:modelValue`, so the key cannot reach `changed`, nor a
 * PATCH. Uploading stays FileInputWidget's business.
 *
 * The type comes from a sibling key named by `options.mimetypeField`, read
 * through `values` as MonetaryField reads its currency. Without it,
 * FileViewer guesses from the URL.
 */
import { computed } from 'vue'

import FileViewer from '@/components/file/FileViewer.vue'

import FieldWrapper from './FieldWrapper.vue'
import type { WidgetProps } from './types'

const props = defineProps<WidgetProps>()

const url = computed(() =>
  typeof props.modelValue === 'string' && props.modelValue !== '' ? props.modelValue : null,
)

const mimetype = computed(() => {
  const key = props.options?.mimetypeField
  const value = key ? props.values?.[key] : undefined
  return typeof value === 'string' ? value : null
})
</script>

<template>
  <!-- No input-id: a viewer has no single focusable element. -->
  <FieldWrapper :label="label" :help="help" :required="required" :error="error">
    <FileViewer :url="url" :mimetype="mimetype" />
  </FieldWrapper>
</template>
