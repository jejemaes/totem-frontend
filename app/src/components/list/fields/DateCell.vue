<script setup lang="ts">
/* A calendar day, in the browser's locale -- never shifted by a timezone. */
import { computed } from 'vue'

import { EMPTY_CELL, formatDate } from './cells'
import type { CellProps } from './types'

const props = defineProps<CellProps>()

const text = computed(() => formatDate(props.value) ?? EMPTY_CELL)
</script>

<template>
  <span>{{ text }}</span>
</template>
