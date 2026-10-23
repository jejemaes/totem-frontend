<script setup lang="ts">
/* An instant, in the browser's locale and timezone. */
import { computed } from 'vue'

import { EMPTY_CELL, formatDateTime } from './cells'
import type { CellProps } from './types'

const props = defineProps<CellProps>()

const text = computed(() => formatDateTime(props.value) ?? EMPTY_CELL)
</script>

<template>
  <span>{{ text }}</span>
</template>
