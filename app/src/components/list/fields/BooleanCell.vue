<script setup lang="ts">
/*
 * A boolean column, as an icon. Three states, not two: a value that is not a
 * boolean shows the dash, never the cross -- "unknown" is not "no".
 */
import { computed } from 'vue'

import { EMPTY_CELL, toBooleanCell } from './cells'
import type { CellProps } from './types'

const props = defineProps<CellProps>()

const state = computed(() => toBooleanCell(props.value))
</script>

<template>
  <i v-if="state === true" class="pi pi-check boolean-cell--yes" role="img" aria-label="Yes" />
  <i v-else-if="state === false" class="pi pi-times boolean-cell--no" role="img" aria-label="No" />
  <span v-else>{{ EMPTY_CELL }}</span>
</template>

<style scoped>
.boolean-cell--yes {
  color: var(--p-primary-color);
}

.boolean-cell--no {
  color: var(--app-muted);
}
</style>
