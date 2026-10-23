<script setup lang="ts">
/* A selection column, labelled through `options.choices` as on the form's SelectionField. */
import { computed } from 'vue'

import { EMPTY_CELL, selectionLabel } from './cells'
import type { CellProps } from './types'

const props = defineProps<CellProps>()

const text = computed(() => selectionLabel(props.value, props.options?.choices) ?? EMPTY_CELL)
</script>

<template>
  <span>{{ text }}</span>
</template>
