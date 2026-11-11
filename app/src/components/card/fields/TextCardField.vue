<script setup lang="ts">
/*
 * A multi-line text on a card -- a summary, a description. Its line breaks are
 * kept, and `options.truncate` cuts it to a number of characters: a card in a
 * grid has a height budget, and one long text would make its whole row tall.
 * The cut is a display choice, so the whole text is in the `title` attribute.
 */
import { computed } from 'vue'

import { EMPTY_FIELD, formatText, truncateText } from './cardFields'
import type { CardFieldProps } from './types'

const props = defineProps<CardFieldProps>()

const whole = computed(() => formatText(props.value))
const text = computed(() => truncateText(props.value, props.options?.truncate) ?? EMPTY_FIELD)
const cut = computed(() => whole.value !== null && text.value !== whole.value)
</script>

<template>
  <p class="text-card-field" :title="cut ? (whole ?? undefined) : undefined">{{ text }}</p>
</template>

<style scoped>
.text-card-field {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
</style>
