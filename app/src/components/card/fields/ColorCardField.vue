<script setup lang="ts">
/* A palette index, as the dot the relation dropdowns already use. */
import { computed } from 'vue'

import ColorDot from '@/components/ColorDot.vue'

import { EMPTY_FIELD, colorIndex } from './cardFields'
import type { CardFieldProps } from './types'

const props = defineProps<CardFieldProps>()

const index = computed(() => colorIndex(props.value))
</script>

<template>
  <ColorDot v-if="index !== null" :color="index" />
  <span v-else>{{ EMPTY_FIELD }}</span>
</template>
