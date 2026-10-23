<script setup lang="ts">
/* An integer column, right-aligned with tabular digits: numbers are scanned by magnitude. */
import { computed } from 'vue'

import { EMPTY_CELL, formatNumber } from './cells'
import type { CellProps } from './types'

const props = defineProps<CellProps>()

const text = computed(() => formatNumber(props.value, { integer: true }) ?? EMPTY_CELL)
</script>

<template>
  <div class="number-cell">{{ text }}</div>
</template>

<style scoped>
.number-cell {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
