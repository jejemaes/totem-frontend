<script setup lang="ts">
/*
 * A decimal column. `options.maxFractionDigits` as on the form's FloatField;
 * a Decimal arrives as a string and is read as a number by cells.ts.
 */
import { computed } from 'vue'

import { EMPTY_CELL, formatNumber } from './cells'
import type { CellProps } from './types'

const props = defineProps<CellProps>()

const text = computed(
  () =>
    formatNumber(props.value, { maxFractionDigits: props.options?.maxFractionDigits }) ??
    EMPTY_CELL,
)
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
