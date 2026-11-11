<script setup lang="ts">
/*
 * A decimal on a card. `options.maxFractionDigits` as on the form's
 * FloatField; a Decimal arrives as a string and is read as a number by
 * cells.ts.
 */
import { computed } from 'vue'

import { EMPTY_FIELD, formatNumber } from './cardFields'
import type { CardFieldProps } from './types'

const props = defineProps<CardFieldProps>()

const text = computed(
  () =>
    formatNumber(props.value, { maxFractionDigits: props.options?.maxFractionDigits }) ??
    EMPTY_FIELD,
)
</script>

<template>
  <span class="number-card-field">{{ text }}</span>
</template>

<style scoped>
.number-card-field {
  font-variant-numeric: tabular-nums;
}
</style>
