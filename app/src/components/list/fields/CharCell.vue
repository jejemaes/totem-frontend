<script setup lang="ts">
/* A string column. The canonical minimal cell: read through cells.ts, laid out here. */
import { computed } from 'vue'

import { EMPTY_CELL, formatText } from './cells'
import type { CellProps } from './types'

const props = defineProps<CellProps>()

const text = computed(() => formatText(props.value) ?? EMPTY_CELL)
</script>

<template>
  <span>{{ text }}</span>
</template>
