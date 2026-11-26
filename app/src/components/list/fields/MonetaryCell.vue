<script setup lang="ts">
/*
 * An amount of money, with the symbol of the currency named by the row's
 * `options.currencyField` key -- each row may be in another currency. Formatted
 * by `@/resources/currencies`, like the form's MonetaryField. The column asks
 * for that key in `?fields=` itself: see list/Field.vue.
 */
import { computed } from 'vue'

import { formatMonetary } from '@/resources/currencies'

import { EMPTY_CELL } from './cells'
import type { CellProps } from './types'

const props = defineProps<CellProps>()

const text = computed(() => {
  const key = props.options?.currencyField
  return formatMonetary(props.value, key ? props.row[key] : undefined) ?? EMPTY_CELL
})
</script>

<template>
  <div class="number-cell">{{ text }}</div>
</template>

<style scoped>
.number-cell {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
