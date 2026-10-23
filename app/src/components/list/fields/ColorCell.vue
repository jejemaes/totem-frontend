<script setup lang="ts">
/* A palette index, as the dot the relation dropdowns already use. */
import { computed } from 'vue'

import ColorDot from '@/components/ColorDot.vue'

import { EMPTY_CELL, colorIndex } from './cells'
import type { CellProps } from './types'

const props = defineProps<CellProps>()

const index = computed(() => colorIndex(props.value))
</script>

<template>
  <ColorDot v-if="index !== null" :color="index" />
  <span v-else>{{ EMPTY_CELL }}</span>
</template>
