<script setup lang="ts">
/* A selection on a card, labelled through `options.choices` as on the form's SelectionField. */
import { computed } from 'vue'

import { EMPTY_FIELD, selectionLabel } from './cardFields'
import type { CardFieldProps } from './types'

const props = defineProps<CardFieldProps>()

const text = computed(() => selectionLabel(props.value, props.options?.choices) ?? EMPTY_FIELD)
</script>

<template>
  <span>{{ text }}</span>
</template>
