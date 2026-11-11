<script setup lang="ts">
/* An instant, in the browser's locale and timezone. */
import { computed } from 'vue'

import { EMPTY_FIELD, formatDateTime } from './cardFields'
import type { CardFieldProps } from './types'

const props = defineProps<CardFieldProps>()

const text = computed(() => formatDateTime(props.value) ?? EMPTY_FIELD)
</script>

<template>
  <span>{{ text }}</span>
</template>
