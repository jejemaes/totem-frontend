<script setup lang="ts">
/*
 * An integer on a card. Left where the text flows, unlike a table's
 * right-aligned column: there is no column of digits to scan by magnitude.
 */
import { computed } from 'vue'

import { EMPTY_FIELD, formatNumber } from './cardFields'
import type { CardFieldProps } from './types'

const props = defineProps<CardFieldProps>()

const text = computed(() => formatNumber(props.value, { integer: true }) ?? EMPTY_FIELD)
</script>

<template>
  <span class="number-card-field">{{ text }}</span>
</template>

<style scoped>
.number-card-field {
  font-variant-numeric: tabular-nums;
}
</style>
